import { DataSource } from 'typeorm';
import { costMicro, MICRO_PER_CREDIT } from './pricing';
import { SpendService } from './spend.service';

/** Answers each query by matching a fragment of its SQL. */
function svc(answers: Array<[fragment: string, rows: unknown[]]>) {
  const query = jest.fn(async (sql: string) => {
    const hit = answers.find(([frag]) => sql.includes(frag));
    return hit ? hit[1] : [];
  });
  return {
    service: new SpendService({ query } as unknown as DataSource),
    query,
  };
}

const windowRow = (w: string, over: Record<string, unknown> = {}) => ({
  window: w,
  vendorusd: '0',
  credits: '0',
  intok: '0',
  outtok: '0',
  runs: '0',
  ...over,
});

describe('vendor cost is recovered from the stored markup', () => {
  it('reports the dollars the vendor charged, not the sale price', async () => {
    // 1M input tokens on gpt-5.6-luna at $0.20/Mtok, sold at 2x markup.
    const charged = costMicro(
      { modelKey: 'gpt-5.6-luna', inputTokens: 1_000_000, outputTokens: 0 },
      2,
    );
    // What the report divides back out: costMicro / markup / (MICRO_PER_CREDIT * 100)
    const vendorUsd = charged / 2 / (MICRO_PER_CREDIT * 100);

    expect(vendorUsd).toBeCloseTo(0.2, 6);
    // And the customer was charged twice that in dollar terms.
    expect(charged / MICRO_PER_CREDIT / 100).toBeCloseTo(0.4, 6);
  });

  it('divides by the markup stored on each row, so a margin change cannot rewrite history', async () => {
    const { service, query } = svc([['FROM usage_records WHERE "createdAt" >= date_trunc', []]]);
    await service.report();

    const windowSql = query.mock.calls.map((c) => String(c[0])).find((s) => s.includes("'today'"));
    // The divisor must be the per-row column, never a constant from config.
    expect(windowSql).toContain('NULLIF(markup, 0)');
  });

  it('computes margin as sale value minus vendor cost', async () => {
    const { service } = svc([
      [
        "'today'",
        [
          windowRow('today', {
            vendorusd: '1.00',
            credits: '250',
            intok: '10',
            outtok: '5',
            runs: '3',
          }),
          windowRow('last7'),
          windowRow('last30'),
          windowRow('all'),
        ],
      ],
    ]);

    const r = await service.report();
    // 250 credits = $2.50 of sale value against $1.00 of vendor cost.
    expect(r.today.vendorUsd).toBeCloseTo(1);
    expect(r.today.marginUsd).toBeCloseTo(1.5);
    expect(r.today.runs).toBe(3);
  });

  it('reports zeroes rather than NaN when a window has no records', async () => {
    const { service } = svc([]);
    const r = await service.report();

    for (const w of [r.today, r.last7, r.last30, r.allTime]) {
      expect(w).toEqual({
        vendorUsd: 0,
        credits: 0,
        marginUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        runs: 0,
      });
    }
  });
});

describe('the per-model breakdown', () => {
  it('reads the stored jsonb lines, not the record total', async () => {
    const { service, query } = svc([]);
    await service.report();

    const sql = query.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('jsonb_array_elements'));
    // A run fans out over several models; attributing it to one would misreport
    // which model is actually eating the budget.
    expect(sql).toContain("line->>'modelKey'");
  });

  it('surfaces each model with its own vendor cost', async () => {
    const { service } = svc([
      [
        'jsonb_array_elements',
        [
          {
            modelkey: 'gpt-5.6-luna',
            vendorusd: '0.40',
            credits: '80',
            intok: '2000000',
            outtok: '5000',
            runs: '9',
          },
          {
            modelkey: 'text-embedding-3-small',
            vendorusd: '0.02',
            credits: '4',
            intok: '1000000',
            outtok: '0',
            runs: '4',
          },
        ],
      ],
    ]);

    const r = await service.report();
    expect(r.byModel.map((m) => m.modelKey)).toEqual(['gpt-5.6-luna', 'text-embedding-3-small']);
    expect(r.byModel[0].vendorUsd).toBeCloseTo(0.4);
    // Embeddings show up at all, which they could not before they were priced.
    expect(r.byModel[1].vendorUsd).toBeCloseTo(0.02);
  });
});

describe('coverage is stated, not implied', () => {
  it('names the spend it cannot see', async () => {
    const { service } = svc([['MIN("createdAt")', [{ first: '2026-08-31T00:00:00.000Z' }]]]);

    const r = await service.report();
    expect(r.coverage.firstRecord).toContain('2026-08-31');
    expect(r.coverage.blindSpots.join(' ')).toMatch(/push|install/i);
    // A cost dashboard that hides its gaps invites you to stop checking the real bill.
    expect(r.coverage.blindSpots.length).toBeGreaterThan(0);
  });
});
