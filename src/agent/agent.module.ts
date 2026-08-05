import { Module } from '@nestjs/common';
import { IndexingModule } from '../indexing/indexing.module';
import { LlmModule } from '../llm/llm.module';
import { AgentPipeline } from './agent.pipeline';
import { RerankerService } from './reranker.service';

@Module({
  imports: [LlmModule, IndexingModule],
  providers: [AgentPipeline, RerankerService],
  exports: [AgentPipeline],
})
export class AgentModule {}
