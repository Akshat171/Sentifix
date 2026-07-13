import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * GitHub App OAuth (user-to-server). Logs a user in and discovers which of the
 * app's installations they can access via GET /user/installations — the canonical
 * source of truth for tenant scoping.
 */
@Injectable()
export class GithubOAuthService {
  private readonly logger = new Logger(GithubOAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.clientId = config.get<string>('GITHUB_APP_CLIENT_ID') ?? '';
    this.clientSecret = config.get<string>('GITHUB_APP_CLIENT_SECRET') ?? '';
    this.baseUrl = (config.get<string>('APP_BASE_URL') ?? '').replace(/\/$/, '');
  }

  get redirectUri(): string {
    return `${this.baseUrl}/auth/callback`;
  }

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
      scope: 'read:user',
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<string | null> {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri,
      }),
    });
    const data = (await res.json()) as { access_token?: string; error?: string };
    if (!data.access_token) {
      this.logger.error(`OAuth token exchange failed: ${data.error ?? 'no token'}`);
      return null;
    }
    return data.access_token;
  }

  async getLogin(token: string): Promise<string | null> {
    const res = await fetch('https://api.github.com/user', {
      headers: this.authHeaders(token),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { login?: string };
    return data.login ?? null;
  }

  /** Installation IDs of this app that the authenticated user can access. */
  async getInstallationIds(token: string): Promise<number[]> {
    const res = await fetch('https://api.github.com/user/installations?per_page=100', {
      headers: this.authHeaders(token),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { installations?: Array<{ id: number }> };
    return (data.installations ?? []).map((i) => i.id);
  }

  private authHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sentifix',
    };
  }
}
