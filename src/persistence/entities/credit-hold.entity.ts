import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { microTransformer } from './money.transformer';

export type HoldState = 'active' | 'settled' | 'released';

/**
 * A card-style authorisation for one run.
 *
 * A triage run makes several model calls over a minute or more. Debiting only at
 * the end would let a customer with 5 credits start 100 concurrent runs and land
 * at -5000; holding worst-case up front and settling the real amount afterwards
 * bounds the exposure to one run's estimate.
 */
@Entity('credit_holds')
export class CreditHold {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  accountId: string;

  /** One hold per run — the unique index is what makes reserve() idempotent. */
  @Index({ unique: true })
  @Column('uuid')
  runId: string;

  @Column({ type: 'bigint', transformer: microTransformer })
  amountMicro: number;

  @Index()
  @Column({ type: 'varchar', default: 'active' })
  state: HoldState;

  /** A worker that dies mid-run must not strand a customer's credits forever. */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
