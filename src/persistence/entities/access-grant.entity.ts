import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AccessStatus = 'pending' | 'approved' | 'denied';

/**
 * Who is allowed to use the product.
 *
 * Authentication and authorisation are different questions. GitHub OAuth proves
 * someone is who they say they are; it says nothing about whether they should be
 * here. Without this table, anyone who is handed the URL and owns a GitHub
 * account is a full user.
 *
 * A row is created on first sign-in rather than by invitation, so someone who
 * finds the link becomes a reviewable request instead of either a silent user or
 * a dead end.
 */
@Entity('access_grants')
export class AccessGrant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** GitHub login, stored lowercase — GitHub treats logins case-insensitively. */
  @Index({ unique: true })
  @Column()
  githubLogin: string;

  @Index()
  @Column({ type: 'varchar', default: 'pending' })
  status: AccessStatus;

  /** Who decided, for the audit trail. Null while pending. */
  @Column({ type: 'varchar', nullable: true })
  decidedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  /** Free-text reason, shown to nobody but useful when reviewing later. */
  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  /** Last time they tried to sign in — tells you who is actually waiting. */
  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
