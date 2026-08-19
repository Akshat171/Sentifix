import { ConfigService } from '@nestjs/config';
import { AgentPipeline, TriageInput, TriageOutput } from './agent.pipeline';
import { EvalJudge, JudgeOutput } from '../eval/eval.judge';
import { TriageRunner } from './triage-runner.service';

const OUTPUT: TriageOutput = {
  classification: {
    category: 'crash',
    severity: 'high',
    affectedComponents: [],
    reasoning: '',
  },
  context: [],
  diagnosis: { rootCause: 'off-by-one', hypothesis: '', relevantFiles: ['a.ts'] },
  proposedDiff: '--- a/a.ts\n+++ b/a.ts\n',
};

function scored(score: number): JudgeOutput {
  return {
    score,
    rationale: '',
    breakdown: { correctness: score, completeness: score, safety: score, clarity: score },
    model: 'gpt-5.6-sol',
  };
}

function build(opts: {
  scores: number[];
  retryDiff?: string;
  retryThrows?: boolean;
  output?: TriageOutput;
}) {
  const evaluate = jest.fn();
  opts.scores.forEach((s) => evaluate.mockResolvedValueOnce(scored(s)));

  const proposeFixOnly = opts.retryThrows
    ? jest.fn().mockRejectedValue(new Error('bedrock exploded'))
    : jest.fn().mockResolvedValue(opts.retryDiff ?? '--- a/a.ts\n+++ b/a.ts\n(better)');

  const pipeline = {
    run: jest.fn().mockResolvedValue(opts.output ?? OUTPUT),
    proposeFixOnly,
  } as unknown as AgentPipeline;

  // Billing off here: these tests cover the escalation decision, which is
  // independent of metering. Ledger behaviour lives in ledger.spec.ts.
  const config = {
    get: (k: string) => (k === 'ESCALATION_THRESHOLD' ? 0.6 : undefined),
  } as unknown as ConfigService;

  const runner = new TriageRunner(
    pipeline,
    { evaluate } as unknown as EvalJudge,
    { reserve: jest.fn(), settle: jest.fn() } as never,
    { estimateMicro: jest.fn().mockReturnValue(0) } as never,
    config,
  );

  return { runner, evaluate, proposeFixOnly };
}

const input = (escalate?: string): TriageInput => ({
  issueId: 'i1',
  repoFullName: 'acme/api',
  title: 'boom',
  body: 'it crashes',
  models: { chat: 'gpt-5.6-luna', rerank: 'gpt-5.6-luna', escalate },
});

describe('TriageRunner escalation', () => {
  it('ships the first attempt when the score clears the threshold', async () => {
    const { runner, proposeFixOnly } = build({ scores: [0.82] });

    const result = await runner.run('r1', input('claude-opus'));

    expect(proposeFixOnly).not.toHaveBeenCalled();
    expect(result.escalated).toBe(false);
    expect(result.modelKey).toBe('gpt-5.6-luna');
  });

  it('retries on the stronger model and ships it when it scores better', async () => {
    const { runner, proposeFixOnly } = build({ scores: [0.3, 0.9] });

    const result = await runner.run('r1', input('claude-opus'));

    expect(proposeFixOnly).toHaveBeenCalledWith(expect.anything(), OUTPUT, 'claude-opus');
    expect(result.escalated).toBe(true);
    expect(result.modelKey).toBe('claude-opus');
    expect(result.output.proposedDiff).toContain('(better)');
    expect(result.evaluation.score).toBe(0.9);
  });

  it('keeps the original when the stronger model scores no better', async () => {
    const { runner } = build({ scores: [0.4, 0.35] });

    const result = await runner.run('r1', input('claude-opus'));

    // Still marked escalated — the second call was paid for either way.
    expect(result.escalated).toBe(true);
    expect(result.modelKey).toBe('gpt-5.6-luna');
    expect(result.output.proposedDiff).toBe(OUTPUT.proposedDiff);
    expect(result.evaluation.score).toBe(0.4);
  });

  it('never escalates when no target was offered', async () => {
    const { runner, proposeFixOnly } = build({ scores: [0.1] });

    const result = await runner.run('r1', input(undefined));

    expect(proposeFixOnly).not.toHaveBeenCalled();
    expect(result.escalated).toBe(false);
  });

  it('skips escalation when retrieval found nothing — a better model cannot help', async () => {
    const { runner, proposeFixOnly } = build({
      scores: [0],
      output: { ...OUTPUT, proposedDiff: '# insufficient-context' },
    });

    const result = await runner.run('r1', input('claude-opus'));

    expect(proposeFixOnly).not.toHaveBeenCalled();
    expect(result.escalated).toBe(false);
  });

  it('falls back to the original diff when the retry throws', async () => {
    const { runner } = build({ scores: [0.2], retryThrows: true });

    const result = await runner.run('r1', input('claude-opus'));

    expect(result.output.proposedDiff).toBe(OUTPUT.proposedDiff);
    expect(result.evaluation.score).toBe(0.2);
    expect(result.escalated).toBe(true);
  });

  it('keeps the original when the retry comes back empty', async () => {
    const { runner } = build({ scores: [0.2], retryDiff: '' });

    const result = await runner.run('r1', input('claude-opus'));

    expect(result.output.proposedDiff).toBe(OUTPUT.proposedDiff);
    expect(result.modelKey).toBe('gpt-5.6-luna');
  });
});
