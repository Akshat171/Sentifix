import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EvalJudge, JudgeOutput } from '../eval/eval.judge';
import { CostEstimator } from '../billing/cost-estimator';
import { LedgerService } from '../billing/ledger.service';
import { priceAll } from '../billing/pricing';
import { withUsageCapture } from '../billing/usage-context';
import { AgentPipeline, TriageInput, TriageOutput } from './agent.pipeline';

export interface TriageRunResult {
  output: TriageOutput;
  evaluation: JudgeOutput;
  /** Catalog key of the model whose diff is being shipped. */
  modelKey: string;
  /** A retry on a stronger model was attempted (whether or not it won). */
  escalated: boolean;
  /** What the run cost the customer, in micro-credits. Zero when unbilled. */
  costMicro: number;
}

export class InsufficientCreditsError extends Error {
  constructor(
    readonly availableMicro: number,
    readonly requiredMicro: number,
  ) {
    super('Not enough credits to start this run');
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * Runs the pipeline, grades the result, and retries the fix on a stronger model
 * when the grade is poor.
 *
 * Escalating on a measured score rather than a predicted difficulty is the point:
 * "this bug looks easy" is a guess that fails silently on subtle bugs, whereas a
 * low judge score is evidence the cheap attempt actually came out badly. Most
 * bugs pass first time, so the second call is paid only on the minority that
 * need it.
 */
@Injectable()
export class TriageRunner {
  private readonly logger = new Logger(TriageRunner.name);
  private readonly threshold: number;
  private readonly billingEnabled: boolean;
  private readonly markup: number;
  private readonly holdTtlMs: number;

  constructor(
    private readonly pipeline: AgentPipeline,
    private readonly judge: EvalJudge,
    private readonly ledger: LedgerService,
    private readonly estimator: CostEstimator,
    config: ConfigService,
  ) {
    this.threshold = Number(config.get<number>('ESCALATION_THRESHOLD') ?? 0.6);
    this.billingEnabled = Boolean(config.get<boolean>('BILLING_ENABLED'));
    this.markup = Number(config.get<number>('CREDIT_MARKUP') ?? 2);
    this.holdTtlMs = Number(config.get<number>('HOLD_TTL_MS') ?? 15 * 60 * 1000);
  }

  /**
   * Reserves credits, runs the pipeline under token metering, and settles the
   * real cost afterwards.
   *
   * Settlement happens in a finally block on purpose: if the pipeline throws
   * halfway through, those tokens were still bought from the vendor, so the
   * customer is still charged for what was actually consumed.
   */
  async run(runId: string, input: TriageInput, accountId?: string): Promise<TriageRunResult> {
    const models = input.models;
    const billing = this.billingEnabled && Boolean(accountId) && Boolean(models);

    if (billing) {
      const holdMicro = this.estimator.estimateMicro(models!);
      const reservation = await this.ledger.reserve(accountId!, runId, holdMicro, this.holdTtlMs);
      if (!reservation.ok) {
        this.logger.warn(
          `Run ${runId} refused: ${reservation.availableMicro} micro available, ${holdMicro} needed`,
        );
        throw new InsufficientCreditsError(reservation.availableMicro, holdMicro);
      }
    }

    return withUsageCapture(async (usage) => {
      try {
        return await this.execute(runId, input);
      } finally {
        if (billing) {
          const lines = priceAll(usage.totals(), this.markup);
          try {
            const costMicro = await this.ledger.settle(accountId!, runId, lines, this.markup);
            this.logger.log(
              `Run ${runId} settled: ${usage.callCount} calls, ${costMicro} micro-credits`,
            );
          } catch (err) {
            // A settlement failure must not swallow the run's own result or
            // error; the hold expires on its own and reconciliation will surface it.
            this.logger.error(`Settle failed for run ${runId}: ${(err as Error).message}`);
          }
        }
      }
    });
  }

  private async execute(runId: string, input: TriageInput): Promise<TriageRunResult> {
    const output = await this.pipeline.run(input);
    const firstModel = input.models?.chat ?? 'default';

    const evaluation = await this.evaluate(runId, input, output, output.proposedDiff);
    const settled: TriageRunResult = {
      output,
      evaluation,
      modelKey: firstModel,
      escalated: false,
      costMicro: 0,
    };

    const escalateTo = input.models?.escalate;
    if (!escalateTo) return settled;

    if (evaluation.score >= this.threshold) {
      this.logger.log(
        `Score ${evaluation.score.toFixed(2)} >= ${this.threshold} on ${firstModel} — shipping`,
      );
      return settled;
    }

    // A stronger model cannot invent context that retrieval never found, so an
    // empty diff is not worth a second call.
    if (!output.proposedDiff || output.proposedDiff === '# insufficient-context') {
      this.logger.log('No diff produced — skipping escalation (retrieval, not model, is the gap)');
      return settled;
    }

    this.logger.log(
      `Score ${evaluation.score.toFixed(2)} < ${this.threshold} on ${firstModel} — retrying on ${escalateTo}`,
    );

    try {
      const retryDiff = await this.pipeline.proposeFixOnly(input, output, escalateTo);
      if (!retryDiff) {
        this.logger.warn(`Escalation to ${escalateTo} produced no diff — keeping original`);
        return { ...settled, escalated: true };
      }

      const retryEval = await this.evaluate(runId, input, output, retryDiff);

      // The stronger model is not guaranteed to win. Keep whichever diff the
      // judge actually preferred rather than assuming the upgrade helped.
      if (retryEval.score <= evaluation.score) {
        this.logger.log(
          `Escalation scored ${retryEval.score.toFixed(2)} <= ${evaluation.score.toFixed(2)} — keeping original`,
        );
        return { ...settled, escalated: true };
      }

      this.logger.log(
        `Escalation improved score ${evaluation.score.toFixed(2)} → ${retryEval.score.toFixed(2)}`,
      );
      return {
        output: { ...output, proposedDiff: retryDiff },
        evaluation: retryEval,
        modelKey: escalateTo,
        escalated: true,
        costMicro: 0,
      };
    } catch (err) {
      // Never let a cost optimisation break triage — ship what we already have.
      this.logger.warn(`Escalation failed, keeping original diff: ${(err as Error).message}`);
      return { ...settled, escalated: true };
    }
  }

  private evaluate(
    runId: string,
    input: TriageInput,
    output: TriageOutput,
    proposedDiff: string,
  ): Promise<JudgeOutput> {
    return this.judge.evaluate({
      runId,
      issue: { title: input.title, body: input.body },
      classification: output.classification as unknown as Record<string, unknown>,
      diagnosis: output.diagnosis as unknown as Record<string, unknown>,
      proposedDiff,
    });
  }
}
