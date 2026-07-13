import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface SessionPayload {
  login: string;
  installationIds: number[];
  exp: number; // epoch ms
  superuser?: boolean;
}

const COOKIE = 'sentifix_session';

/**
 * Stateless signed-cookie sessions (HMAC-SHA256). No external session store or
 * cookie plugin needed — we sign a compact payload and verify it on each request.
 */
@Injectable()
export class SessionService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('SESSION_SECRET') ?? '';
  }

  sign(payload: SessionPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const mac = crypto.createHmac('sha256', this.secret).update(body).digest('base64url');
    return `${body}.${mac}`;
  }

  verify(token?: string): SessionPayload | null {
    if (!token) return null;
    const [body, mac] = token.split('.');
    if (!body || !mac) return null;
    const expected = crypto.createHmac('sha256', this.secret).update(body).digest('base64url');
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
      if (payload.exp && Date.now() > payload.exp) return null;
      return payload;
    } catch {
      return null;
    }
  }

  /** Read a named cookie from a Fastify request's Cookie header. */
  readCookie(req: { headers?: Record<string, unknown> }, name = COOKIE): string | undefined {
    const raw = req?.headers?.cookie;
    if (typeof raw !== 'string') return undefined;
    for (const part of raw.split(';')) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      if (part.slice(0, idx).trim() === name) {
        return decodeURIComponent(part.slice(idx + 1).trim());
      }
    }
    return undefined;
  }

  getSession(req: { headers?: Record<string, unknown> }): SessionPayload | null {
    return this.verify(this.readCookie(req));
  }

  setCookieHeader(value: string, maxAgeSec: number, secure: boolean): string {
    const attrs = [
      `${COOKIE}=${encodeURIComponent(value)}`,
      'HttpOnly',
      'Path=/',
      `Max-Age=${maxAgeSec}`,
      'SameSite=Lax',
    ];
    if (secure) attrs.push('Secure');
    return attrs.join('; ');
  }

  clearCookieHeader(): string {
    return `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
  }

  stateCookieHeader(state: string): string {
    return `sentifix_oauth_state=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`;
  }
}
