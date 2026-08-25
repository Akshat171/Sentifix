import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import type { SessionPayload } from '../auth/session.service';
import { SessionGuard } from '../auth/session.guard';
import { AccountService } from './account.service';
import { ApiKeyService } from './api-key.service';
import { EntitlementService } from './entitlement.service';

/**
 * Key management for the signed-in customer.
 *
 * Session-guarded, not key-guarded: minting a credential with a credential you
 * already hold would let a leaked key mint replacements for itself and survive
 * revocation. Creating and revoking keys requires the human's browser session.
 */
@Controller('billing/me/keys')
@UseGuards(SessionGuard)
export class ApiKeyController {
  private readonly authEnabled: boolean;

  constructor(
    private readonly keys: ApiKeyService,
    private readonly accounts: AccountService,
    private readonly entitlement: EntitlementService,
    @InjectRepository(InstallationRepository)
    private readonly repoMap: Repository<InstallationRepository>,
    config: ConfigService,
  ) {
    this.authEnabled = config.get<boolean>('DASHBOARD_AUTH') === true;
  }

  private async accountId(req: { session?: SessionPayload }): Promise<string> {
    const ids = req.session?.installationIds ?? [];
    if (ids.length > 0) return (await this.accounts.forInstallation(ids[0])).id;

    if (this.authEnabled) {
      throw new ForbiddenException('Connect a GitHub installation before creating API keys');
    }

    // Open self-host mode has no session to scope by, so the one connected
    // installation is the tenant. Guessing between several would mint a key
    // against the wrong wallet, so that case asks for auth instead.
    const installations = [...new Set((await this.repoMap.find()).map((r) => r.installationId))];
    if (installations.length === 0) {
      throw new ForbiddenException('Connect a GitHub installation before creating API keys');
    }
    if (installations.length > 1) {
      throw new ForbiddenException(
        'Several installations are connected. Set DASHBOARD_AUTH=true so keys can be scoped to a signed-in account.',
      );
    }
    return (await this.accounts.forInstallation(installations[0])).id;
  }

  @Get()
  async list(@Req() req: { session?: SessionPayload }) {
    const accountId = await this.accountId(req);
    const [keys, entitlement] = await Promise.all([
      this.keys.list(accountId),
      this.entitlement.check(accountId),
    ]);
    return { entitlement, keys };
  }

  /** The only response that ever contains the secret. */
  @Post()
  async create(@Req() req: { session?: SessionPayload }, @Body() body: { name?: string }) {
    const accountId = await this.accountId(req);
    const { plaintext, record } = await this.keys.mint(accountId, body.name ?? 'API key');

    return {
      key: plaintext,
      warning: 'Copy this now — it is hashed on save and cannot be shown again.',
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      createdAt: record.createdAt,
    };
  }

  @Delete(':id')
  async revoke(@Req() req: { session?: SessionPayload }, @Param('id') id: string) {
    await this.keys.revoke(await this.accountId(req), id);
    return { revoked: true };
  }
}
