import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentPipeline } from '../agent/agent.pipeline';
import { EvalJudge } from '../eval/eval.judge';
import { GithubService } from '../github/github.service';
import { IndexingJob } from '../indexing/indexing.job';
import { EvalResult } from '../persistence/entities/eval-result.entity';
import { Issue } from '../persistence/entities/issue.entity';
import { Run } from '../persistence/entities/run.entity';
import { TriageJobPayload } from '../queue/queue.producer';
import { DataSource } from 'typeorm';

@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name);

  constructor(
    @InjectRepository(Issue) private readonly issueRepo: Repository<Issue>,
    @InjectRepository(Run) private readonly runRepo: Repository<Run>,
    @InjectRepository(EvalResult) private readonly evalRepo: Repository<EvalResult>,
    private readonly pipeline: AgentPipeline,
    private readonly judge: EvalJudge,
    private readonly github: GithubService,
    private readonly indexingJob: IndexingJob,
    private readonly dataSource: DataSource,
  ) {}

  async orchestrate(job: TriageJobPayload): Promise<void> {
    const issue = await this.issueRepo.findOne({ where: { id: job.issueId } });
    if (!issue) {
      this.logger.warn(`Issue ${job.issueId} not found, skipping triage`);
      return;
    }

    const run = await this.runRepo.save(
      this.runRepo.create({ issue, status: 'running', repoFullName: job.repoFullName }),
    );

    try {
      // Auto-index if repo has no chunks yet — ensures RAG always has content
      await this.ensureIndexed(job.repoFullName, issue.githubCommentId, job.githubIssueNumber);

      const output = await this.pipeline.run({
        issueId: issue.id,
        repoFullName: job.repoFullName,
        title: issue.title,
        body: issue.body,
      });

      const evalOutput = await this.judge.evaluate({
        runId: run.id,
        issue: { title: issue.title, body: issue.body },
        classification: output.classification as unknown as Record<string, unknown>,
        diagnosis: output.diagnosis as unknown as Record<string, unknown>,
        proposedDiff: output.proposedDiff,
      });

      await this.evalRepo.save(
        this.evalRepo.create({
          run,
          judgeModel: evalOutput.model,
          score: evalOutput.score,
          rationale: JSON.stringify({
            rationale: evalOutput.rationale,
            breakdown: evalOutput.breakdown,
          }),
        }),
      );

      run.classificationResult = output.classification as unknown as Record<string, unknown>;
      run.diagnosisResult = output.diagnosis as unknown as Record<string, unknown>;
      run.proposedDiff = output.proposedDiff;
      run.status = 'completed';
      run.completedAt = new Date();
      await this.runRepo.save(run);

      this.logger.log(
        `Triage complete for issue ${issue.githubIssueNumber} — score: ${evalOutput.score.toFixed(2)}`,
      );

      // Edit placeholder if it exists, otherwise post fresh comment
      const commentPayload = {
        repoFullName: job.repoFullName,
        issueNumber: issue.githubIssueNumber,
        classification: output.classification,
        diagnosis: output.diagnosis,
        proposedDiff: output.proposedDiff,
        evalScore: evalOutput.score,
        evalBreakdown: evalOutput.breakdown,
        evalRationale: evalOutput.rationale,
        runId: run.id,
      };

      const commentAction = issue.githubCommentId
        ? this.github.updateTriageComment(job.repoFullName, issue.githubCommentId, commentPayload)
        : this.github.postTriageComment(commentPayload);

      commentAction.catch((err: Error) =>
        this.logger.error(`GitHub comment failed: ${err.message}`),
      );
    } catch (err) {
      run.status = 'failed';
      run.completedAt = new Date();
      await this.runRepo.save(run);
      this.logger.error(`Triage failed for run ${run.id}: ${(err as Error).message}`);
      throw err;
    }
  }

  private async ensureIndexed(
    repoFullName: string,
    commentId: number | null,
    issueNumber: number,
  ): Promise<void> {
    const [{ count }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM code_chunks WHERE repo_full_name = $1`,
      [repoFullName],
    );

    if (count > 0) {
      this.logger.log(`Repo ${repoFullName} already indexed (${count} chunks)`);
      return;
    }

    this.logger.log(`Repo ${repoFullName} not indexed — auto-indexing before triage`);

    // Update placeholder comment so user knows what's happening
    if (commentId) {
      const [owner, repo] = repoFullName.split('/');
      await this.dataSource.query('SELECT 1').catch(() => null); // keep connection alive
      this.github
        .postPlaceholderComment(repoFullName, issueNumber)
        .catch(() => null);
    }

    await this.indexingJob.run({ repoFullName });
    this.logger.log(`Auto-indexing complete for ${repoFullName}`);
  }

  async retriageIssue(issueId: string): Promise<{ runId: string }> {
    const issue = await this.issueRepo.findOne({ where: { id: issueId } });
    if (!issue) throw new NotFoundException(`Issue ${issueId} not found`);
    if (!issue.repoFullName) throw new NotFoundException('repoFullName not set on issue');

    const run = await this.runRepo.save(
      this.runRepo.create({ issue, status: 'pending', repoFullName: issue.repoFullName }),
    );

    // Orchestrate in background — same flow as the queue consumer
    this.orchestrate({
      issueId: issue.id,
      githubRepoId: issue.githubRepoId,
      githubIssueNumber: issue.githubIssueNumber,
      repoFullName: issue.repoFullName,
    }).catch((err: Error) =>
      this.logger.error(`Re-triage failed for issue ${issueId}: ${err.message}`),
    );

    this.logger.log(`Re-triage queued for issue #${issue.githubIssueNumber}`);
    return { runId: run.id };
  }

  async getAllIssues(): Promise<Issue[]> {
    return this.issueRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['runs', 'runs.evalResults'],
    });
  }

  async getRunById(runId: string): Promise<Run> {
    const run = await this.runRepo.findOne({
      where: { id: runId },
      relations: ['issue', 'evalResults'],
    });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    return run;
  }

  async getRunsForIssue(issueId: string): Promise<Run[]> {
    return this.runRepo.find({
      where: { issue: { id: issueId } },
      order: { startedAt: 'DESC' },
      relations: ['evalResults'],
    });
  }
}
