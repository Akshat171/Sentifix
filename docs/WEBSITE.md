<!--
  Sentifix — Website / Landing Page Content
  Format modelled on neatlogs.com: lowercase punchy headlines, eyebrow tags,
  benefit-first copy, section-by-section. Copy is ready to drop into a
  Next.js / Framer / Webflow build. Each ## is a page section.
-->

# Sentifix — Landing Page Content

---

## 0. Meta / SEO

- **Product name:** Sentifix
- **One-liner:** The open-source AI agent that turns bug reports into pull requests.
- **Meta title:** Sentifix — from bug report to fix, automatically
- **Meta description:** Sentifix is an open-source AI agent that reads every incoming GitHub issue, finds the root cause in your codebase, and opens a pull request with the fix — before an engineer even opens the tab.
- **Keywords:** AI bug triage, automated bug fixing, AI code agent, GitHub issue automation, RAG code search, LLM pull request, open source AI agent

---

## 1. Hero

> **Eyebrow:** For teams drowning in bug reports

# from bug report to fix, automatically

One AI agent that reads every incoming issue, finds the root cause in your code, and opens a pull request with the fix — before an engineer even looks.

**Primary CTA:** ⭐ Star on GitHub
**Secondary CTA:** Get Started →

> _Sub-line under buttons:_ Open source · MIT licensed · Self-host in minutes

---

## 2. The Problem (social proof / pain)

> **Eyebrow:** The bug backlog never sleeps

### Every issue starts from zero

A bug lands. Someone has to read it, guess which files matter, dig through the codebase, reproduce it, find the root cause, and only *then* start fixing. Multiply that by every "it's broken" report in your inbox and triage becomes the bottleneck — not the fix.

Sentifix does the first 90% of that work automatically, so your engineers open a pull request instead of a blank editor.

---

## 3. See the fix, before you write it

> _(parallel to neatlogs' "See what happened, together")_

**Simple enough for a support engineer to file. Detailed enough for a senior to merge.**

The moment an issue is created, Sentifix posts a full triage report right on the issue — severity, root cause, the exact files involved, and a ready-to-review diff. No dashboards to check, no context to gather. The answer comes to the issue.

- 🏷️ **Classification** — severity, category, affected components
- 🔎 **Root cause** — a plain-English diagnosis grounded in your actual code
- 🧩 **Proposed fix** — a unified diff, applied to a branch, opened as a PR
- ⭐ **Confidence score** — an LLM-as-judge rates every fix before you see it

---

## 4. How it works

> **Eyebrow:** From insight to action in one pass

### Six steps. Zero human wait time.

```
1  Ingest      A new issue (or Slack mention) fires a secure webhook.
2  Classify    The agent tags severity, category, and affected components.
3  Retrieve    Hybrid BM25 + vector search pulls the most relevant code.
4  Diagnose    A reasoning pass identifies the probable root cause.
5  Propose      A unified diff is generated — multi-file aware.
6  Judge & Ship An LLM scores the fix, then opens a PR and posts the report.
```

Built on a **LangGraph** reasoning pipeline with **five specialized nodes**, RAG over your indexed repo, and a four-strategy patch engine that lands the diff even when line numbers drift.

---

## 5. Move from issue to merge

> _(parallel to neatlogs' "Move from insight to action")_

### The fix comes to you — on GitHub, in Slack, or your dashboard

- **On GitHub** — Sentifix comments on the issue and opens a pull request on a fresh branch. Review, tweak, merge.
- **In Slack** — Tag `@Sentifix` in any channel with an error or stack trace. It replies in the thread with the triage and a link to the PR.
- **In your dashboard** — See every triaged issue, re-run the agent, or trigger a resolve with one click.

---

## 6. Fits into the way your team works

> **Eyebrow:** No rip-and-replace

### Works with the tools you already use

- **GitHub** — one-click GitHub App install, no manual webhooks
- **Slack** — `@Sentifix` mentions → triage in-thread
- **OpenAI** — embeddings + reasoning (model-swappable)
- **LangGraph** — the agent orchestration layer
- **PostgreSQL + pgvector** — your private code index
- **RabbitMQ · Redis · NestJS** — production-grade backbone

> _Coming soon: Anthropic Claude, Google Gemini, Ollama (self-hosted models), Discord, JIRA, Linear._

---

## 7. Why Sentifix is different

> **Eyebrow:** Not another bug tracker

### Trackers store bugs. Sentifix fixes them.

| | Traditional triage | Sentifix |
|---|---|---|
| Reads the issue | A human, eventually | Instantly, on arrival |
| Finds relevant code | Manual grep + memory | Hybrid RAG over your repo |
| Root-cause analysis | Hours of digging | Seconds, grounded in code |
| Produces a fix | Starts from scratch | A reviewed diff + open PR |
| Quality gate | Hope | LLM-as-judge score |
| Where it runs | A SaaS you rent | **Your infra — open source** |

**Fully open source. Self-hosted. Your code never leaves your servers.**

---

## 8. Feature grid

> **Eyebrow:** Everything in the box

| Feature | What it does |
|---|---|
| 🤖 Auto-triage | Classifies every new issue in seconds |
| 🧠 Hybrid RAG | BM25 + vector search with RRF fusion for precise retrieval |
| 🔀 Auto PR | Applies the diff to a branch and opens a pull request |
| 🩹 Patch fallback chain | Four strategies land the fix even on drifted line numbers |
| 🧬 HyDE retrieval | Hypothetical-document embedding for code-to-code matching |
| 📍 Stack-trace parsing | Extracts file:line refs straight from error traces |
| ⚖️ LLM-as-judge | Scores every fix on correctness, completeness, safety, clarity |
| 🔁 Re-index on push | Keeps the code index fresh automatically |
| 💬 Slack + GitHub | Triage from wherever the bug is reported |
| 🔐 Auth + rate limiting | Production-ready security out of the box |
| 📊 OpenTelemetry | Opt-in tracing to any OTLP backend |
| 🖥️ Dashboard UI | View, re-triage, and resolve from the browser |

---

## 9. Motive & Vision

> **Eyebrow:** Why we built this

### The best bug fix is the one that's already waiting for review

Software teams spend an enormous share of their time not *fixing* bugs, but *getting ready* to fix them — reading reports, reproducing, hunting through code, rebuilding context someone else already had. That work is real, repetitive, and exactly the kind of thing an AI agent should own.

We believe:

- **Triage should be instant.** The moment a bug is reported, the analysis should already be running.
- **Fixes should come with evidence.** A diff is only trustworthy when it's grounded in the actual code and scored before a human sees it.
- **This belongs to everyone.** Bug-fixing infrastructure this powerful shouldn't be locked behind a SaaS paywall. Sentifix is open source, self-hostable, and MIT-licensed — fork it, extend it, run it on your own hardware.

Our goal is a world where a maintainer wakes up to *pull requests*, not a pile of unread issues.

---

## 10. The Plan / Roadmap

> **Eyebrow:** Where we're headed

**Shipped**
- ✅ GitHub webhook ingestion + HMAC security
- ✅ Hybrid RAG (pgvector + BM25) code indexing
- ✅ Five-node LangGraph reasoning pipeline
- ✅ LLM-as-judge evaluation
- ✅ Automatic branch + pull-request creation
- ✅ GitHub App (one-click install)
- ✅ Slack integration
- ✅ Dashboard UI, API auth, rate limiting, OpenTelemetry, CI

**Next**
- 🔲 Multi-provider LLMs — Anthropic Claude, Google Gemini
- 🔲 Self-hosted models via Ollama (zero data leaves your network)
- 🔲 Discord, JIRA, and Linear integrations
- 🔲 A plugin API for custom agent nodes
- 🔲 A hosted cloud version for teams who don't want to self-host

---

## 11. Get started (developer CTA)

> **Eyebrow:** Running in under five minutes

### Clone, configure, triage

```bash
git clone https://github.com/Akshat171/sentifix.git
cd sentifix
cp .env.example .env      # add your OPENAI_API_KEY
docker compose up -d      # Postgres, Redis, RabbitMQ
pnpm install && pnpm start:dev
```

Point a GitHub webhook (or install the GitHub App) at your instance, index your repo, and open an issue. Sentifix takes it from there.

**CTA:** Read the docs → · ⭐ Star on GitHub →

---

## 12. Common questions

> _(parallel to neatlogs' FAQ)_

**01 · What is Sentifix?**
Sentifix is an open-source AI agent that automatically triages incoming GitHub bug reports — classifying them, finding the root cause in your code, and opening a pull request with a proposed fix.

**02 · How is it different from an AI observability tool?**
Observability tools watch your agents run. Sentifix *is* the agent — it does the work of triaging and fixing bugs, then hands your engineers a reviewed diff instead of a raw report.

**03 · Does my code leave my servers?**
No. Sentifix is self-hosted. Your repository is indexed into *your* Postgres database, and the only external call is to your chosen LLM provider (soon fully self-hostable via Ollama).

**04 · How hard is it to set up?**
Clone the repo, add your OpenAI key, run `docker compose up`. Install the GitHub App for one-click connection — no manual webhook wiring.

**05 · Which languages does it support?**
The RAG index and stack-trace parser cover TypeScript, JavaScript, Python, Go, Java, Ruby, and more — any repo you point it at.

**06 · Is it really free?**
Yes. MIT licensed, fully open source. Fork it, self-host it, extend it. A hosted version is on the roadmap for teams who'd rather not run infrastructure.

---

## 13. Closing CTA

> _(parallel to neatlogs' "start debugging together")_

# stop triaging. start merging.

Free and open source. No credit card, no SaaS lock-in — just clone and run.

**Primary CTA:** ⭐ Star on GitHub
**Secondary CTA:** Read the Docs →

---

## 14. Footer

- **Product:** Features · How it works · Roadmap · Dashboard
- **Developers:** Docs · GitHub · Contributing · Changelog
- **Community:** Discussions · Issues · Discord (soon)
- **Legal:** MIT License · Security Policy · Code of Conduct

_© 2026 Sentifix Contributors · Built with NestJS, LangGraph, and pgvector_

---

## Appendix — Tone & Style Guide (for your designer)

- **Headlines:** lowercase, short, verb-first (`from bug report to fix, automatically`)
- **Voice:** confident, plain-spoken, developer-to-developer — no corporate filler
- **Rhythm:** one bold idea per section, backed by 1–2 sentences, then proof
- **Color cue:** severity palette already used in-product — 🔴 critical / 🟠 high / 🟡 medium / 🟢 low; lean on a calm dark theme with one accent
- **Hero visual suggestion:** an animated GitHub issue that morphs into an open PR (the core "before → after" story)
- **Section visual suggestion:** the six-step pipeline as a horizontal animated flow
