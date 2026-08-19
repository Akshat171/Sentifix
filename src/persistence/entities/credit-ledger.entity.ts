import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { microTransformer } from './money.transformer';

export type LedgerKind = 'grant' | 'topup' | 'debit' | 'refund' | 'adjustment';

/**
 * Append-only. Never updated, never deleted — a corrected mistake is a new
 * 'adjustment' row, so the history a customer can dispute stays intact.
 */
@Entity('credit_ledger')
@Index(['accountId', 'createdAt'])
export class CreditLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  accountId: string;

  /** Signed: credits are positive, debits negative. */
  @Column({ type: 'bigint', transformer: microTransformer })
  amountMicro: number;

  @Column({ type: 'varchar' })
  kind: LedgerKind;

  /**
   * The write is idempotent on this key. Queue redelivery and payment-provider
   * webhook replay both happen routinely; without it, one retried job silently
   * charges a customer twice.
   */
  @Index({ unique: true })
  @Column()
  idempotencyKey: string;

  @Column({ type: 'uuid', nullable: true })
  runId: string | null;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  /** Snapshot for audit — lets you spot cache drift without replaying the ledger. */
  @Column({ type: 'bigint', transformer: microTransformer })
  balanceAfterMicro: number;

  @CreateDateColumn()
  createdAt: Date;
}
