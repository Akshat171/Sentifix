/**
 * Deterministic context-set shaping applied around retrieval.
 *
 * Two ideas from the Sourcegraph posts' "combine modalities" theme:
 *  - Structural prioritisation: chunks whose file matches a strong structural
 *    signal (a stack-trace file, or a component the classifier flagged) should
 *    survive ahead of purely semantic matches.
 *  - Neighbour planning: when a chunk hits, its adjacent chunks in the same file
 *    are worth pulling so the LLM sees a whole function rather than a fragment.
 *
 * Pure and dependency-free so it is unit-testable without any infra.
 */

/** Alphanumeric-normalised substring match — bridges "AuthService" ↔ "src/auth/auth.service.ts". */
export function matchesSignal(filePath: string, signal: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const sig = norm(signal);
  const fp = norm(filePath);
  return sig.length >= 4 && fp.includes(sig);
}

/** Structural signals worth boosting: exact stack-trace files + classifier-flagged components. */
export function collectSignalPaths(
  affectedComponents: string[] | undefined,
  traceFiles: string[],
): string[] {
  return [...traceFiles, ...(affectedComponents ?? [])].map((s) => s.trim()).filter(Boolean);
}

/**
 * Stable partition: chunks matching any signal move to the front (keeping their
 * relative order), the rest follow. Scale-independent — no score arithmetic, so
 * it works regardless of whether similarity is cosine or a fused RRF score.
 */
export function prioritizeBySignals<T extends { filePath: string }>(
  chunks: T[],
  signals: string[],
): T[] {
  if (signals.length === 0) return chunks;
  const matched: T[] = [];
  const rest: T[] = [];
  for (const c of chunks) {
    if (signals.some((s) => matchesSignal(c.filePath, s))) matched.push(c);
    else rest.push(c);
  }
  return [...matched, ...rest];
}

export interface NeighborRequest {
  filePath: string;
  index: number;
}

/**
 * For each hit that carries a chunk index, list the adjacent (filePath, index)
 * pairs within `radius` that are not already present. Deduplicated; negative
 * indices dropped. `present` holds `filePath#index` keys already retrieved.
 */
export function planNeighborFetch(
  hits: Array<{ filePath: string; chunkIndex?: number }>,
  present: Set<string>,
  radius = 1,
): NeighborRequest[] {
  const out: NeighborRequest[] = [];
  const planned = new Set<string>();
  for (const hit of hits) {
    if (hit.chunkIndex == null) continue;
    for (let d = -radius; d <= radius; d++) {
      if (d === 0) continue;
      const index = hit.chunkIndex + d;
      if (index < 0) continue;
      const key = `${hit.filePath}#${index}`;
      if (present.has(key) || planned.has(key)) continue;
      planned.add(key);
      out.push({ filePath: hit.filePath, index });
    }
  }
  return out;
}
