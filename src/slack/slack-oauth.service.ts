import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SlackInstallation } from '../persistence/entities/slack-installation.entity';

const SCOPES = 'app_mentions:read,chat:write,chat:write.public';

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string; // bot token
  bot_user_id?: string;
  app_id?: string;
  scope?: string;
  team?: { id: string; name?: string };
  authed_user?: { id: string };
}

/**
 * Slack "Add to Slack" OAuth v2 flow. Each workspace installs the app and we
 * persist its bot token, so replies use the correct per-workspace credentials.
 */
@Injectable()
export class SlackOAuthService {
  private readonly logger = new Logger(SlackOAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;

  constructor(
    config: ConfigService,
    @InjectRepository(SlackInstallation)
    private readonly installRepo: Repository<SlackInstallation>,
  ) {
    this.clientId = config.get<string>('SLACK_CLIENT_ID') ?? '';
    this.clientSecret = config.get<string>('SLACK_CLIENT_SECRET') ?? '';
    this.baseUrl = (config.get<string>('APP_BASE_URL') ?? '').replace(/\/$/, '');
  }

  get configured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  get redirectUri(): string {
    return `${this.baseUrl}/slack/oauth/callback`;
  }

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      scope: SCOPES,
      redirect_uri: this.redirectUri,
      state,
    });
    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  /** Exchange the OAuth code, persist the workspace's bot token, return the team. */
  async completeInstall(code: string): Promise<{ teamId: string; teamName?: string } | null> {
    const res = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri,
      }),
    });
    const data = (await res.json()) as SlackOAuthResponse;
    if (!data.ok || !data.access_token || !data.team?.id) {
      this.logger.error(`Slack OAuth failed: ${data.error ?? 'no token'}`);
      return null;
    }

    await this.installRepo.upsert(
      {
        teamId: data.team.id,
        teamName: data.team.name ?? null,
        botToken: data.access_token,
        botUserId: data.bot_user_id ?? null,
        appId: data.app_id ?? null,
        authedUser: data.authed_user?.id ?? null,
      },
      ['teamId'],
    );
    this.logger.log(`Slack installed on workspace ${data.team.name ?? data.team.id}`);
    return { teamId: data.team.id, teamName: data.team.name };
  }
}
