import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AccountService } from '../billing/account.service';
import { CustomerKeyGuard, KeyedRequest } from '../billing/customer-key.guard';
import { EntitlementService } from '../billing/entitlement.service';
import { TriageService } from './triage.service';

/**
 * The customer-facing API, authenticated by a per-account key.
 *
 * Versioned from the first commit: `/v1` costs nothing now and is the difference
 * between shipping a breaking change later and being unable to.
 *
 * Every handler is scoped to the key's own account. The scope is derived from
 * the credential, never from a parameter the caller supplies, so there is no
 * request shape that reads another tenant's data.
 */
@Controller('v1')
@UseGuards(CustomerKeyGuard)
export class PublicApiController {
  constructor(
    private readonly triage: TriageService,
    private readonly accounts: AccountService,
    private readonly entitlement: EntitlementService,
  ) {}

  /** Cheap call for integrators to confirm a key works and see what is left. */
  @Get('me')
  async me(@Req() req: KeyedRequest) {
    const entitlement = await this.entitlement.check(req.accountId!);
    return {
      accountId: req.accountId,
      status: entitlement.reason,
      trialEndsAt: entitlement.trialEndsAt,
      trialDaysLeft: entitlement.trialDaysLeft,
      availableCredits: entitlement.availableCredits,
    };
  }

  @Get('repos')
  async repos(@Req() req: KeyedRequest) {
    return this.triage.getRepoOverview(await this.scope(req));
  }

  @Get('issues')
  async issues(@Req() req: KeyedRequest) {
    return this.triage.getIssueSummaries(await this.scope(req));
  }

  @Get('runs/:runId')
  async run(@Req() req: KeyedRequest, @Param('runId') runId: string) {
    return this.triage.getRunById(runId, await this.scope(req));
  }

  @Post('issues/:issueId/retriage')
  async retriage(@Req() req: KeyedRequest, @Param('issueId') issueId: string) {
    return this.triage.retriageIssue(issueId, await this.scope(req));
  }

  /** Installation IDs the key's account owns — the tenant boundary. */
  private async scope(req: KeyedRequest): Promise<number[]> {
    return this.accounts.installationIdsFor(req.accountId!);
  }
}
