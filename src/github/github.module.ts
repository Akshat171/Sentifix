import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GithubService } from './github.service';

@Module({
  imports: [TypeOrmModule],
  providers: [GithubService],
  exports: [GithubService],
})
export class GithubModule {}
