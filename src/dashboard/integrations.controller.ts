import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { SessionGuard } from '../auth/session.guard';
import type { SessionPayload } from '../auth/session.service';
import { AccountLink } from '../persistence/entities/account-link.entity';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { SlackInstallation } from '../persistence/entities/slack-installation.entity';
import { AccountService } from '../billing/account.service';

export interface IntegrationsView {
  github: { connected: boolean; repos: number };
  slack: {
    /** False when the deployment has no Slack OAuth credentials — hide, don't offer. */
    available: boolean;
    connected: boolean;
    workspaces: Array<{ teamId: string; teamName: string | null }>;
  };
}

/**
 * What this customer has connected, for the dashboard's integrations panel.
 *
 * Slack workspaces are reported through account_links rather than by listing
 * slack_installations, so one tenant never learns that another tenant installed
 * the app. A workspace only appears here once it is linked to the caller's
 * account, which SlackOAuthController does at install time.
 */
@Controller('dashboard/integrations')
@UseGuards(SessionGuard)
export class IntegrationsController {
  private readonly slackAvailable: boolean;

  constructor(
    config: ConfigService,
    private readonly accounts: AccountService,
    @InjectRepository(InstallationRepository)
    private readonly repoMap: Repository<InstallationRepository>,
    @InjectRepository(AccountLink)
    private readonly links: Repository<AccountLink>,
    @InjectRepository(SlackInstallation)
    private readonly slackInstalls: Repository<SlackInstallation>,
  ) {
    this.slackAvailable = !!(
      config.get<string>('SLACK_CLIENT_ID') && config.get<string>('SLACK_CLIENT_SECRET')
    );
  }

  @Get()
  async view(@Req() req: { session?: SessionPayload }): Promise<IntegrationsView> {
    const session = req.session;
    const installationIds = session?.superuser ? [] : (session?.installationIds ?? []);

    const repos = installationIds.length
      ? await this.repoMap.count({
          where: { installationId: In(installationIds), deletedAt: IsNull() },
        })
      : await this.repoMap.count({ where: { deletedAt: IsNull() } });

    return {
      github: { connected: repos > 0, repos },
      slack: {
        available: this.slackAvailable,
        ...(await this.slackFor(installationIds)),
      },
    };
  }

  private async slackFor(installationIds: number[]): Promise<{
    connected: boolean;
    workspaces: Array<{ teamId: string; teamName: string | null }>;
  }> {
    if (!this.slackAvailable) return { connected: false, workspaces: [] };

    let teamIds: string[];
    if (installationIds.length === 0) {
      // Operator or open self-host: no tenant to scope to, so show them all.
      teamIds = (await this.slackInstalls.find()).map((i) => i.teamId);
    } else {
      const account = await this.accounts.forInstallation(installationIds[0]);
      const rows = await this.links.find({ where: { accountId: account.id, provider: 'slack' } });
      teamIds = rows.map((r) => r.externalId);
    }

    if (teamIds.length === 0) return { connected: false, workspaces: [] };

    const installs = await this.slackInstalls.find({ where: { teamId: In(teamIds) } });
    return {
      connected: installs.length > 0,
      workspaces: installs.map((i) => ({ teamId: i.teamId, teamName: i.teamName })),
    };
  }
}
