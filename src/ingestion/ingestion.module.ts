import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GithubModule } from '../github/github.module';
import { IndexingModule } from '../indexing/indexing.module';
import { Installation } from '../persistence/entities/installation.entity';
import { Issue } from '../persistence/entities/issue.entity';
import { QueueModule } from '../queue/queue.module';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [TypeOrmModule.forFeature([Issue, Installation]), QueueModule, GithubModule, IndexingModule],
  controllers: [IngestionController],
  providers: [IngestionService],
})
export class IngestionModule {}
