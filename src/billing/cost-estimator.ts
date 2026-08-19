import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ModelSelection } from '../llm/model-catalog';
import { costMicro } from './pricing';

/**
 * Worst-case cost of a run, used as the hold amount.
 *
 * Static per-model estimates rather than a learned p95: a hold only has to be a
 * safe upper bound, and an estimator that is occasionally too low is worse than
 * one that is uniformly a bit too high — the first overdraws a customer, the
 * second briefly reserves credits they get straight back at settle.
 *
 * Tune ESTIMATE_INPUT_TOKENS from real usage_records once you have a week of them.
 */
@Injectable()
export class CostEstimator {
  private readonly inputTokens: number;
  private readonly outputTokens: number;
  private readonly markup: number;

  constructor(config: ConfigService) {
    this.inputTokens = Number(config.get<number>('ESTIMATE_INPUT_TOKENS') ?? 80_000);
    this.outputTokens = Number(config.get<number>('ESTIMATE_OUTPUT_TOKENS') ?? 8_000);
    this.markup = Number(config.get<number>('CREDIT_MARKUP') ?? 2);
  }

  /** Includes the escalation retry, because that is the worst case. */
  estimateMicro(models: ModelSelection): number {
    const base = costMicro(
      {
        modelKey: models.chat,
        inputTokens: this.inputTokens,
        outputTokens: this.outputTokens,
      },
      this.markup,
    );

    if (!models.escalate) return base;

    // Escalation re-runs the fix step only, reusing retrieval and diagnosis, so
    // it is roughly one call rather than a whole second pipeline.
    const retry = costMicro(
      {
        modelKey: models.escalate,
        inputTokens: Math.round(this.inputTokens * 0.4),
        outputTokens: this.outputTokens,
      },
      this.markup,
    );

    return base + retry;
  }
}
