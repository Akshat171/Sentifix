import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Account } from '../persistence/entities/account.entity';
import { AccountLink, LinkProvider } from '../persistence/entities/account-link.entity';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { LedgerService } from './ledger.service';
import { MICRO_PER_CREDIT } from './pricing';

/**
 * Resolves whichever tenant identity a run arrived under to the account that
 * pays for it, provisioning one on first sight.
 *
 * Auto-provisioning matters: a webhook can arrive before anyone has visited the
 * dashboard, and a bug report is a bad moment to discover the customer has no
 * billing record.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);
  private readonly freeGrantMicro: number;

  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(AccountLink) private readonly links: Repository<AccountLink>,
    @InjectRepository(InstallationRepository)
    private readonly repoMap: Repository<InstallationRepository>,
    private readonly ledger: LedgerService,
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.freeGrantMicro =
      Number(config.get<number>('FREE_GRANT_CREDITS') ?? 200) * MICRO_PER_CREDIT;
  }

  async forRepo(repoFullName: string): Promise<Account> {
    const mapping = await this.repoMap.findOne({ where: { repoFullName } });
    // An unmapped repo is its own tenant, matching how QuotaService scopes.
    return mapping
      ? this.resolve('github', String(mapping.installationId), `github:${mapping.installationId}`)
      : this.resolve('github', repoFullName, repoFullName);
  }

  /** Direct lookup when the caller already knows the installation (session scope). */
  async forInstallation(installationId: number): Promise<Account> {
    return this.resolve('github', String(installationId), `github:${installationId}`);
  }

  async forSlackTeam(teamId: string): Promise<Account> {
    return this.resolve('slack', teamId, `slack:${teamId}`);
  }

  /**
   * Link two identities to one wallet — the GitHub App and the Slack app
   * installed by the same customer should not bill separately.
   */
  async link(accountId: string, provider: LinkProvider, externalId: string): Promise<void> {
    const existing = await this.links.findOne({ where: { provider, externalId } });
    if (existing) {
      if (existing.accountId !== accountId) {
        throw new Error(`${provider}:${externalId} is already linked to a different account`);
      }
      return;
    }
    await this.links.insert({ accountId, provider, externalId });
  }

  private async resolve(
    provider: LinkProvider,
    externalId: string,
    name: string,
  ): Promise<Account> {
    const link = await this.links.findOne({ where: { provider, externalId } });
    if (link) {
      return this.accounts.findOneOrFail({ where: { id: link.accountId } });
    }

    const account = await this.dataSource.transaction(async (tx) => {
      const created = await tx.save(tx.create(Account, { name, balanceMicro: 0, heldMicro: 0 }));
      await tx.insert(AccountLink, { accountId: created.id, provider, externalId });
      return created;
    });

    this.logger.log(`Provisioned account ${account.id} for ${provider}:${externalId}`);

    if (this.freeGrantMicro > 0) {
      // Through the ledger, not a direct balance write — a free grant is real
      // money moving and belongs in the audit trail like any other credit.
      await this.ledger.credit(
        account.id,
        this.freeGrantMicro,
        'grant',
        `signup-grant:${account.id}`,
        'Free tier grant on first use',
      );
    }

    return this.accounts.findOneOrFail({ where: { id: account.id } });
  }
}
