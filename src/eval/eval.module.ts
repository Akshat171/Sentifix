import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { EvalJudge } from './eval.judge';

@Module({
  imports: [LlmModule],
  providers: [EvalJudge],
  exports: [EvalJudge],
})
export class EvalModule {}
