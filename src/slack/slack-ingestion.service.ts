import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AgentPipeline } from '../agent/agent.pipeline';
import { EvalJudge } from '../eval/eval.judge';
import { GithubService } from '../github/github.service';
import { IndexingJob } from '../indexing/indexing.job';
import { Issue } from '../persistence/entities/issue.entity';
import { Run } from '../persistence/entities/run.entity';
import { EvalResult } from '../persistence/entities/eval-result.entity';
import { SlackService } from './slack.service';

export interface SlackMentionEvent {
  type: string;
  text: string;           // raw message text including the @mention
  user: string;           // Slack user ID who sent it
  channel: string;        // channel ID
  ts: string;             // message timestamp (unique ID)
  thread_ts?: string;     // parent message ts if replying in thread
  team: string;           // workspace ID
}

@Injectable()
export class SlackIngestionService {
  private readonly logger = new Logger(SlackIngestionService.name);
  private readonly defaultRepo: string;

  constructor(
    @InjectRepository(Issue) private readonly issueRepo: Repository<Issue>,
    @InjectRepository(Run) private readonly runRepo: Repository<Run>,
    @InjectRepository(EvalResult) private readonly evalRepo: Repository<EvalResult>,
    private readonly pipeline: AgentPipeline,
    private readonly judge: EvalJudge,
    private readonly github: GithubService,
    private readonly slackService: SlackService,
    private readonly indexingJob: IndexingJob,
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.defaultRepo = config.get<string>('SLACK_DEFAULT_REPO') ?? '';
  }

  async handleMention(event: SlackMentionEvent): Promise<void> {
    // Strip the @mention, Slack formatting, and normalize quotes
    const cleanText = (event.text ?? '')
      .replace(/<@[A-Z0-9]+>/g, '')    // remove @mentions
      .replace(/[“”„]/g, '"') // smart double quotes → straight
      .replace(/[‘’‚]/g, "'") // smart single quotes → straight
      .replace(/<[^>]+>/g, '')           // strip remaining Slack formatting tags
      .trim();
    if (!cleanText) return;

    const threadTs = event.thread_ts ?? event.ts;

    this.logger.log(`Slack mention from ${event.user} in ${event.channel}: "${cleanText.slice(0, 80)}"`);

    // 1. Detect repo from message or use default
    const repoFullName = this.detectRepo(cleanText) ?? this.defaultRepo;
    if (!repoFullName) {
      this.logger.warn('No repo detected and SLACK_DEFAULT_REPO not set — skipping');
      return;
    }

    // 2. Post placeholder reply immediately
    const placeholderTs = await this.slackService.postPlaceholder(event.channel, threadTs);

    // 3. Persist as an Issue so it appears in the dashboard
    const issue = await this.issueRepo.save(
      this.issueRepo.create({
        githubRepoId: `slack:${event.team}:${event.channel}`,
        githubIssueNumber: parseInt(event.ts.replace('.', '').slice(-8), 10),
        repoFullName,
        title: this.extractTitle(cleanText),
        body: cleanText,
        labels: ['slack'],
        state: 'open',
        source: 'slack',
        sourceChannelId: event.channel,
        sourceThreadTs: threadTs,
        sourceTeamId: event.team,
        githubCommentId: null,
        embeddingText: cleanText,
      }),
    );

    // 4. Auto-index if needed
    await this.ensureIndexed(repoFullName);

    // 5. Run the pipeline
    const run = await this.runRepo.save(
      this.runRepo.create({ issue, status: 'running', repoFullName }),
    );

    try {
      const output = await this.pipeline.run({
        issueId: issue.id,
        repoFullName,
        title: issue.title,
        body: cleanText,
      });

      const evalOutput = await this.judge.evaluate({
        runId: run.id,
        issue: { title: issue.title, body: cleanText },
        classification: output.classification as unknown as Record<string, unknown>,
        diagnosis: output.diagnosis as unknown as Record<string, unknown>,
        proposedDiff: output.proposedDiff,
      });

      await this.evalRepo.save(
        this.evalRepo.create({
          run,
          judgeModel: evalOutput.model,
          score: evalOutput.score,
          rationale: JSON.stringify({ rationale: evalOutput.rationale, breakdown: evalOutput.breakdown }),
        }),
      );

      run.classificationResult = output.classification as unknown as Record<string, unknown>;
      run.diagnosisResult = output.diagnosis as unknown as Record<string, unknown>;
      run.proposedDiff = output.proposedDiff;
      run.status = 'completed';
      run.completedAt = new Date();
      await this.runRepo.save(run);

      // 6. Try to create a PR
      let prUrl: string | undefined;
      let prNumber: number | undefined;
      try {
        const { name: baseBranch, sha } = await this.github.getDefaultBranch(repoFullName);
        const branchName = `sentifix/slack-${event.channel}-${event.ts.replace('.', '')}`;
        // PR creation handled by resolve flow — here we just note it's possible
        this.logger.log(`Triage complete for Slack issue, score: ${evalOutput.score.toFixed(2)}`);
      } catch { /* PR creation is best-effort */ }

      // 7. Update the Slack placeholder with the full report
      if (placeholderTs) {
        await this.slackService.updateWithTriageResult({
          channel: event.channel,
          threadTs,
          placeholderTs,
          classification: output.classification as unknown as Record<string, unknown>,
          diagnosis: output.diagnosis as unknown as Record<string, unknown>,
          proposedDiff: output.proposedDiff,
          evalScore: evalOutput.score,
          evalBreakdown: evalOutput.breakdown,
          evalRationale: evalOutput.rationale,
          prUrl,
          prNumber,
          runId: run.id,
          repoFullName,
        });
      }
    } catch (err) {
      run.status = 'failed';
      run.completedAt = new Date();
      await this.runRepo.save(run);
      this.logger.error(`Slack triage failed: ${(err as Error).message}`);
    }
  }

  private detectRepo(text: string): string | null {
    // github.com/owner/repo link
    const ghLink = text.match(/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/);
    if (ghLink) return ghLink[1];

    // Explicit mention: "repo: owner/repo" or "in owner/repo"
    const explicit = text.match(/(?:repo|in|for)\s*:?\s*([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/i);
    if (explicit) return explicit[1];

    return null;
  }

  private extractTitle(text: string): string {
    // Use first non-empty line as title, cap at 120 chars
    const firstLine = text.split('\n').find((l) => l.trim().length > 0) ?? text;
    return firstLine.slice(0, 120);
  }

  private async ensureIndexed(repoFullName: string): Promise<void> {
    const [{ count }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM code_chunks WHERE repo_full_name = $1`,
      [repoFullName],
    );
    if (count > 0) return;
    this.logger.log(`Auto-indexing ${repoFullName} for Slack triage`);
    try {
      await this.indexingJob.run({ repoFullName });
    } catch (err) {
      this.logger.error(
        `Indexing failed for ${repoFullName}: ${(err as Error).message}. ` +
        'Check that GITHUB_TOKEN has access to this repo and SLACK_DEFAULT_REPO is correct.',
      );
      // Don't rethrow — let triage continue without RAG context
    }
  }
}
