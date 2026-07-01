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
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [Issue, Run, EvalResult, Installation],
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        migrations: ['dist/persistence/migrations/*.js'],
        migrationsRun: false,
        logging: ['error', 'warn'],
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [TypeOrmModule],
})
export class PersistenceModule {}
