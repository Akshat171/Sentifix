# Contributing to Sentifix

Thank you for taking the time to contribute! This document covers everything you need to go from zero to a merged PR.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to contribute](#ways-to-contribute)
- [Good first issues](#good-first-issues)
- [Development setup](#development-setup)
- [Project structure](#project-structure)
- [Coding standards](#coding-standards)
- [Commit conventions](#commit-conventions)
- [Pull request process](#pull-request-process)
- [Running tests](#running-tests)
- [Questions](#questions)

---

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By participating you agree to uphold its standards. Report unacceptable behaviour to the maintainers.

---

## Ways to contribute

| Type | How |
|---|---|
| 🐛 Bug fix | Open an issue first if non-trivial; link it in your PR |
| ✨ New feature | Open a Discussion or issue to align on approach before building |
| 📖 Docs | Fix typos, add examples, improve setup steps — PRs welcome directly |
| 🧪 Tests | More coverage is always welcome; unit and e2e both count |
| 🌐 New integration | Discord, JIRA, Linear, Telegram — open an issue to coordinate |
| 🤖 New LLM provider | Anthropic, Gemini, Ollama — see `src/llm/` |
| 💡 Ideas | [Start a Discussion](https://github.com/Akshat171/sentifix/discussions/new?category=ideas) |

---

## Good first issues

Look for the [`good first issue`](https://github.com/Akshat171/sentifix/labels/good%20first%20issue) label. These are scoped tasks with clear acceptance criteria that don't require deep knowledge of the full system.

---

## Development setup

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 — `npm i -g pnpm`
- Docker & Docker Compose
- An OpenAI API key

### Steps

```bash
# 1. Fork then clone your fork
git clone https://github.com/<your-username>/sentifix.git
cd sentifix

# 2. Add the upstream remote (for keeping in sync)
git remote add upstream https://github.com/Akshat171/sentifix.git

# 3. Start infrastructure
docker compose up -d

# 4. Configure environment
cp .env.example .env
# Edit .env — set OPENAI_API_KEY and GITHUB_WEBHOOK_SECRET at minimum

# 5. Install dependencies
pnpm install

# 6. Start in watch mode (hot reload)
pnpm start:dev

# 7. Verify
curl localhost:3000/health
```

### Keeping your fork up to date

```bash
git fetch upstream
git rebase upstream/main
```

---

## Project structure

```
src/
├── agent/          LangGraph pipeline (classify → retrieve → diagnose → proposeFix)
├── auth/           API key guard
├── config/         Joi env var schema — all vars declared here
├── dashboard/      Browser UI controller (Fastify HTML responses)
├── eval/           LLM-as-judge rubric scoring
├── github/         Octokit wrapper, GitHub App auth, PR creation
├── health/         GET /health
├── indexing/       Repo chunking + embedding + pgvector upsert
├── ingestion/      GitHub webhook controller + HMAC validation
├── llm/            OpenAI wrapper (chat + embeddings)
├── persistence/    TypeORM entities, migrations
├── queue/          RabbitMQ producer + consumer wiring
├── setup/          GitHub App install landing page
├── slack/          Slack Events API controller + ingestion service
├── triage/         Orchestration, resolve (branch/PR), re-triage
└── tracing.ts      OpenTelemetry SDK init (opt-in)
```

**Module boundary rule:** No direct cross-module service imports. Communication goes through injected providers from a parent module or the RabbitMQ queue.

---

## Coding standards

- **TypeScript strict** — `strict: true` in `tsconfig.json`. No `any` without a comment explaining why.
- **No empty catch blocks** — if you catch, log or rethrow.
- **Comments** — only where the *why* is non-obvious. No docblocks restating the function name.
- **No cross-module direct imports** — see module boundary rule above.
- **Env vars** — declare every new var in `src/config/config.schema.ts` first.
- **Entities** — TypeORM entities live in `src/persistence/entities/`. Schema changes need a migration in `src/persistence/migrations/`.
- **Formatting** — Prettier is enforced. Run `pnpm lint` before committing.

---

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

| Type | When to use |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that is neither a fix nor a feature |
| `test` | Adding or fixing tests |
| `chore` | Build, CI, dependency updates |
| `perf` | Performance improvement |

Examples:
```
feat(slack): add @sentifix mention handler with Block Kit reply
fix(resolve): handle multi-segment hunks in applyDirect
docs(readme): add configuration reference table
chore(deps): upgrade @nestjs/throttler to 6.5.0
```

---

## Pull request process

1. **Branch from `main`** — `git checkout -b feat/my-feature`
2. **Keep PRs focused** — one concern per PR. Stacked PRs are welcome.
3. **Tests** — add or update tests. The CI must be green.
4. **Lint** — `pnpm lint` must pass.
5. **Fill out the PR template** — describe what changed and why, and list how you tested it.
6. **Link issues** — use `Closes #123` or `Fixes #123` in the description.
7. **Review** — a maintainer will review within a few days. Address feedback with new commits (no force-push to open PRs).

---

## Running tests

```bash
pnpm test          # unit tests (co-located *.spec.ts files)
pnpm test:e2e      # e2e tests in test/ (requires running Postgres)
pnpm test:cov      # coverage report
pnpm lint          # ESLint + Prettier check
pnpm build         # TypeScript compilation check
```

---

## Questions

- **Usage question** → [GitHub Discussions Q&A](https://github.com/Akshat171/sentifix/discussions/new?category=q-a)
- **Bug** → [Open an issue](https://github.com/Akshat171/sentifix/issues/new?template=bug_report.md)
- **Feature idea** → [Open a Discussion](https://github.com/Akshat171/sentifix/discussions/new?category=ideas)
- **Security vulnerability** → See [SECURITY.md](./SECURITY.md) — **do not open a public issue**
