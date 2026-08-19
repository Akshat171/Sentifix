import { AsyncLocalStorage } from 'node:async_hooks';
import type { TokenCount } from './pricing';

/**
 * Ambient token metering for one triage run.
 *
 * A run fans out across four services and seven call sites; threading an
 * accumulator through every signature would touch all of them and still miss any
 * future call site silently. AsyncLocalStorage keeps the plumbing in one place:
 * TriageRunner opens a context, LlmProvider writes into whatever context is
 * ambient, and code that runs outside one (eval scripts, the model checker) is
 * simply unmetered rather than broken.
 */
export class UsageAccumulator {
  private readonly lines: TokenCount[] = [];

  add(line: TokenCount): void {
    this.lines.push(line);
  }

  /** Per-model totals — several pipeline nodes share one model. */
  totals(): TokenCount[] {
    const byModel = new Map<string, TokenCount>();
    for (const l of this.lines) {
      const acc = byModel.get(l.modelKey);
      if (acc) {
        acc.inputTokens += l.inputTokens;
        acc.outputTokens += l.outputTokens;
      } else {
        byModel.set(l.modelKey, { ...l });
      }
    }
    return [...byModel.values()];
  }

  get callCount(): number {
    return this.lines.length;
  }
}

const storage = new AsyncLocalStorage<UsageAccumulator>();

export function withUsageCapture<T>(fn: (usage: UsageAccumulator) => Promise<T>): Promise<T> {
  const accumulator = new UsageAccumulator();
  return storage.run(accumulator, () => fn(accumulator));
}

/** No-op outside a capture context, so unmetered callers keep working. */
export function recordUsage(line: TokenCount): void {
  storage.getStore()?.add(line);
}
