import { requireModel } from '../llm/model-catalog';

/**
 * Money is integer micro-credits everywhere below this line.
 *
 * 1 credit = 1_000_000 micro-credits, and 1 credit is defined as USD 0.01 of
 * customer-facing value. Floats appear in exactly one place — the per-model USD
 * rates in the catalog, which are transcribed from vendor pricing pages — and
 * every derived amount is rounded to an integer immediately. Float arithmetic on
 * a running balance is the classic billing bug: it is silent, it compounds, and
 * it is unrecoverable once it has been invoiced.
 */
export const MICRO_PER_CREDIT = 1_000_000;
export const CENTS_PER_CREDIT = 1;

export interface TokenCount {
  modelKey: string;
  inputTokens: number;
  outputTokens: number;
}

export interface PricedLine extends TokenCount {
  costMicro: number;
}

/**
 * Vendor cost is stored, not sale price, so the catalog stays checkable against
 * the vendor's own pricing page. The markup is applied here, once, so changing
 * your margin is a config change rather than a re-transcription of every rate.
 */
export function costMicro(count: TokenCount, markup: number): number {
  const m = requireModel(count.modelKey);

  // tokens ÷ 1e6 × usdPerMTok × markup × (100 credits per USD) × 1e6 micro
  // collapses to: tokens × usdPerMTok × markup × 100
  const input = count.inputTokens * m.usdPerMTokIn * markup * 100;
  const output = count.outputTokens * m.usdPerMTokOut * markup * 100;

  return Math.round(input + output);
}

export function priceAll(counts: TokenCount[], markup: number): PricedLine[] {
  return counts.map((c) => ({ ...c, costMicro: costMicro(c, markup) }));
}

export function sumMicro(lines: PricedLine[]): number {
  return lines.reduce((total, l) => total + l.costMicro, 0);
}

/** Display helper — never use the result for arithmetic. */
export function formatCredits(micro: number): string {
  return (micro / MICRO_PER_CREDIT).toFixed(2);
}
