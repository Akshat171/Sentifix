import { costMicro, formatCredits, MICRO_PER_CREDIT, priceAll, sumMicro } from './pricing';
import { MODEL_CATALOG, requireModel } from '../llm/model-catalog';

describe('catalog pricing data', () => {
  it('prices every model, or billing silently charges nothing', () => {
    for (const m of MODEL_CATALOG) {
      expect(m.usdPerMTokIn).toBeGreaterThan(0);
      expect(m.usdPerMTokOut).toBeGreaterThan(0);
      expect(m.pricedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('charges more for output than input on every model, as vendors do', () => {
    for (const m of MODEL_CATALOG) {
      expect(m.usdPerMTokOut).toBeGreaterThan(m.usdPerMTokIn);
    }
  });

  it('keeps the tier ordering honest — premium must cost more than economy', () => {
    const luna = requireModel('gpt-5.6-luna');
    const sol = requireModel('gpt-5.6-sol');
    expect(sol.usdPerMTokIn).toBeGreaterThan(luna.usdPerMTokIn);
  });
});

describe('costMicro', () => {
  it('converts vendor USD into credits at 1 credit = USD 0.01', () => {
    // Luna output is $1.20/MTok. 1M output tokens at markup 1 = $1.20 = 120 credits.
    const micro = costMicro(
      { modelKey: 'gpt-5.6-luna', inputTokens: 0, outputTokens: 1_000_000 },
      1,
    );
    expect(micro).toBe(120 * MICRO_PER_CREDIT);
  });

  it('applies the markup multiplicatively', () => {
    const at1 = costMicro({ modelKey: 'gpt-5.6-sol', inputTokens: 1000, outputTokens: 500 }, 1);
    const at3 = costMicro({ modelKey: 'gpt-5.6-sol', inputTokens: 1000, outputTokens: 500 }, 3);
    expect(at3).toBe(at1 * 3);
  });

  it('always returns an integer — fractional micro-credits would drift', () => {
    for (const tokens of [1, 7, 13, 999, 1234]) {
      const micro = costMicro(
        { modelKey: 'gpt-5.6-terra', inputTokens: tokens, outputTokens: tokens },
        2.5,
      );
      expect(Number.isInteger(micro)).toBe(true);
    }
  });

  it('prices a realistic run at a sane figure', () => {
    // ~80k in / 8k out on the economy tier at 2x markup.
    const micro = costMicro(
      { modelKey: 'gpt-5.6-luna', inputTokens: 80_000, outputTokens: 8_000 },
      2,
    );
    const credits = micro / MICRO_PER_CREDIT;
    expect(credits).toBeGreaterThan(0);
    expect(credits).toBeLessThan(20); // a cheap-tier bug should not cost 20c of credit
  });

  it('makes the premium tier materially more expensive than the economy tier', () => {
    const call = { inputTokens: 50_000, outputTokens: 5_000 };
    const luna = costMicro({ modelKey: 'gpt-5.6-luna', ...call }, 2);
    const sol = costMicro({ modelKey: 'gpt-5.6-sol', ...call }, 2);
    expect(sol / luna).toBeGreaterThan(10);
  });

  it('charges nothing for a call that reported no tokens', () => {
    expect(costMicro({ modelKey: 'gpt-5.6-sol', inputTokens: 0, outputTokens: 0 }, 2)).toBe(0);
  });
});

describe('priceAll / sumMicro', () => {
  it('totals a multi-model run', () => {
    const lines = priceAll(
      [
        { modelKey: 'gpt-5.6-luna', inputTokens: 10_000, outputTokens: 1_000 },
        { modelKey: 'gpt-5.6-sol', inputTokens: 5_000, outputTokens: 2_000 },
      ],
      2,
    );
    expect(lines).toHaveLength(2);
    expect(sumMicro(lines)).toBe(lines[0].costMicro + lines[1].costMicro);
  });

  it('sums an empty run to zero rather than NaN', () => {
    expect(sumMicro(priceAll([], 2))).toBe(0);
  });
});

describe('formatCredits', () => {
  it('renders micro-credits as a two-decimal credit figure', () => {
    expect(formatCredits(2_500_000)).toBe('2.50');
    expect(formatCredits(0)).toBe('0.00');
  });
});
