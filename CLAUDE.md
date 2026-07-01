# Sentifix — Developer Guide

## What this is
Sentifix is an open-source AI agent that triages incoming GitHub bug reports.
A new issue triggers a pipeline: classify → RAG retrieval over the indexed repo → diagnose root cause → propose a fix as a unified diff → score the fix with an LLM-as-judge eval.

## Architecture

```
GitHub Webhook (POST /webhooks/github)
    ↓
IngestionModule   — validates HMAC, parses event
    ↓
QueueModule       — RabbitMQ producer (sentifix_triage queue)
    ↓
QueueConsumer     — picks up job, calls AgentPipeline
    ↓
AgentModule       — LangGraph pipeline (classify → retrieve → diagnose → fix)
    ↓
IndexingModule    — pgvector RAG over cloned repo (OpenAI text-embedding-3-small)
    ↓
EvalModule        — LLM-as-judge scores the proposed diff
    ↓
PersistenceModule — TypeORM/Postgres: issues, runs, eval_results tables
```

## Stack
| Layer | Choice |
|---|---|
| Framework | NestJS 10 + Fastify |
| Language | TypeScript 5 (strict) |
| ORM | TypeORM 0.3, PostgreSQL 16 |
| Vector store | pgvector (vector(1536) column on `issues`) |
| Cache | Redis 7 via ioredis |
| Queue | RabbitMQ 3 via @nestjs/microservices AMQP transport |
| Agent | LangGraph.js |
| Embeddings | OpenAI text-embedding-3-small |
| Package manager | pnpm |

## Conventions
- **Module boundaries**: no direct cross-module service imports. Communication is either injected providers from a parent module or async via the queue.
- **Config**: all env vars are declared in `src/config/config.schema.ts` and validated at boot with Joi. The app hard-fails if any required var is missing.
- **Entities**: TypeORM entities live in `src/persistence/entities/`. `synchronize: true` only in non-production. Migrations live in `src/persistence/migrations/`.
- **Stubs**: modules not yet implemented carry `// TODO:` comments describing the next step. No empty catch blocks.
- **Tests**: unit tests co-located as `*.spec.ts`; e2e tests in `test/`.
- **Comments**: only where the *why* is non-obvious. No doc-blocks restating the function name.

## Local dev

```bash
# 1. Start infra
docker compose up -d

# 2. Copy env and fill in values
cp .env.example .env

# 3. Install deps
pnpm install

# 4. Start app (hot-reload)
pnpm start:dev

# 5. Health check
curl localhost:3000/health
```

## Testing
```bash
pnpm test          # unit tests
pnpm test:e2e      # e2e (requires running Postgres)
pnpm test:cov      # coverage report
pnpm lint          # ESLint + Prettier check
```

## Build roadmap
1. **Foundation** ✅ — scaffold, all modules, health endpoint
2. **Core pipeline** ✅ — webhook ingestion, RAG indexing, LangGraph agent, eval, triage API
3. Auth (API keys), rate limiting, OpenTelemetry tracing
4. Hosted demo + GitHub Actions CI/CD
