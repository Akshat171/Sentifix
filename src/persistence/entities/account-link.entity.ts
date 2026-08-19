import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type LinkProvider = 'github' | 'slack';

/** Maps an external tenant identity onto the account that pays for it. */
@Entity('account_links')
@Index(['provider', 'externalId'], { unique: true })
export class AccountLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  accountId: string;

  @Column({ type: 'varchar' })
  provider: LinkProvider;

  /** GitHub installation ID, or Slack team ID. */
  @Column()
  externalId: string;

  @CreateDateColumn()
  createdAt: Date;
}
