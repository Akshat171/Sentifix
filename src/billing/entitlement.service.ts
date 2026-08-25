import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../persistence/entities/account.entity';
import { formatCredits } from './pricing';

export type EntitlementReason =
  | 'trial'
  | 'paid'
  | 'trial_expired'
  | 'no_credits'
  | 'unknown_account';

export interface Entitlement {
  allowed: boolean;
  reason: EntitlementReason;
  trialEndsAt: Date | null;
  trialDaysLeft: number | null;
  availableCredits: string;
}

/**
 * Whether an account may use the product right now.
 *
 * One rule covers both states: you are in if your trial has not ended OR you
 * have credits. Modelling it as a plan enum instead would need a state machine
 * kept in step with payments, and would drift the first time a webhook was
 * missed. Here, topping up is what grants access, so there is nothing to sync.
 *
 * The credit half also matters for a self-serve trial: time alone would let one
 * stranger burn unbounded provider spend inside their seven days.
 */
@Injectable()
export class EntitlementService {
  private readonly trialDays: number;

  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    config: ConfigService,
  ) {
    this.trialDays = Number(config.get<number>('TRIAL_DAYS') ?? 7);
  }

  /** When a newly provisioned account's trial should end. */
  trialEnd(from: Date = new Date()): Date | null {
    if (this.trialDays <= 0) return null;
    return new Date(from.getTime() + this.trialDays * 24 * 60 * 60 * 1000);
  }

  async check(accountId: string): Promise<Entitlement> {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) {
      return {
        allowed: false,
        reason: 'unknown_account',
        trialEndsAt: null,
        trialDaysLeft: null,
        availableCredits: '0.00',
      };
    }

    const availableMicro = Math.max(account.balanceMicro - account.heldMicro, 0);
    const availableCredits = formatCredits(availableMicro);
    const trialEndsAt = account.trialEndsAt;
    const msLeft = trialEndsAt ? trialEndsAt.getTime() - Date.now() : 0;
    const trialActive = msLeft > 0;
    const trialDaysLeft = trialEndsAt ? Math.max(Math.ceil(msLeft / 86_400_000), 0) : null;

    if (trialActive) {
      return { allowed: true, reason: 'trial', trialEndsAt, trialDaysLeft, availableCredits };
    }
    if (availableMicro > 0) {
      return { allowed: true, reason: 'paid', trialEndsAt, trialDaysLeft, availableCredits };
    }

    return {
      allowed: false,
      // Distinguished so the customer is told the accurate thing: a lapsed trial
      // and a spent balance need different next steps. An account that holds a
      // balance is a customer, not a lapsed trialist, even when every credit is
      // currently reserved by in-flight work — telling them their "free trial has
      // ended" would be both wrong and insulting.
      reason: trialEndsAt && account.balanceMicro === 0 ? 'trial_expired' : 'no_credits',
      trialEndsAt,
      trialDaysLeft,
      availableCredits,
    };
  }
}
