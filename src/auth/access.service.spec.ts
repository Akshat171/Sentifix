import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AccessService } from './access.service';
import { AccessGrant, AccessStatus } from '../persistence/entities/access-grant.entity';

const cfg = (v: Record<string, unknown>) =>
  ({ get: (k: string) => v[k] }) as unknown as ConfigService;

function build(values: Record<string, unknown>, grant: Partial<AccessGrant> | null = null) {
  const insert = jest.fn().mockResolvedValue(undefined);
  const update = jest.fn().mockResolvedValue(undefined);
  const repo = {
    findOne: jest.fn().mockResolvedValue(grant),
    findOneOrFail: jest.fn().mockResolvedValue({ ...grant, status: 'approved' }),
    insert,
    update,
  } as unknown as Repository<AccessGrant>;
  return { svc: new AccessService(repo, cfg(values)), insert, update, repo };
}

const APPROVAL = { ACCESS_MODE: 'approval', ACCESS_BOOTSTRAP_LOGINS: 'akshat171' };

describe('open mode (self-host default)', () => {
  it('lets everyone in, so existing deployments are unaffected', async () => {
    const { svc, insert } = build({});
    expect(svc.enabled).toBe(false);
    await expect(svc.isApproved('a-stranger')).resolves.toBe(true);
    await expect(svc.recordAndCheck('a-stranger')).resolves.toBe('approved');
    // No queue is kept when the gate is off.
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('approval mode', () => {
  it('turns away a login nobody has approved', async () => {
    const { svc } = build(APPROVAL, null);
    await expect(svc.isApproved('random-person')).resolves.toBe(false);
  });

  it('records a first-time visitor as pending rather than dropping them', async () => {
    const { svc, insert } = build(APPROVAL, null);
    await expect(svc.recordAndCheck('random-person')).resolves.toBe('pending');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ githubLogin: 'random-person', status: 'pending' }),
    );
  });

  it('lets an approved login through', async () => {
    const { svc } = build(APPROVAL, { id: '1', githubLogin: 'friend', status: 'approved' });
    await expect(svc.isApproved('friend')).resolves.toBe(true);
  });

  it('keeps a denied login out', async () => {
    const { svc } = build(APPROVAL, { id: '1', githubLogin: 'spammer', status: 'denied' });
    await expect(svc.isApproved('spammer')).resolves.toBe(false);
    await expect(svc.recordAndCheck('spammer')).resolves.toBe('denied');
  });

  it('admits the bootstrap login without a database row', async () => {
    const { svc, repo } = build(APPROVAL, null);
    await expect(svc.isApproved('akshat171')).resolves.toBe(true);
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('treats GitHub logins case-insensitively, as GitHub does', async () => {
    const { svc } = build(APPROVAL, null);
    await expect(svc.isApproved('AkShAt171')).resolves.toBe(true);
    await expect(svc.isApproved('  akshat171  ')).resolves.toBe(true);
  });

  it('supports several bootstrap logins', async () => {
    const { svc } = build({ ACCESS_MODE: 'approval', ACCESS_BOOTSTRAP_LOGINS: 'a, b ,c' });
    for (const l of ['a', 'b', 'c']) {
      await expect(svc.isApproved(l)).resolves.toBe(true);
    }
    await expect(svc.isApproved('d')).resolves.toBe(false);
  });

  it('refuses everyone when misconfigured with no bootstrap login', async () => {
    // Fails closed. An operator who forgets the bootstrap list locks themselves
    // out, which is recoverable; the opposite would silently admit the internet.
    const { svc } = build({ ACCESS_MODE: 'approval' }, null);
    await expect(svc.isApproved('anyone')).resolves.toBe(false);
  });

  it('updates lastSeenAt so the queue shows who is still trying', async () => {
    const { svc, update } = build(APPROVAL, { id: '9', githubLogin: 'waiting', status: 'pending' });
    await svc.recordAndCheck('waiting');
    expect(update).toHaveBeenCalledWith(
      { id: '9' },
      expect.objectContaining({ lastSeenAt: expect.any(Date) }),
    );
  });
});

describe('decide', () => {
  it('approves an existing request', async () => {
    const { svc, update } = build(APPROVAL, { id: '3', githubLogin: 'friend', status: 'pending' });
    await svc.decide('friend', 'approved', 'akshat171');
    expect(update).toHaveBeenCalledWith(
      { id: '3' },
      expect.objectContaining({ status: 'approved', decidedBy: 'akshat171' }),
    );
  });

  it('pre-approves someone who has never signed in — that is an invite', async () => {
    const { svc, insert } = build(APPROVAL, null);
    await svc.decide('newcomer', 'approved', 'akshat171', 'invited by email');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        githubLogin: 'newcomer',
        status: 'approved',
        note: 'invited by email',
      }),
    );
  });

  it('normalises the login on decide, so casing cannot create a second row', async () => {
    const { svc, insert } = build(APPROVAL, null);
    await svc.decide('NewComer', 'denied', 'akshat171');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ githubLogin: 'newcomer', status: 'denied' }),
    );
  });
});

describe('counts', () => {
  it('reports zero for statuses with no rows rather than omitting them', async () => {
    const repo = {
      createQueryBuilder: () => ({
        select: () => ({
          addSelect: () => ({
            groupBy: () => ({
              getRawMany: async () => [{ status: 'pending' as AccessStatus, count: '2' }],
            }),
          }),
        }),
      }),
    } as unknown as Repository<AccessGrant>;

    const svc = new AccessService(repo, cfg(APPROVAL));
    await expect(svc.counts()).resolves.toEqual({ pending: 2, approved: 0, denied: 0 });
  });
});
