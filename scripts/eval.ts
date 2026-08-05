/**
 * Offline evaluation harness.
 * Usage: pnpm eval            (runs every dataset under eval/datasets/)
 *        EVAL_K=15 pnpm eval  (override the top-k retrieval cutoff)
 *
 * For each labelled triage case it:
 *   1. Runs the full AgentPipeline (bypassing the webhook + queue).
 *   2. Scores the RETRIEVAL stage in isolation — recall@k / precision@k / MRR
 *      of the retrieved file paths against the case's ground-truth expectedFiles.
 *   3. Scores the END-TO-END fix with the LLM-as-judge (reference-based when a
 *      referenceDiff is present).
 *
 * Separating (2) from (3) is the point: a low end-to-end score with high recall
 * means the LLM reasoned poorly; low recall means retrieval missed the files.
 * The repos named in the dataset must already be indexed (POST /index).
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { AgentPipeline } from '../src/agent/agent.pipeline';
import { EvalJudge } from '../src/eval/eval.judge';
import { loadAllDatasets } from '../src/eval/dataset.loader';
import type { TriageCase } from '../src/eval/dataset.types';
import {
  aggregateRetrieval,
  RetrievalScore,
  scoreRetrieval,
} from '../src/eval/retrieval-metrics';

const K = Number(process.env.EVAL_K ?? 10);
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

interface CaseResult {
  id: string;
  retrieval: RetrievalScore;
  retrievedFiles: string[];
  judgeScore: number;
}

async function runCase(
  pipeline: AgentPipeline,
  judge: EvalJudge,
  c: TriageCase,
): Promise<CaseResult> {
  const output = await pipeline.run({
    issueId: c.id,
    repoFullName: c.repoFullName,
    title: c.issue.title,
    body: c.issue.body,
  });

  const retrievedFiles = output.context.map((ctx) => ctx.filePath);
  const retrieval = scoreRetrieval(retrievedFiles, c.expectedFiles, K);

  const evalResult = await judge.evaluate({
    runId: c.id,
    issue: c.issue,
    classification: output.classification as unknown as Record<string, unknown>,
    diagnosis: output.diagnosis as unknown as Record<string, unknown>,
    proposedDiff: output.proposedDiff,
    referenceDiff: c.referenceDiff,
    expectedFiles: c.expectedFiles,
  });

  return { id: c.id, retrieval, retrievedFiles, judgeScore: evalResult.score };
}

async function main() {
  const onlyArg = process.argv.indexOf('--dataset');
  const only = onlyArg !== -1 ? process.argv[onlyArg + 1] : undefined;

  let datasets = loadAllDatasets();
  if (only) datasets = datasets.filter((d) => d.name === only);
  if (datasets.length === 0) {
    console.error(
      only
        ? `No dataset named "${only}" under eval/datasets/.`
        : 'No datasets found under eval/datasets/. Add a *.json file first.',
    );
    process.exit(1);
  }

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    rawBody: true,
    logger: ['error', 'warn'],
  });
  const pipeline = app.get(AgentPipeline);
  const judge = app.get(EvalJudge);

  const allScores: RetrievalScore[] = [];
  const allJudge: number[] = [];

  for (const ds of datasets) {
    console.log(`\n=== dataset: ${ds.name} (${ds.cases.length} cases, k=${K}) ===`);
    for (const c of ds.cases) {
      try {
        const r = await runCase(pipeline, judge, c);
        allScores.push(r.retrieval);
        allJudge.push(r.judgeScore);
        console.log(
          `  ${r.id}\n` +
            `    retrieval: recall@${K}=${pct(r.retrieval.recallAtK)} ` +
            `precision@${K}=${pct(r.retrieval.precisionAtK)} MRR=${r.retrieval.reciprocalRank.toFixed(2)}` +
            `${r.retrievedFiles.length === 0 ? '  ⚠️  0 chunks retrieved — is the repo indexed?' : ''}\n` +
            `    judge:     ${pct(r.judgeScore)}`,
        );
      } catch (err) {
        console.error(`  ${c.id}  ❌  ${(err as Error).message}`);
      }
    }
  }

  const agg = aggregateRetrieval(allScores);
  const meanJudge = allJudge.length ? allJudge.reduce((a, b) => a + b, 0) / allJudge.length : 0;

  console.log('\n── Aggregate ───────────────────────────────────────────────────');
  console.log(`  cases scored:  ${allScores.length}`);
  console.log(`  recall@${K}:      ${pct(agg.recallAtK)}`);
  console.log(`  precision@${K}:   ${pct(agg.precisionAtK)}`);
  console.log(`  MRR:           ${agg.reciprocalRank.toFixed(3)}`);
  console.log(`  mean judge:    ${pct(meanJudge)}`);
  console.log('');

  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌  Eval failed:', (err as Error).message);
  process.exit(1);
});
