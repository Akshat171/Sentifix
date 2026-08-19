import { MICRO_PER_CREDIT } from './pricing';

/**
 * What a customer can buy. One credit is USD 0.01 of value, so a pack's face
 * value is priceUsd × 100 credits; anything above that is the volume bonus.
 *
 * Kept as a literal rather than a database table on purpose: price points change
 * rarely, and a code change gets reviewed. A pack table invites someone editing
 * a price in production without a deploy or an audit trail. Retire a pack by
 * setting `available: false` — never delete one, because ledger rows reference it.
 */
export interface CreditPack {
  id: string;
  label: string;
  priceUsd: number;
  /** Total credits granted, face value plus bonus. */
  credits: number;
  available: boolean;
}

export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: 'starter', label: 'Starter', priceUsd: 20, credits: 2_000, available: true },
  { id: 'team', label: 'Team', priceUsd: 100, credits: 11_000, available: true },
  { id: 'scale', label: 'Scale', priceUsd: 500, credits: 60_000, available: true },
];

const BY_ID = new Map(CREDIT_PACKS.map((p) => [p.id, p]));

export function findPack(id: string): CreditPack | undefined {
  return BY_ID.get(id);
}

export function availablePacks(): CreditPack[] {
  return CREDIT_PACKS.filter((p) => p.available);
}

export function packCreditsMicro(pack: CreditPack): number {
  return pack.credits * MICRO_PER_CREDIT;
}

/** Bonus credits over face value, as a percentage — for display only. */
export function bonusPercent(pack: CreditPack): number {
  const faceValue = pack.priceUsd * 100;
  return Math.round(((pack.credits - faceValue) / faceValue) * 100);
}
