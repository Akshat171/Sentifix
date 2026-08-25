import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A customer's API credential.
 *
 * Only a SHA-256 hash of the secret is stored. The plaintext is shown once at
 * creation and is unrecoverable afterwards — a database dump therefore leaks no
 * usable credentials, and "I lost my key" is answered by minting a new one
 * rather than by us being able to read the old one back.
 *
 * `prefix` is the leading, non-secret portion, stored in the clear so a lookup
 * is one indexed hit rather than hashing the candidate against every row, and so
 * the UI can show `sfx_live_a1b2…` to identify a key without revealing it.
 */
@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  accountId: string;

  /** What the customer called it, e.g. "CI pipeline". */
  @Column()
  name: string;

  /** Non-secret leading segment — identifies the row, reveals nothing. */
  @Index({ unique: true })
  @Column()
  prefix: string;

  /** SHA-256 of the full plaintext key. Never the key itself. */
  @Column()
  keyHash: string;

  /** Null means it does not expire on its own; entitlement still applies. */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  /** Set once, never unset — revocation is permanent by design. */
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** Written on use, so an unused key is visible and can be cleaned up. */
  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
