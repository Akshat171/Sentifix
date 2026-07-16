import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentModule } from '../agent/agent.module';
import { EvalModule } from '../eval/eval.module';
import { GithubModule } from '../github/github.module';
import { IndexingModule } from '../indexing/indexing.module';
import { QuotaModule } from '../quota/quota.module';
import { EvalResult } from '../persistence/entities/eval-result.entity';
import { Issue } from '../persistence/entities/issue.entity';
import { Run } from '../persistence/entities/run.entity';
import { SlackInstallation } from '../persistence/entities/slack-installation.entity';
import { SlackIngestionService } from './slack-ingestion.service';
import { SlackController } from './slack.controller';
import { SlackOAuthController } from './slack-oauth.controller';
import { SlackOAuthService } from './slack-oauth.service';
import { SlackService } from './slack.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Issue, Run, EvalResult, SlackInstallation]),
    AgentModule,
    EvalModule,
    GithubModule,
    IndexingModule,
    QuotaModule,
  ],
  controllers: [SlackController, SlackOAuthController],
  providers: [SlackService, SlackIngestionService, SlackOAuthService],
  exports: [SlackService],
})
export class SlackModule {}
