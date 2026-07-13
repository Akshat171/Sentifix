import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentModule } from '../agent/agent.module';
import { AuthModule } from '../auth/auth.module';
import { EvalModule } from '../eval/eval.module';
import { GithubModule } from '../github/github.module';
import { IndexingModule } from '../indexing/indexing.module';
import { LlmModule } from '../llm/llm.module';
import { EvalResult } from '../persistence/entities/eval-result.entity';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { Issue } from '../persistence/entities/issue.entity';
import { Run } from '../persistence/entities/run.entity';
import { QueueConsumer } from '../queue/queue.consumer';
import { ResolveService } from './resolve.service';
import { TriageController } from './triage.controller';
import { TriageService } from './triage.service';

@Module({
  imports: [TypeOrmModule.forFeature([Issue, Run, EvalResult, InstallationRepository]), AgentModule, EvalModule, GithubModule, AuthModule, LlmModule, IndexingModule],
  providers: [TriageService, ResolveService],
  controllers: [TriageController, QueueConsumer],
  exports: [TriageService],
})
export class TriageModule {}
