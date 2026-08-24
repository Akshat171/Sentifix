import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccountService } from '../billing/account.service';
import { LedgerService } from '../billing/ledger.service';
import { costMicro, formatCredits, MICRO_PER_CREDIT } from '../billing/pricing';
import { selectableModels } from '../llm/model-catalog';
import { LinkProvider, TenantModelService } from '../llm/tenant-model.service';
import { InsightsService } from '../billing/insights.service';
import { AdminGuard } from './admin.guard';
import { AccessService } from '../auth/access.service';

/** A representative run, used only to show relative burn rate between tiers. */
const SAMPLE_RUN = { inputTokens: 80_000, outputTokens: 8_000 };
const SAMPLE_MARKUP = 2;

interface SetTierBody {
  /** A catalog key, or null to fall back to the deployment default. */
  modelKey: string | null;
}

interface GrantBody {
  credits: number;
  /**
   * Required, not generated. A retried grant with the same key is ignored; a
   * grant without one that gets retried mints credits twice.
   */
  idempotencyKey: string;
  note?: string;
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly tenantModels: TenantModelService,
    private readonly accounts: AccountService,
    private readonly ledger: LedgerService,
    private readonly insights: InsightsService,
    private readonly access: AccessService,
  ) {}

  /**
   * The sellable menu with the cost of a representative run on each, because a
   * tier change is a ~25x change in burn rate and that should never be invisible
   * to whoever is making it.
   */
  @Get('models')
  models() {
    return selectableModels().map((m) => {
      const micro = costMicro({ modelKey: m.key, ...SAMPLE_RUN }, SAMPLE_MARKUP);
      return {
        key: m.key,
        label: m.label,
        vendor: m.vendor,
        tier: m.tier,
        creditsPerRun: Number(formatCredits(micro)),
        note: '80k in / 8k out at 2x markup — indicative, not a quote',
      };
    });
  }

  /** Who is waiting, who is in, who was turned away. */
  @Get('access')
  async accessList() {
    const [grants, counts] = await Promise.all([this.access.list(), this.access.counts()]);
    return { counts, grants };
  }

  @Patch('access/:login')
  async decideAccess(
    @Param('login') login: string,
    @Body() body: { status: 'approved' | 'denied'; note?: string },
  ) {
    if (body.status !== 'approved' && body.status !== 'denied') {
      throw new BadRequestException("status must be 'approved' or 'denied'");
    }
    return this.access.decide(login, body.status, 'admin-api', body.note);
  }

  @Get('tenants')
  async tenants() {
    return this.tenantModels.listTenants();
  }

  /** Per-tenant runs, escalation rate, margin and a tier recommendation. */
  @Get('insights')
  async insightsView() {
    const tenants = await this.insights.tenantStats();
    return {
      tenants,
      totals: {
        tenants: tenants.length,
        moveUp: tenants.filter((t) => t.recommendation === 'move_up').length,
        moveDown: tenants.filter((t) => t.recommendation === 'move_down').length,
      },
    };
  }

  @Patch('tenants/:provider/:externalId')
  async setTier(
    @Param('provider') provider: LinkProvider,
    @Param('externalId') externalId: string,
    @Body() body: SetTierBody,
  ) {
    return this.tenantModels.setTier(provider, externalId, body.modelKey ?? null);
  }

  @Get('accounts/:provider/:externalId')
  async account(
    @Param('provider') provider: LinkProvider,
    @Param('externalId') externalId: string,
  ) {
    const account =
      provider === 'slack'
        ? await this.accounts.forSlackTeam(externalId)
        : await this.accounts.forRepo(externalId);

    return {
      accountId: account.id,
      name: account.name,
      balance: formatCredits(account.balanceMicro),
      held: formatCredits(account.heldMicro),
      available: formatCredits(account.balanceMicro - account.heldMicro),
    };
  }

  /**
   * Manual top-up. This is the seam a Stripe webhook will call later — the
   * ledger does not care where the money came from, only that the credit is
   * idempotent.
   */
  @Post('accounts/:accountId/credits')
  async grant(@Param('accountId') accountId: string, @Body() body: GrantBody) {
    const balanceAfter = await this.ledger.credit(
      accountId,
      Math.round(body.credits * MICRO_PER_CREDIT),
      'topup',
      body.idempotencyKey,
      body.note ?? 'Manual admin top-up',
    );
    return { accountId, balance: formatCredits(balanceAfter) };
  }

  @Get('accounts/:accountId/reconcile')
  async reconcile(@Param('accountId') accountId: string) {
    const result = await this.ledger.reconcile(accountId);
    return {
      cached: formatCredits(result.cached),
      derivedFromLedger: formatCredits(result.derived),
      drift: formatCredits(result.drift),
      healthy: result.drift === 0,
    };
  }
}
