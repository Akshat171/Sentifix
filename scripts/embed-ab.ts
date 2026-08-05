/**
 * Embedding-model A/B harness.
 * Usage: pnpm embed:ab --repo /path/to/local/checkout [--k 10] [--max-files 300] [--dataset name]
 *        EMBED_AB_MODELS="small=text-embedding-3-small,large=text-embedding-3-large" pnpm embed:ab --repo ...
 *
 * Measures retrieval quality (recall@k / precision@k / MRR) of candidate
 * embedding models against the golden datasets, so the choice to swap the
 * production embedding model (roadmap item 4) is justified by numbers rather
 * than vibes. Runs entirely in memory (cosine similarity) over a LOCAL checkout
 * of the repo — no pgvector, no migration, dimension-agnostic.
 *
 * The retrieved paths are ranked purely by embedding similarity of the raw issue
 * text against the code chunks — deliberately isolating embedding quality from
 * HyDE / BM25 / reranking, which is what this A/B is meant to compare.
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { chunkCode } from '../src/indexing/code-chunker';
import { createEmbedder, parseModelSpecs } from '../src/eval/embedder';
import { loadAllDatasets } from '../src/eval/dataset.loader';
import type { EvalDataset } from '../src/eval/dataset.types';
import { aggregateRetrieval, scoreRetrieval, RetrievalScore } from '../src/eval/retrieval-metrics';
import { topKByCosine } from '../src/eval/vector-math';

const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.java', '.kt',
  '.rb', '.rs', '.c', '.cpp', '.h', '.cs', '.php', '.swift', '.md', '.mdx',
]);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'vendor']);

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function walk(dir: string, root: string, acc: string[], maxFiles: number): void {
  if (acc.length >= maxFiles) return;
  for (const entry of readdirSync(dir)) {
    if (acc.length >= maxFiles) return;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full, root, acc, maxFiles);
    } else {
      const dot = entry.lastIndexOf('.');
      if (dot !== -1 && CODE_EXTS.has(entry.slice(dot).toLowerCase())) acc.push(relative(root, full));
    }
  }
}

interface Chunk {
  filePath: string;
  text: string;
}

function collectChunks(repo: string, maxFiles: number): { chunks: Chunk[]; fileCount: number } {
  const files: string[] = [];
  walk(repo, repo, files, maxFiles);
  const chunks: Chunk[] = [];
  for (const rel of files) {
    let content: string;
    try {
      content = readFileSync(join(repo, rel), 'utf-8');
    } catch {
      continue;
    }
    for (const c of chunkCode(content, rel)) {
      // Mirror the production representation: "File: <path>\n\n<chunk>".
      chunks.push({ filePath: rel, text: `File: ${rel}\n\n${c}` });
    }
  }
  return { chunks, fileCount: files.length };
}

function dedupe(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

async function scoreModel(
  spec: { label: string; model: string },
  chunks: Chunk[],
  datasets: EvalDataset[],
  k: number,
): Promise<RetrievalScore> {
  const embedder = createEmbedder(spec);
  const vectors = await embedder.embedBatch(chunks.map((c) => c.text));
  const docs = chunks.map((c, i) => ({ item: c.filePath, vector: vectors[i] }));

  const scores: RetrievalScore[] = [];
  for (const ds of datasets) {
    for (const c of ds.cases) {
      const [queryVec] = await embedder.embedBatch([`${c.issue.title}\n${c.issue.body}`]);
      const ranked = topKByCosine(queryVec, docs, k);
      const retrieved = dedupe(ranked.map((r) => r.doc));
      scores.push(scoreRetrieval(retrieved, c.expectedFiles, k));
    }
  }
  return aggregateRetrieval(scores);
}

async function main() {
  const repo = arg('repo');
  if (!repo) {
    console.error('Required: --repo /path/to/local/checkout');
    process.exit(1);
  }
  const k = Number(arg('k', '10'));
  const maxFiles = Number(arg('max-files', '300'));
  const only = arg('dataset');

  let datasets = loadAllDatasets();
  if (only) datasets = datasets.filter((d) => d.name === only);
  const totalCases = datasets.reduce((n, d) => n + d.cases.length, 0);
  if (totalCases === 0) {
    console.error('No dataset cases found (check eval/datasets/ and --dataset).');
    process.exit(1);
  }

  const { chunks, fileCount } = collectChunks(repo, maxFiles);
  if (fileCount >= maxFiles) {
    console.warn(`⚠️  Hit --max-files=${maxFiles}; some files were not indexed for this A/B.`);
  }
  console.log(`Indexed ${chunks.length} chunks from ${fileCount} files; ${totalCases} cases; k=${k}\n`);

  const specs = parseModelSpecs(process.env.EMBED_AB_MODELS);
  const results: Array<{ label: string; model: string; score: RetrievalScore }> = [];
  for (const spec of specs) {
    process.stdout.write(`Scoring ${spec.label} (${spec.model})... `);
    try {
      const score = await scoreModel(spec, chunks, datasets, k);
      results.push({ ...spec, score });
      console.log('done');
    } catch (err) {
      console.log(`❌  ${(err as Error).message}`);
    }
  }

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  console.log('\n── Comparison ──────────────────────────────────────────────────');
  console.log(`${'model'.padEnd(22)} recall@${k}   precision@${k}   MRR`);
  for (const r of results) {
    console.log(
      `${r.label.padEnd(22)} ${pct(r.score.recallAtK).padEnd(9)} ${pct(r.score.precisionAtK).padEnd(13)} ${r.score.reciprocalRank.toFixed(3)}`,
    );
  }
  if (results.length > 1) {
    const winner = [...results].sort((a, b) => b.score.recallAtK - a.score.recallAtK)[0];
    console.log(`\nBest recall@${k}: ${winner.label} (${winner.model})`);
  }
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌  embed-ab failed:', (err as Error).message);
  process.exit(1);
});
