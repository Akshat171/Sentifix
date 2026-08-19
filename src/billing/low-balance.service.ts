import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../persistence/entities/account.entity';
import { availablePacks } from './credit-packs';
import { formatCredits, MICRO_PER_CREDIT } from './pricing';

export interface LowBalanceWarning {
  accountId: string;
  availableMicro: number;
  thresholdMicro: number;
  topUpUrl: string;
}

/**
 * Warns before the balance hits zero.
 *
 * Running out mid-triage is a bad first experience: the customer sees a bug
 * report answered with "out of credits" and has to work out what happened. The
 * threshold is expressed in credits rather than runs because run cost varies
 * ~25x by tier — a "5 runs left" warning would mean wildly different things to
 * an economy and a premium tenant.
 */
@Injectable()
export class LowBalanceService {
  private readonly logger = new Logger(LowBalanceService.name);
  private readonly thresholdMicro: number;
  private readonly baseUrl: string;
  private readonly cooldownMs: number;

  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    config: ConfigService,
  ) {
    this.thresholdMicro =
      Number(config.get<number>('LOW_BALANCE_THRESHOLD_CREDITS') ?? 250) * MICRO_PER_CREDIT;
    this.baseUrl = config.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';
    this.cooldownMs =
      Number(config.get<number>('LOW_BALANCE_COOLDOWN_HOURS') ?? 24) * 60 * 60 * 1000;
  }

  /** Null when the balance is healthy, so callers can `if (warning)`. */
  async check(accountId: string): Promise<LowBalanceWarning | null> {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) return null;

    const availableMicro = account.balanceMicro - account.heldMicro;
    if (availableMicro > this.thresholdMicro) return null;

    this.logger.warn(
      `Account ${accountId} low: ${formatCredits(availableMicro)} credits remaining`,
    );

    return {
      accountId,
      availableMicro,
      thresholdMicro: this.thresholdMicro,
      topUpUrl: `${this.baseUrl}/billing`,
    };
  }

  /**
   * Same check, but claims the right to notify — returns a warning at most once
   * per cooldown window. Without this, every run below the threshold appends
   * another nag to the customer's issue tracker, which trains them to ignore it.
   */
  async checkAndClaim(accountId: string): Promise<LowBalanceWarning | null> {
    const warning = await this.check(accountId);
    if (!warning) return null;

    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) return null;

    const last = account.lowBalanceNotifiedAt?.getTime() ?? 0;
    if (Date.now() - last < this.cooldownMs) return null;

    await this.accounts.update({ id: accountId }, { lowBalanceNotifiedAt: new Date() });
    return warning;
  }

  /** Message body shared by the GitHub comment and the Slack reply. */
  format(warning: LowBalanceWarning): string {
    const cheapest = availablePacks()[0];
    return (
      `Sentifix credits running low — ${formatCredits(warning.availableMicro)} left. ` +
      (cheapest
        ? `A ${cheapest.label} pack adds ${cheapest.credits.toLocaleString()} credits for $${cheapest.priceUsd}: ${warning.topUpUrl}`
        : `Top up: ${warning.topUpUrl}`)
    );
  }
}
