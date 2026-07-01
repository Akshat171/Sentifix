import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Run } from './run.entity';

@Entity('issues')
export class Issue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  githubRepoId: string;

  @Column()
  githubIssueNumber: number;

  @Column()
  title: string;

  @Column('text')
  body: string;

  @Column('simple-array', { nullable: true })
  labels: string[];

  @Column({ default: 'open' })
  state: string;

  @Column({ type: 'varchar', nullable: true })
  repoFullName: string | null;

  // GitHub comment ID for the placeholder comment — updated once triage completes
  @Column({ type: 'bigint', nullable: true })
  githubCommentId: number | null;

  @Column('text', { nullable: true })
  embeddingText: string | null;

  // Source of this issue: 'github' | 'slack' | 'discord' | 'teams'
  @Column({ type: 'varchar', default: 'github' })
  source: string;

  // For Slack/Discord: channel ID where the mention happened
  @Column({ type: 'varchar', nullable: true })
  sourceChannelId: string | null;

  // For Slack: thread_ts to reply in the correct thread
  @Column({ type: 'varchar', nullable: true })
  sourceThreadTs: string | null;

  // For Slack: workspace/team ID
  @Column({ type: 'varchar', nullable: true })
  sourceTeamId: string | null;

  @OneToMany(() => Run, (run) => run.issue)
  runs: Run[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
