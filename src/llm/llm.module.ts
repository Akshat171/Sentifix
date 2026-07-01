import { Module } from '@nestjs/common';
import { LlmProvider } from './llm.provider';

@Module({
  providers: [LlmProvider],
  exports: [LlmProvider],
})
export class LlmModule {}
