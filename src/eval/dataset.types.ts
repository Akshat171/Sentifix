/**
 * A single labelled triage case used for offline evaluation.
 *
 * `expectedFiles` is the ground truth for the retrieval stage — the files that
 * actually needed changing (typically the paths touched by the fixing PR).
 * `referenceDiff` is optional ground truth for the fix stage; when present the
 * judge scores against it (reference-based) instead of reasoning unaided.
 */
export interface TriageCase {
  id: string;
  repoFullName: string;
  issue: {
    title: string;
    body: string;
  };
  expectedFiles: string[];
  referenceDiff?: string;
  /** Free-form note on provenance, e.g. the PR/commit the labels came from. */
  source?: string;
}

export interface EvalDataset {
  name: string;
  description?: string;
  cases: TriageCase[];
}
