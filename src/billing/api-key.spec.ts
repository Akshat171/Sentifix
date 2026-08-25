import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import { ApiKey } from '../persistence/entities/api-key.entity';
import { Account } from '../persistence/entities/account.entity';
import { ApiKeyService } from './api-key.service';
import { CustomerKeyGuard } from './customer-key.guard';
import { EntitlementService } from './entitlement.service';
import { MICRO_PER_CREDIT } from './pricing';

const cfg = (v: Record<string, unknown> = {}) =>
  ({ get: (k: string) => v[k] }) as unknown as ConfigService;

function keyRepo(row: Partial<ApiKey> | null) {
  return {
    findOne: jest.fn().mockResolvedValue(row),
    find: jest.fn().mockResolvedValue(row ? [row] : []),
    save: jest.fn(async (x) => ({ ...x, id: 'k1', createdAt: new Date() })),
    create: jest.fn((x) => x),
    update: jest.fn().mockResolvedValue(undefined),
  } as unknown as Repository<ApiKey>;
}

describe('minting', () => {
  it('returns a prefixed secret and stores only its hash', async () => {
    const repo = keyRepo(null);
    const { plaintext, record } = await new ApiKeyService(repo).mint('acc-1', 'CI');

    expect(plaintext.startsWith('sfx_live_')).toBe(true);
    expect(plaintext.length).toBeGreaterThan(30);
    // The secret itself must never be persisted.
    expect(JSON.stringify(record)).not.toContain(plaintext);
    expect(record.keyHash).toBe(createHash('sha256').update(plaintext).digest('hex'));
    expect(plaintext.startsWith(record.prefix)).toBe(true);
  });

  it('generates a different key every time', async () => {
    const svc = new ApiKeyService(keyRepo(null));
    const a = await svc.mint('acc-1', 'one');
    const b = await svc.mint('acc-1', 'two');
    expect(a.plaintext).not.toBe(b.plaintext);
  });

  it('never leaks the hash when listing keys for a customer', async () => {
    const svc = new ApiKeyService(
      keyRepo({ id: 'k1', accountId: 'acc-1', prefix: 'sfx_live_abcd1234', keyHash: 'SECRETHASH' }),
    );
    const [listed] = await svc.list('acc-1');
    expect(JSON.stringify(listed)).not.toContain('SECRETHASH');
    expect('keyHash' in listed).toBe(false);
  });
});

describe('resolving a presented key', () => {
  async function withStoredKey(overrides: Partial<ApiKey> = {}) {
    const plaintext = (await new ApiKeyService(keyRepo(null)).mint('acc-1', 'k')).plaintext;
    const row: Partial<ApiKey> = {
      id: 'k1',
      accountId: 'acc-1',
      prefix: plaintext.slice(0, 17),
      keyHash: createHash('sha256').update(plaintext).digest('hex'),
      revokedAt: null,
      expiresAt: null,
      ...overrides,
    };
    return { plaintext, svc: new ApiKeyService(keyRepo(row)) };
  }

  it('accepts the correct key', async () => {
    const { plaintext, svc } = await withStoredKey();
    await expect(svc.resolve(plaintext)).resolves.toMatchObject({ accountId: 'acc-1' });
  });

  it('rejects a key whose secret is wrong despite a matching prefix', async () => {
    const { plaintext, svc } = await withStoredKey();
    const tampered = plaintext.slice(0, 20) + 'X'.repeat(plaintext.length - 20);
    await expect(svc.resolve(tampered)).resolves.toBeNull();
  });

  it('rejects a revoked key', async () => {
    const { plaintext, svc } = await withStoredKey({ revokedAt: new Date() });
    await expect(svc.resolve(plaintext)).resolves.toBeNull();
  });

  it('rejects an expired key', async () => {
    const { plaintext, svc } = await withStoredKey({ expiresAt: new Date(Date.now() - 1000) });
    await expect(svc.resolve(plaintext)).resolves.toBeNull();
  });

  it('rejects junk without touching the database', async () => {
    const repo = keyRepo(null);
    const svc = new ApiKeyService(repo);
    for (const bad of [undefined, '', 'nonsense', 'Bearer x', 'sfx_test_abc']) {
      await expect(svc.resolve(bad as string)).resolves.toBeNull();
    }
    expect(repo.findOne).not.toHaveBeenCalled();
  });
});

describe('revocation is scoped to the owner', () => {
  it('refuses to revoke a key belonging to another account', async () => {
    const svc = new ApiKeyService(keyRepo(null));
    await expect(svc.revoke('attacker', 'someone-elses-key')).rejects.toThrow(NotFoundException);
  });
});

describe('entitlement', () => {
  function svcFor(account: Partial<Account> | null, trialDays = 7) {
    const repo = {
      findOne: jest.fn().mockResolvedValue(account),
    } as unknown as Repository<Account>;
    return new EntitlementService(repo, cfg({ TRIAL_DAYS: trialDays }));
  }
  const future = new Date(Date.now() + 3 * 86_400_000);
  const past = new Date(Date.now() - 86_400_000);

  it('allows a live trial with no credits', async () => {
    const e = await svcFor({ id: 'a', balanceMicro: 0, heldMicro: 0, trialEndsAt: future }).check(
      'a',
    );
    expect(e).toMatchObject({ allowed: true, reason: 'trial', trialDaysLeft: 3 });
  });

  it('allows credits after the trial has lapsed', async () => {
    const e = await svcFor({
      id: 'a',
      balanceMicro: 500 * MICRO_PER_CREDIT,
      heldMicro: 0,
      trialEndsAt: past,
    }).check('a');
    expect(e).toMatchObject({ allowed: true, reason: 'paid' });
  });

  it('blocks a lapsed trial with no credits, and says which', async () => {
    const e = await svcFor({ id: 'a', balanceMicro: 0, heldMicro: 0, trialEndsAt: past }).check(
      'a',
    );
    expect(e).toMatchObject({ allowed: false, reason: 'trial_expired' });
  });

  it('does not count held credits as spendable', async () => {
    const e = await svcFor({
      id: 'a',
      balanceMicro: 100 * MICRO_PER_CREDIT,
      heldMicro: 100 * MICRO_PER_CREDIT,
      trialEndsAt: past,
    }).check('a');
    // Blocked, but as a customer out of headroom — not as a lapsed trialist.
    expect(e).toMatchObject({ allowed: false, reason: 'no_credits' });
  });

  it('blocks an unknown account rather than defaulting open', async () => {
    const e = await svcFor(null).check('ghost');
    expect(e).toMatchObject({ allowed: false, reason: 'unknown_account' });
  });

  it('grants no trial window when trials are disabled', () => {
    expect(svcFor(null, 0).trialEnd()).toBeNull();
  });
});

describe('CustomerKeyGuard', () => {
  const ctx = (headers: Record<string, string | undefined>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;

  const keys = (resolved: unknown) =>
    ({
      resolve: jest.fn().mockResolvedValue(resolved),
      touch: jest.fn(),
    }) as unknown as ApiKeyService;
  const ent = (allowed: boolean, reason = 'trial') =>
    ({ check: jest.fn().mockResolvedValue({ allowed, reason }) }) as unknown as EntitlementService;

  it('accepts a valid key via x-api-key and attaches the account', async () => {
    const req = { headers: { 'x-api-key': 'sfx_live_x' } } as Record<string, unknown>;
    const guard = new CustomerKeyGuard(keys({ id: 'k', accountId: 'acc-1' }), ent(true));
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.accountId).toBe('acc-1');
  });

  it('accepts the same key as a bearer token', async () => {
    const guard = new CustomerKeyGuard(keys({ id: 'k', accountId: 'acc-1' }), ent(true));
    await expect(guard.canActivate(ctx({ authorization: 'Bearer sfx_live_x' }))).resolves.toBe(
      true,
    );
  });

  it('401s an unresolvable key', async () => {
    const guard = new CustomerKeyGuard(keys(null), ent(true));
    await expect(guard.canActivate(ctx({ 'x-api-key': 'bogus' }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('401s when no credential is presented — never falls open', async () => {
    const guard = new CustomerKeyGuard(keys(null), ent(true));
    await expect(guard.canActivate(ctx({}))).rejects.toThrow(UnauthorizedException);
  });

  it('403s a real key whose account is out of trial and credits', async () => {
    const guard = new CustomerKeyGuard(
      keys({ id: 'k', accountId: 'acc-1' }),
      ent(false, 'trial_expired'),
    );
    await expect(guard.canActivate(ctx({ 'x-api-key': 'sfx_live_x' }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('checks entitlement per request, so a trial key stops working when it lapses', async () => {
    const entitlement = ent(true);
    const guard = new CustomerKeyGuard(keys({ id: 'k', accountId: 'acc-1' }), entitlement);
    await guard.canActivate(ctx({ 'x-api-key': 'sfx_live_x' }));
    expect(entitlement.check).toHaveBeenCalledWith('acc-1');
  });
});
