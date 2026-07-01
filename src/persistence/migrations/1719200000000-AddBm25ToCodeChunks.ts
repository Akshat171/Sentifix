import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBm25ToCodeChunks1719200000000 implements MigrationInterface {
  name = 'AddBm25ToCodeChunks1719200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Generated tsvector column — auto-updated on content change
    await queryRunner.query(`
      ALTER TABLE code_chunks
      ADD COLUMN IF NOT EXISTS tsv tsvector
        GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
    `);

    // GIN index for fast full-text search
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS code_chunks_tsv_idx
      ON code_chunks USING gin(tsv)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS code_chunks_tsv_idx`);
    await queryRunner.query(`ALTER TABLE code_chunks DROP COLUMN IF EXISTS tsv`);
  }
}
