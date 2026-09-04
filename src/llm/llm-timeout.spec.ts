import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { LlmProvider } from './llm.provider';

const cfg = (v: Record<string, unknown> = {}) =>
  ({
    get: (k: string) =>
      ({ OPENAI_API_KEY: 'sk-test', DEFAULT_CHAT_MODEL: 'gpt-5.6-luna', ...v })[k],
  }) as unknown as ConfigService;

/** The client the provider actually built, so this asserts on the real object. */
const clientOf = (p: LlmProvider) => (p as unknown as { client: OpenAI }).client;

describe('the OpenAI client is bounded', () => {
  it('sets a request timeout instead of taking the SDK default', () => {
    const client = clientOf(new LlmProvider(cfg()));

    // The SDK default is 600_000, which outlives RabbitMQ's consumer_timeout.
    expect(client.timeout).toBe(90_000);
    expect(client.timeout).toBeLessThan(600_000);
  });

  it('retries at most once, so the worst case stays inside the ack window', () => {
    const client = clientOf(new LlmProvider(cfg()));

    expect(client.maxRetries).toBe(1);
    // timeout x (retries + 1) must stay well under the 30-minute redelivery
    // timeout, or a wedged call resurrects the loop the ack fix just killed.
    expect(client.timeout * (client.maxRetries + 1)).toBeLessThan(30 * 60 * 1000);
  });

  it('honours an override', () => {
    const client = clientOf(new LlmProvider(cfg({ LLM_TIMEOUT_MS: 45_000, LLM_MAX_RETRIES: 0 })));

    expect(client.timeout).toBe(45_000);
    expect(client.maxRetries).toBe(0);
  });

  it('keeps the worst case under the ack window even at the configurable maximum', () => {
    // Joi caps retries at 5; a generous timeout with that many retries must still
    // not be able to outlast redelivery.
    const client = clientOf(new LlmProvider(cfg({ LLM_TIMEOUT_MS: 240_000, LLM_MAX_RETRIES: 5 })));

    expect(client.timeout * (client.maxRetries + 1)).toBeLessThanOrEqual(30 * 60 * 1000);
  });
});
