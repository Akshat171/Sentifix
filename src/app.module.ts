import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { PersistenceModule } from './persistence/persistence.module';
import { HealthModule } from './health/health.module';
import { LlmModule } from './llm/llm.module';
import { IndexingModule } from './indexing/indexing.module';
import { AgentModule } from './agent/agent.module';
import { EvalModule } from './eval/eval.module';
import { GithubModule } from './github/github.module';
import { TriageModule } from './triage/triage.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { QueueModule } from './queue/queue.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SetupModule } from './setup/setup.module';
import { SlackModule } from './slack/slack.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 60 }, // 60 req/min per IP
    ]),
    AppConfigModule,
    PersistenceModule,
    HealthModule,
    LlmModule,
    IndexingModule,
    AgentModule,
    EvalModule,
    GithubModule,
    TriageModule,
    IngestionModule,
    QueueModule,
    DashboardModule,
    SetupModule,
    SlackModule,
  ],
  providers: [
    // Rate limiting applied globally; webhook controllers opt out with @SkipThrottle()
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
