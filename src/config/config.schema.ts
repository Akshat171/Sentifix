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
  OPENAI_API_KEY: Joi.string().required(),
  OPENAI_CHAT_MODEL: Joi.string().default('gpt-4o-mini'),
  OPENAI_EMBEDDING_MODEL: Joi.string().default('text-embedding-3-small'),
  GITHUB_WEBHOOK_SECRET: Joi.string().required(),
  GITHUB_TOKEN: Joi.string().optional(),
  API_KEY: Joi.string().optional(),
  // GitHub App (optional — enables one-click install flow)
  GITHUB_APP_ID: Joi.number().optional(),
  GITHUB_APP_PRIVATE_KEY: Joi.string().optional(), // PEM with \n escaped as \\n
  GITHUB_APP_SLUG: Joi.string().optional(),        // e.g. "sentifix-bot"
  GITHUB_APP_CLIENT_ID: Joi.string().optional(),
  GITHUB_APP_CLIENT_SECRET: Joi.string().optional(),
  // Slack integration
  SLACK_BOT_TOKEN: Joi.string().optional(),       // xoxb-...
  SLACK_SIGNING_SECRET: Joi.string().optional(),  // for request verification
  SLACK_DEFAULT_REPO: Joi.string().optional(),    // fallback owner/repo when not detectable
  // OpenTelemetry
  OTEL_ENABLED: Joi.boolean().default(false),
  OTEL_SERVICE_NAME: Joi.string().default('sentifix'),
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().uri().optional(),
});
