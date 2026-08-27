jest.mock('@octokit/auth-app', () => ({ createAppAuth: jest.fn() }));
jest.mock('@octokit/rest', () => ({ Octokit: class {} }));

import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { TriageService } from './triage.service';

const cfg = (v: Record<string, unknown> = {}) =>
  ({ get: (k: string) => v[k] }) as unknown as ConfigService;

const dbRow = (over: Record<string, unknown> = {}) => ({
  id: 'issue-1',
  title: 'Checkout 500s',
  repofullname: 'acme/checkout',
  githubissuenumber: 42,
  source: 'github',
  createdat: '2026-08-25T10:00:00.000Z',
  runid: 'run-9',
  status: 'completed',
  startedat: '2026-08-25T10:01:00.000Z',
  severity: 'high',
  score: '0.82',
  runs: '2162',
  ...over,
});

function svc(rows: Array<Record<string, unknown>>, scopeRepos: string[] = []) {
  const query = jest.fn().mockResolvedValue(rows);
  const installRepoMap = {
    find: jest.fn().mockResolvedValue(scopeRepos.map((repoFullName) => ({ repoFullName }))),
  } as unknown as Repository<InstallationRepository>;

  const nil = null as never;
  const service = new TriageService(
    nil,
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
    nil, // runEvents — this path publishes nothing
    { query } as unknown as DataSource,
    cfg({}),
  );
  return { service, query };
}

describe('getIssueSummaries', () => {
  it('returns one row per issue carrying only its latest run', async () => {
    const { service } = svc([dbRow()]);

    const [issue] = await service.getIssueSummaries(undefined);

    expect(issue).toEqual({
      id: 'issue-1',
      title: 'Checkout 500s',
      repoFullName: 'acme/checkout',
      githubIssueNumber: 42,
      source: 'github',
      createdAt: '2026-08-25T10:00:00.000Z',
      runs: 2162,
      latestRun: {
        id: 'run-9',
        status: 'completed',
        startedAt: '2026-08-25T10:01:00.000Z',
        severity: 'high',
        score: 0.82,
      },
    });
  });

  it('never carries a diff, diagnosis or rationale — that is what made it heavy', async () => {
    const { service } = svc([dbRow()]);

    const json = JSON.stringify(await service.getIssueSummaries(undefined));

    for (const heavy of ['proposedDiff', 'diagnosisResult', 'classificationResult', 'rationale']) {
      expect(json).not.toContain(heavy);
    }
  });

  it('handles an issue that has never been triaged', async () => {
    const { service } = svc([
      dbRow({ runid: null, status: null, startedat: null, severity: null, score: null, runs: '0' }),
    ]);

    const [issue] = await service.getIssueSummaries(undefined);
    expect(issue.latestRun).toBeNull();
    expect(issue.runs).toBe(0);
  });

  it('reports an unscored run as null rather than zero', async () => {
    // Rounding a missing score to 0 would render "0/100" — a scored-and-terrible
    // fix and a not-yet-scored one must not look the same.
    const { service } = svc([dbRow({ score: null })]);

    const [issue] = await service.getIssueSummaries(undefined);
    expect(issue.latestRun?.score).toBeNull();
  });

  it('passes the tenant repo list to the query as a bound parameter', async () => {
    const { service, query } = svc([], ['mine/one', 'mine/two']);

    await service.getIssueSummaries([7]);

    expect(query).toHaveBeenCalledWith(expect.any(String), [['mine/one', 'mine/two']]);
  });

  it('short-circuits when the tenant has no repos, without querying', async () => {
    const { service, query } = svc([], []);

    await expect(service.getIssueSummaries([7])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('passes null for an unrestricted operator so every issue matches', async () => {
    const { service, query } = svc([]);

    await service.getIssueSummaries(undefined);

    expect(query).toHaveBeenCalledWith(expect.any(String), [null]);
  });
});
