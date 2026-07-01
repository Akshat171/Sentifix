import { Module } from '@nestjs/common';
import { IndexingModule } from '../indexing/indexing.module';
import { LlmModule } from '../llm/llm.module';
import { AgentPipeline } from './agent.pipeline';

@Module({
  imports: [LlmModule, IndexingModule],
  providers: [AgentPipeline],
  exports: [AgentPipeline],
})
export class AgentModule {}
