import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// `import Stripe from 'stripe'` compiles to `stripe_1.default`, which this
// project's tsconfig (esModuleInterop off) never populates — Stripe's CJS build
// exports the constructor directly. The import-equals form is the localized fix;
// flipping esModuleInterop would change module resolution for the whole project.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
import Stripe = require('stripe');
import { CreditPack, findPack, packCreditsMicro } from './credit-packs';
import { LedgerService } from './ledger.service';

export interface CheckoutLink {
  url: string;
  sessionId: string;
}

/**
 * Money in.
 *
 * Two invariants shape everything here:
 *
 *  1. Credits are granted by the WEBHOOK, never by the browser returning to the
 *     success URL. A success redirect proves the customer's browser reached a
 *     page; it does not prove Stripe captured the payment, and it is trivially
 *     forged by visiting the URL directly.
 *
 *  2. The webhook is idempotent on Stripe's event id. Stripe retries deliveries
 *     as normal operation, so a handler that is merely "usually called once"
 *     will eventually double-credit an account.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client?: Stripe;
  private readonly webhookSecret?: string;
  private readonly baseUrl: string;

  constructor(
    config: ConfigService,
    private readonly ledger: LedgerService,
  ) {
    const key = config.get<string>('STRIPE_SECRET_KEY');
    this.client = key ? new Stripe(key) : undefined;
    this.webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET');
    this.baseUrl = config.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';

    if (!this.client) {
      this.logger.warn('STRIPE_SECRET_KEY unset — checkout disabled, top-ups are admin-only');
    }
  }

  get enabled(): boolean {
    return Boolean(this.client && this.webhookSecret);
  }

  async createCheckout(accountId: string, packId: string): Promise<CheckoutLink> {
    if (!this.client) throw new BadRequestException('Payments are not configured');

    const pack = findPack(packId);
    if (!pack || !pack.available) throw new BadRequestException(`Unknown pack "${packId}"`);

    const session = await this.client.checkout.sessions.create({
      mode: 'payment',
      success_url: `${this.baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.baseUrl}/billing`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: pack.priceUsd * 100, // Stripe wants cents
            product_data: {
              name: `Sentifix ${pack.label} — ${pack.credits.toLocaleString()} credits`,
            },
          },
        },
      ],
      // Read back on the webhook: the session is the only place linking this
      // payment to an account, so it must survive the round trip.
      metadata: { accountId, packId: pack.id, credits: String(pack.credits) },
      client_reference_id: accountId,
    });

    if (!session.url) throw new BadRequestException('Stripe returned no checkout URL');
    this.logger.log(`Checkout ${session.id} opened for account ${accountId} (${pack.id})`);
    return { url: session.url, sessionId: session.id };
  }

  /**
   * Verifies the signature against the RAW request body and applies the credit.
   * Parsing the body before verifying would re-serialise it and invalidate the
   * signature, so the raw buffer has to reach this method untouched.
   */
  async handleWebhook(rawBody: Buffer | string, signature: string): Promise<{ handled: boolean }> {
    if (!this.client || !this.webhookSecret) {
      throw new BadRequestException('Stripe webhooks are not configured');
    }

    let event: Stripe.Event;
    try {
      event = this.client.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (err) {
      // An unverified body is either a misconfiguration or an attacker minting
      // free credits. Never fall through to processing it.
      this.logger.error(`Rejected Stripe webhook: ${(err as Error).message}`);
      throw new BadRequestException('Invalid Stripe signature');
    }

    if (event.type !== 'checkout.session.completed') {
      return { handled: false };
    }

    const session = event.data.object as Stripe.Checkout.Session;

    // Asynchronous methods can complete a session before the funds arrive.
    if (session.payment_status !== 'paid') {
      this.logger.warn(`Session ${session.id} completed but unpaid — no credit applied`);
      return { handled: false };
    }

    const accountId = session.metadata?.accountId ?? session.client_reference_id;
    const packId = session.metadata?.packId;
    if (!accountId || !packId) {
      this.logger.error(`Session ${session.id} has no accountId/packId — cannot attribute payment`);
      return { handled: false };
    }

    const pack = findPack(packId);
    if (!pack) {
      this.logger.error(`Session ${session.id} references retired pack "${packId}"`);
      return { handled: false };
    }

    await this.applyPurchase(accountId, pack, event.id);
    return { handled: true };
  }

  private async applyPurchase(accountId: string, pack: CreditPack, eventId: string): Promise<void> {
    const balanceAfter = await this.ledger.credit(
      accountId,
      packCreditsMicro(pack),
      'topup',
      // Stripe's event id is the natural idempotency key: a redelivered webhook
      // carries the same one, and credit() swallows the duplicate.
      `stripe:${eventId}`,
      `${pack.label} pack — ${pack.credits} credits for $${pack.priceUsd}`,
    );
    this.logger.log(
      `Credited ${pack.credits} to account ${accountId} (${pack.id}); balance now ${balanceAfter} micro`,
    );
  }
}
