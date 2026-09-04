import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MICRO_PER_CREDIT } from './pricing';

/**
 * Credits are a sale price: vendor cost x markup x 100. Dividing that back out
 * recovers the dollars the vendor actually charged, which is the number the
 * provider's own dashboard shows.
 */
const MICRO_PER_VENDOR_USD = MICRO_PER_CREDIT * 100;

export interface SpendTotals {
  /** What the vendor charged — the figure comparable to the OpenAI dashboard. */
  vendorUsd: number;
  /** What customers were charged for it, in credits. */
  credits: number;
  /** credits/100 - vendorUsd, i.e. gross margin in dollars. */
  marginUsd: number;
  inputTokens: number;
  outputTokens: number;
  runs: number;
}

export interface ModelSpend extends SpendTotals {
  modelKey: string;
}

export interface TenantSpend extends SpendTotals {
  accountId: string;
  name: string;
}

export interface DailySpend {
  day: string;
  vendorUsd: number;
  credits: number;
  runs: number;
}

export interface SpendReport {
  today: SpendTotals;
  last7: SpendTotals;
  last30: SpendTotals;
  allTime: SpendTotals;
  byModel: ModelSpend[];
  byTenant: TenantSpend[];
  daily: DailySpend[];
  coverage: {
    firstRecord: string | null;
    /** Spend this report cannot see, stated rather than silently omitted. */
    blindSpots: string[];
  };
}

const ZERO: SpendTotals = {
  vendorUsd: 0,
  credits: 0,
  marginUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  runs: 0,
};

/**
 * Operator-facing cost reporting, computed from usage_records alone.
 *
 * No provider API is involved. Every record stores the tokens, the price charged
 * and the markup that produced it, so the vendor's share is arithmetic rather
 * than a second source of truth that can drift or rate-limit.
 *
 * Because the markup is stored per record, a change of margin does not rewrite
 * history: old rows keep reporting the vendor cost they were actually priced at.
 */
@Injectable()
export class SpendService {
  constructor(private readonly dataSource: DataSource) {}

  async report(): Promise<SpendReport> {
    const [totals, byModel, byTenant, daily, coverage] = await Promise.all([
      this.windows(),
      this.byModel(),
      this.byTenant(),
      this.daily(),
      this.coverage(),
    ]);

    return { ...totals, byModel, byTenant, daily, coverage };
  }

  /** Sum expression shared by every query, so one rounding rule applies. */
  private get sums(): string {
    return `
      COALESCE(SUM("costMicro" / NULLIF(markup, 0)), 0) / ${MICRO_PER_VENDOR_USD}::float AS vendorusd,
      COALESCE(SUM("costMicro"), 0) / ${MICRO_PER_CREDIT}::float                        AS credits,
      COALESCE(SUM("inputTokens"), 0)                                                   AS intok,
      COALESCE(SUM("outputTokens"), 0)                                                  AS outtok,
      COUNT(*)                                                                          AS runs`;
  }

  private row(r: Record<string, string | number> | undefined): SpendTotals {
    if (!r) return { ...ZERO };
    const vendorUsd = Number(r.vendorusd);
    const credits = Number(r.credits);
    return {
      vendorUsd,
      credits,
      marginUsd: credits / 100 - vendorUsd,
      inputTokens: Number(r.intok),
      outputTokens: Number(r.outtok),
      runs: Number(r.runs),
    };
  }

  private async windows() {
    const [rows] = await Promise.all([
      this.dataSource.query(
        `SELECT 'today' AS window, ${this.sums} FROM usage_records WHERE "createdAt" >= date_trunc('day', now())
         UNION ALL
         SELECT 'last7',  ${this.sums} FROM usage_records WHERE "createdAt" >= now() - interval '7 days'
         UNION ALL
         SELECT 'last30', ${this.sums} FROM usage_records WHERE "createdAt" >= now() - interval '30 days'
         UNION ALL
         SELECT 'all',    ${this.sums} FROM usage_records`,
      ) as Promise<Array<Record<string, string>>>,
    ]);

    const at = (w: string) => this.row(rows.find((r) => r.window === w));
    return { today: at('today'), last7: at('last7'), last30: at('last30'), allTime: at('all') };
  }

  /**
   * Per model, read out of the stored jsonb lines rather than the record total:
   * one run fans out across several models, so the record's own modelKey would
   * attribute a mixed-model run to whichever line happened to be first.
   */
  private async byModel(): Promise<ModelSpend[]> {
    const rows: Array<Record<string, string>> = await this.dataSource.query(
      `SELECT line->>'modelKey' AS modelkey,
              COALESCE(SUM((line->>'costMicro')::numeric / NULLIF(u.markup, 0)), 0)
                / ${MICRO_PER_VENDOR_USD}::float                                  AS vendorusd,
              COALESCE(SUM((line->>'costMicro')::numeric), 0)
                / ${MICRO_PER_CREDIT}::float                                      AS credits,
              COALESCE(SUM((line->>'inputTokens')::numeric), 0)                   AS intok,
              COALESCE(SUM((line->>'outputTokens')::numeric), 0)                  AS outtok,
              COUNT(DISTINCT u.id)                                                AS runs
         FROM usage_records u
         CROSS JOIN LATERAL jsonb_array_elements(u.lines) AS line
        WHERE u."createdAt" >= now() - interval '30 days'
        GROUP BY 1
        ORDER BY vendorusd DESC`,
    );

    return rows.map((r) => ({ modelKey: r.modelkey ?? 'unknown', ...this.row(r) }));
  }

  private async byTenant(): Promise<TenantSpend[]> {
    const rows: Array<Record<string, string>> = await this.dataSource.query(
      `SELECT u."accountId"::text AS accountid,
              COALESCE(a.name, 'unknown') AS name,
              ${this.sums}
         FROM usage_records u
         LEFT JOIN accounts a ON a.id = u."accountId"
        WHERE u."createdAt" >= now() - interval '30 days'
        GROUP BY 1, 2
        ORDER BY vendorusd DESC
        LIMIT 20`,
    );

    return rows.map((r) => ({ accountId: r.accountid, name: r.name, ...this.row(r) }));
  }

  private async daily(): Promise<DailySpend[]> {
    const rows: Array<Record<string, string>> = await this.dataSource.query(
      `SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
              COALESCE(SUM("costMicro" / NULLIF(markup, 0)), 0)
                / ${MICRO_PER_VENDOR_USD}::float                    AS vendorusd,
              COALESCE(SUM("costMicro"), 0) / ${MICRO_PER_CREDIT}::float AS credits,
              COUNT(*)                                              AS runs
         FROM usage_records
        WHERE "createdAt" >= now() - interval '30 days'
        GROUP BY 1 ORDER BY 1`,
    );

    return rows.map((r) => ({
      day: r.day,
      vendorUsd: Number(r.vendorusd),
      credits: Number(r.credits),
      runs: Number(r.runs),
    }));
  }

  /**
   * What the report cannot see. Stated on the page, because a cost dashboard
   * that is quietly incomplete is worse than none: it invites you to stop
   * checking the real bill.
   */
  private async coverage() {
    const [first]: Array<{ first: string | null }> = await this.dataSource.query(
      `SELECT MIN("createdAt")::text AS first FROM usage_records`,
    );

    return {
      firstRecord: first?.first ?? null,
      blindSpots: [
        'Indexing triggered by a push or a fresh install — it runs outside a triage, so its embedding cost is not recorded here.',
        'Anything before billing was switched on, or any run where the provider was called outside a metered context.',
      ],
    };
  }
}
