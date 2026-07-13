import { Controller, Get, Logger, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { HttpReply, HttpRequest } from './http.types';
import { GithubOAuthService } from './github-oauth.service';
import { SessionService } from './session.service';

const SESSION_TTL_SEC = 7 * 24 * 3600;

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly secure: boolean;

  constructor(
    private readonly oauth: GithubOAuthService,
    private readonly session: SessionService,
    config: ConfigService,
  ) {
    this.secure = (config.get<string>('APP_BASE_URL') ?? '').startsWith('https://');
  }

  @Get('login')
  login(@Res() reply: HttpReply): void {
    const state = crypto.randomBytes(16).toString('hex');
    reply.header('Set-Cookie', this.session.stateCookieHeader(state));
    reply.redirect(this.oauth.authorizeUrl(state));
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: HttpRequest,
    @Res() reply: HttpReply,
  ): Promise<void> {
    const expected = this.session.readCookie(req, 'sentifix_oauth_state');
    if (!code || !state || state !== expected) {
      reply.redirect('/dashboard?error=oauth_state');
      return;
    }

    const token = await this.oauth.exchangeCode(code);
    if (!token) {
      reply.redirect('/dashboard?error=oauth_token');
      return;
    }

    const login = await this.oauth.getLogin(token);
    if (!login) {
      reply.redirect('/dashboard?error=oauth_user');
      return;
    }
    const installationIds = await this.oauth.getInstallationIds(token);

    const value = this.session.sign({
      login,
      installationIds,
      exp: Date.now() + SESSION_TTL_SEC * 1000,
    });
    reply.header('Set-Cookie', this.session.setCookieHeader(value, SESSION_TTL_SEC, this.secure));
    reply.header('Set-Cookie', 'sentifix_oauth_state=; Path=/; Max-Age=0');
    this.logger.log(`Login: ${login} (${installationIds.length} installation(s))`);
    reply.redirect('/dashboard');
  }

  @Get('logout')
  logout(@Res() reply: HttpReply): void {
    reply.header('Set-Cookie', this.session.clearCookieHeader());
    reply.redirect('/dashboard');
  }
}
