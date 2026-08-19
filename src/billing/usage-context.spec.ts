import { recordUsage, UsageAccumulator, withUsageCapture } from './usage-context';

describe('usage capture', () => {
  it('collects calls made anywhere inside the context', async () => {
    const totals = await withUsageCapture(async (usage) => {
      // Simulates LlmProvider being several frames deep in the call stack.
      const deep = async () =>
        recordUsage({ modelKey: 'gpt-5.6-luna', inputTokens: 100, outputTokens: 20 });
      await deep();
      await deep();
      return usage.totals();
    });

    expect(totals).toEqual([{ modelKey: 'gpt-5.6-luna', inputTokens: 200, outputTokens: 40 }]);
  });

  it('keeps a separate line per model', async () => {
    const totals = await withUsageCapture(async (usage) => {
      recordUsage({ modelKey: 'gpt-5.6-luna', inputTokens: 10, outputTokens: 1 });
      recordUsage({ modelKey: 'gpt-5.6-sol', inputTokens: 20, outputTokens: 2 });
      return usage.totals();
    });

    expect(totals).toHaveLength(2);
    expect(totals.map((t) => t.modelKey).sort()).toEqual(['gpt-5.6-luna', 'gpt-5.6-sol']);
  });

  it('does not leak between concurrent runs', async () => {
    const [a, b] = await Promise.all([
      withUsageCapture(async (usage) => {
        recordUsage({ modelKey: 'gpt-5.6-luna', inputTokens: 1, outputTokens: 1 });
        await new Promise((r) => setTimeout(r, 10));
        recordUsage({ modelKey: 'gpt-5.6-luna', inputTokens: 1, outputTokens: 1 });
        return usage.totals();
      }),
      withUsageCapture(async (usage) => {
        recordUsage({ modelKey: 'gpt-5.6-sol', inputTokens: 5, outputTokens: 5 });
        return usage.totals();
      }),
    ]);

    expect(a).toEqual([{ modelKey: 'gpt-5.6-luna', inputTokens: 2, outputTokens: 2 }]);
    expect(b).toEqual([{ modelKey: 'gpt-5.6-sol', inputTokens: 5, outputTokens: 5 }]);
  });

  it('is a no-op outside a context, so unmetered callers still work', () => {
    expect(() =>
      recordUsage({ modelKey: 'gpt-5.6-luna', inputTokens: 1, outputTokens: 1 }),
    ).not.toThrow();
  });

  it('counts calls, not just tokens', () => {
    const acc = new UsageAccumulator();
    acc.add({ modelKey: 'a', inputTokens: 1, outputTokens: 1 });
    acc.add({ modelKey: 'a', inputTokens: 1, outputTokens: 1 });
    expect(acc.callCount).toBe(2);
    expect(acc.totals()).toHaveLength(1);
  });
});
