import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessGrant, AccessStatus } from '../persistence/entities/access-grant.entity';

export type AccessMode = 'open' | 'approval';

@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);
  private readonly mode: AccessMode;
  private readonly bootstrap: Set<string>;

  constructor(
    @InjectRepository(AccessGrant) private readonly grants: Repository<AccessGrant>,
    config: ConfigService,
  ) {
    this.mode = (config.get<string>('ACCESS_MODE') as AccessMode) ?? 'open';

    // Without a bootstrap list the first approval is impossible: nobody can get
    // in to approve anyone, including you. These logins skip the queue.
    this.bootstrap = new Set(
      (config.get<string>('ACCESS_BOOTSTRAP_LOGINS') ?? '')
        .split(',')
        .map((l) => l.trim().toLowerCase())
        .filter(Boolean),
    );

    if (this.mode === 'approval' && this.bootstrap.size === 0) {
      this.logger.error(
        'ACCESS_MODE=approval with no ACCESS_BOOTSTRAP_LOGINS — nobody can approve anyone. ' +
          'Set your own GitHub login there before relying on this.',
      );
    }
    this.logger.log(
      `Access mode: ${this.mode}${this.bootstrap.size ? ` (${this.bootstrap.size} bootstrap login(s))` : ''}`,
    );
  }

  get enabled(): boolean {
    return this.mode === 'approval';
  }

  private key(login: string): string {
    return login.trim().toLowerCase();
  }

  /**
   * Records the sign-in attempt and returns the caller's standing.
   *
   * Recording on every attempt, not just the first, is what makes the pending
   * queue useful — you can see who is still trying rather than only who once did.
   */
  async recordAndCheck(login: string): Promise<AccessStatus> {
    if (!this.enabled) return 'approved';

    const githubLogin = this.key(login);
    if (this.bootstrap.has(githubLogin)) return 'approved';

    const existing = await this.grants.findOne({ where: { githubLogin } });
    if (existing) {
      await this.grants.update({ id: existing.id }, { lastSeenAt: new Date() });
      return existing.status;
    }

    await this.grants.insert({
      githubLogin,
      status: 'pending',
      lastSeenAt: new Date(),
    });
    this.logger.log(`Access requested by ${githubLogin}`);
    return 'pending';
  }

  /**
   * Read-only check for the request guard. Deliberately hits the table on every
   * request rather than trusting a claim baked into the session cookie — that is
   * what makes revoking access take effect immediately instead of whenever the
   * cookie happens to expire.
   */
  async isApproved(login: string): Promise<boolean> {
    if (!this.enabled) return true;

    const githubLogin = this.key(login);
    if (this.bootstrap.has(githubLogin)) return true;

    const grant = await this.grants.findOne({ where: { githubLogin } });
    return grant?.status === 'approved';
  }

  async decide(
    login: string,
    status: Extract<AccessStatus, 'approved' | 'denied'>,
    decidedBy: string,
    note?: string,
  ): Promise<AccessGrant> {
    const githubLogin = this.key(login);
    const existing = await this.grants.findOne({ where: { githubLogin } });

    if (existing) {
      await this.grants.update(
        { id: existing.id },
        { status, decidedBy, decidedAt: new Date(), note: note ?? existing.note },
      );
    } else {
      // Pre-approving someone who has never signed in is a legitimate invite.
      await this.grants.insert({
        githubLogin,
        status,
        decidedBy,
        decidedAt: new Date(),
        note: note ?? null,
      });
    }

    this.logger.log(`Access ${status} for ${githubLogin} by ${decidedBy}`);
    return this.grants.findOneOrFail({ where: { githubLogin } });
  }

  async list(status?: AccessStatus): Promise<AccessGrant[]> {
    return this.grants.find({
      where: status ? { status } : {},
      order: { status: 'ASC', lastSeenAt: 'DESC', createdAt: 'DESC' },
      take: 200,
    });
  }

  async counts(): Promise<Record<AccessStatus, number>> {
    const rows = await this.grants
      .createQueryBuilder('g')
      .select('g.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('g.status')
      .getRawMany<{ status: AccessStatus; count: string }>();

    const out: Record<AccessStatus, number> = { pending: 0, approved: 0, denied: 0 };
    for (const r of rows) out[r.status] = Number(r.count);
    return out;
  }
}
