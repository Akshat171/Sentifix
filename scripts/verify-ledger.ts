/**
 * Exercises the credit ledger against a real Postgres.
 *
 * The unit tests mock the repositories, so they cannot catch the things that
 * actually break here: column naming, transaction semantics, and whether the
 * atomic reserve really is atomic. Run against a scratch database.
 *
 * Usage: pnpm verify:ledger
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { Account } from '../src/persistence/entities/account.entity';
import { AccountLink } from '../src/persistence/entities/account-link.entity';
import { CreditHold } from '../src/persistence/entities/credit-hold.entity';
import { CreditLedgerEntry } from '../src/persistence/entities/credit-ledger.entity';
import { UsageRecord } from '../src/persistence/entities/usage-record.entity';
import { LedgerService } from '../src/billing/ledger.service';
import { MICRO_PER_CREDIT, priceAll } from '../src/billing/pricing';

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [Account, AccountLink, CreditHold, CreditLedgerEntry, UsageRecord],
    synchronize: false,
    logging: false,
  });
  await ds.initialize();

  const accounts = ds.getRepository(Account);
  const holds = ds.getRepository(CreditHold);
  const ledgerRepo = ds.getRepository(CreditLedgerEntry);
  const ledger = new LedgerService(accounts, holds, ledgerRepo, ds);

  const account = await accounts.save(accounts.create({ name: 'verify-run', balanceMicro: 0, heldMicro: 0 }));
  const runId = '00000000-0000-4000-8000-000000000001';
  const runId2 = '00000000-0000-4000-8000-000000000002';

  try {
    console.log('\ncredit / balance');
    await ledger.credit(account.id, 1_000 * MICRO_PER_CREDIT, 'grant', `verify-grant:${account.id}`);
    check('credit applied', (await ledger.availableMicro(account.id)) === 1_000 * MICRO_PER_CREDIT);

    await ledger.credit(account.id, 1_000 * MICRO_PER_CREDIT, 'grant', `verify-grant:${account.id}`);
    check(
      'replayed credit is ignored (idempotency key)',
      (await ledger.availableMicro(account.id)) === 1_000 * MICRO_PER_CREDIT,
    );

    console.log('\nreserve');
    const ok = await ledger.reserve(account.id, runId, 200 * MICRO_PER_CREDIT, 60_000);
    check('hold placed', ok.ok);
    check(
      'available reduced by the hold',
      (await ledger.availableMicro(account.id)) === 800 * MICRO_PER_CREDIT,
    );

    const tooBig = await ledger.reserve(account.id, runId2, 5_000 * MICRO_PER_CREDIT, 60_000);
    check('over-balance reserve refused', !tooBig.ok);

    console.log('\nconcurrency — the whole point of the atomic UPDATE');
    // Ten simultaneous 100-credit holds against an 800-credit available balance.
    // Exactly eight must succeed; a read-then-write would let all ten through.
    const many = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        ledger
          .reserve(account.id, `00000000-0000-4000-8000-1000000000${i.toString().padStart(2, '0')}`, 100 * MICRO_PER_CREDIT, 60_000)
          .then((r) => r.ok)
          .catch(() => false),
      ),
    );
    const granted = many.filter(Boolean).length;
    check('exactly 8 of 10 concurrent holds granted', granted === 8, `${granted} granted`);
    check('never overdrawn', (await ledger.availableMicro(account.id)) >= 0);

    console.log('\nsettle');
    const lines = priceAll(
      [{ modelKey: 'gpt-5.6-luna', inputTokens: 80_000, outputTokens: 8_000 }],
      2,
    );
    const cost = await ledger.settle(account.id, runId, lines, 2);
    check('settle returned the priced cost', cost > 0, `${cost} micro`);

    const hold = await holds.findOne({ where: { runId } });
    check('hold marked settled', hold?.state === 'settled');

    const debit = await ledgerRepo.findOne({ where: { idempotencyKey: `run:${runId}:debit` } });
    check('debit written to the ledger', debit?.amountMicro === -cost);

    const usage = await ds.getRepository(UsageRecord).findOne({ where: { runId } });
    check('usage record written', Boolean(usage), `${usage?.inputTokens ?? 0} in / ${usage?.outputTokens ?? 0} out`);

    console.log('\nreconcile — cached balance vs the ledger');
    const rec = await ledger.reconcile(account.id);
    check('no drift between cache and ledger', rec.drift === 0, `cached ${rec.cached}, ledger ${rec.derived}`);
  } finally {
    // Scratch data only — leave the database as we found it.
    await ds.getRepository(UsageRecord).delete({ accountId: account.id });
    await ledgerRepo.delete({ accountId: account.id });
    await holds.delete({ accountId: account.id });
    await accounts.delete({ id: account.id });
    await ds.destroy();
  }

  console.log(failures === 0 ? '\nledger verified against real Postgres\n' : `\n${failures} check(s) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nverification crashed:', (err as Error).message, '\n');
  process.exit(1);
});
