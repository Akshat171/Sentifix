<div align="center">
  <h1>🩹 Sentifix</h1>
  <p><strong>Open-source AI agent that triages GitHub bug reports, diagnoses root causes, and opens PRs with proposed fixes — automatically.</strong></p>

  <p>
    <a href="https://github.com/Akshat171/sentifix/actions/workflows/ci.yml"><img src="https://github.com/Akshat171/sentifix/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://github.com/Akshat171/sentifix/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
    <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node >=20">
    <img src="https://img.shields.io/badge/built_with-NestJS-red" alt="NestJS">
    <img src="https://img.shields.io/badge/pnpm-%3E%3D9-F69220" alt="pnpm">
    <img src="https://img.shields.io/badge/status-alpha-orange" alt="Alpha">
  </p>

  <p>
    <a href="#-quickstart">Quickstart</a> ·
    <a href="#-one-click-deploy">Deploy</a> ·
    <a href="#-how-it-works">How it works</a> ·
    <a href="#-integrations">Integrations</a> ·
    <a href="#%EF%B8%8F-configuration">Configuration</a> ·
    <a href="#-roadmap">Roadmap</a> ·
    <a href="./CONTRIBUTING.md">Contributing</a>
  </p>

  <p>
    <a href="https://render.com/deploy?repo=https://github.com/Akshat171/sentifix"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render"></a>
  </p>
</div>

---

## What is Sentifix?

Sentifix sits between your GitHub Issues inbox and your engineers. When a bug report lands, it:

1. **Classifies** severity, category, and affected components
2. **Retrieves** the most relevant code via hybrid semantic + BM25 search over your indexed repo
3. **Diagnoses** the probable root cause using a multi-step LangGraph reasoning pipeline
4. **Proposes a fix** as a unified diff, then applies it to a branch and opens a PR
5. **Scores the fix** with an LLM-as-judge eval (correctness · completeness · safety · clarity)
6. **Posts the full triage report** back as a GitHub comment or Slack thread reply

Engineers see a structured triage with a candidate patch ready to review — not a raw bug dump.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Auto-triage** | Classifies every new GitHub issue in seconds |
| **RAG over your repo** | Hybrid BM25 + vector search with RRF fusion for precise retrieval |
| **LangGraph pipeline** | 5-node reasoning graph: classify → retrieve → diagnose → targeted-retrieve → propose fix |
| **HyDE retrieval** | Hypothetical Document Embedding for code-to-code semantic matching |
| **Stack trace parsing** | Extracts file:line references from error tracebacks for direct retrieval |
| **Auto PR** | Applies the diff to a branch and opens a pull request automatically |
| **Patch fallback chain** | 4-strategy application: fuzz → segment → search-replace → LLM-assisted |
| **LLM-as-judge** | Scores proposed diffs on a rubric before delivery |
| **GitHub App** | One-click installation — no manual webhook setup |
| **Slack integration** | Tag `@Sentifix` in any channel with an error → triage reply in thread |
| **Re-index on push** | Keeps the code index fresh automatically |
| **Dashboard UI** | View all triaged issues, re-triage, and trigger resolve from a browser |
| **API key auth** | Optional; open in dev, enforced in production |
| **Rate limiting** | 60 req/min per IP; webhook endpoints exempt |
| **OpenTelemetry** | Opt-in tracing to any OTLP backend (Jaeger, Tempo, Honeycomb, Datadog) |

---

## 🔧 How it works

```
GitHub Issue / Slack mention
          │
          ▼
   IngestionModule          HMAC-verified webhook
          │
          ▼
    QueueModule             RabbitMQ (durable, noAck=false)
          │
          ▼
    AgentModule             LangGraph StateGraph
     ├─ classify            → severity, category, components
     ├─ retrieve            → stack trace hits + HyDE hybrid search
     ├─ diagnose            → root cause + relevantFiles
     ├─ retrieveTargeted    → second pass with diagnosis context
     └─ proposeFix          → unified diff (multi-file aware)
          │
          ▼
    IndexingModule          pgvector (1536-dim) + BM25 tsvector + RRF fusion
          │
          ▼
     EvalModule             LLM-as-judge: 0–1 score + breakdown
          │
          ▼
  PersistenceModule         TypeORM / Postgres: issues · runs · eval_results
          │
          ▼
   GitHub comment / Slack thread reply + PR
```

### Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 10 + Fastify |
| Language | TypeScript 5 (strict) |
| Agent | LangGraph.js |
| Vector store | PostgreSQL 16 + pgvector |
| Full-text search | PostgreSQL tsvector + GIN index |
| Embeddings | OpenAI text-embedding-3-small |
| LLM | OpenAI gpt-4o-mini (swappable) |
| Queue | RabbitMQ 3 via `@nestjs/microservices` |
| Cache | Redis 7 via ioredis |
| ORM | TypeORM 0.3 |
| GitHub SDK | `@octokit/rest` + `@octokit/auth-app` |
| Slack SDK | `@slack/web-api` |
| Tracing | OpenTelemetry (opt-in) |

---

## ⚡ Quickstart

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- Node.js ≥ 20 (`node -v`)
- pnpm ≥ 9 (`npm i -g pnpm`)
- An OpenAI API key ([platform.openai.com](https://platform.openai.com))
- A GitHub account

### 1. Clone & configure

```bash
git clone https://github.com/Akshat171/sentifix.git
cd sentifix
cp .env.example .env
```

Open `.env` and fill in at minimum:

```env
OPENAI_API_KEY=sk-...
GITHUB_WEBHOOK_SECRET=any-random-string   # must match your webhook setting
```

### 2. Start infrastructure

```bash
docker compose up -d
# Postgres + pgvector, Redis, and RabbitMQ start with health checks
```

### 3. Install & run

```bash
pnpm install
pnpm start:dev
```

### 4. Verify

```bash
curl localhost:3000/health
# {"status":"ok","info":{"database":{"status":"up"}},...}
```

### 5. Expose to GitHub

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 3000
```

Copy the HTTPS URL. Then in GitHub: **Repo → Settings → Webhooks → Add webhook**
- Payload URL: `https://<your-ngrok>/webhooks/github`
- Content type: `application/json`
- Secret: the value of `GITHUB_WEBHOOK_SECRET` in your `.env`
- Events: **Issues**, **Push**

### 6. Index your repo

```bash
curl -X POST http://localhost:3000/index \
  -H "Content-Type: application/json" \
  -d '{"repoFullName":"owner/repo"}'
```

Create a GitHub issue → Sentifix triages it and posts a comment with the fix.

> **Tip:** Install the [GitHub App](#github-app) to skip manual webhook setup and enable auto-indexing.

---

## 🚀 One-click deploy

Don't want to run infra yourself? Deploy the whole stack — app, PostgreSQL + pgvector, Redis, and RabbitMQ — to the cloud in one click. You get a real public HTTPS URL, so **no `ngrok` and no always-on laptop needed**.

<a href="https://render.com/deploy?repo=https://github.com/Akshat171/sentifix"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render"></a>

1. Click the button (or use the [`render.yaml`](./render.yaml) blueprint).
2. Fill in your `OPENAI_API_KEY` — everything else is auto-wired or optional.
3. Open `https://<your-app>.onrender.com/setup` and connect a repo.

Full walkthrough (Render + Railway + self-hosting), costs, and troubleshooting: **[DEPLOY.md](./DEPLOY.md)**.

---

## 🔌 Integrations

### GitHub App (recommended)

One-click install — no manual webhook or token setup needed.

1. Go to `http://localhost:3000/setup`
2. Click **Install on GitHub**
3. Select the repos you want Sentifix to watch

Every new issue on an installed repo is triaged automatically.

### Slack

Tag `@Sentifix` in any channel with an error or stack trace → the bot replies in the thread with a triage report and a link to the PR.

Setup:
1. Create a Slack App at [api.slack.com/apps](https://api.slack.com/apps)
2. Scopes: `app_mentions:read`, `chat:write`, `chat:write.public`
3. Enable Events → `app_mention` → Request URL: `https://<your-domain>/webhooks/slack`
4. Add to `.env`:
   ```env
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_SIGNING_SECRET=...
   SLACK_DEFAULT_REPO=owner/repo
   ```

---

## ⚙️ Configuration

All env vars are validated at boot — the app hard-fails on missing required vars.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `RABBITMQ_URL` | ✅ | — | RabbitMQ AMQP URL |
| `OPENAI_API_KEY` | ✅ | — | OpenAI API key |
| `GITHUB_WEBHOOK_SECRET` | ✅ | — | HMAC secret for GitHub webhooks |
| `REDIS_URL` | — | — | Redis URL (optional) |
| `GITHUB_TOKEN` | — | — | PAT for private repos / higher rate limits |
| `API_KEY` | — | — | If set, all `/triage` and `/index` endpoints require `X-Api-Key` |
| `OPENAI_CHAT_MODEL` | — | `gpt-4o-mini` | Chat completion model |
| `OPENAI_EMBEDDING_MODEL` | — | `text-embedding-3-small` | Embedding model |
| `SLACK_BOT_TOKEN` | — | — | Slack bot token (enables Slack integration) |
| `SLACK_SIGNING_SECRET` | — | — | Slack request verification secret |
| `SLACK_DEFAULT_REPO` | — | — | Fallback repo when not detected from message |
| `GITHUB_APP_ID` | — | — | GitHub App ID (enables one-click install) |
| `GITHUB_APP_PRIVATE_KEY` | — | — | GitHub App private key (PEM, `\n` escaped) |
| `GITHUB_APP_SLUG` | — | — | GitHub App slug |
| `GITHUB_APP_CLIENT_ID` | — | — | GitHub App OAuth client ID |
| `GITHUB_APP_CLIENT_SECRET` | — | — | GitHub App OAuth client secret |
| `OTEL_ENABLED` | — | `false` | Enable OpenTelemetry tracing |
| `OTEL_SERVICE_NAME` | — | `sentifix` | Service name in traces |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | `http://localhost:4318/v1/traces` | OTLP collector endpoint |

---

## 🗺 Roadmap

| Milestone | Status |
|---|---|
| Foundation scaffold | ✅ Done |
| GitHub webhook ingestion + HMAC | ✅ Done |
| RAG: repo indexing + hybrid pgvector/BM25 | ✅ Done |
| LangGraph agent pipeline (5 nodes) | ✅ Done |
| LLM-as-judge eval with rubric scoring | ✅ Done |
| Auto PR creation (branch → diff → PR) | ✅ Done |
| Dashboard UI (issues, re-triage, resolve) | ✅ Done |
| GitHub App (one-click install) | ✅ Done |
| Slack integration | ✅ Done |
| API key auth + rate limiting | ✅ Done |
| OpenTelemetry tracing | ✅ Done |
| GitHub Actions CI | ✅ Done |
| Multi-provider LLM support (Anthropic, Gemini) | 🔲 Planned |
| Discord integration | 🔲 Planned |
| JIRA / Linear issue sync | 🔲 Planned |
| Self-hosted model support (Ollama) | 🔲 Planned |
| Configurable agent nodes via plugin API | 🔲 Planned |
| Hosted cloud version | 🔲 Planned |

Have an idea? [Open a discussion](https://github.com/Akshat171/sentifix/discussions/new?category=ideas) or [submit a feature request](https://github.com/Akshat171/sentifix/issues/new?template=feature_request.md).

---

## 🤝 Contributing

We welcome contributions of all kinds — bug fixes, new integrations, documentation, tests, ideas.

**Quick path:**
1. Look for [`good first issue`](https://github.com/Akshat171/sentifix/labels/good%20first%20issue) labels
2. Fork → branch → PR
3. Read **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the full guide

---

## License

[MIT](./LICENSE) © 2025 Sentifix Contributors
