import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessService } from './access.service';
import { SessionService } from './session.service';

/**
 * When DASHBOARD_AUTH is on, requires a valid session (or the operator's master
 * API key) and attaches it to the request for tenant scoping. When off, it's a
 * no-op so self-host stays open/single-tenant.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  private readonly authEnabled: boolean;
  private readonly apiKey?: string;

  constructor(
    config: ConfigService,
    private readonly session: SessionService,
    private readonly access: AccessService,
  ) {
    this.authEnabled = config.get<boolean>('DASHBOARD_AUTH') === true;
    this.apiKey = config.get<string>('API_KEY');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.authEnabled) return true; // open self-host mode

    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; session?: unknown }>();

    // Operator master key → superuser (sees all tenants)
    if (this.apiKey && req.headers['x-api-key'] === this.apiKey) {
      req.session = { login: '__operator__', installationIds: [], exp: 0, superuser: true };
      return true;
    }

    const session = this.session.getSession(req);
    if (!session) throw new UnauthorizedException('Login required');

    // Checked per request against the table, not read from the cookie: a claim
    // baked into a signed session would keep working until the cookie expired,
    // so revoking someone would not actually revoke them.
    if (!(await this.access.isApproved(session.login))) {
      throw new ForbiddenException('Your access request is still pending approval');
    }

    req.session = session;
    return true;
  }
}
