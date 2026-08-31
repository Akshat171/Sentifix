jest.mock('@octokit/auth-app', () => ({ createAppAuth: jest.fn() }));
jest.mock('@octokit/rest', () => ({ Octokit: class {} }));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { Issue } from '../persistence/entities/issue.entity';
import { TriageService } from './triage.service';

const cfg = (v: Record<string, unknown> = {}) =>
  ({ get: (k: string) => v[k] }) as unknown as ConfigService;

const REPO = 'acme/checkout';

/**
 * The counts query runs first and everything after it is a DELETE, so the mock
 * answers the first call with counts and records the rest verbatim.
 */
function svc(opts: { issue?: Partial<Issue> | null; scopeRepos?: string[]; counts?: object } = {}) {
  const executed: string[] = [];
  const counts = opts.counts ?? { issues: '3', runs: '120', evals: '90', chunks: '687' };
  const query = jest.fn(async (sql: string) => {
    executed.push(sql.replace(/\s+/g, ' ').trim());
    return sql.trim().startsWith('SELECT') ? [counts] : [[], 0];
  });

  const dataSource = {
    query,
    transaction: (fn: (tx: { query: typeof query }) => unknown) => fn({ query }),
  } as unknown as DataSource;

  const issueRepo = {
    findOne: jest
      .fn()
      .mockResolvedValue(opts.issue === undefined ? { id: 'i1', repoFullName: REPO } : opts.issue),
  } as unknown as Repository<Issue>;

  const installRepoMap = {
    find: jest
      .fn()
      .mockResolvedValue((opts.scopeRepos ?? [REPO]).map((repoFullName) => ({ repoFullName }))),
  } as unknown as Repository<InstallationRepository>;

  const nil = null as never;
  const service = new TriageService(
    issueRepo,
    nil,
    nil,
    installRepoMap,
    nil,
    nil,
    nil,
    nil,
    nil,
    nil,
    nil,
    nil,
    dataSource,
    cfg({}),
  );
  return { service, executed, query, installRepoMap };
}

const ran = (executed: string[], fragment: string) => executed.some((s) => s.includes(fragment));

describe('deleting a repo', () => {
  it('reports exactly what it removed', async () => {
    const { service } = svc();

    await expect(service.deleteRepo(REPO, [7])).resolves.toEqual({
      issues: 3,
      runs: 120,
      evals: 90,
      chunks: 687,
    });
  });

  it('deletes children before parents, or the foreign keys would refuse', async () => {
    const { service, executed } = svc();
    await service.deleteRepo(REPO, [7]);

    const order = ['DELETE FROM eval_results', 'DELETE FROM runs', 'DELETE FROM issues'];
    const positions = order.map((frag) => executed.findIndex((s) => s.startsWith(frag)));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('removes the indexed code as well as the history', async () => {
    const { service, executed } = svc();
    await service.deleteRepo(REPO, [7]);
    expect(ran(executed, 'DELETE FROM code_chunks')).toBe(true);
  });

  it('leaves a tombstone rather than removing the mapping row', async () => {
    const { service, executed } = svc();
    await service.deleteRepo(REPO, [7]);

    // Dropping the row would make the repo unmapped, and an unmapped repo gets
    // triaged again and billed as its own tenant.
    expect(ran(executed, 'DELETE FROM installation_repositories')).toBe(false);
    expect(ran(executed, 'UPDATE installation_repositories')).toBe(true);
    expect(ran(executed, '"deletedAt" = now()')).toBe(true);
  });

  it('never touches the ledger, so the money trail outlives the runs', async () => {
    const { service, executed } = svc();
    await service.deleteRepo(REPO, [7]);

    for (const table of ['credit_ledger', 'credit_holds', 'usage_records', 'accounts']) {
      expect(ran(executed, table)).toBe(false);
    }
  });

  it("refuses another tenant's repo", async () => {
    const { service, query } = svc({ scopeRepos: ['mine/repo'] });

    await expect(service.deleteRepo('someone/else', [7])).rejects.toThrow(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it('lets an unrestricted operator through', async () => {
    const { service } = svc({ scopeRepos: [] });
    await expect(service.deleteRepo(REPO, undefined)).resolves.toMatchObject({ issues: 3 });
  });

  it('drops the repo out of tenant scope, so a scoped caller cannot act on it again', async () => {
    const { service, installRepoMap } = svc();
    await service.deleteRepo(REPO, [7]);

    // The scope lookup filters on deletedAt, so once stamped the repo is invisible
    // to every scoped read and write — including a second delete.
    expect(installRepoMap.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: expect.anything() }) }),
    );
  });
});

describe('deleting an issue', () => {
  it('removes the issue with its runs and evals', async () => {
    const { service, executed } = svc({ counts: { runs: '12', evals: '9' } });

    await expect(service.deleteIssue('i1', [7])).resolves.toEqual({
      issues: 1,
      runs: 12,
      evals: 9,
      chunks: 0,
    });
    // The repo's index is shared by other issues and must survive.
    expect(ran(executed, 'code_chunks')).toBe(false);
  });

  it('404s an issue that does not exist', async () => {
    const { service } = svc({ issue: null });
    await expect(service.deleteIssue('ghost', [7])).rejects.toThrow(NotFoundException);
  });

  it("refuses an issue in another tenant's repo", async () => {
    const { service, query } = svc({
      issue: { id: 'i1', repoFullName: 'someone/else' } as Issue,
      scopeRepos: ['mine/repo'],
    });

    await expect(service.deleteIssue('i1', [7])).rejects.toThrow(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });
});
