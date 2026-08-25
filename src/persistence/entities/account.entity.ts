import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { microTransformer } from './money.transformer';

/**
 * One billable customer. GitHub installations and Slack workspaces both link
 * here through account_links, so a customer using both surfaces has one wallet
 * rather than two.
 *
 * balanceMicro and heldMicro are a CACHE. credit_ledger is the source of truth:
 * these two columns exist so the hot path can authorise a run with one statement
 * instead of summing the ledger, and a reconciliation job re-derives them.
 */
@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'bigint', default: 0, transformer: microTransformer })
  balanceMicro: number;

  /** Sum of active holds. Available balance is balanceMicro - heldMicro. */
  @Column({ type: 'bigint', default: 0, transformer: microTransformer })
  heldMicro: number;

  /**
   * End of the free trial. Null means no trial was granted (or trials are off).
   * Access is trial-OR-credits, so this never needs clearing when they pay.
   */
  @Column({ type: 'timestamptz', nullable: true })
  trialEndsAt: Date | null;

  /** When the customer was last told they were running low. Null = never. */
  @Column({ type: 'timestamptz', nullable: true })
  lowBalanceNotifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
