import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Run } from './run.entity';

@Entity('eval_results')
export class EvalResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Run, (run) => run.evalResults, { nullable: false })
  run: Run;

  @Column()
  judgeModel: string;

  @Column('float')
  score: number;

  @Column('text', { nullable: true })
  rationale: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
