import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { EvalModule } from '../eval/eval.module';
import { IndexingModule } from '../indexing/indexing.module';
import { LlmModule } from '../llm/llm.module';
import { AgentPipeline } from './agent.pipeline';
import { RerankerService } from './reranker.service';
import { TriageRunner } from './triage-runner.service';

@Module({
  imports: [LlmModule, IndexingModule, EvalModule, BillingModule],
  providers: [AgentPipeline, RerankerService, TriageRunner],
  exports: [AgentPipeline, TriageRunner],
})
export class AgentModule {}
