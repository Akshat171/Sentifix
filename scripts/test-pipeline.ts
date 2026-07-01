/**
 * Manual end-to-end test script.
 * Usage: npx ts-node -r tsconfig-paths/register scripts/test-pipeline.ts
 *
 * Tests the full triage pipeline directly (bypasses webhook + RabbitMQ):
 *   1. Validate OpenAI key with a cheap embedding call
 *   2. Insert a fake Issue into Postgres
 *   3. Call AgentPipeline.run() directly
 *   4. Call EvalJudge.evaluate()
 *   5. Print the full triage result
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AgentPipeline } from '../src/agent/agent.pipeline';
import { EvalJudge } from '../src/eval/eval.judge';
import { LlmProvider } from '../src/llm/llm.provider';
import { Issue } from '../src/persistence/entities/issue.entity';

const FAKE_ISSUE = {
  title: 'TypeError: Cannot read properties of undefined (reading "userId") in AuthService',
  body: `
## Description
After the recent refactor of AuthService, users are getting a 500 error when trying to log in
with an OAuth provider. The error occurs in the token validation step.

## Stack trace
\`\`\`
TypeError: Cannot read properties of undefined (reading 'userId')
    at AuthService.validateOAuthToken (src/auth/auth.service.ts:87:32)
    at OAuthStrategy.validate (src/auth/oauth.strategy.ts:45:12)
\`\`\`

## Steps to reproduce
1. Visit /auth/google
2. Complete Google OAuth flow
3. Observe 500 Internal Server Error

## Expected
Successful redirect to /dashboard

## Environment
- Node 20.x, NestJS 10, commit abc1234
  `.trim(),
  repoFullName: 'acme/my-api',
};

async function main() {
  console.log('\n🔧  Bootstrapping Sentifix app...');
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { rawBody: true, logger: ['error', 'warn'] },
  );

  const llm = app.get(LlmProvider);
  const pipeline = app.get(AgentPipeline);
  const judge = app.get(EvalJudge);
  const issueRepo = app.get<Repository<Issue>>(getRepositoryToken(Issue));

  // ── 1. Validate API key ────────────────────────────────────────────────────
  console.log('\n[1/4] Validating OpenAI key with a test embedding...');
  const embedding = await llm.embed('hello world');
  console.log(`      ✅  Embedding OK — ${embedding.length} dimensions`);

  // ── 2. Persist a fake issue ────────────────────────────────────────────────
  console.log('\n[2/4] Persisting fake issue to Postgres...');
  const issue = await issueRepo.save(
    issueRepo.create({
      githubRepoId: 'test-repo-001',
      githubIssueNumber: 999,
      title: FAKE_ISSUE.title,
      body: FAKE_ISSUE.body,
      labels: ['bug', 'auth'],
      state: 'open',
      embeddingText: `${FAKE_ISSUE.title}\n\n${FAKE_ISSUE.body}`,
    }),
  );
  console.log(`      ✅  Issue saved — id: ${issue.id}`);

  // ── 3. Run the agent pipeline ──────────────────────────────────────────────
  console.log('\n[3/4] Running LangGraph triage pipeline (4 nodes)...');
  console.log('      classify → retrieve → diagnose → proposeFix');
  console.log('      (retrieve will return 0 results — repo not indexed, that is expected)\n');

  const start = Date.now();
  const output = await pipeline.run({
    issueId: issue.id,
    repoFullName: FAKE_ISSUE.repoFullName,
    title: FAKE_ISSUE.title,
    body: FAKE_ISSUE.body,
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`      ✅  Pipeline completed in ${elapsed}s\n`);
  console.log('── Classification ──────────────────────────────────────────────');
  console.log(JSON.stringify(output.classification, null, 2));
  console.log('\n── Retrieved context ───────────────────────────────────────────');
  console.log(`   ${output.context.length} chunks (0 expected — repo not indexed)`);
  console.log('\n── Diagnosis ───────────────────────────────────────────────────');
  console.log(JSON.stringify(output.diagnosis, null, 2));
  console.log('\n── Proposed diff ───────────────────────────────────────────────');
  console.log(output.proposedDiff || '(none — insufficient context)');

  // ── 4. Run the eval judge ──────────────────────────────────────────────────
  console.log('\n[4/4] Running LLM-as-judge eval...');
  const evalResult = await judge.evaluate({
    runId: 'test-run',
    issue: { title: FAKE_ISSUE.title, body: FAKE_ISSUE.body },
    classification: output.classification as unknown as Record<string, unknown>,
    diagnosis: output.diagnosis as unknown as Record<string, unknown>,
    proposedDiff: output.proposedDiff,
  });

  console.log('\n── Eval result ─────────────────────────────────────────────────');
  console.log(`   Score:     ${(evalResult.score * 100).toFixed(0)}%`);
  console.log(`   Model:     ${evalResult.model}`);
  console.log(`   Rationale: ${evalResult.rationale}`);
  console.log(`   Breakdown: ${JSON.stringify(evalResult.breakdown)}`);
  console.log('\n✅  All done.\n');

  await issueRepo.delete({ id: issue.id });
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌  Test failed:', err.message);
  process.exit(1);
});
