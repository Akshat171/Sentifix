import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EvalResult } from './entities/eval-result.entity';
import { Installation } from './entities/installation.entity';
import { Issue } from './entities/issue.entity';
import { Run } from './entities/run.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => {
        const isProd = config.get<string>('NODE_ENV') === 'production';
        return {
          type: 'postgres',
          url: config.get<string>('DATABASE_URL'),
          entities: [Issue, Run, EvalResult, Installation],
          // Entity tables have no migrations — synchronize creates them.
          // On in dev always; in prod opt-in via DB_SYNCHRONIZE (set by the deploy template).
          synchronize: !isProd || config.get<boolean>('DB_SYNCHRONIZE') === true,
          migrations: ['dist/persistence/migrations/*.js'],
          // Migrations own the pgvector extension + code_chunks table (no entity for it).
          // Run them automatically in prod so a fresh deploy comes up with a working RAG store.
          migrationsRun: isProd,
          logging: ['error', 'warn'],
        };
      },
      inject: [ConfigService],
    }),
  ],
  exports: [TypeOrmModule],
})
export class PersistenceModule {}
