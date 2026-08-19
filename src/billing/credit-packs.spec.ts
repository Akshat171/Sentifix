import {
  availablePacks,
  bonusPercent,
  CREDIT_PACKS,
  findPack,
  packCreditsMicro,
} from './credit-packs';
import { costMicro, MICRO_PER_CREDIT } from './pricing';

describe('credit packs', () => {
  it('never grants less than face value — a pack must not be a bad deal', () => {
    for (const p of CREDIT_PACKS) {
      expect(p.credits).toBeGreaterThanOrEqual(p.priceUsd * 100);
    }
  });

  it('rewards volume: bigger packs carry a bigger bonus', () => {
    const bonuses = CREDIT_PACKS.map(bonusPercent);
    for (let i = 1; i < bonuses.length; i++) {
      expect(bonuses[i]).toBeGreaterThanOrEqual(bonuses[i - 1]);
    }
  });

  it('has unique ids, since ledger rows reference them', () => {
    expect(new Set(CREDIT_PACKS.map((p) => p.id)).size).toBe(CREDIT_PACKS.length);
  });

  it('converts to micro-credits without losing precision', () => {
    const pack = findPack('starter')!;
    expect(packCreditsMicro(pack)).toBe(2_000 * MICRO_PER_CREDIT);
    expect(Number.isSafeInteger(packCreditsMicro(findPack('scale')!))).toBe(true);
  });

  it('buys a sensible number of runs on the default tier', () => {
    const perRun = costMicro(
      { modelKey: 'gpt-5.6-luna', inputTokens: 80_000, outputTokens: 8_000 },
      2,
    );
    const runs = packCreditsMicro(findPack('starter')!) / perRun;
    expect(runs).toBeGreaterThan(100); // a $20 entry pack should not feel stingy
  });

  it('only lists available packs', () => {
    expect(availablePacks().every((p) => p.available)).toBe(true);
  });

  it('returns undefined for an unknown pack rather than throwing', () => {
    expect(findPack('enterprise-unlimited')).toBeUndefined();
  });
});
