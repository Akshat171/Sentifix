// GithubService pulls in Octokit, which ships ESM that ts-jest will not load.
// The e2e config maps @octokit/rest to a stub; unit specs stub it here instead.
jest.mock('@octokit/auth-app', () => ({ createAppAuth: jest.fn() }));
jest.mock('@octokit/rest', () => ({ Octokit: class {} }));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { Issue } from '../persistence/entities/issue.entity';
import { Installation } from '../persistence/entities/installation.entity';
import { TriageService } from '../triage/triage.service';
import { GithubIssuePayload, IngestionService } from './ingestion.service';

const cfg = (v: Record<string, unknown> = {}) =>
  ({ get: (k: string) => v[k] }) as unknown as ConfigService;

const REPO = 'acme/checkout';

function harness(mapRow: Partial<InstallationRepository> | null) {
  const producer = { enqueueTriageJob: jest.fn().mockResolvedValue(undefined) };
  const github = { postPlaceholderComment: jest.fn().mockResolvedValue(1234) };
  const indexingJob = { run: jest.fn().mockResolvedValue(undefined) };
  const issueRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ ...x, id: 'issue-1' })),
  } as unknown as Repository<Issue>;
  const installRepoMap = {
    findOne: jest.fn().mockResolvedValue(mapRow),
    upsert: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as Repository<InstallationRepository>;
  const installationRepo = {
    findOne: jest.fn().mockResolvedValue({ installationId: 7, repos: [] }),
    save: jest.fn(async (x) => x),
    create: jest.fn((x) => x),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as Repository<Installation>;

  const service = new IngestionService(
    issueRepo,
    installationRepo,
    installRepoMap,
    producer as never,
    github as never,
    indexingJob as never,
    cfg({ SENTIFIX_TRIGGER: 'all' }),
  );

  return { service, producer, github, indexingJob, issueRepo, installRepoMap };
}

const issueEvent = (): GithubIssuePayload => ({
  action: 'opened',
  issue: {
    number: 42,
    title: 'Checkout 500s on empty cart',
    body: 'stack trace attached',
    labels: [],
    state: 'open',
    html_url: `https://github.com/${REPO}/issues/42`,
  },
  repository: {
    id: 9001,
    full_name: REPO,
    clone_url: `https://github.com/${REPO}.git`,
    default_branch: 'main',
  },
});

describe('a disconnected repo', () => {
  it('does not get triaged, commented on, or even recorded', async () => {
    const h = harness({ repoFullName: REPO, disconnectedAt: new Date() });

    await h.service.handleIssueEvent(issueEvent());

    expect(h.producer.enqueueTriageJob).not.toHaveBeenCalled();
    // The visible half matters most: no comment on the customer's issue thread.
    expect(h.github.postPlaceholderComment).not.toHaveBeenCalled();
    expect(h.issueRepo.save).not.toHaveBeenCalled();
  });

  it('ignores an explicit /sentifix command too', async () => {
    const h = harness({ repoFullName: REPO, disconnectedAt: new Date() });
    const e = issueEvent();

    await h.service.handleIssueCommentEvent({
      action: 'created',
      comment: { body: 'please /sentifix this', user: { login: 'dev', type: 'User' } },
      issue: e.issue,
      repository: e.repository,
    });

    expect(h.producer.enqueueTriageJob).not.toHaveBeenCalled();
  });

  it('stops being cloned and re-indexed on push', async () => {
    const h = harness({ repoFullName: REPO, disconnectedAt: new Date() });

    await h.service.handlePushEvent({
      ref: 'refs/heads/main',
      repository: { id: 9001, full_name: REPO, default_branch: 'main' },
    });

    expect(h.indexingJob.run).not.toHaveBeenCalled();
  });
});

describe('a connected repo', () => {
  it('is triaged as before when the row has no disconnect stamp', async () => {
    const h = harness({ repoFullName: REPO, disconnectedAt: null });

    await h.service.handleIssueEvent(issueEvent());

    expect(h.producer.enqueueTriageJob).toHaveBeenCalledWith(
      expect.objectContaining({ repoFullName: REPO, githubIssueNumber: 42 }),
    );
    expect(h.github.postPlaceholderComment).toHaveBeenCalled();
  });

  it('is triaged when it has no mapping row at all', async () => {
    // Unmapped repos have always been triaged; disconnecting is opt-out, so the
    // absence of a row must not start behaving like an opt-out.
    const h = harness(null);

    await h.service.handleIssueEvent(issueEvent());

    expect(h.producer.enqueueTriageJob).toHaveBeenCalled();
  });

  it('is re-indexed on a push to the default branch', async () => {
    const h = harness({ repoFullName: REPO, disconnectedAt: null });

    await h.service.handlePushEvent({
      ref: 'refs/heads/main',
      repository: { id: 9001, full_name: REPO, default_branch: 'main' },
    });

    expect(h.indexingJob.run).toHaveBeenCalledWith(expect.objectContaining({ repoFullName: REPO }));
  });
});

describe('re-adding a repo on GitHub clears the disconnect', () => {
  it('writes disconnectedAt: null when repos are added to an installation', async () => {
    const h = harness({ repoFullName: REPO, disconnectedAt: new Date() });

    await h.service.handleInstallationReposEvent({
      action: 'added',
      installation: { id: 7 },
      repositories_added: [{ id: 9001, full_name: REPO }],
    });

    expect(h.installRepoMap.upsert).toHaveBeenCalledWith(
      [{ installationId: 7, repoFullName: REPO, disconnectedAt: null }],
      ['repoFullName'],
    );
  });
});

describe('setRepoConnected', () => {
  // Only the mapping repo and the scope check are in play here; the rest of the
  // pipeline is passed as null so a dependency creeping into this path fails loudly.
  function svc(mapRow: Partial<InstallationRepository> | null, scopeRepos: string[]) {
    const installRepoMap = {
      findOne: jest.fn().mockResolvedValue(mapRow),
      find: jest.fn().mockResolvedValue(scopeRepos.map((repoFullName) => ({ repoFullName }))),
      save: jest.fn(async (x) => x),
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
      nil, // runEvents — this path publishes nothing
      nil,
      nil,
      cfg({}),
    );
    return { service, installRepoMap };
  }

  it('stamps disconnectedAt when switching a repo off', async () => {
    const row = { repoFullName: REPO, disconnectedAt: null } as InstallationRepository;
    const { service, installRepoMap } = svc(row, [REPO]);

    await expect(service.setRepoConnected(REPO, false, [7])).resolves.toEqual({
      repoFullName: REPO,
      connected: false,
    });
    expect(row.disconnectedAt).toBeInstanceOf(Date);
    expect(installRepoMap.save).toHaveBeenCalledWith(row);
  });

  it('clears disconnectedAt when switching it back on', async () => {
    const row = { repoFullName: REPO, disconnectedAt: new Date() } as InstallationRepository;
    const { service } = svc(row, [REPO]);

    await service.setRepoConnected(REPO, true, [7]);
    expect(row.disconnectedAt).toBeNull();
  });

  it('keeps the row, so the repo stays attributed to its installation', async () => {
    const row = { repoFullName: REPO, disconnectedAt: null } as InstallationRepository;
    const { service, installRepoMap } = svc(row, [REPO]);

    await service.setRepoConnected(REPO, false, [7]);
    // Deleting it would move the repo's spend onto a wallet of its own.
    expect((installRepoMap as unknown as { delete?: unknown }).delete).toBeUndefined();
  });

  it("refuses to touch another tenant's repo", async () => {
    const { service } = svc({ repoFullName: 'someone/else' }, ['mine/repo']);

    await expect(service.setRepoConnected('someone/else', false, [7])).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('404s a repo with no mapping row', async () => {
    const { service } = svc(null, ['unmapped/repo']);

    await expect(service.setRepoConnected('unmapped/repo', false, [7])).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lets the operator act without a scope', async () => {
    const row = { repoFullName: REPO, disconnectedAt: null } as InstallationRepository;
    const { service } = svc(row, []);

    await expect(service.setRepoConnected(REPO, false, undefined)).resolves.toMatchObject({
      connected: false,
    });
  });
});
