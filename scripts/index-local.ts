/**
 * Index a LOCAL checkout into Postgres (code_chunks), bypassing the GitHub
 * fetch path. For eval/testing so we can get real retrieval numbers without
 * pushing a repo or holding a GITHUB_TOKEN.
 *
 * Usage: pnpm index:local --repo /path/to/checkout --name owner/repo [--max-files 400]
 *
 * Reuses the production chunker (chunkCode), embedding model (LlmProvider), and
 * store (VectorStoreService.upsertChunks) — so the index it builds matches what
 * the real IndexingJob would produce.
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { AppModule } from '../src/app.module';
import { chunkCode } from '../src/indexing/code-chunker';
import { LlmProvider } from '../src/llm/llm.provider';
import { VectorStoreService } from '../src/indexing/vector-store.service';

const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.java', '.kt',
  '.rb', '.rs', '.c', '.cpp', '.h', '.cs', '.php', '.swift', '.md', '.mdx',
]);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'vendor']);

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function walk(dir: string, root: string, acc: string[], maxFiles: number): void {
  if (acc.length >= maxFiles) return;
  for (const entry of readdirSync(dir)) {
    if (acc.length >= maxFiles) return;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full, root, acc, maxFiles);
    } else {
      const dot = entry.lastIndexOf('.');
      if (dot !== -1 && CODE_EXTS.has(entry.slice(dot).toLowerCase())) acc.push(relative(root, full));
    }
  }
}

async function main() {
  const repo = arg('repo');
  const name = arg('name');
  const maxFiles = Number(arg('max-files', '400'));
  if (!repo || !name) {
    console.error('Required: --repo /path/to/checkout --name owner/repo');
    process.exit(1);
  }

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    rawBody: true,
    logger: ['error', 'warn'],
  });
  const llm = app.get(LlmProvider);
  const store = app.get(VectorStoreService);

  const files: string[] = [];
  walk(repo, repo, files, maxFiles);
  console.log(`Indexing ${files.length} files from ${repo} as "${name}"`);

  await store.deleteRepo(name); // clean baseline

  const BATCH = 20;
  let total = 0;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const texts: string[] = [];
    const meta: Array<{ path: string; idx: number }> = [];

    for (const rel of batch) {
      let content: string;
      try {
        content = readFileSync(join(repo, rel), 'utf-8');
      } catch {
        continue;
      }
      chunkCode(content, rel).forEach((c, idx) => {
        texts.push(`File: ${rel}\n\n${c}`);
        meta.push({ path: rel, idx });
      });
    }
    if (texts.length === 0) continue;

    const embeddings = await llm.embedBatch(texts);
    await store.upsertChunks(
      meta.map((m, k) => ({
        repoFullName: name,
        filePath: m.path,
        chunkIndex: m.idx,
        content: texts[k],
        embedding: embeddings[k],
      })),
    );
    total += texts.length;
    console.log(`  batch ${i / BATCH + 1}: +${texts.length} chunks (total ${total})`);
  }

  console.log(`\nDone: ${total} chunks indexed for "${name}".`);
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌  index-local failed:', (err as Error).message);
  process.exit(1);
});
