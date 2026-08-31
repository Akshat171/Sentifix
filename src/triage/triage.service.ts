import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
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
import { RunEventsService } from '../events/run-events.service';

/**
 * Tenant scope for read/act operations. `undefined` = unrestricted (self-host or
 * operator). An array of installation IDs restricts data to those installations' repos.
 */
export type TenantScope = number[] | undefined;

/** What the issue list needs — deliberately not the whole run. */
export interface IssueSummary {
  id: string;
  title: string;
  repoFullName: string | null;
  githubIssueNumber: number | null;
  source: string;
  createdAt: string;
  /** How many times this issue has been triaged. */
  runs: number;
  latestRun: {
    id: string;
    status: string | null;
    startedAt: string | null;
    severity: string | null;
    score: number | null;
  } | null;
}

/** What a delete removed, so the UI can say it plainly. */
export interface DeletionSummary {
  issues: number;
  runs: number;
  evals: number;
  chunks: number;
}

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
  /** False when the customer has switched this repo off. */
  connected: boolean;
}

@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name);
  private readonly billingEnabled: boolean;
  private readonly failureCircuitLimit: number;

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
    private readonly runEvents: RunEventsService,
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.billingEnabled = config.get<boolean>('BILLING_ENABLED') === true;
    this.failureCircuitLimit = Number(config.get<number>('FAILURE_CIRCUIT_LIMIT') ?? 5);
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

    // Defence in depth against a failure that repeats. Even with requeue fixed,
    // anything that re-enqueues the same issue — a webhook retry, a stuck
    // upstream, a manual loop — would otherwise keep paying the provider to fail
    // the same way. Bound it by recent history rather than trusting the caller.
    if (await this.tripped(issue.id)) {
      this.logger.error(
        `Circuit open for issue ${issue.githubIssueNumber}: ` +
          `${this.failureCircuitLimit} consecutive failures in the last hour — refusing to retry`,
      );
      return;
    }

    const run = await this.runRepo.save(
      this.runRepo.create({ issue, status: 'running', repoFullName: job.repoFullName }),
    );
    this.runEvents.publish(job.repoFullName);

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
      this.runEvents.publish(run.repoFullName);

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
      this.runEvents.publish(run.repoFullName);

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
    this.runEvents.publish(issue.repoFullName);

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

  /**
   * One row per issue for the list view, carrying only its most recent run.
   *
   * This used to be `find({ relations: ['runs', 'runs.evalResults'] })`, which
   * loaded every run an issue had ever had. The dashboard polls this endpoint and
   * then calls latestRun() — so on production data (four issues, ~2,000 runs each
   * after the requeue loop) every poll moved 5.5 MB out of Postgres to render
   * four cards, and discarded all but four rows of it.
   *
   * DISTINCT ON gives Postgres the "latest run per issue" directly, so the work
   * is bounded by the number of issues rather than the number of runs. The full
   * run — diff, diagnosis, rationale — is fetched by getRunById when a row is
   * actually opened.
   */
  async getIssueSummaries(scope?: TenantScope): Promise<IssueSummary[]> {
    let repos: string[] | null = null;
    if (scope !== undefined) {
      repos = await this.reposForScope(scope);
      if (!repos.length) return []; // no accessible repos → nothing to show
    }

    const rows: Array<{
      id: string;
      title: string;
      repofullname: string | null;
      githubissuenumber: number | null;
      source: string | null;
      createdat: string;
      runid: string | null;
      status: string | null;
      startedat: string | null;
      severity: string | null;
      score: string | null;
      runs: string;
    }> = await this.dataSource.query(
      `SELECT i.id,
              i.title,
              i."repoFullName"      AS repofullname,
              i."githubIssueNumber" AS githubissuenumber,
              i.source,
              i."createdAt"         AS createdat,
              r.id                  AS runid,
              r.status,
              r."startedAt"         AS startedat,
              r."classificationResult"->>'severity' AS severity,
              (SELECT e.score FROM eval_results e
                WHERE e."runId" = r.id ORDER BY e."createdAt" DESC LIMIT 1)::text AS score,
              COALESCE(rc.runs, 0)::text AS runs
         FROM issues i
         LEFT JOIN LATERAL (
           SELECT run.id, run.status, run."startedAt", run."classificationResult"
             FROM runs run
            WHERE run."issueId" = i.id
            ORDER BY run."startedAt" DESC
            LIMIT 1
         ) r ON true
         LEFT JOIN (
           SELECT "issueId", COUNT(*) AS runs FROM runs GROUP BY "issueId"
         ) rc ON rc."issueId" = i.id
        WHERE $1::text[] IS NULL OR i."repoFullName" = ANY($1)
        ORDER BY i."createdAt" DESC`,
      [repos],
    );

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      repoFullName: row.repofullname,
      githubIssueNumber: row.githubissuenumber,
      source: row.source ?? 'github',
      createdAt: row.createdat,
      runs: Number(row.runs),
      latestRun: row.runid
        ? {
            id: row.runid,
            status: row.status,
            startedAt: row.startedat,
            severity: row.severity,
            score: row.score === null ? null : Number(row.score),
          }
        : null,
    }));
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
    const rows = await this.installRepoMap.find({
      where: { installationId: In(scope), deletedAt: IsNull() },
    });
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

    const disconnected = new Set(
      (
        await this.installRepoMap.find({
          where: { repoFullName: In(repos), disconnectedAt: Not(IsNull()) },
        })
      ).map((r) => r.repoFullName),
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
      connected: !disconnected.has(row.repofullname),
    }));
  }

  /**
   * Delete an issue and everything produced for it.
   *
   * Runs and eval results go with it — they are meaningless without the issue.
   * Ledger entries do not: they reference a run by id but carry no foreign key,
   * so the financial record survives its operational cause, which is what an
   * audit trail is for.
   */
  async deleteIssue(issueId: string, scope?: TenantScope): Promise<DeletionSummary> {
    const issue = await this.issueRepo.findOne({ where: { id: issueId } });
    if (!issue) throw new NotFoundException(`Issue ${issueId} not found`);
    await this.assertRepoInScope(issue.repoFullName ?? '', scope);

    return this.dataSource.transaction(async (tx) => {
      const [{ runs, evals }]: Array<{ runs: string; evals: string }> = await tx.query(
        `SELECT (SELECT count(*) FROM runs WHERE "issueId" = $1)::text AS runs,
                (SELECT count(*) FROM eval_results e
                   JOIN runs r ON r.id = e."runId" WHERE r."issueId" = $1)::text AS evals`,
        [issueId],
      );

      await tx.query(
        `DELETE FROM eval_results WHERE "runId" IN (SELECT id FROM runs WHERE "issueId" = $1)`,
        [issueId],
      );
      await tx.query(`DELETE FROM runs WHERE "issueId" = $1`, [issueId]);
      await tx.query(`DELETE FROM issues WHERE id = $1`, [issueId]);

      this.logger.log(`Deleted issue ${issueId} (${runs} run(s), ${evals} eval(s))`);
      return { issues: 1, runs: Number(runs), evals: Number(evals), chunks: 0 };
    });
  }

  /**
   * Delete a repo's entire footprint: issues, runs, evals and indexed code.
   *
   * Deliberately does not touch GitHub — the App stays installed and no comment
   * or branch is removed. This is "forget what you know about my repo", not
   * "undo what you did on it", because the second is not ours to undo.
   */
  async deleteRepo(repoFullName: string, scope?: TenantScope): Promise<DeletionSummary> {
    await this.assertRepoInScope(repoFullName, scope);

    return this.dataSource.transaction(async (tx) => {
      const [counts]: Array<{ issues: string; runs: string; evals: string; chunks: string }> =
        await tx.query(
          `SELECT (SELECT count(*) FROM issues WHERE "repoFullName" = $1)::text AS issues,
                  (SELECT count(*) FROM runs  WHERE "repoFullName" = $1
                     OR "issueId" IN (SELECT id FROM issues WHERE "repoFullName" = $1))::text AS runs,
                  (SELECT count(*) FROM eval_results e JOIN runs r ON r.id = e."runId"
                    WHERE r."repoFullName" = $1
                      OR r."issueId" IN (SELECT id FROM issues WHERE "repoFullName" = $1))::text AS evals,
                  (SELECT count(*) FROM code_chunks WHERE repo_full_name = $1)::text AS chunks`,
          [repoFullName],
        );

      // Runs are matched on both columns: repoFullName is denormalised onto runs
      // but is nullable, so an older run is only reachable through its issue.
      await tx.query(
        `DELETE FROM eval_results WHERE "runId" IN (
           SELECT id FROM runs WHERE "repoFullName" = $1
             OR "issueId" IN (SELECT id FROM issues WHERE "repoFullName" = $1))`,
        [repoFullName],
      );
      await tx.query(
        `DELETE FROM runs WHERE "repoFullName" = $1
           OR "issueId" IN (SELECT id FROM issues WHERE "repoFullName" = $1)`,
        [repoFullName],
      );
      await tx.query(`DELETE FROM issues WHERE "repoFullName" = $1`, [repoFullName]);
      await tx.query(`DELETE FROM code_chunks WHERE repo_full_name = $1`, [repoFullName]);
      await tx.query(
        `UPDATE installation_repositories
            SET "deletedAt" = now(), "disconnectedAt" = COALESCE("disconnectedAt", now())
          WHERE "repoFullName" = $1`,
        [repoFullName],
      );

      this.logger.log(
        `Deleted ${repoFullName}: ${counts.issues} issue(s), ${counts.runs} run(s), ` +
          `${counts.evals} eval(s), ${counts.chunks} indexed chunk(s)`,
      );
      return {
        issues: Number(counts.issues),
        runs: Number(counts.runs),
        evals: Number(counts.evals),
        chunks: Number(counts.chunks),
      };
    });
  }

  /**
   * Stop acting on a repo without uninstalling the GitHub App.
   *
   * The mapping row is kept rather than deleted, for two reasons: the repo stays
   * attributed to this installation, so its history and spend do not fragment onto
   * a wallet of their own; and reconnecting is one click instead of a reinstall.
   *
   * Already-indexed code is left in place so reconnecting is instant. Nothing new
   * is pulled while disconnected — see IngestionService.handlePushEvent.
   */
  async setRepoConnected(
    repoFullName: string,
    connected: boolean,
    scope?: TenantScope,
  ): Promise<{ repoFullName: string; connected: boolean }> {
    await this.assertRepoInScope(repoFullName, scope);

    const row = await this.installRepoMap.findOne({ where: { repoFullName } });
    if (!row) {
      throw new NotFoundException(`${repoFullName} is not connected to an installation`);
    }

    row.disconnectedAt = connected ? null : new Date();
    await this.installRepoMap.save(row);

    this.logger.log(`${repoFullName} ${connected ? 'reconnected' : 'disconnected'}`);
    return { repoFullName, connected };
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
           SELECT "repoFullName" AS repo FROM installation_repositories WHERE "deletedAt" IS NULL
           UNION SELECT "repoFullName" FROM issues WHERE "repoFullName" IS NOT NULL
           UNION SELECT "repoFullName" FROM runs   WHERE "repoFullName" IS NOT NULL
         ) t
          WHERE repo IS NOT NULL
            AND repo NOT IN (
              SELECT "repoFullName" FROM installation_repositories WHERE "deletedAt" IS NOT NULL
            )`,
      );
      return rows.map((r) => r.repo);
    }
    if (scope.length === 0) return [];
    const rows = await this.installRepoMap.find({
      where: { installationId: In(scope), deletedAt: IsNull() },
    });
    return [...new Set(rows.map((r) => r.repoFullName))];
  }

  /**
   * True when this issue has failed repeatedly and recently, so another attempt
   * is very unlikely to behave differently. Counts only the most recent runs, so
   * one success re-closes the circuit without any extra bookkeeping.
   */
  private async tripped(issueId: string): Promise<boolean> {
    if (this.failureCircuitLimit <= 0) return false;

    const recent = await this.runRepo.find({
      where: { issue: { id: issueId } },
      order: { startedAt: 'DESC' },
      take: this.failureCircuitLimit,
      relations: [],
    });

    return (
      recent.length >= this.failureCircuitLimit &&
      recent.every(
        (r) => r.status === 'failed' && r.startedAt.getTime() > Date.now() - 60 * 60 * 1000,
      )
    );
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
