import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GithubService } from '../github/github.service';
import { IndexingJob } from '../indexing/indexing.job';
import { Installation } from '../persistence/entities/installation.entity';
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

  constructor(
    @InjectRepository(Issue) private readonly issueRepo: Repository<Issue>,
    @InjectRepository(Installation) private readonly installationRepo: Repository<Installation>,
    private readonly producer: QueueProducer,
    private readonly github: GithubService,
    private readonly indexingJob: IndexingJob,
  ) {}

  async handleIssueEvent(payload: GithubIssuePayload): Promise<void> {
    const { action, issue, repository } = payload;

    if (action !== 'opened' && action !== 'reopened') {
      this.logger.debug(`Skipping issue event action: ${action}`);
      return;
    }

    this.logger.log(
      `Processing ${action} event for issue #${issue.number} in ${repository.full_name}`,
    );

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
      this.logger.log(`Repos added to installation: ${newRepos.join(', ')}`);

      for (const repo of newRepos) {
        this.indexingJob.run({ repoFullName: repo }).catch((err: Error) => {
          this.logger.error(`Auto-indexing failed for ${repo}: ${err.message}`);
        });
      }
    } else if (payload.action === 'removed' && payload.repositories_removed?.length) {
      const removed = new Set(payload.repositories_removed.map((r) => r.full_name));
      installationRecord.repos = (installationRecord.repos ?? []).filter((r) => !removed.has(r));
      await this.installationRepo.save(installationRecord);
      this.logger.log(`Repos removed from installation: ${[...removed].join(', ')}`);
    }
  }
}
