import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { EntitlementService } from './entitlement.service';

export interface KeyedRequest {
  headers: Record<string, string | undefined>;
  accountId?: string;
}

/**
 * Authenticates a customer API key and checks the account is still entitled.
 *
 * Two separate questions, both asked on every request: is this key real (not
 * revoked, not expired), and may this account still use the product (trial live
 * or credits remaining). Baking entitlement into the key at mint time would mean
 * a key issued during a trial kept working forever.
 *
 * Unlike the operator ApiKeyGuard this never falls open — there is no
 * configuration under which a missing key is acceptable here.
 */
@Injectable()
export class CustomerKeyGuard implements CanActivate {
  constructor(
    private readonly keys: ApiKeyService,
    private readonly entitlement: EntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<KeyedRequest>();

    const header = req.headers['authorization'];
    const presented =
      req.headers['x-api-key'] ??
      (header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : undefined);

    const key = await this.keys.resolve(presented);
    if (!key) {
      // One message for missing, malformed, revoked and expired alike: telling a
      // caller which of those it was helps an attacker enumerate valid keys.
      throw new UnauthorizedException('Invalid or expired API key');
    }

    const entitlement = await this.entitlement.check(key.accountId);
    if (!entitlement.allowed) {
      throw new ForbiddenException(
        entitlement.reason === 'trial_expired'
          ? 'Your free trial has ended. Add credits to continue.'
          : 'No credits remaining. Top up to continue.',
      );
    }

    this.keys.touch(key.id);
    req.accountId = key.accountId;
    return true;
  }
}
