import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { ApiKey } from '../persistence/entities/api-key.entity';

/** Everything before the secret. Lets a leaked key be recognised in a log or a repo. */
const SCHEME = 'sfx_live_';
const PREFIX_CHARS = 8;
const SECRET_BYTES = 24;

/** What a customer is allowed to see about their own keys. */
export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}

export interface MintedKey {
  /** Shown once. Never retrievable again. */
  plaintext: string;
  record: ApiKey;
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(@InjectRepository(ApiKey) private readonly keys: Repository<ApiKey>) {}

  private hash(plaintext: string): string {
    return createHash('sha256').update(plaintext).digest('hex');
  }

  async mint(accountId: string, name: string, expiresAt: Date | null = null): Promise<MintedKey> {
    // base64url so the key is copy-pasteable and shell-safe.
    const secret = randomBytes(SECRET_BYTES).toString('base64url');
    const plaintext = `${SCHEME}${secret}`;

    const record = await this.keys.save(
      this.keys.create({
        accountId,
        name: name.trim() || 'API key',
        prefix: plaintext.slice(0, SCHEME.length + PREFIX_CHARS),
        keyHash: this.hash(plaintext),
        expiresAt,
      }),
    );

    this.logger.log(`Minted key ${record.prefix}… for account ${accountId}`);
    return { plaintext, record };
  }

  /**
   * Resolve a presented key, or null.
   *
   * Looks the row up by its non-secret prefix, then compares hashes in constant
   * time. Comparing with `===` would leak, through timing, how much of a guessed
   * key was correct — cheap to avoid, expensive to get wrong.
   */
  async resolve(presented: string | undefined): Promise<ApiKey | null> {
    if (!presented || !presented.startsWith(SCHEME)) return null;

    const prefix = presented.slice(0, SCHEME.length + PREFIX_CHARS);
    const record = await this.keys.findOne({ where: { prefix } });
    if (!record) return null;

    const a = Buffer.from(this.hash(presented), 'hex');
    const b = Buffer.from(record.keyHash, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    if (record.revokedAt) return null;
    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) return null;

    return record;
  }

  /**
   * Fire-and-forget usage stamp. Deliberately not awaited by the guard: a write
   * failure here must never turn a valid request into a rejected one.
   */
  touch(id: string): void {
    this.keys
      .update({ id }, { lastUsedAt: new Date() })
      .catch((err: Error) => this.logger.warn(`lastUsedAt update failed: ${err.message}`));
  }

  /**
   * Never returns the hash — callers render this straight to a customer.
   *
   * Built field by field rather than by spreading the row minus one key, so a
   * column added to the entity later cannot silently start being served.
   */
  async list(accountId: string): Promise<ApiKeySummary[]> {
    const rows = await this.keys.find({
      where: { accountId, revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      expiresAt: row.expiresAt,
    }));
  }

  /** Scoped by account so one customer cannot revoke another's key by id. */
  async revoke(accountId: string, id: string): Promise<void> {
    const record = await this.keys.findOne({ where: { id, accountId } });
    if (!record) throw new NotFoundException('No such API key');
    if (record.revokedAt) return;

    await this.keys.update({ id }, { revokedAt: new Date() });
    this.logger.log(`Revoked key ${record.prefix}… for account ${accountId}`);
  }
}
