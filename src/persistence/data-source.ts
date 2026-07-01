import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { EvalResult } from './entities/eval-result.entity';
import { Issue } from './entities/issue.entity';
import { Run } from './entities/run.entity';

dotenv.config();

// Used exclusively by the TypeORM CLI for running/reverting migrations.
// e.g.: pnpm typeorm migration:run -d src/persistence/data-source.ts
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Issue, Run, EvalResult],
  migrations: ['src/persistence/migrations/*.ts'],
  synchronize: false,
});
