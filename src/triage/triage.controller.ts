import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
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

  /** One row per connected repo — powers the dashboard home. */
  @Get('overview')
  getOverview(@Req() req: { session?: SessionPayload }) {
    return this.triage.getRepoOverview(this.scope(req));
  }

  @Get('issues')
  getAllIssues(@Req() req: { session?: SessionPayload }) {
    return this.triage.getIssueSummaries(this.scope(req));
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

  /**
   * Switch a repo off (or back on) without uninstalling the GitHub App.
   *
   * Scoped like every other write here: you can only act on repos mapped to your
   * own installations, so the owner/repo in the path cannot reach another tenant.
   */
  @Patch('repos/:owner/:repo/connection')
  setRepoConnection(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Body() body: { connected?: boolean },
    @Req() req: { session?: SessionPayload },
  ) {
    return this.triage.setRepoConnected(
      `${owner}/${repo}`,
      body?.connected === true,
      this.scope(req),
    );
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
