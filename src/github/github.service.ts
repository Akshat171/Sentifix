import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { DataSource } from 'typeorm';

export interface TriageCommentPayload {
  repoFullName: string;
  issueNumber: number;
  classification: {
    category: string;
    severity: string;
    reasoning: string;
    affectedComponents: string[];
  };
  diagnosis: {
    rootCause: string;
    hypothesis: string;
  };
  proposedDiff: string;
  evalScore: number;
  evalBreakdown: {
    correctness: number;
    completeness: number;
    safety: number;
    clarity: number;
  };
  evalRationale: string;
  runId: string;
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🟢',
};

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  private readonly patOctokit: Octokit;
  private readonly appAuth?: ReturnType<typeof createAppAuth>;

  constructor(
    config: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.patOctokit = new Octokit({ auth: config.get<string>('GITHUB_TOKEN') });

    const appId = config.get<number>('GITHUB_APP_ID');
    const rawKey = config.get<string>('GITHUB_APP_PRIVATE_KEY');
    if (appId && rawKey) {
      this.appAuth = createAppAuth({
        appId,
        privateKey: rawKey.replace(/\\n/g, '\n'),
      });
      this.logger.log(`GitHub App auth configured (App ID: ${appId})`);
    }
  }

  /**
   * Returns an Octokit authenticated for the repo's installation if the GitHub
   * App is configured, otherwise returns the PAT-based client.
   */
  private async getOctokit(repoFullName?: string): Promise<Octokit> {
    if (!this.appAuth || !repoFullName) return this.patOctokit;

    try {
      const rows: Array<{ installation_id: number }> = await this.dataSource.query(
        `SELECT installation_id FROM installation_repositories
         WHERE repo_full_name = $1
         LIMIT 1`,
        [repoFullName],
      );

      if (rows.length && rows[0].installation_id) {
        const { token } = (await this.appAuth({
          type: 'installation',
          installationId: rows[0].installation_id,
        })) as { token: string };
        return new Octokit({ auth: token });
      }
    } catch {
      // Fall through to PAT
    }

    return this.patOctokit;
  }

  async postPlaceholderComment(repoFullName: string, issueNumber: number): Promise<number | null> {
    const [owner, repo] = repoFullName.split('/');
    const body = [
      '## 🤖 Sentifix is analyzing this issue...',
      '',
      '⏳ **Classify** → Retrieve context → Diagnose → Propose fix',
      '',
      '_This comment will be updated with the full triage report in ~30 seconds._',
    ].join('\n');

    try {
      const octokit = await this.getOctokit(repoFullName);
      const { data } = await octokit.issues.createComment({
        owner, repo, issue_number: issueNumber, body,
      });
      this.logger.log(`Posted placeholder comment on ${repoFullName}#${issueNumber}`);
      return data.id;
    } catch (err) {
      this.logger.error(`Failed to post placeholder on ${repoFullName}#${issueNumber}: ${(err as Error).message}`);
      return null;
    }
  }

  async postTriageComment(payload: TriageCommentPayload): Promise<void> {
    const [owner, repo] = payload.repoFullName.split('/');
    const body = this.formatComment(payload);
    const octokit = await this.getOctokit(payload.repoFullName);
    try {
      await octokit.issues.createComment({
        owner, repo, issue_number: payload.issueNumber, body,
      });
      this.logger.log(`Posted triage comment on ${payload.repoFullName}#${payload.issueNumber}`);
    } catch (err) {
      this.logger.error(`Failed to post comment on ${payload.repoFullName}#${payload.issueNumber}: ${(err as Error).message}`);
    }
  }

  async updateTriageComment(repoFullName: string, commentId: number, payload: TriageCommentPayload): Promise<void> {
    const [owner, repo] = repoFullName.split('/');
    const body = this.formatComment(payload);
    const octokit = await this.getOctokit(repoFullName);
    try {
      await octokit.issues.updateComment({ owner, repo, comment_id: commentId, body });
      this.logger.log(`Updated triage comment ${commentId} on ${repoFullName}#${payload.issueNumber}`);
    } catch (err) {
      this.logger.error(`Failed to update comment ${commentId}: ${(err as Error).message}`);
      await this.postTriageComment(payload);
    }
  }

  private formatComment(p: TriageCommentPayload): string {
    const emoji = SEVERITY_EMOJI[p.classification.severity.toLowerCase()] ?? '⚪';
    const score = Math.round(p.evalScore * 100);
    const scoreBar = this.scoreBar(p.evalScore);

    const diffBlock = p.proposedDiff.startsWith('```')
      ? p.proposedDiff
      : p.proposedDiff === '# insufficient-context'
        ? '_Insufficient code context to generate a diff. Index the repository first._'
        : `\`\`\`diff\n${p.proposedDiff}\n\`\`\``;

    const breakdown = [
      `Correctness ${Math.round(p.evalBreakdown.correctness * 100)}%`,
      `Completeness ${Math.round(p.evalBreakdown.completeness * 100)}%`,
      `Safety ${Math.round(p.evalBreakdown.safety * 100)}%`,
      `Clarity ${Math.round(p.evalBreakdown.clarity * 100)}%`,
    ].join(' · ');

    return `## 🤖 Sentifix Triage Report

${emoji} **Severity:** ${this.capitalise(p.classification.severity)} &nbsp;|&nbsp; **Category:** ${this.capitalise(p.classification.category)} &nbsp;|&nbsp; **Score:** ${scoreBar} ${score}/100

**Affected:** ${p.classification.affectedComponents.join(', ')}

---

### Root Cause
${p.diagnosis.rootCause}

### Hypothesis
${p.diagnosis.hypothesis}

### Proposed Fix
${diffBlock}

### Judge's Notes
${p.evalRationale}

> ${breakdown}

---
<sub>Run ID: \`${p.runId}\` · Generated by [Sentifix](https://github.com/akshatjangid/sentifix)</sub>`;
  }

  // ── Git / PR helpers ────────────────────────────────────────────────────────

  async findFilesByName(repoFullName: string, filename: string, ref: string): Promise<string[]> {
    const [owner, repo] = repoFullName.split('/');
    const octokit = await this.getOctokit(repoFullName);
    try {
      const { data } = await octokit.git.getTree({ owner, repo, tree_sha: ref, recursive: '1' });
      return (data.tree ?? [])
        .filter((node) => node.type === 'blob' && node.path?.split('/').pop() === filename)
        .map((node) => node.path!);
    } catch {
      return [];
    }
  }

  async getDefaultBranch(repoFullName: string): Promise<{ name: string; sha: string }> {
    const [owner, repo] = repoFullName.split('/');
    const octokit = await this.getOctokit(repoFullName);
    const { data } = await octokit.repos.get({ owner, repo });
    const branch = data.default_branch;
    const ref = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
    return { name: branch, sha: ref.data.object.sha };
  }

  async createBranch(repoFullName: string, branchName: string, fromSha: string): Promise<void> {
    const [owner, repo] = repoFullName.split('/');
    const octokit = await this.getOctokit(repoFullName);
    try {
      await octokit.git.deleteRef({ owner, repo, ref: `heads/${branchName}` });
      this.logger.log(`Deleted existing branch ${branchName}`);
    } catch { /* didn't exist */ }
    await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branchName}`, sha: fromSha });
    this.logger.log(`Created branch ${branchName} on ${repoFullName}`);
  }

  async getFileContent(repoFullName: string, path: string, ref: string): Promise<{ content: string; sha: string } | null> {
    const [owner, repo] = repoFullName.split('/');
    const octokit = await this.getOctokit(repoFullName);
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
      if ('content' in data && data.type === 'file') {
        return { content: Buffer.from(data.content, 'base64').toString('utf-8'), sha: data.sha };
      }
      return null;
    } catch { return null; }
  }

  async updateFile(repoFullName: string, path: string, newContent: string, fileSha: string, commitMessage: string, branch: string): Promise<void> {
    const [owner, repo] = repoFullName.split('/');
    const octokit = await this.getOctokit(repoFullName);
    await octokit.repos.createOrUpdateFileContents({
      owner, repo, path, branch, message: commitMessage,
      content: Buffer.from(newContent).toString('base64'), sha: fileSha,
    });
  }

  async createFile(repoFullName: string, path: string, content: string, commitMessage: string, branch: string): Promise<void> {
    const [owner, repo] = repoFullName.split('/');
    const octokit = await this.getOctokit(repoFullName);
    await octokit.repos.createOrUpdateFileContents({
      owner, repo, path, branch, message: commitMessage,
      content: Buffer.from(content).toString('base64'),
    });
  }

  async createPullRequest(repoFullName: string, title: string, body: string, head: string, base: string): Promise<{ number: number; html_url: string }> {
    const [owner, repo] = repoFullName.split('/');
    const octokit = await this.getOctokit(repoFullName);
    try {
      const existing = await octokit.pulls.list({ owner, repo, head: `${owner}:${head}`, state: 'open' });
      for (const pr of existing.data) {
        await octokit.pulls.update({ owner, repo, pull_number: pr.number, state: 'closed' });
        this.logger.log(`Closed stale PR #${pr.number} for branch ${head}`);
      }
    } catch { /* non-critical */ }
    const { data } = await octokit.pulls.create({ owner, repo, title, body, head, base });
    this.logger.log(`Created PR #${data.number} on ${repoFullName}: ${data.html_url}`);
    return { number: data.number, html_url: data.html_url };
  }

  private scoreBar(score: number): string {
    const filled = Math.round(score * 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  }

  private capitalise(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
