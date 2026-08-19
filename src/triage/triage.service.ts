import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { TriageRunner } from '../agent/triage-runner.service';
import { GithubService } from '../github/github.service';
import { IndexingJob } from '../indexing/indexing.job';
import { EvalResult } from '../persistence/entities/eval-result.entity';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { Issue } from '../persistence/entities/issue.entity';
import { Run } from '../persistence/entities/run.entity';
import { TriageJobPayload } from '../queue/queue.producer';
import { QuotaService } from '../quota/quota.service';
import { DataSource } from 'typeorm';
import { TenantModelService } from '../llm/tenant-model.service';
import { AccountService } from '../billing/account.service';
import { formatCredits } from '../billing/pricing';
import { InsufficientCreditsError } from '../agent/triage-runner.service';
import { LowBalanceService } from '../billing/low-balance.service';

/**
 * Tenant scope for read/act operations. `undefined` = unrestricted (self-host or
 * operator). An array of installation IDs restricts data to those installations' repos.
 */
export type TenantScope = number[] | undefined;

export interface RepoOverview {
  repoFullName: string;
  issues: number;
  runs: number;
  completed: number;
  failed: number;
  /** Mean eval score across this repo's runs, or null when nothing scored yet. */
  avgScore: number | null;
  lastActivity: string | null;
  indexed: boolean;
  chunks: number;
}

@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name);
  private readonly billingEnabled: boolean;

  constructor(
    @InjectRepository(Issue) private readonly issueRepo: Repository<Issue>,
    @InjectRepository(Run) private readonly runRepo: Repository<Run>,
    @InjectRepository(EvalResult) private readonly evalRepo: Repository<EvalResult>,
    @InjectRepository(InstallationRepository)
    private readonly installRepoMap: Repository<InstallationRepository>,
    private readonly runner: TriageRunner,
    private readonly github: GithubService,
    private readonly indexingJob: IndexingJob,
    private readonly quota: QuotaService,
    private readonly tenantModels: TenantModelService,
    private readonly accounts: AccountService,
    private readonly lowBalance: LowBalanceService,
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.billingEnabled = config.get<boolean>('BILLING_ENABLED') === true;
  }

  async orchestrate(job: TriageJobPayload): Promise<void> {
    const issue = await this.issueRepo.findOne({ where: { id: job.issueId } });
    if (!issue) {
      this.logger.warn(`Issue ${job.issueId} not found, skipping triage`);
      return;
    }

    // Per-tenant daily cap — protects LLM spend on public multi-tenant deploys
    const quota = await this.quota.check(job.repoFullName);
    if (!quota.allowed) {
      this.logger.warn(
        `Triage quota reached for ${job.repoFullName}: ${quota.used}/${quota.limit}/day`,
      );
      const body = [
        '## 🤖 Sentifix — daily limit reached',
        '',
        `This account has hit its automated-triage limit (**${quota.limit}/day**). Triage resumes once the 24h window rolls over.`,
      ].join('\n');
      await this.github.postNotice(
        job.repoFullName,
        job.githubIssueNumber,
        issue.githubCommentId,
        body,
      );
      return;
    }

    const run = await this.runRepo.save(
      this.runRepo.create({ issue, status: 'running', repoFullName: job.repoFullName }),
    );

    try {
      // Auto-index if repo has no chunks yet — ensures RAG always has content
      await this.ensureIndexed(job.repoFullName, issue.githubCommentId, job.githubIssueNumber);

      const models = await this.tenantModels.forRepo(job.repoFullName);
      // Only touch the billing tables when billing is on. Resolving an account
      // unconditionally would make every triage depend on schema that a
      // billing-disabled deployment has no reason to have.
      const account = this.billingEnabled ? await this.accounts.forRepo(job.repoFullName) : null;
      this.logger.log(
        `Triaging ${job.repoFullName} on model ${models.chat}` +
          (account ? ` (account ${account.id})` : ''),
      );

      const {
        output,
        evaluation: evalOutput,
        modelKey,
        escalated,
      } = await this.runner.run(
        run.id,
        {
          issueId: issue.id,
          repoFullName: job.repoFullName,
          title: issue.title,
          body: issue.body,
          models,
        },
        account?.id,
      );

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
      run.modelKey = modelKey;
      run.escalated = escalated;
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

      // Best-effort: a missed warning must never fail a triage that succeeded.
      const warning = account
        ? await this.lowBalance.checkAndClaim(account.id).catch(() => null)
        : null;
      if (warning) {
        await this.github
          .postNotice(
            job.repoFullName,
            job.githubIssueNumber,
            null,
            this.lowBalance.format(warning),
          )
          .catch(() => undefined);
      }
    } catch (err) {
      run.status = 'failed';
      run.completedAt = new Date();
      await this.runRepo.save(run);

      if (err instanceof InsufficientCreditsError) {
        // Out of credit is a billing state, not a fault: tell the customer how to
        // fix it and stop, rather than surfacing a stack trace or retrying.
        this.logger.warn(`Run ${run.id} halted — account out of credits`);
        await this.github.postNotice(
          job.repoFullName,
          job.githubIssueNumber,
          issue.githubCommentId,
          [
            '## Sentifix — out of credits',
            '',
            `This account has ${formatCredits(err.availableMicro)} credits left and this triage needs about ${formatCredits(err.requiredMicro)}.`,
            '',
            'Top up to resume automated triage. Nothing was charged for this issue.',
          ].join('\n'),
        );
        return;
      }

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
      this.github.postPlaceholderComment(repoFullName, issueNumber).catch(() => null);
    }

    await this.indexingJob.run({ repoFullName });
    this.logger.log(`Auto-indexing complete for ${repoFullName}`);
  }

  async retriageIssue(issueId: string, scope?: TenantScope): Promise<{ runId: string }> {
    const issue = await this.issueRepo.findOne({ where: { id: issueId } });
    if (!issue) throw new NotFoundException(`Issue ${issueId} not found`);
    if (!issue.repoFullName) throw new NotFoundException('repoFullName not set on issue');
    await this.assertRepoInScope(issue.repoFullName, scope);

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

  async getAllIssues(scope?: TenantScope): Promise<Issue[]> {
    let where: FindOptionsWhere<Issue> | undefined;
    if (scope !== undefined) {
      const repos = await this.reposForScope(scope);
      if (!repos.length) return []; // no accessible repos → nothing to show
      where = { repoFullName: In(repos) };
    }
    return this.issueRepo.find({
      ...(where ? { where } : {}),
      order: { createdAt: 'DESC' },
      relations: ['runs', 'runs.evalResults'],
    });
  }

  async getRunById(runId: string, scope?: TenantScope): Promise<Run> {
    const run = await this.runRepo.findOne({
      where: { id: runId },
      relations: ['issue', 'evalResults'],
    });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    await this.assertRepoInScope(run.repoFullName ?? run.issue?.repoFullName ?? '', scope);
    return run;
  }

  async getRunsForIssue(issueId: string): Promise<Run[]> {
    return this.runRepo.find({
      where: { issue: { id: issueId } },
      order: { startedAt: 'DESC' },
      relations: ['evalResults'],
    });
  }

  /** Repo full-names visible to the given tenant scope. */
  private async reposForScope(scope: number[]): Promise<string[]> {
    if (!scope.length) return [];
    const rows = await this.installRepoMap.find({ where: { installationId: In(scope) } });
    return rows.map((r) => r.repoFullName);
  }

  /**
   * One row per connected repository, with everything needed to answer "is this
   * working for me?" without drilling into a single issue.
   *
   * Repos come from the installation record rather than from the issues table, so
   * a freshly connected repo appears immediately with zeroes instead of being
   * invisible until its first bug report — which is what made the dashboard feel
   * empty and pushed people back to the connect screen.
   */
  async getRepoOverview(scope?: TenantScope): Promise<RepoOverview[]> {
    const repos = await this.reposForOverview(scope);
    if (repos.length === 0) return [];

    const rows: Array<{
      repofullname: string;
      issues: string;
      runs: string;
      completed: string;
      failed: string;
      avgscore: string | null;
      lastactivity: string | null;
      chunks: string;
    }> = await this.dataSource.query(
      `SELECT r.repo                                        AS repofullname,
              COALESCE(i.issues, 0)::text                   AS issues,
              COALESCE(ru.runs, 0)::text                    AS runs,
              COALESCE(ru.completed, 0)::text               AS completed,
              COALESCE(ru.failed, 0)::text                  AS failed,
              ev.avgscore::text                             AS avgscore,
              GREATEST(i.last_issue, ru.last_run)::text      AS lastactivity,
              COALESCE(c.chunks, 0)::text                   AS chunks
         FROM unnest($1::text[]) AS r(repo)
         LEFT JOIN (
           SELECT "repoFullName" AS repo, COUNT(*) AS issues, MAX("createdAt") AS last_issue
             FROM issues WHERE "repoFullName" = ANY($1) GROUP BY "repoFullName"
         ) i ON i.repo = r.repo
         LEFT JOIN (
           SELECT "repoFullName" AS repo, COUNT(*) AS runs,
                  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                  COUNT(*) FILTER (WHERE status = 'failed')    AS failed,
                  MAX("startedAt") AS last_run
             FROM runs WHERE "repoFullName" = ANY($1) GROUP BY "repoFullName"
         ) ru ON ru.repo = r.repo
         LEFT JOIN (
           SELECT run."repoFullName" AS repo, ROUND(AVG(e.score)::numeric, 2) AS avgscore
             FROM eval_results e
             JOIN runs run ON run.id = e."runId"
            WHERE run."repoFullName" = ANY($1) GROUP BY run."repoFullName"
         ) ev ON ev.repo = r.repo
         LEFT JOIN (
           SELECT repo_full_name AS repo, COUNT(*) AS chunks
             FROM code_chunks WHERE repo_full_name = ANY($1) GROUP BY repo_full_name
         ) c ON c.repo = r.repo
        ORDER BY GREATEST(i.last_issue, ru.last_run) DESC NULLS LAST, r.repo`,
      [repos],
    );

    return rows.map((row) => ({
      repoFullName: row.repofullname,
      issues: Number(row.issues),
      runs: Number(row.runs),
      completed: Number(row.completed),
      failed: Number(row.failed),
      avgScore: row.avgscore === null ? null : Number(row.avgscore),
      lastActivity: row.lastactivity,
      indexed: Number(row.chunks) > 0,
      chunks: Number(row.chunks),
    }));
  }

  /**
   * Repos the caller may see.
   *
   * A tenant sees exactly the repos mapped to their installations — an unmapped
   * repo cannot be attributed to anyone, so including it would leak another
   * customer's data. The unrestricted (operator) view additionally unions in any
   * repo that has issues or runs but no mapping, which otherwise stays invisible
   * despite being active.
   */
  private async reposForOverview(scope?: TenantScope): Promise<string[]> {
    if (scope === undefined) {
      const rows: Array<{ repo: string }> = await this.dataSource.query(
        `SELECT DISTINCT repo FROM (
           SELECT "repoFullName" AS repo FROM installation_repositories
           UNION SELECT "repoFullName" FROM issues WHERE "repoFullName" IS NOT NULL
           UNION SELECT "repoFullName" FROM runs   WHERE "repoFullName" IS NOT NULL
         ) t WHERE repo IS NOT NULL`,
      );
      return rows.map((r) => r.repo);
    }
    if (scope.length === 0) return [];
    const rows = await this.installRepoMap.find({ where: { installationId: In(scope) } });
    return [...new Set(rows.map((r) => r.repoFullName))];
  }

  /** Throw unless the repo is visible to the scope (no-op when unrestricted). */
  async assertRepoInScope(repoFullName: string, scope?: TenantScope): Promise<void> {
    if (scope === undefined) return;
    const repos = await this.reposForScope(scope);
    if (!repos.includes(repoFullName)) {
      throw new ForbiddenException('Repository not in your installations');
    }
  }
}
