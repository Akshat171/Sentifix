import * as Joi from 'joi';

export const configSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  // Create entity tables via TypeORM synchronize in production (used by the deploy template,
  // since entity tables have no migrations). Safe here — all tables hold re-derivable data.
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  REDIS_URL: Joi.string().uri().optional(),
  RABBITMQ_URL: Joi.string().uri().required(),
  // Which vendor serves chat/completions. Embeddings always use OpenAI — Anthropic
  // ships no embedding model — so OPENAI_API_KEY stays required either way.
  LLM_PROVIDER: Joi.string().valid('openai', 'bedrock').default('openai'),
  // Claude on Amazon Bedrock. Credentials resolve through the standard AWS chain
  // (instance role on EC2), so there is no key to set here. Model IDs carry the
  // `anthropic.` prefix, and access must be granted per-region in the Bedrock console.
  AWS_REGION: Joi.string().when('LLM_PROVIDER', {
    is: 'bedrock',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  BEDROCK_CHAT_MODEL: Joi.string().default('anthropic.claude-sonnet-5'),
  // Kept stronger than BEDROCK_CHAT_MODEL for the same reason as the OpenAI pair below.
  BEDROCK_JUDGE_MODEL: Joi.string().default('anthropic.claude-opus-5'),
  BEDROCK_RERANK_MODEL: Joi.string().optional(), // defaults to BEDROCK_CHAT_MODEL
  // Claude requires an explicit output ceiling, and on Opus-tier models thinking
  // shares this budget with the response — leave headroom or JSON replies truncate.
  BEDROCK_MAX_TOKENS: Joi.number().default(16000),
  OPENAI_API_KEY: Joi.string().required(),
  OPENAI_CHAT_MODEL: Joi.string().default('gpt-4o-mini'),
  // Model used by the LLM-as-judge eval. Defaults to a different, stronger model
  // than OPENAI_CHAT_MODEL so the judge doesn't grade its own output (self-preference bias).
  OPENAI_JUDGE_MODEL: Joi.string().default('gpt-4o'),
  OPENAI_EMBEDDING_MODEL: Joi.string().default('text-embedding-3-small'),
  // Precision stage: after retrieval casts a wide net, an LLM reranker scores each
  // candidate chunk for relevance and keeps only the top RERANK_TOP_N for the fix prompt.
  RERANK_ENABLED: Joi.boolean().default(true),
  RERANK_TOP_N: Joi.number().default(8),
  OPENAI_RERANK_MODEL: Joi.string().optional(), // defaults to OPENAI_CHAT_MODEL
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
