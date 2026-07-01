import { Injectable, Logger } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { LlmProvider } from '../llm/llm.provider';
import { VectorStoreService } from '../indexing/vector-store.service';

// ── State ────────────────────────────────────────────────────────────────────

export interface TriageInput {
  issueId: string;
  repoFullName: string;
  title: string;
  body: string;
}

export interface ClassificationResult {
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affectedComponents: string[];
  reasoning: string;
}

export interface RetrievedContext {
  filePath: string;
  content: string;
  similarity: number;
}

export interface DiagnosisResult {
  rootCause: string;
  hypothesis: string;
  relevantFiles: string[];
}

export interface TriageOutput {
  classification: ClassificationResult;
  context: RetrievedContext[];
  diagnosis: DiagnosisResult;
  proposedDiff: string;
}

const PipelineState = Annotation.Root({
  issue: Annotation<TriageInput>(),
  classification: Annotation<ClassificationResult | null>(),
  context: Annotation<RetrievedContext[]>(),
  diagnosis: Annotation<DiagnosisResult | null>(),
  proposedDiff: Annotation<string>(),
});

type PState = typeof PipelineState.State;

// ── Agent ────────────────────────────────────────────────────────────────────

@Injectable()
export class AgentPipeline {
  private readonly logger = new Logger(AgentPipeline.name);
  private readonly graph;

  constructor(
    private readonly llm: LlmProvider,
    private readonly vectorStore: VectorStoreService,
  ) {
    this.graph = new StateGraph(PipelineState)
      .addNode('classify', this.classifyNode.bind(this))
      .addNode('retrieve', this.retrieveNode.bind(this))
      .addNode('diagnose', this.diagnoseNode.bind(this))
      .addNode('retrieveTargeted', this.retrieveTargetedNode.bind(this))
      .addNode('proposeFix', this.proposeFixNode.bind(this))
      .addEdge(START, 'classify')
      .addEdge('classify', 'retrieve')
      .addEdge('retrieve', 'diagnose')
      .addEdge('diagnose', 'retrieveTargeted')
      .addEdge('retrieveTargeted', 'proposeFix')
      .addEdge('proposeFix', END)
      .compile();
  }

  async run(input: TriageInput): Promise<TriageOutput> {
    this.logger.log(`Running pipeline for issue ${input.issueId}`);

    const result = await this.graph.invoke({
      issue: input,
      classification: null,
      context: [],
      diagnosis: null,
      proposedDiff: '',
    });

    return {
      classification: result.classification!,
      context: result.context,
      diagnosis: result.diagnosis!,
      proposedDiff: result.proposedDiff,
    };
  }

  // ── Nodes ──────────────────────────────────────────────────────────────────

  private async classifyNode(state: PState): Promise<Partial<PState>> {
    this.logger.log(`classify: issue ${state.issue.issueId}`);

    const raw = await this.llm.chat(
      [
        {
          role: 'system',
          content: `You are a senior engineer classifying a GitHub bug report.
Respond with valid JSON matching this schema:
{
  "category": string,          // e.g. "data-integrity", "performance", "security", "crash", "ux"
  "severity": "critical"|"high"|"medium"|"low",
  "affectedComponents": string[],
  "reasoning": string
}`,
        },
        {
          role: 'user',
          content: `Repository: ${state.issue.repoFullName}\nTitle: ${state.issue.title}\n\nBody:\n${state.issue.body}`,
        },
      ],
      true,
    );

    const classification: ClassificationResult = JSON.parse(raw);
    return { classification };
  }

  private async retrieveNode(state: PState): Promise<Partial<PState>> {
    this.logger.log(`retrieve: searching ${state.issue.repoFullName}`);
    const issueText = `${state.issue.title}\n${state.issue.body}`;
    const results: RetrievedContext[] = [];
    const seen = new Set<string>();

    const add = (chunks: Array<{ filePath: string; content: string; similarity: number }>) => {
      for (const c of chunks) {
        const key = `${c.filePath}::${c.content.slice(0, 50)}`;
        if (!seen.has(key)) { seen.add(key); results.push(c); }
      }
    };

    // ── Strategy 1: Stack trace / error parsing ───────────────────────────
    // If the issue body contains a stack trace, fetch those exact files first.
    // This is the most precise signal — zero ambiguity.
    const traceFiles = this.parseStackTraceFiles(issueText);
    if (traceFiles.length) {
      this.logger.log(`retrieve: stack trace found — fetching ${traceFiles.length} files directly`);
      for (const fp of traceFiles) {
        const chunks = await this.vectorStore.getChunksForFile(state.issue.repoFullName, fp);
        add(chunks);
      }
    }

    // ── Strategy 2: HyDE + hybrid search ─────────────────────────────────
    // Generate hypothetical code for the bug → embed that → hybrid search.
    // Code-to-code similarity is much stronger than text-to-code.
    const hypotheticalCode = await this.generateHypotheticalCode(state.issue);
    const hydeEmbedding = await this.llm.embed(hypotheticalCode);
    const hydeResults = await this.vectorStore.hybridSearch(
      state.issue.repoFullName,
      hydeEmbedding,
      `${issueText} ${hypotheticalCode}`,
      15,
    );
    add(hydeResults);

    // ── Strategy 3: Direct hybrid on raw issue text ───────────────────────
    // BM25 catches exact identifiers from the issue (function names, error strings).
    if (results.length < 10) {
      const rawEmbedding = await this.llm.embed(issueText);
      const rawResults = await this.vectorStore.hybridSearch(
        state.issue.repoFullName,
        rawEmbedding,
        issueText,
        10,
      );
      add(rawResults);
    }

    this.logger.log(`retrieve: ${results.length} total chunks (trace=${traceFiles.length > 0})`);
    return { context: results.slice(0, 20) };
  }

  /**
   * HyDE — Hypothetical Document Embedding.
   * Ask the LLM to write code that would contain this bug.
   * Embed that hypothetical code to search the index.
   * Code-to-code similarity far outperforms text-to-code.
   */
  private async generateHypotheticalCode(issue: TriageInput): Promise<string> {
    try {
      return await this.llm.chat([
        {
          role: 'system',
          content: `You are a code search assistant. Write a SHORT code snippet (10-20 lines) that would likely contain the bug described. Use the same language/framework as the repository. Include realistic function names, variable names, and patterns. Output ONLY code, no explanation.`,
        },
        {
          role: 'user',
          content: `Repository: ${issue.repoFullName}\nBug: ${issue.title}\n\n${issue.body.slice(0, 500)}`,
        },
      ]);
    } catch {
      return issue.title; // fallback to plain text if LLM call fails
    }
  }

  /**
   * Parse stack traces from issue body to extract exact file paths.
   * Supports Python, JavaScript/TypeScript, Java, Go, Ruby, Rust.
   */
  private parseStackTraceFiles(text: string): string[] {
    const patterns: RegExp[] = [
      // JS/TS: at ClassName.method (src/auth/auth.service.ts:87:32)
      /at\s+\S+\s+\((.+?\.(?:ts|js|mjs|jsx|tsx)):[\d:]+\)/g,
      // Python: File "app/auth.py", line 42
      /File\s+"(.+?\.py)",\s+line\s+\d+/g,
      // Go: goroutine ... /path/to/file.go:42
      /\S+\.go:\d+/g,
      // Ruby: path/to/file.rb:42:in
      /(\S+\.rb):\d+:in/g,
      // Java/Kotlin: at com.example.Class(File.java:42)
      /at\s+[\w.]+\((\w+\.(?:java|kt)):\d+\)/g,
      // Generic path-like: path/to/file.ext:line
      /\b([\w./\-]+\.(?:py|ts|js|go|java|rb|rs|php|cs))(?::\d+)+/g,
    ];

    const files = new Set<string>();
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const file = match[1] ?? match[0].split(':')[0];
        if (file && !file.includes('node_modules') && !file.includes('site-packages')) {
          files.add(file.trim());
        }
      }
    }

    return [...files].slice(0, 5); // cap at 5 files
  }

  private async diagnoseNode(state: PState): Promise<Partial<PState>> {
    this.logger.log(`diagnose: issue ${state.issue.issueId}`);

    const contextBlock = state.context
      .slice(0, 8)
      .map((c) => `### ${c.filePath}\n\`\`\`\n${c.content.slice(0, 600)}\n\`\`\``)
      .join('\n\n');

    const raw = await this.llm.chat(
      [
        {
          role: 'system',
          content: `You are a senior engineer diagnosing the root cause of a bug.
Given the issue and relevant code context, produce valid JSON:
{
  "rootCause": string,       // concise one-sentence root cause
  "hypothesis": string,      // detailed hypothesis with supporting evidence
  "relevantFiles": string[]  // file paths most likely to need changes
}`,
        },
        {
          role: 'user',
          content: `Issue: ${state.issue.title}\n\n${state.issue.body}\n\nClassification: ${JSON.stringify(state.classification)}\n\nCode context:\n${contextBlock || '(no code context available — reason from the issue description)'}`,
        },
      ],
      true,
    );

    const diagnosis: DiagnosisResult = JSON.parse(raw);
    this.logger.log(`diagnose: relevant files — ${diagnosis.relevantFiles.join(', ')}`);
    return { diagnosis };
  }

  /**
   * Second retrieval pass using the diagnosis output.
   * Searches specifically for the files identified during diagnosis,
   * using a richer query (root cause + file name) to surface more targeted chunks.
   * Merges with original context, deduplicating by filePath.
   */
  private async retrieveTargetedNode(state: PState): Promise<Partial<PState>> {
    const relevantFiles = state.diagnosis?.relevantFiles ?? [];
    if (!relevantFiles.length) return {};

    this.logger.log(`retrieveTargeted: searching for ${relevantFiles.length} specific files`);

    const existingPaths = new Set(state.context.map((c) => c.filePath));
    const newChunks: RetrievedContext[] = [];

    for (const file of relevantFiles.slice(0, 5)) {
      const filename = file.split('/').pop() ?? file;
      const query = `${filename} ${state.diagnosis?.rootCause ?? ''} ${state.issue.title}`;
      const embedding = await this.llm.embed(query);
      const results = await this.vectorStore.search(state.issue.repoFullName, embedding, 5);

      for (const r of results) {
        if (!existingPaths.has(r.filePath)) {
          existingPaths.add(r.filePath);
          newChunks.push({ filePath: r.filePath, content: r.content, similarity: r.similarity });
        }
      }
    }

    this.logger.log(`retrieveTargeted: added ${newChunks.length} new chunks`);

    // Merge: targeted chunks first (most relevant), then original context
    const merged = [...newChunks, ...state.context].slice(0, 15);
    return { context: merged };
  }

  private async proposeFixNode(state: PState): Promise<Partial<PState>> {
    const relevantFiles = state.diagnosis?.relevantFiles ?? [];
    this.logger.log(
      `proposeFix: issue ${state.issue.issueId}, ${state.context.length} chunks, files: ${relevantFiles.join(', ')}`,
    );

    // Group context chunks by file path for multi-file awareness
    const chunksByFile = new Map<string, RetrievedContext[]>();
    for (const chunk of state.context) {
      const existing = chunksByFile.get(chunk.filePath) ?? [];
      chunksByFile.set(chunk.filePath, [...existing, chunk]);
    }

    // Match retrieved files to relevant files (fuzzy — filename suffix match)
    const matchedFiles = relevantFiles
      .map((rf) => {
        const rfName = rf.split('/').pop() ?? rf;
        // Find the best-matching indexed file path
        for (const [fp] of chunksByFile) {
          if (fp === rf || fp.endsWith('/' + rfName) || fp.split('/').pop() === rfName) {
            return fp;
          }
        }
        return null;
      })
      .filter(Boolean) as string[];

    // Build context block: up to 3 chunks per relevant file, covering all matched files
    const usedPaths = matchedFiles.length > 0 ? matchedFiles : [...chunksByFile.keys()].slice(0, 5);
    const contextBlock = usedPaths
      .slice(0, 8)
      .flatMap((fp) => (chunksByFile.get(fp) ?? []).slice(0, 3))
      .map((c) => `### ${c.filePath}\n\`\`\`\n${c.content}\n\`\`\``)
      .join('\n\n');

    const hasContext = contextBlock.length > 0;
    this.logger.log(`proposeFix: building diff for ${usedPaths.length} files, hasContext=${hasContext}`);

    const proposedDiff = await this.llm.chat([
      {
        role: 'system',
        content: `You are an expert engineer proposing a minimal, correct fix for a bug.

Output ONLY unified diffs in standard format. For multi-file fixes, concatenate the diffs:
--- a/path/to/file1
+++ b/path/to/file1
@@ -N,M +N,M @@
 context
-removed
+added

--- a/path/to/file2
+++ b/path/to/file2
@@ -N,M +N,M @@
 context
-removed
+added

Rules:
- Always produce a diff. Never refuse.
- Fix ALL files that need changes — do not limit to one file if the bug spans multiple.
- If you have code context, produce exact diffs matching the actual code.
- If no code context, generate best-effort diffs from the diagnosis and file paths.
- Keep changes minimal — only what is necessary to fix the issue.`,
      },
      {
        role: 'user',
        content: `Issue: ${state.issue.title}

${state.issue.body}

Root cause: ${state.diagnosis?.rootCause}
Hypothesis: ${state.diagnosis?.hypothesis}
Files to change: ${relevantFiles.join(', ')}

${hasContext ? `Code context:\n${contextBlock}` : `No code context available. Generate fixes based on the diagnosis and your knowledge of common ${state.issue.repoFullName.split('/').pop()} patterns.`}`,
      },
    ]);

    return { proposedDiff };
  }
}
