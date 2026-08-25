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

  /**
   * Set when the customer disconnects the repo from the dashboard. The row stays
   * so the repo keeps belonging to this installation — deleting it instead would
   * silently move the repo's spend onto its own wallet (see AccountService.forRepo)
   * and, because ingestion does not consult this table to decide whether to run,
   * would not have stopped anything.
   */
  @Column({ type: 'timestamptz', nullable: true })
  disconnectedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
