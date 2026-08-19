import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { Account } from '../persistence/entities/account.entity';
import { CreditHold } from '../persistence/entities/credit-hold.entity';
import { CreditLedgerEntry, LedgerKind } from '../persistence/entities/credit-ledger.entity';
import { UsageRecord } from '../persistence/entities/usage-record.entity';
import { PricedLine, sumMicro } from './pricing';

export interface ReserveResult {
  ok: boolean;
  availableMicro: number;
}

/** Postgres raises this when an idempotency key or run_id is replayed. */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === UNIQUE_VIOLATION;
}

/**
 * TypeORM's query() returns `[rows, affectedCount]` for UPDATE ... RETURNING,
 * not the rows array. Reading `.length` off the outer value therefore always
 * gives 2, which silently turned every "did the guard match a row?" check into
 * an unconditional yes — a customer with no credits could run without limit.
 */
function returnedRows<T>(result: unknown): T[] {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0] as T[];
  }
  return (Array.isArray(result) ? result : []) as T[];
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(CreditHold) private readonly holds: Repository<CreditHold>,
    @InjectRepository(CreditLedgerEntry)
    private readonly ledger: Repository<CreditLedgerEntry>,
    private readonly dataSource: DataSource,
  ) {}

  async availableMicro(accountId: string): Promise<number> {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) return 0;
    return account.balanceMicro - account.heldMicro;
  }

  /**
   * Authorise a run by holding its worst-case cost.
   *
   * The guard lives in the WHERE clause of a single UPDATE, so the check and the
   * write are one atomic statement. A read-then-write version of this — however
   * short the gap — lets two concurrent runs both observe a sufficient balance
   * and both proceed, which is exactly how a customer ends up overdrawn.
   */
  async reserve(
    accountId: string,
    runId: string,
    amountMicro: number,
    ttlMs: number,
  ): Promise<ReserveResult> {
    if (amountMicro <= 0) return { ok: true, availableMicro: await this.availableMicro(accountId) };

    return this.dataSource.transaction(async (tx) => {
      const rows = returnedRows<{ available: string }>(
        await tx.query(
          `UPDATE accounts
            SET "heldMicro" = "heldMicro" + $1, "updatedAt" = now()
          WHERE id = $2
            AND "balanceMicro" - "heldMicro" >= $1
      RETURNING "balanceMicro" - "heldMicro" AS available`,
          [amountMicro, accountId],
        ),
      );

      if (rows.length === 0) {
        return { ok: false, availableMicro: await this.availableMicro(accountId) };
      }

      try {
        await tx.insert(CreditHold, {
          accountId,
          runId,
          amountMicro,
          state: 'active',
          expiresAt: new Date(Date.now() + ttlMs),
        });
      } catch (err) {
        // Same run reserved twice (queue redelivery). Roll the whole thing back
        // so the second attempt does not double-hold.
        if (isUniqueViolation(err)) {
          throw new HoldAlreadyExistsError(runId);
        }
        throw err;
      }

      return { ok: true, availableMicro: Number(rows[0].available) };
    });
  }

  /**
   * Convert a hold into a real charge. Releases the held amount, debits what was
   * actually consumed, and records the usage breakdown — all in one transaction,
   * so a crash can never leave a debit without its usage record or vice versa.
   */
  async settle(
    accountId: string,
    runId: string,
    lines: PricedLine[],
    markup: number,
  ): Promise<number> {
    const costMicro = sumMicro(lines);

    return this.dataSource.transaction(async (tx) => {
      const hold = await tx.findOne(CreditHold, { where: { runId } });
      if (hold && hold.state !== 'active') {
        this.logger.warn(`Run ${runId} already settled — ignoring duplicate`);
        return costMicro;
      }

      const heldMicro = hold?.amountMicro ?? 0;
      if (costMicro > heldMicro && heldMicro > 0) {
        // Not an error: the estimate is worst-case per model, and an unusually
        // large context can exceed it. Worth seeing, because a pattern of it
        // means the estimator is wrong.
        this.logger.warn(
          `Run ${runId} cost ${costMicro} exceeded its ${heldMicro} hold by ${costMicro - heldMicro}`,
        );
      }

      const updated = returnedRows<{ balanceMicro: string }>(
        await tx.query(
          `UPDATE accounts
            SET "heldMicro" = GREATEST("heldMicro" - $1, 0),
                "balanceMicro" = "balanceMicro" - $2,
                "updatedAt" = now()
          WHERE id = $3
      RETURNING "balanceMicro"`,
          [heldMicro, costMicro, accountId],
        ),
      );
      const balanceAfter = Number(updated[0]?.balanceMicro ?? 0);

      if (hold) {
        await tx.update(CreditHold, { id: hold.id }, { state: 'settled' });
      }

      try {
        await tx.insert(CreditLedgerEntry, {
          accountId,
          amountMicro: -costMicro,
          kind: 'debit',
          idempotencyKey: `run:${runId}:debit`,
          runId,
          note: `${lines.length} model(s)`,
          balanceAfterMicro: balanceAfter,
        });
        await tx.insert(UsageRecord, {
          accountId,
          runId,
          lines,
          inputTokens: lines.reduce((t, l) => t + l.inputTokens, 0),
          outputTokens: lines.reduce((t, l) => t + l.outputTokens, 0),
          costMicro,
          markup,
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          this.logger.warn(`Run ${runId} debit replayed — rolling back, already charged`);
          throw new AlreadySettledError(runId);
        }
        throw err;
      }

      return costMicro;
    });
  }

  /** Give the hold back untouched — the run never consumed anything. */
  async release(runId: string): Promise<void> {
    await this.dataSource.transaction(async (tx) => {
      const hold = await tx.findOne(CreditHold, { where: { runId } });
      if (!hold || hold.state !== 'active') return;

      await tx.query(
        `UPDATE accounts SET "heldMicro" = GREATEST("heldMicro" - $1, 0), "updatedAt" = now()
          WHERE id = $2`,
        [hold.amountMicro, hold.accountId],
      );
      await tx.update(CreditHold, { id: hold.id }, { state: 'released' });
    });
  }

  /** Add credits: a purchase, a free-tier grant, or a manual correction. */
  async credit(
    accountId: string,
    amountMicro: number,
    kind: Extract<LedgerKind, 'topup' | 'grant' | 'refund' | 'adjustment'>,
    idempotencyKey: string,
    note?: string,
  ): Promise<number> {
    if (amountMicro <= 0) throw new Error('credit() requires a positive amount');

    try {
      return await this.dataSource.transaction(async (tx) => {
        const rows = returnedRows<{ balanceMicro: string }>(
          await tx.query(
            `UPDATE accounts SET "balanceMicro" = "balanceMicro" + $1, "updatedAt" = now()
            WHERE id = $2 RETURNING "balanceMicro"`,
            [amountMicro, accountId],
          ),
        );
        const balanceAfter = Number(rows[0]?.balanceMicro ?? 0);

        await tx.insert(CreditLedgerEntry, {
          accountId,
          amountMicro,
          kind,
          idempotencyKey,
          runId: null,
          note: note ?? null,
          balanceAfterMicro: balanceAfter,
        });

        return balanceAfter;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Stripe replays webhooks as a matter of course; this is the normal path
        // for a redelivery, not a failure.
        this.logger.log(`Credit ${idempotencyKey} already applied — ignoring replay`);
        return this.availableMicro(accountId);
      }
      throw err;
    }
  }

  /**
   * Return credits stranded by workers that died mid-run. Without this a crash
   * quietly shrinks a customer's spendable balance until someone notices.
   */
  async expireStaleHolds(): Promise<number> {
    const stale = await this.holds.find({
      where: { state: 'active', expiresAt: LessThan(new Date()) },
      take: 500,
    });
    for (const hold of stale) {
      await this.release(hold.runId);
      this.logger.warn(`Expired stale hold for run ${hold.runId} (${hold.amountMicro} micro)`);
    }
    return stale.length;
  }

  /**
   * Ledger is truth; the balance column is a cache. This proves they agree.
   * Run it on a schedule — silent drift is the failure mode that destroys trust
   * in a billing system, and it is cheap to detect.
   */
  async reconcile(accountId: string): Promise<{ cached: number; derived: number; drift: number }> {
    const account = await this.accounts.findOneOrFail({ where: { id: accountId } });
    const row = await this.ledger
      .createQueryBuilder('l')
      .select('COALESCE(SUM(l.amountMicro), 0)', 'sum')
      .where('l.accountId = :accountId', { accountId })
      .getRawOne<{ sum: string }>();

    const derived = Number(row?.sum ?? 0);
    const drift = account.balanceMicro - derived;
    if (drift !== 0) {
      this.logger.error(
        `Balance drift on account ${accountId}: cached ${account.balanceMicro} vs ledger ${derived}`,
      );
    }
    return { cached: account.balanceMicro, derived, drift };
  }
}

export class HoldAlreadyExistsError extends Error {
  constructor(runId: string) {
    super(`A credit hold already exists for run ${runId}`);
    this.name = 'HoldAlreadyExistsError';
  }
}

export class AlreadySettledError extends Error {
  constructor(runId: string) {
    super(`Run ${runId} has already been charged`);
    this.name = 'AlreadySettledError';
  }
}
