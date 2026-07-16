import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import * as crypto from 'crypto';
import type { HttpReply, HttpRequest } from '../auth/http.types';
import { SlackOAuthService } from './slack-oauth.service';

const STATE_COOKIE = 'sentifix_slack_state';

@Controller('slack')
export class SlackOAuthController {
  private readonly logger = new Logger(SlackOAuthController.name);

  constructor(private readonly oauth: SlackOAuthService) {}

  @Get('install')
  install(@Res() reply: HttpReply): void {
    if (!this.oauth.configured) {
      reply.code(302).redirect('/?slack=not_configured');
      return;
    }
    const state = crypto.randomBytes(16).toString('hex');
    reply.header('Set-Cookie', `${STATE_COOKIE}=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`);
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
    reply.code(302).redirect(result ? '/?slack=connected' : '/?slack=error');
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
