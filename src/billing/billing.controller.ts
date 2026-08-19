import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { availablePacks, bonusPercent } from './credit-packs';
import { LowBalanceService } from './low-balance.service';
import { formatCredits } from './pricing';
import { AccountService } from './account.service';
import { InsightsService } from './insights.service';
import { TenantModelService } from '../llm/tenant-model.service';
import type { SessionPayload } from '../auth/session.service';
import { StripeService } from './stripe.service';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly stripe: StripeService,
    private readonly accounts: AccountService,
    private readonly lowBalance: LowBalanceService,
    private readonly insights: InsightsService,
    private readonly tenantModels: TenantModelService,
  ) {}

  /**
   * The client screen's data, scoped to the session's own installations. The
   * caller never supplies an account id — deriving it from the signed session is
   * what stops one customer reading or changing another's plan.
   */
  @Get('me')
  @UseGuards(SessionGuard)
  async me(@Req() req: { session?: SessionPayload }) {
    const installationId = this.firstInstallation(req);
    const account = await this.accounts.forInstallation(installationId);
    const tier = (await this.tenantModels.listTenants()).find(
      (t) => t.provider === 'github' && t.externalId === String(installationId),
    );

    return this.insights.clientSummary(
      account.id,
      tier?.effective.chat ?? 'gpt-5.6-luna',
      tier?.usingDefault ?? true,
    );
  }

  /** Self-serve tier change. Prepaid balance is what makes this safe to expose. */
  @Patch('me/tier')
  @UseGuards(SessionGuard)
  async setMyTier(
    @Req() req: { session?: SessionPayload },
    @Body() body: { modelKey: string | null },
  ) {
    const installationId = this.firstInstallation(req);
    return this.tenantModels.setTier('github', String(installationId), body.modelKey ?? null);
  }

  private firstInstallation(req: { session?: SessionPayload }): number {
    const ids = req.session?.installationIds ?? [];
    if (ids.length === 0) {
      throw new ForbiddenException('This account has no GitHub installation');
    }
    return ids[0];
  }

  /** Public: the price list is not a secret. */
  @Get('packs')
  packs() {
    return {
      paymentsEnabled: this.stripe.enabled,
      packs: availablePacks().map((p) => ({
        id: p.id,
        label: p.label,
        priceUsd: p.priceUsd,
        credits: p.credits,
        bonusPercent: bonusPercent(p),
      })),
    };
  }

  @Get('accounts/:accountId')
  @UseGuards(SessionGuard)
  async balance(@Param('accountId') accountId: string) {
    const warning = await this.lowBalance.check(accountId);
    return {
      accountId,
      low: Boolean(warning),
      available: warning ? formatCredits(warning.availableMicro) : undefined,
    };
  }

  @Post('checkout')
  @UseGuards(SessionGuard)
  async checkout(@Body() body: { accountId: string; packId: string }) {
    return this.stripe.createCheckout(body.accountId, body.packId);
  }
}

/**
 * Separate controller so the webhook is not behind SessionGuard — Stripe cannot
 * present a session cookie. Its authentication is the signature over the raw
 * body, verified inside StripeService.
 */
@Controller('webhooks')
export class StripeWebhookController {
  constructor(private readonly stripe: StripeService) {}

  @Post('stripe')
  async stripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<{ rawBody?: Buffer }>,
  ) {
    // The raw buffer is required: re-serialising the parsed JSON changes the
    // bytes and the signature no longer matches.
    const raw = req.rawBody;
    if (!raw) return { received: false, reason: 'raw body unavailable' };

    const result = await this.stripe.handleWebhook(raw, signature);
    return { received: true, ...result };
  }
}
