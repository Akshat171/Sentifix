import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Account } from '../persistence/entities/account.entity';
import { UsageRecord } from '../persistence/entities/usage-record.entity';
import { requireModel, selectableModels } from '../llm/model-catalog';
import { TenantModelService } from '../llm/tenant-model.service';
import { costMicro, formatCredits, MICRO_PER_CREDIT } from './pricing';

export interface TierOption {
  key: string;
  label: string;
  tier: string;
  creditsPerRun: number;
  runsRemaining: number;
  /** Change in runs remaining versus the tenant's current tier. */
  deltaRuns: number;
  current: boolean;
}

export interface ClientSummary {
  accountId: string;
  availableCredits: string;
  currentModelKey: string;
  usingDefault: boolean;
  runsRemaining: number;
  /** Null when there is not enough history to project honestly. */
  daysRemaining: number | null;
  options: TierOption[];
}

export type Recommendation = 'move_up' | 'move_down' | 'healthy';

export interface TenantStat {
  provider: string;
  externalId: string;
  label: string;
  modelKey: string | null;
  effectiveModel: string;
  runs: number;
  escalated: number;
  escalationRate: number;
  chargedCredits: string;
  marginCredits: string;
  marginPercent: number;
  recommendation: Recommendation;
  reason: string;
}

/**
 * Read models for the two dashboards.
 *
 * Kept apart from LedgerService on purpose: the ledger owns money movement and
 * has to be correct under concurrency, while everything here is aggregate reads
 * that must never be allowed to hold a lock on the accounts table.
 */
@Injectable()
export class InsightsService {
  private readonly inputTokens: number;
  private readonly outputTokens: number;
  private readonly markup: number;

  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(UsageRecord) private readonly usage: Repository<UsageRecord>,
    private readonly tenantModels: TenantModelService,
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    // Same assumptions the pre-run hold uses, so the number a customer sees
    // matches the number that actually gets reserved.
    this.inputTokens = Number(config.get<number>('ESTIMATE_INPUT_TOKENS') ?? 80_000);
    this.outputTokens = Number(config.get<number>('ESTIMATE_OUTPUT_TOKENS') ?? 8_000);
    this.markup = Number(config.get<number>('CREDIT_MARKUP') ?? 2);
  }

  private perRunMicro(modelKey: string): number {
    return costMicro(
      { modelKey, inputTokens: this.inputTokens, outputTokens: this.outputTokens },
      this.markup,
    );
  }

  /**
   * Everything the client screen needs, expressed in runs rather than credits —
   * cost varies ~25x by tier, so a credit figure alone tells a customer nothing
   * about how long they have left.
   */
  async clientSummary(
    accountId: string,
    currentModelKey: string,
    usingDefault: boolean,
  ): Promise<ClientSummary> {
    const account = await this.accounts.findOneOrFail({ where: { id: accountId } });
    const availableMicro = Math.max(account.balanceMicro - account.heldMicro, 0);

    const currentPerRun = this.perRunMicro(currentModelKey);
    const currentRuns = currentPerRun > 0 ? Math.floor(availableMicro / currentPerRun) : 0;

    const options: TierOption[] = selectableModels().map((m) => {
      const perRun = this.perRunMicro(m.key);
      const runs = perRun > 0 ? Math.floor(availableMicro / perRun) : 0;
      return {
        key: m.key,
        label: m.label,
        tier: m.tier,
        creditsPerRun: Number(formatCredits(perRun)),
        runsRemaining: runs,
        deltaRuns: runs - currentRuns,
        current: m.key === currentModelKey,
      };
    });

    return {
      accountId,
      availableCredits: formatCredits(availableMicro),
      currentModelKey,
      usingDefault,
      runsRemaining: currentRuns,
      daysRemaining: await this.projectDays(accountId, availableMicro),
      options,
    };
  }

  /**
   * Days of runway at the last 30 days' burn. Returns null rather than a
   * fabricated number when there is too little history — a made-up projection is
   * worse than none, because a customer will plan around it.
   */
  private async projectDays(accountId: string, availableMicro: number): Promise<number | null> {
    const row = await this.usage
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.costMicro), 0)', 'spent')
      .addSelect('COUNT(*)', 'runs')
      .where('u.accountId = :accountId', { accountId })
      .andWhere("u.createdAt > now() - interval '30 days'")
      .getRawOne<{ spent: string; runs: string }>();

    const runs = Number(row?.runs ?? 0);
    const spent = Number(row?.spent ?? 0);
    if (runs < 5 || spent <= 0) return null;

    const perDay = spent / 30;
    return Math.max(Math.floor(availableMicro / perDay), 0);
  }

  /**
   * Per-tenant health for the admin screen. Escalation rate is the useful signal:
   * a tenant escalating constantly is on too cheap a tier and you are paying for
   * two runs, while a premium tenant that never escalates is overpaying.
   */
  async tenantStats(): Promise<TenantStat[]> {
    const tenants = await this.tenantModels.listTenants();

    const runRows: Array<{ installationid: string; runs: string; escalated: string }> = await this
      .dataSource.query(`
        SELECT ir."installationId"::text AS installationid,
               COUNT(*)::text            AS runs,
               COUNT(*) FILTER (WHERE r.escalated)::text AS escalated
          FROM runs r
          JOIN installation_repositories ir ON ir."repoFullName" = r."repoFullName"
         WHERE r.status = 'completed'
      GROUP BY ir."installationId"
      `);
    const byInstallation = new Map(runRows.map((r) => [r.installationid, r]));

    const spendRows: Array<{ accountid: string; charged: string; markup: string }> = await this
      .dataSource.query(`
        SELECT u."accountId"::text AS accountid,
               COALESCE(SUM(u."costMicro"), 0)::text AS charged,
               COALESCE(AVG(u.markup), 2)::text      AS markup
          FROM usage_records u
      GROUP BY u."accountId"
      `);

    const links: Array<{ externalid: string; provider: string; accountid: string }> =
      await this.dataSource.query(
        `SELECT "externalId" AS externalid, provider, "accountId"::text AS accountid FROM account_links`,
      );
    const accountFor = new Map(links.map((l) => [`${l.provider}:${l.externalid}`, l.accountid]));
    const spendFor = new Map(spendRows.map((s) => [s.accountid, s]));

    return tenants.map((t) => {
      const runStats = t.provider === 'github' ? byInstallation.get(t.externalId) : undefined;
      const runs = Number(runStats?.runs ?? 0);
      const escalated = Number(runStats?.escalated ?? 0);
      const escalationRate = runs > 0 ? escalated / runs : 0;

      const spend = spendFor.get(accountFor.get(`${t.provider}:${t.externalId}`) ?? '');
      const charged = Number(spend?.charged ?? 0);
      const markup = Number(spend?.markup ?? this.markup);
      // Vendor cost is the charged amount divided by the markup that was applied
      // at the time, which is why usage_records stores the markup per run.
      const margin = markup > 0 ? charged * (1 - 1 / markup) : 0;

      const { recommendation, reason } = this.recommend(t.effective.chat, runs, escalationRate);

      return {
        provider: t.provider,
        externalId: t.externalId,
        label: t.label,
        modelKey: t.modelKey,
        effectiveModel: t.effective.chat,
        runs,
        escalated,
        escalationRate: Math.round(escalationRate * 100) / 100,
        chargedCredits: formatCredits(charged),
        marginCredits: formatCredits(margin),
        marginPercent: charged > 0 ? Math.round((margin / charged) * 100) : 0,
        recommendation,
        reason,
      };
    });
  }

  private recommend(
    modelKey: string,
    runs: number,
    escalationRate: number,
  ): { recommendation: Recommendation; reason: string } {
    // Too little history to say anything useful — silence beats a bad call.
    if (runs < 10) {
      return {
        recommendation: 'healthy',
        reason: `Only ${runs} completed runs — not enough to judge`,
      };
    }

    if (escalationRate >= 0.4) {
      return {
        recommendation: 'move_up',
        reason: `Escalated on ${Math.round(escalationRate * 100)}% of runs — paying twice on most issues`,
      };
    }

    const tier = requireModel(modelKey).tier;
    if (tier === 'premium' && escalationRate <= 0.05) {
      return {
        recommendation: 'move_down',
        reason: `On premium with ${escalated(escalationRate, runs)} escalations in ${runs} runs — a cheaper tier would score the same`,
      };
    }

    return {
      recommendation: 'healthy',
      reason: `${Math.round(escalationRate * 100)}% escalation rate across ${runs} runs`,
    };
  }
}

function escalated(rate: number, runs: number): number {
  return Math.round(rate * runs);
}

export const CREDITS_PER_UNIT = MICRO_PER_CREDIT;
