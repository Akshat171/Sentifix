import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * One row per Slack workspace that installed the app (multi-tenant).
 * Stores that workspace's bot token so replies go out on the right workspace.
 */
@Entity('slack_installations')
export class SlackInstallation {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  teamId: string; // Slack workspace/team ID

  @Column({ type: 'varchar', nullable: true })
  teamName: string | null;

  @Column()
  botToken: string; // xoxb-... for THIS workspace

  @Column({ type: 'varchar', nullable: true })
  botUserId: string | null;

  @Column({ type: 'varchar', nullable: true })
  appId: string | null;

  @Column({ type: 'varchar', nullable: true })
  authedUser: string | null; // Slack user who installed it

  @Column({ type: 'varchar', nullable: true })
  defaultRepo: string | null; // optional per-workspace fallback repo

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
