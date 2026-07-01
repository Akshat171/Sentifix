import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parsePatch, applyPatch } from 'diff';
import { GithubService } from '../github/github.service';
import { LlmProvider } from '../llm/llm.provider';
import { Run } from '../persistence/entities/run.entity';
import { Issue } from '../persistence/entities/issue.entity';

type ParsedDiff = ReturnType<typeof parsePatch>[0];

export interface ResolveResult {
  prUrl: string;
  prNumber: number;
  branchName: string;
  filesChanged: string[];
  filesSkipped: string[];
}

@Injectable()
export class ResolveService {
  private readonly logger = new Logger(ResolveService.name);

  constructor(
    @InjectRepository(Run) private readonly runRepo: Repository<Run>,
    @InjectRepository(Issue) private readonly issueRepo: Repository<Issue>,
    private readonly github: GithubService,
    private readonly llm: LlmProvider,
  ) {}

  async resolveRun(runId: string, repoFullNameOverride?: string): Promise<ResolveResult> {
    const run = await this.runRepo.findOne({
      where: { id: runId },
      relations: ['issue', 'evalResults'],
    });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    if (run.status !== 'completed') {
      throw new BadRequestException(`Run is not completed (status: ${run.status})`);
    }

    const diff = run.proposedDiff;
    if (!diff || diff === '# insufficient-context') {
      throw new BadRequestException(
        'No diff available — index the repository first so Sentifix can propose a real fix',
      );
    }

    const issue = run.issue;
    const repoFullName = repoFullNameOverride ?? run.repoFullName ?? issue.repoFullName;
    if (!repoFullName) {
      throw new BadRequestException(
        'Could not determine repository. Pass {"repoFullName":"owner/repo"} in the request body.',
      );
    }

    const cleanDiff = this.normalizeDiff(diff);
    const patches = parsePatch(cleanDiff);
    if (!patches.length) throw new BadRequestException('Could not parse proposed diff');

    const { name: baseBranch, sha: baseSha } = await this.github.getDefaultBranch(repoFullName);
    const branchName = `sentifix/issue-${issue.githubIssueNumber}-fix`;

    try {
      await this.github.createBranch(repoFullName, branchName, baseSha);
    } catch (err) {
      const msg = (err as Error).message;
      if (
        msg.includes('Not Found') ||
        msg.includes('403') ||
        msg.includes('Resource not accessible')
      ) {
        throw new BadRequestException(
          `Cannot create branch on ${repoFullName}. ` +
            'Make sure your GITHUB_TOKEN has write access to this repository.',
        );
      }
      throw err;
    }

    const filesChanged: string[] = [];
    const filesSkipped: string[] = [];
    const diag = run.diagnosisResult as Record<string, unknown>;

    for (const patch of patches) {
      const filePath = this.extractPath(patch.newFileName ?? patch.oldFileName ?? '');
      if (!filePath) continue;

      try {
        // Always read from base branch for canonical content
        let resolvedPath = filePath;
        let existing = await this.github.getFileContent(repoFullName, filePath, baseBranch);

        // If exact path not found, search repo tree for file with same name
        if (!existing) {
          this.logger.warn(`${filePath} not found — searching repo tree for matching filename`);
          resolvedPath = await this.findFilePath(repoFullName, filePath, baseBranch) ?? filePath;
          if (resolvedPath !== filePath) {
            this.logger.log(`Resolved ${filePath} → ${resolvedPath}`);
            existing = await this.github.getFileContent(repoFullName, resolvedPath, baseBranch);
          }
        }

        this.logger.log(
          `File ${resolvedPath}: ${existing ? `found (${existing.content.length} chars)` : 'not found in repo'}`,
        );

        if (existing) {
          const patched = await this.applyPatchRobust(
            existing.content,
            patch,
            filePath,
            cleanDiff,
            String(diag?.rootCause ?? ''),
          );

          if (patched === false) {
            filesSkipped.push(filePath);
            continue;
          }

          await this.github.updateFile(
            repoFullName,
            resolvedPath,
            patched,
            existing.sha,
            `fix(sentifix): apply fix for issue #${issue.githubIssueNumber}`,
            branchName,
          );
        } else {
          const patched = applyPatch('', patch, { fuzzFactor: 2 });
          if (patched === false || patched === '') {
            filesSkipped.push(filePath);
            continue;
          }
          await this.github.createFile(
            repoFullName,
            filePath,
            patched,
            `fix(sentifix): create ${filePath} for issue #${issue.githubIssueNumber}`,
            branchName,
          );
        }
        filesChanged.push(resolvedPath);
      } catch (err) {
        this.logger.error(`Failed to apply patch to ${filePath}: ${(err as Error).message}`);
        filesSkipped.push(filePath);
      }
    }

    if (!filesChanged.length) {
      throw new BadRequestException(
        `Patch did not apply to any files. Files attempted: ${filesSkipped.join(', ')}.`,
      );
    }

    const cls = run.classificationResult as Record<string, unknown>;
    const evalRes = run.evalResults?.[0];
    const score = evalRes ? Math.round(evalRes.score * 100) : 0;

    const prBody = [
      `## 🤖 Automated fix by Sentifix`,
      '',
      `Closes #${issue.githubIssueNumber}`,
      '',
      '### What this fixes',
      String(diag?.rootCause ?? ''),
      '',
      '### Files changed',
      filesChanged.map((f) => `- \`${f}\``).join('\n'),
      filesSkipped.length
        ? `\n### Files skipped\n${filesSkipped.map((f) => `- \`${f}\``).join('\n')}`
        : '',
      '',
      `### Confidence: ${score}/100`,
      `Severity: **${cls?.severity ?? 'unknown'}** · Category: **${cls?.category ?? 'unknown'}**`,
      '',
      '> ⚠️ This PR was automatically generated by [Sentifix](https://github.com/akshatjangid/sentifix). Please review carefully before merging.',
    ]
      .filter((l) => l !== undefined)
      .join('\n');

    const pr = await this.github.createPullRequest(
      repoFullName,
      `fix: ${issue.title} (#${issue.githubIssueNumber})`,
      prBody,
      branchName,
      baseBranch,
    );

    return { prUrl: pr.html_url, prNumber: pr.number, branchName, filesChanged, filesSkipped };
  }

  // ── Patch application strategies (tried in order) ──────────────────────────

  private async applyPatchRobust(
    content: string,
    patch: ParsedDiff,
    filePath: string,
    fullDiff: string,
    rootCause: string,
  ): Promise<string | false> {
    this.logger.log(`Trying strategy 1 (fuzz=2) for ${filePath}`);
    let result = applyPatch(content, patch, { fuzzFactor: 2 });
    if (result !== false) { this.logger.log(`Strategy 1 succeeded`); return result; }

    this.logger.log(`Trying strategy 2 (fuzz=5) for ${filePath}`);
    result = applyPatch(content, patch, { fuzzFactor: 5 });
    if (result !== false) { this.logger.log(`Strategy 2 succeeded`); return result; }

    this.logger.log(`Trying strategy 3 (segment search-replace) for ${filePath}`);
    result = this.applyDirect(content, patch);
    if (result !== false) { this.logger.log(`Strategy 3 succeeded`); return result; }

    this.logger.log(`Trying strategy 4 (LLM) for ${filePath}`);
    result = await this.applyWithLlm(content, filePath, fullDiff, rootCause);
    if (result !== false) { this.logger.log(`Strategy 4 (LLM) succeeded`); return result; }

    this.logger.warn(`All 4 strategies failed for ${filePath}`);
    return false;
  }

  /**
   * Segment-by-segment apply: splits each hunk on context lines, creating
   * independent change-segments. Each segment is applied as its own
   * search-replace. This correctly handles multi-segment hunks where the
   * changes aren't adjacent in the file.
   *
   * Example hunk with two segments:
   *   -OLD_LINE_A        ← segment 1 del
   *   +NEW_LINE_A        ← segment 1 add
   *    (blank ctx line)  ← flush segment 1
   *   -OLD_FUNC_DEF      ← segment 2 del
   *   -    old_body
   *   +NEW_FUNC_DEF      ← segment 2 add
   *   +    new_body      ← end of hunk → flush segment 2
   */
  private applyDirect(content: string, patch: ParsedDiff): string | false {
    let result = content;

    for (const hunk of patch.hunks ?? []) {
      const lines = hunk.lines as string[];
      let delBuf: string[] = [];
      let addBuf: string[] = [];

      const flushSegment = (): boolean => {
        if (!delBuf.length) {
          delBuf = [];
          addBuf = [];
          return true;
        }

        const removed = delBuf.join('\n');
        const added = addBuf.join('\n');

        if (result.includes(removed)) {
          result = result.replace(removed, added);
        } else {
          // Try trailing-space normalisation
          const removedTrimmed = removed
            .split('\n')
            .map((l: string) => l.trimEnd())
            .join('\n');
          const resultNorm = result
            .split('\n')
            .map((l: string) => l.trimEnd())
            .join('\n');

          if (!resultNorm.includes(removedTrimmed)) return false;
          result = resultNorm.replace(removedTrimmed, added);
        }

        delBuf = [];
        addBuf = [];
        return true;
      };

      for (const line of lines) {
        if (line.startsWith('-')) {
          delBuf.push(line.slice(1));
        } else if (line.startsWith('+')) {
          addBuf.push(line.slice(1));
        } else {
          // Context line — flush any open segment first
          if (!flushSegment()) return false;
        }
      }
      // Flush remaining segment at end of hunk
      if (!flushSegment()) return false;
    }

    return result;
  }

  /**
   * LLM fallback: gives the model the actual file content, the proposed diff,
   * and the root cause, and asks it to return the complete corrected file.
   * Handles any edge case where string matching fails (encoding, hallucinated
   * lines, etc.).
   */
  private async applyWithLlm(
    content: string,
    filePath: string,
    diff: string,
    rootCause: string,
  ): Promise<string | false> {
    try {
      const raw = await this.llm.chat([
        {
          role: 'system',
          content: `You are a precise code editor. Apply the given fix to the file.
Return ONLY the raw file content — absolutely no markdown code fences, no explanations, no "Here is the modified file:" prefix.
Start your response with the first character of the file.`,
        },
        {
          role: 'user',
          content: `File: ${filePath}
Bug: ${rootCause}

Diff to apply:
${diff}

Current file:
${content}`,
        },
      ]);

      if (!raw || raw.trim().length < 10) {
        this.logger.warn(`LLM returned empty/tiny response for ${filePath}`);
        return false;
      }

      // Strip markdown fences the LLM might add despite instructions
      const modified = raw
        .replace(/^```[\w]*\r?\n?/, '')
        .replace(/\r?\n?```\s*$/, '')
        .trimEnd();

      this.logger.log(
        `LLM returned ${modified.length} chars for ${filePath} (original: ${content.length})`,
      );

      if (modified.trim() === content.trim()) {
        this.logger.warn(`LLM returned identical content for ${filePath} — fix may already be applied`);
        return false;
      }

      return modified;
    } catch (err) {
      this.logger.error(`LLM patch failed for ${filePath}: ${(err as Error).message}`);
      return false;
    }
  }

  /** Search the repo tree for any file whose name matches the target filename. */
  private async findFilePath(
    repoFullName: string,
    diffPath: string,
    ref: string,
  ): Promise<string | null> {
    const filename = diffPath.split('/').pop() ?? diffPath;
    const candidates = await this.github.findFilesByName(repoFullName, filename, ref);
    if (!candidates.length) return null;

    // Prefer the candidate whose path most closely matches the diff path
    const exact = candidates.find((c) => c === diffPath);
    if (exact) return exact;

    const scored = candidates
      .map((c) => {
        const cParts = c.split('/');
        const dParts = diffPath.split('/');
        const overlap = cParts.filter((p, i) => p === dParts[dParts.length - cParts.length + i]).length;
        return { path: c, overlap };
      })
      .sort((a, b) => b.overlap - a.overlap);

    return scored[0]?.path ?? null;
  }

  private extractPath(raw: string): string {
    return raw.replace(/^[ab]\//, '').trim();
  }

  /**
   * Recalculate @@ hunk line counts from actual content — LLM diffs routinely
   * have wrong counts which cause parsePatch to throw.
   */
  private normalizeDiff(raw: string): string {
    const diff = raw
      .replace(/^```diff\s*\n?/m, '')
      .replace(/\n?```\s*$/m, '')
      .trim();

    const lines = diff.split('\n');
    const out: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.startsWith('@@ ')) {
        let j = i + 1;
        let ctxLines = 0,
          addLines = 0,
          delLines = 0;

        while (
          j < lines.length &&
          !lines[j].startsWith('@@ ') &&
          !lines[j].startsWith('--- ') &&
          !lines[j].startsWith('diff ')
        ) {
          if (lines[j].startsWith('+')) addLines++;
          else if (lines[j].startsWith('-')) delLines++;
          else ctxLines++;
          j++;
        }

        const match = line.match(/@@ -(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)?/);
        const oldStart = match ? match[1] : '1';
        const newStart = match ? match[2] : '1';
        const trailingCtx = match?.[3] ?? '';

        out.push(
          `@@ -${oldStart},${ctxLines + delLines} +${newStart},${ctxLines + addLines} @@${trailingCtx}`,
        );
        i++;
      } else {
        out.push(line);
        i++;
      }
    }

    return out.join('\n');
  }
}
