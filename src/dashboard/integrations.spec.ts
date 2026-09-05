jest.mock('@octokit/auth-app', () => ({ createAppAuth: jest.fn() }));
jest.mock('@octokit/rest', () => ({ Octokit: class {} }));

import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AccountService } from '../billing/account.service';
import { AccountLink } from '../persistence/entities/account-link.entity';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { SlackInstallation } from '../persistence/entities/slack-installation.entity';
import { IntegrationsController } from './integrations.controller';

const cfg = (v: Record<string, unknown> = {}) =>
  ({ get: (k: string) => v[k] }) as unknown as ConfigService;

const SLACK_CONFIGURED = {
  SLACK_CLIENT_ID: 'id',
  SLACK_CLIENT_SECRET: 'secret',
};

function controller(
  opts: {
    slack?: boolean;
    repos?: number;
    links?: string[];
    installs?: Array<{ teamId: string; teamName: string | null }>;
  } = {},
) {
  const repoMap = {
    count: jest.fn().mockResolvedValue(opts.repos ?? 3),
  } as unknown as Repository<InstallationRepository>;

  const links = {
    find: jest.fn().mockResolvedValue((opts.links ?? []).map((externalId) => ({ externalId }))),
  } as unknown as Repository<AccountLink>;

  const slackInstalls = {
    find: jest.fn().mockResolvedValue(opts.installs ?? []),
  } as unknown as Repository<SlackInstallation>;

  const accounts = {
    forInstallation: jest.fn().mockResolvedValue({ id: 'acc-1' }),
  } as unknown as AccountService;

  return {
    ctl: new IntegrationsController(
      cfg(opts.slack === false ? {} : SLACK_CONFIGURED),
      accounts,
      repoMap,
      links,
      slackInstalls,
    ),
    links,
    slackInstalls,
  };
}

const req = (installationIds: number[], superuser = false) =>
  ({ session: { login: 'me', installationIds, superuser, exp: 0 } }) as never;

describe('GitHub card', () => {
  it('reports the repositories this tenant has connected', async () => {
    const { ctl } = controller({ repos: 5 });
    const v = await ctl.view(req([7]));
    expect(v.github).toEqual({ connected: true, repos: 5 });
  });

  it('reads as unconnected at zero, which is what makes the card shout', async () => {
    const { ctl } = controller({ repos: 0 });
    const v = await ctl.view(req([7]));
    expect(v.github.connected).toBe(false);
  });
});

describe('Slack card', () => {
  it('is unavailable when the deployment has no Slack credentials', async () => {
    const { ctl } = controller({ slack: false });
    const v = await ctl.view(req([7]));
    // The UI hides the card entirely rather than offering a button that 302s
    // straight to an error.
    expect(v.slack).toEqual({ available: false, connected: false, workspaces: [] });
  });

  it('is available but unconnected when nothing is linked yet', async () => {
    const { ctl } = controller({ links: [] });
    const v = await ctl.view(req([7]));
    expect(v.slack).toMatchObject({ available: true, connected: false, workspaces: [] });
  });

  it('names the workspaces linked to this account', async () => {
    const { ctl } = controller({
      links: ['T123'],
      installs: [{ teamId: 'T123', teamName: 'Sentifix' }],
    });

    const v = await ctl.view(req([7]));
    expect(v.slack.connected).toBe(true);
    expect(v.slack.workspaces).toEqual([{ teamId: 'T123', teamName: 'Sentifix' }]);
  });

  it('never lists a workspace belonging to another tenant', async () => {
    // The account has no slack links, so nothing is reported even though the
    // deployment has installs — the lookup goes through account_links, not
    // through the installs table.
    const { ctl, slackInstalls } = controller({ links: [] });

    const v = await ctl.view(req([7]));

    expect(v.slack.workspaces).toEqual([]);
    expect(slackInstalls.find).not.toHaveBeenCalled();
  });

  it('scopes the link lookup to the caller’s own account', async () => {
    const { ctl, links } = controller({ links: ['T123'] });
    await ctl.view(req([7]));
    expect(links.find).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', provider: 'slack' },
    });
  });

  it('shows every workspace to an unrestricted operator', async () => {
    const { ctl, slackInstalls } = controller({
      installs: [
        { teamId: 'T1', teamName: 'One' },
        { teamId: 'T2', teamName: 'Two' },
      ],
    });

    const v = await ctl.view(req([], true));

    expect(v.slack.connected).toBe(true);
    expect(slackInstalls.find).toHaveBeenCalled();
  });
});
