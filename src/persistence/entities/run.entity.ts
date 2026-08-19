import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Issue } from './issue.entity';
import { EvalResult } from './eval-result.entity';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed';

@Entity('runs')
export class Run {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Issue, (issue) => issue.runs, { nullable: false })
  issue: Issue;

  @Column({ default: 'pending' })
  status: RunStatus;

  @Column({ type: 'varchar', nullable: true })
  repoFullName: string | null;

  @Column('jsonb', { nullable: true })
  classificationResult: Record<string, unknown> | null;

  @Column('jsonb', { nullable: true })
  diagnosisResult: Record<string, unknown> | null;

  @Column('text', { nullable: true })
  proposedDiff: string | null;

  // Catalog key that produced the diff above. Recorded per run so per-tenant
  // cost and quality can be attributed to a specific model after the fact.
  @Column({ type: 'varchar', nullable: true })
  modelKey: string | null;

  // True when the first attempt scored below the threshold and the fix was
  // retried on a stronger model. The rate of this is the signal for whether
  // a tenant is on the right default tier.
  @Column({ default: false })
  escalated: boolean;

  @OneToMany(() => EvalResult, (evalResult) => evalResult.run)
  evalResults: EvalResult[];

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
