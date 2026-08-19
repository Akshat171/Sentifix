import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { LedgerService } from './ledger.service';
import { findPack, packCreditsMicro } from './credit-packs';

const cfg = (v: Record<string, unknown>) =>
  ({ get: (k: string) => v[k] }) as unknown as ConfigService;

function build(constructEvent: jest.Mock) {
  const credit = jest.fn().mockResolvedValue(2_000_000_000);
  const svc = new StripeService(
    cfg({
      STRIPE_SECRET_KEY: 'sk_test_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x',
      APP_BASE_URL: 'https://sentifix.dev',
    }),
    { credit } as unknown as LedgerService,
  );
  // Swap the SDK's verifier for a controllable stub.
  (svc as unknown as { client: unknown }).client = { webhooks: { constructEvent } };
  return { svc, credit };
}

function paidSession(metadata: Record<string, string>, paymentStatus = 'paid') {
  return {
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', payment_status: paymentStatus, metadata } },
  };
}

describe('StripeService webhook', () => {
  it('credits the account on a paid checkout session', async () => {
    const pack = findPack('team')!;
    const { svc, credit } = build(
      jest.fn().mockReturnValue(paidSession({ accountId: 'acc-1', packId: 'team' })),
    );

    await expect(svc.handleWebhook(Buffer.from('{}'), 'sig')).resolves.toEqual({ handled: true });
    expect(credit).toHaveBeenCalledWith(
      'acc-1',
      packCreditsMicro(pack),
      'topup',
      'stripe:evt_1',
      expect.stringContaining('Team'),
    );
  });

  it('keys idempotency on the Stripe event id, so a replay cannot double-credit', async () => {
    const { svc, credit } = build(
      jest.fn().mockReturnValue(paidSession({ accountId: 'acc-1', packId: 'starter' })),
    );

    await svc.handleWebhook(Buffer.from('{}'), 'sig');
    await svc.handleWebhook(Buffer.from('{}'), 'sig');

    // The service calls through twice; the ledger's unique key absorbs the
    // duplicate. What matters here is that the KEY is stable across deliveries.
    const keys = credit.mock.calls.map((c) => c[3]);
    expect(keys).toEqual(['stripe:evt_1', 'stripe:evt_1']);
  });

  it('refuses an unverified body instead of minting free credits', async () => {
    const { svc, credit } = build(
      jest.fn().mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      }),
    );

    await expect(svc.handleWebhook(Buffer.from('{}'), 'forged')).rejects.toThrow(
      BadRequestException,
    );
    expect(credit).not.toHaveBeenCalled();
  });

  it('ignores a completed but unpaid session', async () => {
    const { svc, credit } = build(
      jest.fn().mockReturnValue(paidSession({ accountId: 'acc-1', packId: 'starter' }, 'unpaid')),
    );

    await expect(svc.handleWebhook(Buffer.from('{}'), 'sig')).resolves.toEqual({ handled: false });
    expect(credit).not.toHaveBeenCalled();
  });

  it('ignores event types it does not handle', async () => {
    const { svc, credit } = build(
      jest
        .fn()
        .mockReturnValue({ id: 'evt_2', type: 'payment_intent.created', data: { object: {} } }),
    );

    await expect(svc.handleWebhook(Buffer.from('{}'), 'sig')).resolves.toEqual({ handled: false });
    expect(credit).not.toHaveBeenCalled();
  });

  it('does not credit when the session cannot be attributed to an account', async () => {
    const { svc, credit } = build(jest.fn().mockReturnValue(paidSession({ packId: 'starter' })));

    await expect(svc.handleWebhook(Buffer.from('{}'), 'sig')).resolves.toEqual({ handled: false });
    expect(credit).not.toHaveBeenCalled();
  });

  it('does not credit for a pack that no longer exists', async () => {
    const { svc, credit } = build(
      jest.fn().mockReturnValue(paidSession({ accountId: 'acc-1', packId: 'retired-2024' })),
    );

    await expect(svc.handleWebhook(Buffer.from('{}'), 'sig')).resolves.toEqual({ handled: false });
    expect(credit).not.toHaveBeenCalled();
  });
});

describe('StripeService configuration', () => {
  it('reports disabled and refuses checkout when unconfigured', async () => {
    const svc = new StripeService(cfg({}), { credit: jest.fn() } as unknown as LedgerService);
    expect(svc.enabled).toBe(false);
    await expect(svc.createCheckout('acc-1', 'starter')).rejects.toThrow(BadRequestException);
  });

  it('refuses an unknown pack', async () => {
    const { svc } = build(jest.fn());
    await expect(svc.createCheckout('acc-1', 'unlimited')).rejects.toThrow(BadRequestException);
  });
});
