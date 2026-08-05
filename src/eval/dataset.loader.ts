import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalDataset, TriageCase } from './dataset.types';

/** Repo-root-relative directory holding *.json eval datasets. */
export const DATASETS_DIR = join(process.cwd(), 'eval', 'datasets');

function assertValid(ds: unknown, file: string): asserts ds is EvalDataset {
  const d = ds as Partial<EvalDataset>;
  if (!d || typeof d.name !== 'string' || !Array.isArray(d.cases)) {
    throw new Error(`Invalid dataset ${file}: expected { name, cases[] }`);
  }
  d.cases.forEach((c: Partial<TriageCase>, i) => {
    if (!c.id || !c.repoFullName || !c.issue?.title || !Array.isArray(c.expectedFiles)) {
      throw new Error(
        `Invalid case #${i} in ${file}: need { id, repoFullName, issue.title, expectedFiles[] }`,
      );
    }
  });
}

export function loadDataset(path: string): EvalDataset {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  assertValid(parsed, path);
  return parsed;
}

/** Load every *.json dataset under DATASETS_DIR (empty array if none). */
export function loadAllDatasets(dir: string = DATASETS_DIR): EvalDataset[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(dir, f))
    .filter((p) => statSync(p).isFile())
    .map(loadDataset);
}
