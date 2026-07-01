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

  @OneToMany(() => EvalResult, (evalResult) => evalResult.run)
  evalResults: EvalResult[];

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
