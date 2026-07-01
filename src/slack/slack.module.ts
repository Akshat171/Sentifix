import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentModule } from '../agent/agent.module';
import { EvalModule } from '../eval/eval.module';
import { GithubModule } from '../github/github.module';
import { IndexingModule } from '../indexing/indexing.module';
import { EvalResult } from '../persistence/entities/eval-result.entity';
import { Issue } from '../persistence/entities/issue.entity';
import { Run } from '../persistence/entities/run.entity';
import { SlackIngestionService } from './slack-ingestion.service';
import { SlackController } from './slack.controller';
import { SlackService } from './slack.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Issue, Run, EvalResult]),
    AgentModule,
    EvalModule,
    GithubModule,
    IndexingModule,
  ],
  controllers: [SlackController],
  providers: [SlackService, SlackIngestionService],
  exports: [SlackService],
})
export class SlackModule {}
