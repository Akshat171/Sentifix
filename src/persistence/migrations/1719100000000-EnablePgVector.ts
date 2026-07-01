import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnablePgVector1719100000000 implements MigrationInterface {
  name = 'EnablePgVector1719100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS code_chunks (
        id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        repo_full_name VARCHAR      NOT NULL,
        file_path     VARCHAR      NOT NULL,
        chunk_index   INTEGER      NOT NULL,
        content       TEXT         NOT NULL,
        embedding     vector(1536) NOT NULL,
        created_at    TIMESTAMPTZ  DEFAULT NOW(),
        CONSTRAINT code_chunks_unique UNIQUE (repo_full_name, file_path, chunk_index)
      )
    `);

    // ivfflat index — effective once the table has data (list count tuned for ~1M vectors)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS code_chunks_embedding_idx
      ON code_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS code_chunks_embedding_idx`);
    await queryRunner.query(`DROP TABLE IF EXISTS code_chunks`);
  }
}
