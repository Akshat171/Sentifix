import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('installations')
export class Installation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  installationId: number;

  @Column()
  accountLogin: string;

  @Column()
  accountType: string;

  // Comma-separated list of repo full names (owner/repo)
  @Column('simple-array', { nullable: true })
  repos: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
