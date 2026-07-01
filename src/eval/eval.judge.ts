import { Injectable, Logger } from '@nestjs/common';
import { LlmProvider } from '../llm/llm.provider';

export interface JudgeInput {
  runId: string;
  issue: { title: string; body: string };
  classification: Record<string, unknown>;
  diagnosis: Record<string, unknown>;
  proposedDiff: string;
}

export interface JudgeOutput {
  score: number;
  rationale: string;
  breakdown: {
    correctness: number;
    completeness: number;
    safety: number;
    clarity: number;
  };
  model: string;
}

interface RubricResponse {
  correctness: number;
  completeness: number;
  safety: number;
  clarity: number;
  rationale: string;
}

@Injectable()
export class EvalJudge {
  private readonly logger = new Logger(EvalJudge.name);

  constructor(private readonly llm: LlmProvider) {}

  async evaluate(input: JudgeInput): Promise<JudgeOutput> {
    this.logger.log(`Evaluating run ${input.runId}`);

    if (!input.proposedDiff || input.proposedDiff === '# insufficient-context') {
      return {
        score: 0,
        rationale: 'No diff was proposed due to insufficient context.',
        breakdown: { correctness: 0, completeness: 0, safety: 0, clarity: 0 },
        model: this.llm.chatModel,
      };
    }

    const raw = await this.llm.chat(
      [
        {
          role: 'system',
          content: `You are an impartial code review judge evaluating a proposed bug fix.
Score each dimension 0.0–1.0, then output valid JSON:
{
  "correctness":   <float>,  // does the diff actually fix the described bug?
  "completeness":  <float>,  // are all affected code paths covered?
  "safety":        <float>,  // no regressions, no new security issues?
  "clarity":       <float>,  // is the diff readable and minimal?
  "rationale":     <string>  // ≤3 sentences explaining your overall verdict
}`,
        },
        {
          role: 'user',
          content: `## Issue
Title: ${input.issue.title}
Body: ${input.issue.body}

## Classification
${JSON.stringify(input.classification, null, 2)}

## Diagnosis
${JSON.stringify(input.diagnosis, null, 2)}

## Proposed diff
\`\`\`diff
${input.proposedDiff}
\`\`\``,
        },
      ],
      true,
    );

    const rubric: RubricResponse = JSON.parse(raw);
    const score = (rubric.correctness + rubric.completeness + rubric.safety + rubric.clarity) / 4;

    return {
      score: Math.min(1, Math.max(0, score)),
      rationale: rubric.rationale,
      breakdown: {
        correctness: rubric.correctness,
        completeness: rubric.completeness,
        safety: rubric.safety,
        clarity: rubric.clarity,
      },
      model: this.llm.chatModel,
    };
  }
}
