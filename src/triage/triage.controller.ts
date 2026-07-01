import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ResolveService } from './resolve.service';
import { TriageService } from './triage.service';

@Controller('triage')
@UseGuards(ApiKeyGuard)
export class TriageController {
  constructor(
    private readonly triage: TriageService,
    private readonly resolve: ResolveService,
  ) {}

  @Get('issues')
  getAllIssues() {
    return this.triage.getAllIssues();
  }

  @Get('issues/:issueId/runs')
  getRunsForIssue(@Param('issueId') issueId: string) {
    return this.triage.getRunsForIssue(issueId);
  }

  @Get('runs/:runId')
  getRunById(@Param('runId') runId: string) {
    return this.triage.getRunById(runId);
  }

  @Post('issues/:issueId/retriage')
  retriageIssue(@Param('issueId') issueId: string) {
    return this.triage.retriageIssue(issueId);
  }

  @Post('runs/:runId/resolve')
  resolveRun(
    @Param('runId') runId: string,
    @Body() body?: { repoFullName?: string },
  ) {
    return this.resolve.resolveRun(runId, body?.repoFullName);
  }
}
