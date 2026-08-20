import * as Joi from 'joi';
import { MODEL_KEYS } from '../llm/model-catalog';

export const configSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  // Create entity tables via TypeORM synchronize in production (used by the deploy template,
  // since entity tables have no migrations). Safe here — all tables hold re-derivable data.
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  REDIS_URL: Joi.string().uri().optional(),
  RABBITMQ_URL: Joi.string().uri().required(),
  // Model keys from src/llm/model-catalog.ts, not vendor model IDs. The vendor is
  // looked up per call from the key, so one deployment serves OpenAI and Bedrock
  // tenants at once. Embeddings always use OpenAI — Anthropic ships no embedding
  // model — so OPENAI_API_KEY stays required either way.
  DEFAULT_CHAT_MODEL: Joi.string()
    .valid(...MODEL_KEYS)
    .default('gpt-5.6-luna'),
  DEFAULT_RERANK_MODEL: Joi.string()
    .valid(...MODEL_KEYS)
    .optional(),
  // Pinned deployment-wide and never client-selectable: eval scores are only
  // comparable across tenants if every run is graded by the same judge.
  JUDGE_MODEL: Joi.string()
    .valid(...MODEL_KEYS)
    .default('gpt-5.6-sol'),
  // Escalation: when the judge scores a fix below ESCALATION_THRESHOLD, retry the
  // fix once on ESCALATION_MODEL and keep whichever diff scored higher. Off by
  // default because on a poorly-tuned deployment it doubles the cost of a run.
  ESCALATION_ENABLED: Joi.boolean().default(false),
  ESCALATION_MODEL: Joi.string()
    .valid(...MODEL_KEYS)
    .optional(),
  ESCALATION_THRESHOLD: Joi.number().min(0).max(1).default(0.6),
  // Billing. 1 credit = USD 0.01 of customer-facing value. CREDIT_MARKUP is the
  // multiple of vendor token cost you charge, applied once at settle time.
  // Admin API fails closed: with neither ADMIN_API_KEY nor API_KEY set, every
  // /admin route 401s rather than falling open the way ApiKeyGuard does.
  ADMIN_API_KEY: Joi.string().optional(),
  // After this many consecutive recent failures on one issue, stop retrying it.
  // 0 disables the breaker. Guards against paying a provider to fail repeatedly.
  FAILURE_CIRCUIT_LIMIT: Joi.number().min(0).default(5),
  BILLING_ENABLED: Joi.boolean().default(false),
  CREDIT_MARKUP: Joi.number().min(1).default(2),
  FREE_GRANT_CREDITS: Joi.number().min(0).default(500),
  // Worst-case token budget used to size the pre-run hold, not a cap on the run.
  ESTIMATE_INPUT_TOKENS: Joi.number().default(80000),
  ESTIMATE_OUTPUT_TOKENS: Joi.number().default(8000),
  HOLD_TTL_MS: Joi.number().default(15 * 60 * 1000),
  // Stripe. Credits are granted by the webhook, never by the success redirect,
  // so STRIPE_WEBHOOK_SECRET is as load-bearing as the secret key itself.
  STRIPE_SECRET_KEY: Joi.string().optional(),
  STRIPE_WEBHOOK_SECRET: Joi.string().optional(),
  LOW_BALANCE_THRESHOLD_CREDITS: Joi.number().min(0).default(250),
  LOW_BALANCE_COOLDOWN_HOURS: Joi.number().min(1).default(24),
  // Required only once a Bedrock-backed model is actually selected; the client is
  // built lazily. Credentials resolve through the standard AWS chain (instance
  // role on EC2), and model access must be granted per-region in the console.
  AWS_REGION: Joi.string().optional(),
  // Claude requires an explicit output ceiling, and on Opus-tier models thinking
  // shares this budget with the response — leave headroom or JSON replies truncate.
  BEDROCK_MAX_TOKENS: Joi.number().default(16000),
  OPENAI_API_KEY: Joi.string().required(),
  OPENAI_EMBEDDING_MODEL: Joi.string().default('text-embedding-3-small'),
  // Precision stage: after retrieval casts a wide net, an LLM reranker scores each
  // candidate chunk for relevance and keeps only the top RERANK_TOP_N for the fix prompt.
  RERANK_ENABLED: Joi.boolean().default(true),
  RERANK_TOP_N: Joi.number().default(8),
  GITHUB_WEBHOOK_SECRET: Joi.string().required(),
  GITHUB_TOKEN: Joi.string().optional(),
  // Which issues to auto-triage:
  //   all            → every opened/reopened issue (default)
  //   label:<name>   → only issues carrying that label (e.g. label:bug)
  //   command        → none automatically; only when someone comments "/sentifix"
  // The "/sentifix" comment always triggers a (re)triage regardless of this setting.
  SENTIFIX_TRIGGER: Joi.string()
    .pattern(/^(all|command|label:.+)$/)
    .default('all'),
  // Max triage runs per tenant (GitHub installation, else per repo) per rolling 24h.
  // Protects your LLM spend on a public multi-tenant deploy. 0 = unlimited.
  TRIAGE_DAILY_LIMIT: Joi.number().default(0),
  API_KEY: Joi.string().optional(),
  // Multi-tenant SaaS mode: require GitHub login and scope the dashboard/API to the
  // signed-in user's installations. Off (default) = open single-tenant self-host.
  // When on, needs SESSION_SECRET, APP_BASE_URL, and GITHUB_APP_CLIENT_ID/SECRET.
  DASHBOARD_AUTH: Joi.boolean().default(false),
  SESSION_SECRET: Joi.string().optional(), // HMAC secret for signing the session cookie
  APP_BASE_URL: Joi.string().uri().optional(), // public base URL, e.g. https://sentifix.dev
  // GitHub App (optional — enables one-click install flow)
  GITHUB_APP_ID: Joi.number().optional(),
  GITHUB_APP_PRIVATE_KEY: Joi.string().optional(), // PEM with \n escaped as \\n
  GITHUB_APP_SLUG: Joi.string().optional(), // e.g. "sentifix-bot"
  GITHUB_APP_CLIENT_ID: Joi.string().optional(),
  GITHUB_APP_CLIENT_SECRET: Joi.string().optional(),
  // Slack integration
  SLACK_BOT_TOKEN: Joi.string().optional(), // xoxb-... (legacy single-workspace fallback)
  SLACK_SIGNING_SECRET: Joi.string().optional(), // per-app; verifies all inbound requests
  SLACK_DEFAULT_REPO: Joi.string().optional(), // global fallback owner/repo when not detectable
  // Slack OAuth (multi-tenant "Add to Slack" — each workspace installs & we store its bot token)
  SLACK_CLIENT_ID: Joi.string().optional(),
  SLACK_CLIENT_SECRET: Joi.string().optional(),
  // OpenTelemetry
  OTEL_ENABLED: Joi.boolean().default(false),
  OTEL_SERVICE_NAME: Joi.string().default('sentifix'),
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().uri().optional(),
});
