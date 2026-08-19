import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { InsightsService } from './insights.service';
import { Account } from '../persistence/entities/account.entity';
import { UsageRecord } from '../persistence/entities/usage-record.entity';
import { TenantModelService } from '../llm/tenant-model.service';
import { MICRO_PER_CREDIT } from './pricing';

const cfg = (v: Record<string, unknown> = {}) =>
  ({ get: (k: string) => v[k] }) as unknown as ConfigService;

function build(opts: {
  balanceMicro?: number;
  heldMicro?: number;
  history?: { spent: string; runs: string };
  tenants?: unknown[];
  queries?: unknown[][];
}) {
  const accounts = {
    findOneOrFail: jest.fn().mockResolvedValue({
      id: 'acc-1',
      balanceMicro: opts.balanceMicro ?? 2_000 * MICRO_PER_CREDIT,
      heldMicro: opts.heldMicro ?? 0,
    }),
  } as unknown as Repository<Account>;

  const usage = {
    createQueryBuilder: () => ({
      select: () => ({
        addSelect: () => ({
          where: () => ({
            andWhere: () => ({
              getRawOne: async () => opts.history ?? { spent: '0', runs: '0' },
            }),
          }),
        }),
      }),
    }),
  } as unknown as Repository<UsageRecord>;

  const tenantModels = {
    listTenants: jest.fn().mockResolvedValue(opts.tenants ?? []),
  } as unknown as TenantModelService;

  const responses = [...(opts.queries ?? [])];
  const dataSource = {
    query: jest.fn().mockImplementation(async () => responses.shift() ?? []),
  } as unknown as DataSource;

  return new InsightsService(accounts, usage, tenantModels, dataSource, cfg());
}

describe('clientSummary', () => {
  it('reports runs remaining, not just a credit figure', async () => {
    const svc = build({ balanceMicro: 2_000 * MICRO_PER_CREDIT });
    const s = await svc.clientSummary('acc-1', 'gpt-5.6-luna', true);

    expect(s.availableCredits).toBe('2000.00');
    // 2000 credits at ~5.12 per run on the economy tier
    expect(s.runsRemaining).toBeGreaterThan(300);
    expect(s.runsRemaining).toBeLessThan(500);
  });

  it('subtracts active holds from what the customer can actually spend', async () => {
    const svc = build({
      balanceMicro: 2_000 * MICRO_PER_CREDIT,
      heldMicro: 1_000 * MICRO_PER_CREDIT,
    });
    const s = await svc.clientSummary('acc-1', 'gpt-5.6-luna', true);
    expect(s.availableCredits).toBe('1000.00');
  });

  it('never reports a negative balance to the customer', async () => {
    const svc = build({ balanceMicro: 10 * MICRO_PER_CREDIT, heldMicro: 400 * MICRO_PER_CREDIT });
    const s = await svc.clientSummary('acc-1', 'gpt-5.6-luna', true);
    expect(s.availableCredits).toBe('0.00');
    expect(s.runsRemaining).toBe(0);
  });

  it('shows the burn-rate consequence of every tier before switching', async () => {
    const svc = build({ balanceMicro: 2_000 * MICRO_PER_CREDIT });
    const s = await svc.clientSummary('acc-1', 'gpt-5.6-luna', true);

    const current = s.options.find((o) => o.current)!;
    const premium = s.options.find((o) => o.key === 'gpt-5.6-sol')!;

    expect(current.key).toBe('gpt-5.6-luna');
    expect(current.deltaRuns).toBe(0);
    // Upgrading must read as a large, visible loss of runway.
    expect(premium.deltaRuns).toBeLessThan(-200);
    expect(premium.runsRemaining).toBeLessThan(current.runsRemaining / 10);
  });

  it('declines to project runway without enough history', async () => {
    const svc = build({ history: { spent: '5000', runs: '2' } });
    const s = await svc.clientSummary('acc-1', 'gpt-5.6-luna', true);
    expect(s.daysRemaining).toBeNull();
  });

  it('projects runway once there is a month of usage', async () => {
    const svc = build({
      balanceMicro: 1_000 * MICRO_PER_CREDIT,
      history: { spent: String(300 * MICRO_PER_CREDIT), runs: '60' },
    });
    const s = await svc.clientSummary('acc-1', 'gpt-5.6-luna', true);
    // 300 credits over 30 days = 10/day; 1000 available is about 100 days
    expect(s.daysRemaining).toBe(100);
  });
});

describe('tenantStats recommendations', () => {
  const tenant = (modelKey: string | null, chat: string) => ({
    provider: 'github',
    externalId: '42',
    label: 'acme',
    modelKey,
    effective: { chat, rerank: chat },
    usingDefault: modelKey === null,
  });

  function statsFor(runs: number, escalated: number, chat = 'gpt-5.6-luna') {
    return build({
      tenants: [tenant(chat === 'gpt-5.6-luna' ? null : chat, chat)],
      queries: [
        [{ installationid: '42', runs: String(runs), escalated: String(escalated) }],
        [{ accountid: 'acc-1', charged: String(500 * MICRO_PER_CREDIT), markup: '2' }],
        [{ externalid: '42', provider: 'github', accountid: 'acc-1' }],
      ],
    }).tenantStats();
  }

  it('flags a tenant escalating on most runs as needing a better tier', async () => {
    const [stat] = await statsFor(100, 61);
    expect(stat.recommendation).toBe('move_up');
    expect(stat.reason).toContain('61%');
  });

  it('flags a premium tenant that never escalates as overpaying', async () => {
    const [stat] = await statsFor(40, 0, 'gpt-5.6-sol');
    expect(stat.recommendation).toBe('move_down');
  });

  it('stays quiet when there is too little history to judge', async () => {
    const [stat] = await statsFor(4, 3);
    expect(stat.recommendation).toBe('healthy');
    expect(stat.reason).toContain('not enough');
  });

  it('computes margin from the markup stored on the usage record', async () => {
    const [stat] = await statsFor(50, 5);
    // 500 credits charged at 2x markup: 250 vendor cost, 250 margin (50%)
    expect(stat.chargedCredits).toBe('500.00');
    expect(stat.marginCredits).toBe('250.00');
    expect(stat.marginPercent).toBe(50);
  });

  it('handles a tenant with no runs without dividing by zero', async () => {
    const svc = build({
      tenants: [tenant(null, 'gpt-5.6-luna')],
      queries: [[], [], []],
    });
    const [stat] = await svc.tenantStats();
    expect(stat.runs).toBe(0);
    expect(stat.escalationRate).toBe(0);
    expect(stat.marginPercent).toBe(0);
  });
});
