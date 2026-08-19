import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { microTransformer } from './money.transformer';
import type { PricedLine } from '../../billing/pricing';

/**
 * What a run actually consumed, written once at settle rather than per model
 * call — seven inserts on the hot path buys nothing the hold has not already
 * protected.
 *
 * costMicro and markup are STORED, not recomputed later: when you change your
 * margin or a vendor changes a rate, every historical charge must still show the
 * price the customer was actually charged.
 */
@Entity('usage_records')
export class UsageRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  accountId: string;

  @Index({ unique: true })
  @Column('uuid')
  runId: string;

  /** Per-model breakdown, so a disputed charge can be explained line by line. */
  @Column('jsonb')
  lines: PricedLine[];

  @Column('int')
  inputTokens: number;

  @Column('int')
  outputTokens: number;

  @Column({ type: 'bigint', transformer: microTransformer })
  costMicro: number;

  @Column({ type: 'real' })
  markup: number;

  @CreateDateColumn()
  createdAt: Date;
}
