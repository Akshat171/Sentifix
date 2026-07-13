import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Exact repo → installation mapping. Replaces the fragile `repos LIKE '%owner/repo%'`
 * lookup (which could match the wrong tenant) with an indexed, exact-match table.
 * Also the join used to scope dashboard/API data to a tenant's installations.
 */
@Entity('installation_repositories')
export class InstallationRepository {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  installationId: number;

  @Index({ unique: true })
  @Column()
  repoFullName: string;

  @CreateDateColumn()
  createdAt: Date;
}
