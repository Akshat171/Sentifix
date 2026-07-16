import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { Run } from '../persistence/entities/run.entity';

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
}

/**
 * Per-tenant triage cap over a rolling 24h window. A tenant is a GitHub
 * installation (all its repos share the budget); if a repo isn't mapped to an
 * installation, the repo itself is the tenant. Protects LLM spend on public deploys.
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);
  private readonly dailyLimit: number;

  constructor(
    config: ConfigService,
    @InjectRepository(Run) private readonly runRepo: Repository<Run>,
    @InjectRepository(InstallationRepository) private readonly mapRepo: Repository<InstallationRepository>,
  ) {
    this.dailyLimit = Number(config.get<number>('TRIAGE_DAILY_LIMIT') ?? 0);
  }

  async check(repoFullName: string): Promise<QuotaResult> {
    if (!this.dailyLimit || this.dailyLimit <= 0) {
      return { allowed: true, used: 0, limit: 0 }; // unlimited
    }
    const repos = await this.tenantRepos(repoFullName);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const used = await this.runRepo.count({
      where: { repoFullName: In(repos), startedAt: MoreThanOrEqual(since) },
    });
    return { allowed: used < this.dailyLimit, used, limit: this.dailyLimit };
  }

  /** All repos sharing the tenant's budget (the installation's repos, else just this repo). */
  private async tenantRepos(repoFullName: string): Promise<string[]> {
    const map = await this.mapRepo.findOne({ where: { repoFullName } });
    if (!map) return [repoFullName];
    const rows = await this.mapRepo.find({ where: { installationId: map.installationId } });
    return rows.length ? rows.map((r) => r.repoFullName) : [repoFullName];
  }
}
