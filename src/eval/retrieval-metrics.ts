/**
 * Component-level retrieval metrics.
 *
 * These measure the *retrieval* stage in isolation from the LLM's reasoning:
 * given a triage case whose ground-truth "files that actually needed changing"
 * are known (e.g. from the fixing PR), how well did retrieval surface them?
 * This is the distinction the Sourcegraph "context retrieval and evaluation"
 * post draws between component-specific and end-to-end evaluation.
 */

/**
 * Two repo-relative paths refer to the same file when they are equal after
 * normalisation, or when one is a path-suffix of the other. The suffix case
 * mirrors the fuzzy matching AgentPipeline already uses to reconcile
 * diagnosis file names against indexed chunk paths.
 */
export function isSameFile(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/^\.?\//, '').trim();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.endsWith('/' + y) || y.endsWith('/' + x);
}

/** Distinct retrieved paths in rank order (first occurrence wins). */
function orderedUnique(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const key = p.replace(/^\.?\//, '').trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

/** Fraction of expected files that appear anywhere in the top-k retrieved. */
export function recallAtK(retrieved: string[], expected: string[], k: number): number {
  if (expected.length === 0) return 1;
  const topK = orderedUnique(retrieved).slice(0, k);
  const hits = expected.filter((e) => topK.some((r) => isSameFile(r, e))).length;
  return hits / expected.length;
}

/** Fraction of the top-k retrieved that are expected files. */
export function precisionAtK(retrieved: string[], expected: string[], k: number): number {
  const topK = orderedUnique(retrieved).slice(0, k);
  if (topK.length === 0) return 0;
  const hits = topK.filter((r) => expected.some((e) => isSameFile(r, e))).length;
  return hits / topK.length;
}

/**
 * Mean Reciprocal Rank: 1 / (rank of the first expected file), 0 if none hit.
 * Rewards surfacing a relevant file early.
 */
export function reciprocalRank(retrieved: string[], expected: string[]): number {
  const ordered = orderedUnique(retrieved);
  for (let i = 0; i < ordered.length; i++) {
    if (expected.some((e) => isSameFile(ordered[i], e))) return 1 / (i + 1);
  }
  return 0;
}

export interface RetrievalScore {
  recallAtK: number;
  precisionAtK: number;
  reciprocalRank: number;
}

export function scoreRetrieval(retrieved: string[], expected: string[], k: number): RetrievalScore {
  return {
    recallAtK: recallAtK(retrieved, expected, k),
    precisionAtK: precisionAtK(retrieved, expected, k),
    reciprocalRank: reciprocalRank(retrieved, expected),
  };
}

/** Mean of each metric across a set of per-case scores. */
export function aggregateRetrieval(scores: RetrievalScore[]): RetrievalScore {
  if (scores.length === 0) {
    return { recallAtK: 0, precisionAtK: 0, reciprocalRank: 0 };
  }
  const sum = scores.reduce(
    (acc, s) => ({
      recallAtK: acc.recallAtK + s.recallAtK,
      precisionAtK: acc.precisionAtK + s.precisionAtK,
      reciprocalRank: acc.reciprocalRank + s.reciprocalRank,
    }),
    { recallAtK: 0, precisionAtK: 0, reciprocalRank: 0 },
  );
  return {
    recallAtK: sum.recallAtK / scores.length,
    precisionAtK: sum.precisionAtK / scores.length,
    reciprocalRank: sum.reciprocalRank / scores.length,
  };
}
