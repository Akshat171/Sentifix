import { ConfigService } from '@nestjs/config';
import { RerankCandidate, RerankerService } from './reranker.service';
import { LlmProvider } from '../llm/llm.provider';

function makeReranker(
  chatImpl: jest.Mock,
  cfg: Record<string, unknown> = { RERANK_ENABLED: true, RERANK_TOP_N: 2 },
) {
  const llm = { chat: chatImpl, chatModel: 'gpt-4o-mini' } as unknown as LlmProvider;
  const config = { get: (k: string) => cfg[k] } as unknown as ConfigService;
  return new RerankerService(llm, config);
}

const candidates: RerankCandidate[] = [
  { filePath: 'a.ts', content: 'alpha', similarity: 0.9 },
  { filePath: 'b.ts', content: 'beta', similarity: 0.8 },
  { filePath: 'c.ts', content: 'gamma', similarity: 0.7 },
];

describe('RerankerService', () => {
  it('reorders by LLM score and keeps top-N', async () => {
    // LLM says c (idx 2) is most relevant, then a (idx 0), then b (idx 1).
    const chat = jest.fn().mockResolvedValue(
      JSON.stringify({
        scores: [
          { index: 0, score: 0.5 },
          { index: 1, score: 0.1 },
          { index: 2, score: 0.99 },
        ],
      }),
    );
    const reranker = makeReranker(chat);
    const out = await reranker.rerank('bug', candidates);
    expect(out.map((c) => c.filePath)).toEqual(['c.ts', 'a.ts']);
  });

  it('skips the LLM call when candidates already fit top-N', async () => {
    const chat = jest.fn();
    const reranker = makeReranker(chat, { RERANK_ENABLED: true, RERANK_TOP_N: 5 });
    const out = await reranker.rerank('bug', candidates);
    expect(chat).not.toHaveBeenCalled();
    expect(out).toHaveLength(3);
  });

  it('is a no-op passthrough (truncated) when disabled', async () => {
    const chat = jest.fn();
    const reranker = makeReranker(chat, { RERANK_ENABLED: false, RERANK_TOP_N: 2 });
    const out = await reranker.rerank('bug', candidates);
    expect(chat).not.toHaveBeenCalled();
    expect(out.map((c) => c.filePath)).toEqual(['a.ts', 'b.ts']);
  });

  it('falls back to retrieval order when the LLM returns malformed JSON', async () => {
    const chat = jest.fn().mockResolvedValue('not json');
    const reranker = makeReranker(chat);
    const out = await reranker.rerank('bug', candidates);
    expect(out.map((c) => c.filePath)).toEqual(['a.ts', 'b.ts']);
  });

  it('uses the retrieval similarity for any index the LLM omits', async () => {
    // Only scores idx 1; 0 and 2 fall back to their similarity (0.9, 0.7).
    const chat = jest.fn().mockResolvedValue(JSON.stringify({ scores: [{ index: 1, score: 1 }] }));
    const reranker = makeReranker(chat);
    const out = await reranker.rerank('bug', candidates);
    // b (1.0) then a (0.9 similarity) beat c (0.7).
    expect(out.map((c) => c.filePath)).toEqual(['b.ts', 'a.ts']);
  });
});
