import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { SessionGuard } from '../auth/session.guard';
import type { SessionPayload } from '../auth/session.service';
import { ResolveService } from './resolve.service';
import { TenantScope, TriageService } from './triage.service';

@Controller('triage')
@UseGuards(ApiKeyGuard, SessionGuard)
export class TriageController {
  constructor(
    private readonly triage: TriageService,
    private readonly resolve: ResolveService,
  ) {}

  @Get('issues')
  getAllIssues(@Req() req: { session?: SessionPayload }) {
    return this.triage.getAllIssues(this.scope(req));
  }

  @Get('issues/:issueId/runs')
  getRunsForIssue(@Param('issueId') issueId: string) {
    return this.triage.getRunsForIssue(issueId);
  }

  @Get('runs/:runId')
  getRunById(@Param('runId') runId: string, @Req() req: { session?: SessionPayload }) {
    return this.triage.getRunById(runId, this.scope(req));
  }

  @Post('issues/:issueId/retriage')
  retriageIssue(@Param('issueId') issueId: string, @Req() req: { session?: SessionPayload }) {
    return this.triage.retriageIssue(issueId, this.scope(req));
  }

  @Post('runs/:runId/resolve')
  async resolveRun(
    @Param('runId') runId: string,
    @Req() req: { session?: SessionPayload },
    @Body() body?: { repoFullName?: string },
  ) {
    // Enforce tenant scope on the run before resolving
    await this.triage.getRunById(runId, this.scope(req));
    return this.resolve.resolveRun(runId, body?.repoFullName);
  }

  /** Extract the tenant scope from the request session (undefined = unrestricted). */
  private scope(req: { session?: SessionPayload }): TenantScope {
    const s = req.session;
    if (!s || s.superuser) return undefined;
    return s.installationIds ?? [];
  }
}
