import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

/**
 * Fails closed, unlike ApiKeyGuard.
 *
 * ApiKeyGuard treats a missing API_KEY as "open dev mode", which is a reasonable
 * default for read endpoints and a bad one for endpoints that change a
 * customer's billing tier or mint credits. Here, no configured key means no
 * access at all — a forgotten env var must not silently expose the money.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);
  private readonly apiKey: string | undefined;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('ADMIN_API_KEY') ?? config.get<string>('API_KEY');
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.apiKey) {
      this.logger.error('Admin request refused: no ADMIN_API_KEY or API_KEY configured');
      throw new UnauthorizedException('Admin API is not configured');
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const provided = request.headers['x-api-key'];

    if (typeof provided !== 'string' || !this.matches(provided)) {
      throw new UnauthorizedException('Invalid or missing admin API key');
    }
    return true;
  }

  /** Constant-time, so a wrong key leaks nothing about how much of it was right. */
  private matches(provided: string): boolean {
    const a = Buffer.from(provided);
    const b = Buffer.from(this.apiKey as string);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
