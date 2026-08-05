import { ConfigService } from '@nestjs/config';
import { EvalJudge, JudgeInput } from './eval.judge';
import { LlmProvider } from '../llm/llm.provider';

function makeJudge(chatImpl: jest.Mock, judgeModel = 'gpt-4o') {
  const llm = { chat: chatImpl, chatModel: 'gpt-4o-mini' } as unknown as LlmProvider;
  const config = { get: () => judgeModel } as unknown as ConfigService;
  return new EvalJudge(llm, config);
}

const baseInput: JudgeInput = {
  runId: 'r1',
  issue: { title: 'bug', body: 'it breaks' },
  classification: { severity: 'high' },
  diagnosis: { rootCause: 'null deref' },
  proposedDiff: '--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-a\n+b',
};

describe('EvalJudge', () => {
  it('returns score 0 without calling the LLM when no diff was proposed', async () => {
    const chat = jest.fn();
    const judge = makeJudge(chat);
    const result = await judge.evaluate({ ...baseInput, proposedDiff: '# insufficient-context' });
    expect(result.score).toBe(0);
    expect(chat).not.toHaveBeenCalled();
  });

  it('uses the configured judge model, not the chat model', async () => {
    const chat = jest
      .fn()
      .mockResolvedValue(
        JSON.stringify({ correctness: 1, completeness: 1, safety: 1, clarity: 1, rationale: 'ok' }),
      );
    const judge = makeJudge(chat, 'gpt-4o');
    const result = await judge.evaluate(baseInput);
    expect(result.model).toBe('gpt-4o');
    // chat(messages, jsonMode, model)
    expect(chat.mock.calls[0][2]).toBe('gpt-4o');
    expect(result.score).toBe(1);
  });

  it('injects the reference solution into the prompt when provided', async () => {
    const chat = jest.fn().mockResolvedValue(
      JSON.stringify({
        correctness: 0.5,
        completeness: 0.5,
        safety: 0.5,
        clarity: 0.5,
        rationale: 'x',
      }),
    );
    const judge = makeJudge(chat);
    await judge.evaluate({
      ...baseInput,
      referenceDiff: 'REFERENCE_DIFF_MARKER',
      expectedFiles: ['src/x.ts'],
    });
    const userMessage = chat.mock.calls[0][0][1].content as string;
    expect(userMessage).toContain('REFERENCE_DIFF_MARKER');
    expect(userMessage).toContain('src/x.ts');
    const systemMessage = chat.mock.calls[0][0][0].content as string;
    expect(systemMessage).toContain('reference solution');
  });
});
