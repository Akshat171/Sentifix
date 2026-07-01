import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { IndexingJob } from './indexing.job';

interface IndexRequestBody {
  repoFullName: string;
  branch?: string;
}

@Controller('index')
export class IndexingController {
  private readonly logger = new Logger(IndexingController.name);

  constructor(
    private readonly job: IndexingJob,
    private readonly dataSource: DataSource,
  ) {}

  @Post()
  @HttpCode(202)
  @UseGuards(ApiKeyGuard)
  triggerIndexing(@Body() body: IndexRequestBody): { accepted: boolean; repoFullName: string } {
    const { repoFullName, branch } = body ?? {};

    if (!repoFullName || !repoFullName.includes('/')) {
      throw new BadRequestException('repoFullName must be in "owner/repo" format');
    }

    this.job.run({ repoFullName, branch }).catch((err: Error) => {
      this.logger.error(`Indexing failed for ${repoFullName}: ${err.message}`, err.stack);
    });

    this.logger.log(`Accepted indexing request for ${repoFullName}`);
    return { accepted: true, repoFullName };
  }

  @Get(':owner/:repo/status')
  async getStatus(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
  ): Promise<{ repoFullName: string; chunkCount: number; indexed: boolean }> {
    const repoFullName = `${owner}/${repo}`;
    const [{ count }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM code_chunks WHERE repo_full_name = $1`,
      [repoFullName],
    );
    return { repoFullName, chunkCount: count, indexed: count > 0 };
  }
}
