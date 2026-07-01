# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project uses [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Planned
- Multi-provider LLM support (Anthropic Claude, Google Gemini)
- Discord integration
- JIRA / Linear issue sync
- Self-hosted model support via Ollama
- Configurable agent plugin API
- Hosted cloud version

---

## [0.3.0] – 2025-07-01

### Added
- **OpenTelemetry tracing** — opt-in (`OTEL_ENABLED=true`), ships traces to any OTLP backend; auto-instruments HTTP, Postgres, Redis, RabbitMQ
- **Rate limiting** — 60 req/min per IP globally via `@nestjs/throttler`; webhook endpoints exempt via `@SkipThrottle()`
- **GitHub Actions CI** — lint, build, unit + e2e tests on every push/PR to `main`

---

## [0.2.0] – 2025-06-30

### Added
- **Slack integration** — tag `@Sentifix` in any channel to triage an error; Block Kit reply in thread with severity badge, score bar, diff preview, and PR button
- **GitHub App** — one-click installation; auto-indexes repos on install and re-indexes on push
- **Setup page** — `GET /setup` shows connected repos and GitHub App install button
- **Re-index on push** — `push` webhook events trigger re-indexing of changed files
- **Re-triage button** — dashboard action to re-run the pipeline on any existing issue
- **Resolve button** — applies the proposed diff to a branch and opens a PR automatically
- **Patch fallback chain** — 4-strategy application: fuzz=2 → fuzz=5 → segment search-replace → LLM-assisted
- **Multi-file diffs** — `proposeFixNode` now groups context by file and instructs LLM to fix all affected files

### Changed
- `Issue` entity: added `source`, `sourceChannelId`, `sourceThreadTs`, `sourceTeamId`, `repoFullName`, `githubCommentId`
- `Run` entity: added `repoFullName`, fixed `completedAt` type
- GitHub comment is now posted as a placeholder immediately on issue creation, then updated after triage

### Fixed
- Wrong `repoFullName` null errors — field now persisted on both `Issue` and `Run`
- `applyDirect` failed on multi-segment hunks — rewrote to process each contiguous del/add segment independently
- LLM "insufficient-context" escape hatch removed — pipeline always produces a best-effort diff
- `parsePatch` throwing on LLM diffs with wrong `@@` hunk counts — `normalizeDiff()` recalculates from actual lines
- Branch already-existed on resolve — `createBranch()` now deletes then recreates the branch

---

## [0.1.0] – 2025-06-24

### Added
- **Foundation scaffold** — NestJS 10 + Fastify, TypeORM 0.3, pgvector, Redis, RabbitMQ
- **LangGraph agent pipeline** — 5-node graph: classify → retrieve → diagnose → retrieveTargeted → proposeFix
- **Hybrid RAG** — BM25 (tsvector/GIN) + pgvector with Reciprocal Rank Fusion
- **HyDE retrieval** — Hypothetical Document Embedding for code-to-code matching
- **Stack trace parsing** — regex extraction of file:line references (Python, JS/TS, Go, Ruby, Java)
- **LLM-as-judge eval** — rubric scoring: correctness · completeness · safety · clarity
- **GitHub webhook ingestion** — HMAC-SHA256 validated, handles `issues` and `push` events
- **Dashboard UI** — browser view of triaged issues with severity badges and eval scores
- **API key auth** — optional `X-Api-Key` guard on triage/index endpoints
- **Health endpoint** — `GET /health` with Postgres connectivity check
- **Docker Compose** — Postgres + pgvector, Redis, RabbitMQ with health checks
- **Multi-stage Dockerfile** — pnpm-based production image
