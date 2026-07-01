import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LlmModule } from '../llm/llm.module';
import { IndexingController } from './indexing.controller';
import { IndexingJob } from './indexing.job';
import { VectorStoreService } from './vector-store.service';

@Module({
  imports: [LlmModule, AuthModule],
  controllers: [IndexingController],
  providers: [IndexingJob, VectorStoreService],
  exports: [IndexingJob, VectorStoreService],
})
export class IndexingModule {}
