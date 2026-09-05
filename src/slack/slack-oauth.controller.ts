import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import * as crypto from 'crypto';
import type { HttpReply, HttpRequest } from '../auth/http.types';
import { SessionService } from '../auth/session.service';
import { AccountService } from '../billing/account.service';
import { SlackOAuthService } from './slack-oauth.service';

const STATE_COOKIE = 'sentifix_slack_state';

@Controller('slack')
export class SlackOAuthController {
  private readonly logger = new Logger(SlackOAuthController.name);

  constructor(
    private readonly oauth: SlackOAuthService,
    private readonly session: SessionService,
    private readonly accounts: AccountService,
  ) {}

  @Get('install')
  install(@Res() reply: HttpReply): void {
    if (!this.oauth.configured) {
      reply.code(302).redirect('/?slack=not_configured');
      return;
    }
    const state = crypto.randomBytes(16).toString('hex');
    reply.header(
      'Set-Cookie',
      `${STATE_COOKIE}=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`,
    );
    reply.code(302).redirect(this.oauth.authorizeUrl(state));
  }

  @Get('oauth/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: HttpRequest,
    @Res() reply: HttpReply,
  ): Promise<void> {
    if (!code || !state || state !== this.readState(req)) {
      reply.code(302).redirect('/?slack=state_error');
      return;
    }
    const result = await this.oauth.completeInstall(code);
    if (!result) {
      reply.code(302).redirect('/?slack=error');
      return;
    }

    await this.linkToSignedInAccount(req, result.teamId);
    reply.code(302).redirect('/dashboard?slack=connected');
  }

  /**
   * Attach the workspace to the account of whoever is installing it.
   *
   * Without this the Slack side resolves through AccountService.forSlackTeam,
   * which mints a *separate* account for the workspace — its own wallet, its own
   * free grant, its own quota, and nothing tying it to the GitHub installation
   * that is plainly the same customer. The browser doing this callback is signed
   * in, so this is the one moment we can tell who they are.
   *
   * Best effort by design: the workspace is already installed and working by the
   * time we get here, so a linking failure must not present as a failed install.
   */
  private async linkToSignedInAccount(req: HttpRequest, teamId: string): Promise<void> {
    try {
      const session = this.session.getSession(req);
      const installationId = session?.installationIds?.[0];
      if (!installationId) return; // signed out, or no GitHub installation yet

      const account = await this.accounts.forInstallation(installationId);
      await this.accounts.link(account.id, 'slack', teamId);
      this.logger.log(`Linked Slack team ${teamId} to account ${account.id}`);
    } catch (err) {
      this.logger.warn(
        `Could not link Slack team ${teamId} to an account: ${(err as Error).message}`,
      );
    }
  }

  private readState(req: HttpRequest): string | undefined {
    const raw = req.headers?.cookie;
    if (typeof raw !== 'string') return undefined;
    for (const part of raw.split(';')) {
      const idx = part.indexOf('=');
      if (idx !== -1 && part.slice(0, idx).trim() === STATE_COOKIE) {
        return part.slice(idx + 1).trim();
      }
    }
    return undefined;
  }
}
