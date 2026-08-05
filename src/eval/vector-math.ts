/**
 * In-memory vector similarity for the offline embedding A/B harness.
 *
 * The production store uses pgvector, but comparing embedding models there would
 * mean a migration per model (each has a different dimension: 1536 for
 * text-embedding-3-small, 3072 for -large, 1024 for voyage-code-3, 768 for
 * jina code models). For an offline comparison over a single repo + a small
 * dataset, computing cosine in memory is dimension-agnostic and needs no schema
 * change — so we can rank candidate models before committing to a re-index.
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface ScoredDoc<T> {
  doc: T;
  similarity: number;
}

/** Rank docs by cosine similarity to the query vector, returning the top k. */
export function topKByCosine<T>(
  queryVec: number[],
  docs: Array<{ item: T; vector: number[] }>,
  k: number,
): Array<ScoredDoc<T>> {
  return docs
    .map((d) => ({ doc: d.item, similarity: cosineSimilarity(queryVec, d.vector) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}
