import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { GithubService } from '../github/github.service';
import { IndexingJob } from '../indexing/indexing.job';
import { Installation } from '../persistence/entities/installation.entity';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { Issue } from '../persistence/entities/issue.entity';
import { QueueProducer } from '../queue/queue.producer';

export interface GithubIssuePayload {
  action: string;
  issue: {
    number: number;
    title: string;
    body: string | null;
    labels: Array<{ name: string }>;
    state: string;
    html_url: string;
  };
  repository: {
    id: number;
    full_name: string;
    clone_url: string;
    default_branch: string;
  };
}

export interface GithubPushPayload {
  ref: string;
  repository: {
    id: number;
    full_name: string;
    default_branch: string;
  };
}

export interface GithubIssueCommentPayload {
  action: string;
  comment: {
    body: string;
    user: { login: string; type: string };
  };
  issue: GithubIssuePayload['issue'];
  repository: GithubIssuePayload['repository'];
}

export interface GithubInstallationPayload {
  action: 'created' | 'deleted' | 'suspend' | 'unsuspend';
  installation: {
    id: number;
    account: { login: string; type: string };
  };
  repositories?: Array<{ id: number; full_name: string; private: boolean }>;
}

export interface GithubInstallationReposPayload {
  action: 'added' | 'removed';
  installation: { id: number };
  repositories_added?: Array<{ id: number; full_name: string }>;
  repositories_removed?: Array<{ id: number; full_name: string }>;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly trigger: string;

  constructor(
    @InjectRepository(Issue) private readonly issueRepo: Repository<Issue>,
    @InjectRepository(Installation) private readonly installationRepo: Repository<Installation>,
    @InjectRepository(InstallationRepository)
    private readonly installRepoMap: Repository<InstallationRepository>,
    private readonly producer: QueueProducer,
    private readonly github: GithubService,
    private readonly indexingJob: IndexingJob,
    config: ConfigService,
  ) {
    this.trigger = config.get<string>('SENTIFIX_TRIGGER') ?? 'all';
  }

  async handleIssueEvent(payload: GithubIssuePayload): Promise<void> {
    const { action, issue, repository } = payload;

    if (action !== 'opened' && action !== 'reopened') {
      this.logger.debug(`Skipping issue event action: ${action}`);
      return;
    }

    const labels = issue.labels.map((l) => l.name);
    if (!this.shouldTriageOnOpen(labels)) {
      this.logger.log(
        `Skipping issue #${issue.number} in ${repository.full_name} — trigger "${this.trigger}" not satisfied`,
      );
      return;
    }

    this.logger.log(
      `Processing ${action} event for issue #${issue.number} in ${repository.full_name}`,
    );
    await this.enqueueIssueForTriage(repository, issue);
  }

  async handleIssueCommentEvent(payload: GithubIssueCommentPayload): Promise<void> {
    const { action, comment, issue, repository } = payload;
    if (action !== 'created') return;
    // Ignore bot comments so Sentifix can never trigger itself
    if (comment.user?.type === 'Bot') return;
    // Only act on an explicit "/sentifix" command (word-bounded)
    if (!/(^|\s)\/sentifix(\s|$)/i.test(comment.body ?? '')) return;

    this.logger.log(
      `/sentifix on issue #${issue.number} in ${repository.full_name} — triggering triage`,
    );
    await this.enqueueIssueForTriage(repository, issue);
  }

  /** Whether to auto-triage a freshly opened/reopened issue given the configured trigger. */
  private shouldTriageOnOpen(labels: string[]): boolean {
    if (this.trigger === 'command') return false; // only "/sentifix" triggers
    if (this.trigger.startsWith('label:')) {
      const required = this.trigger.slice('label:'.length).trim().toLowerCase();
      return labels.some((l) => l.toLowerCase() === required);
    }
    return true; // 'all'
  }

  /** Persist the issue, post a placeholder comment, and enqueue a triage job. */
  private async enqueueIssueForTriage(
    repository: GithubIssuePayload['repository'],
    issue: GithubIssuePayload['issue'],
  ): Promise<void> {
    const existing = await this.issueRepo.findOne({
      where: { githubRepoId: String(repository.id), githubIssueNumber: issue.number },
    });

    const record = this.issueRepo.create({
      ...(existing ?? {}),
      githubRepoId: String(repository.id),
      githubIssueNumber: issue.number,
      repoFullName: repository.full_name,
      title: issue.title,
      body: issue.body ?? '',
      labels: issue.labels.map((l) => l.name),
      state: issue.state,
      embeddingText: `${issue.title}\n\n${issue.body ?? ''}`.trim(),
    });

    const saved = await this.issueRepo.save(record);

    // Post placeholder immediately so the issue thread shows activity right away
    const commentId = await this.github.postPlaceholderComment(
      repository.full_name,
      issue.number,
    );

    if (commentId) {
      saved.githubCommentId = commentId;
      await this.issueRepo.save(saved);
    }

    await this.producer.enqueueTriageJob({
      issueId: saved.id,
      githubRepoId: String(repository.id),
      githubIssueNumber: issue.number,
      repoFullName: repository.full_name,
    });
  }

  async handlePushEvent(payload: GithubPushPayload): Promise<void> {
    const { ref, repository } = payload;
    const defaultBranch = `refs/heads/${repository.default_branch}`;

    if (ref !== defaultBranch) {
      this.logger.debug(`Skipping push to non-default branch: ${ref}`);
      return;
    }

    this.logger.log(`Re-indexing ${repository.full_name} after push to ${ref}`);
    this.indexingJob
      .run({ repoFullName: repository.full_name, branch: repository.default_branch })
      .catch((err: Error) => {
        this.logger.error(`Re-indexing failed for ${repository.full_name}: ${err.message}`);
      });
  }

  async handleInstallationEvent(payload: GithubInstallationPayload): Promise<void> {
    const { action, installation, repositories } = payload;
    const repos = (repositories ?? []).map((r) => r.full_name);

    if (action === 'created') {
      const record = this.installationRepo.create({
        installationId: installation.id,
        accountLogin: installation.account.login,
        accountType: installation.account.type,
        repos,
      });
      await this.installationRepo.save(record);
      await this.mapRepos(installation.id, repos);
      this.logger.log(
        `App installed by ${installation.account.login} on repos: ${repos.join(', ')}`,
      );

      // Auto-index all repos in the background
      for (const repo of repos) {
        this.indexingJob.run({ repoFullName: repo }).catch((err: Error) => {
          this.logger.error(`Auto-indexing failed for ${repo}: ${err.message}`);
        });
      }
    } else if (action === 'deleted') {
      await this.installationRepo.delete({ installationId: installation.id });
      await this.installRepoMap.delete({ installationId: installation.id });
      this.logger.log(`App uninstalled by ${installation.account.login}`);
    }
  }

  async handleInstallationReposEvent(payload: GithubInstallationReposPayload): Promise<void> {
    const installationRecord = await this.installationRepo.findOne({
      where: { installationId: payload.installation.id },
    });
    if (!installationRecord) return;

    if (payload.action === 'added' && payload.repositories_added?.length) {
      const newRepos = payload.repositories_added.map((r) => r.full_name);
      installationRecord.repos = [...(installationRecord.repos ?? []), ...newRepos];
      await this.installationRepo.save(installationRecord);
      await this.mapRepos(payload.installation.id, newRepos);
      this.logger.log(`Repos added to installation: ${newRepos.join(', ')}`);

      for (const repo of newRepos) {
        this.indexingJob.run({ repoFullName: repo }).catch((err: Error) => {
          this.logger.error(`Auto-indexing failed for ${repo}: ${err.message}`);
        });
      }
    } else if (payload.action === 'removed' && payload.repositories_removed?.length) {
      const removed = payload.repositories_removed.map((r) => r.full_name);
      installationRecord.repos = (installationRecord.repos ?? []).filter(
        (r) => !removed.includes(r),
      );
      await this.installationRepo.save(installationRecord);
      if (removed.length) await this.installRepoMap.delete({ repoFullName: In(removed) });
      this.logger.log(`Repos removed from installation: ${removed.join(', ')}`);
    }
  }

  /** Upsert exact repo→installation rows (unique on repoFullName). */
  private async mapRepos(installationId: number, repos: string[]): Promise<void> {
    if (!repos.length) return;
    await this.installRepoMap.upsert(
      repos.map((repoFullName) => ({ installationId, repoFullName })),
      ['repoFullName'],
    );
  }
}
