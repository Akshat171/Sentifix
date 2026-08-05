import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from '../llm/llm.provider';

export interface RerankCandidate {
  filePath: string;
  content: string;
  similarity: number;
}

interface RerankScore {
  index: number;
  score: number;
}

// Snippet length shown to the reranker per candidate — enough to judge relevance
// without blowing up the prompt across ~15 candidates.
const SNIPPET_CHARS = 400;

/**
 * The ranking (precision) stage of the two-stage retrieval architecture the
 * Sourcegraph "context retrieval and evaluation" post describes: retrieval
 * optimises recall (cast a wide net), then ranking filters down to the most
 * relevant items that fit the token budget. Retrieval here already fuses vector
 * + BM25; this narrows that candidate set to the top-N for the fix prompt.
 *
 * The post also notes the final *order* matters less than picking the right
 * *set* — so this is a set-selector, not a strict ordering, and it degrades
 * gracefully to the pre-existing "keep the first N" behaviour on any failure.
 */
@Injectable()
export class RerankerService {
  private readonly logger = new Logger(RerankerService.name);
  private readonly enabled: boolean;
  private readonly defaultTopN: number;
  private readonly model?: string;

  constructor(
    private readonly llm: LlmProvider,
    private readonly config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('RERANK_ENABLED') ?? true;
    this.defaultTopN = config.get<number>('RERANK_TOP_N') ?? 8;
    this.model = config.get<string>('OPENAI_RERANK_MODEL');
  }

  async rerank<T extends RerankCandidate>(
    query: string,
    candidates: T[],
    topN?: number,
  ): Promise<T[]> {
    const limit = topN ?? this.defaultTopN;

    // Nothing to filter — skip the LLM call entirely.
    if (!this.enabled || candidates.length <= limit) {
      return candidates.slice(0, limit);
    }

    try {
      const scores = await this.scoreCandidates(query, candidates);
      const byIndex = new Map(scores.map((s) => [s.index, s.score]));

      return candidates
        .map((c, i) => ({ c, i, score: byIndex.get(i) ?? c.similarity }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.c);
    } catch (err) {
      // Never let reranking break triage — fall back to retrieval order.
      this.logger.warn(`rerank failed, falling back to retrieval order: ${(err as Error).message}`);
      return candidates.slice(0, limit);
    }
  }

  private async scoreCandidates(
    query: string,
    candidates: RerankCandidate[],
  ): Promise<RerankScore[]> {
    const list = candidates
      .map((c, i) => `[${i}] ${c.filePath}\n${c.content.slice(0, SNIPPET_CHARS)}`)
      .join('\n\n');

    const raw = await this.llm.chat(
      [
        {
          role: 'system',
          content: `You are a code-search reranker. Score how likely each candidate snippet is needed to diagnose and fix the bug.
Score 0.0 (irrelevant) to 1.0 (essential). Output valid JSON scoring EVERY index:
{ "scores": [ { "index": <int>, "score": <float> }, ... ] }`,
        },
        {
          role: 'user',
          content: `## Bug\n${query}\n\n## Candidates\n${list}`,
        },
      ],
      true,
      this.model,
    );

    const parsed = JSON.parse(raw) as { scores?: RerankScore[] };
    if (!Array.isArray(parsed.scores)) throw new Error('reranker returned no scores array');

    return parsed.scores.map((s) => ({
      index: s.index,
      score: Math.min(1, Math.max(0, Number(s.score) || 0)),
    }));
  }
}
