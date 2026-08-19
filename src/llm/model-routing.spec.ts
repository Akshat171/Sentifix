import { ConfigService } from '@nestjs/config';
import { LlmProvider } from './llm.provider';
import { TenantModelService } from './tenant-model.service';
import { findModel, requireModel, selectableModels } from './model-catalog';

function configWith(values: Record<string, unknown>): ConfigService {
  // OPENAI_API_KEY is always required: embeddings go to OpenAI regardless of
  // which chat model a tenant is on, so the client is built unconditionally.
  const all: Record<string, unknown> = { OPENAI_API_KEY: 'sk-test', ...values };
  return { get: (k: string) => all[k] } as unknown as ConfigService;
}

describe('model catalog', () => {
  it('exposes a distinct wire ID per vendor for the same family', () => {
    expect(requireModel('gpt-5.6-luna').modelId).toBe('gpt-5.6-luna');
    // Bedrock needs the anthropic. prefix; a bare Claude ID would 400 there.
    expect(requireModel('claude-sonnet').modelId).toBe('anthropic.claude-sonnet-5');
  });

  it('throws on an unknown key rather than silently defaulting', () => {
    expect(() => requireModel('gpt-9-turbo')).toThrow(/Unknown model key/);
    expect(findModel('gpt-9-turbo')).toBeUndefined();
  });

  it('offers at least one model from each vendor to clients', () => {
    const vendors = new Set(selectableModels().map((m) => m.vendor));
    expect(vendors).toEqual(new Set(['openai', 'bedrock']));
  });
});

describe('LlmProvider routing', () => {
  it('rejects a misspelled default model at construction, not mid-triage', () => {
    expect(() => new LlmProvider(configWith({ DEFAULT_CHAT_MODEL: 'gpt-5.6-lunaa' }))).toThrow(
      /Unknown model key/,
    );
  });

  it('sends the vendor wire ID for an OpenAI key, not the catalog key', async () => {
    const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });
    const llm = new LlmProvider(configWith({ DEFAULT_CHAT_MODEL: 'gpt-5.6-luna' }));
    (llm as unknown as { client: unknown }).client = {
      chat: { completions: { create } },
    };

    await llm.chat([{ role: 'user', content: 'hi' }], true, 'gpt-5.6-sol');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.6-sol',
        response_format: { type: 'json_object' },
      }),
    );
  });

  it('routes a Bedrock key away from the OpenAI client', async () => {
    const create = jest.fn();
    const bedrockChat = jest
      .fn()
      .mockResolvedValue({ text: 'claude says hi', inputTokens: 12, outputTokens: 5 });
    const llm = new LlmProvider(configWith({ DEFAULT_CHAT_MODEL: 'gpt-5.6-luna' }));
    (llm as unknown as { client: unknown }).client = { chat: { completions: { create } } };
    (llm as unknown as { bedrock: unknown }).bedrock = { chat: bedrockChat };

    const out = await llm.chat([{ role: 'user', content: 'hi' }], false, 'claude-opus');

    expect(out).toBe('claude says hi');
    expect(create).not.toHaveBeenCalled();
    expect(bedrockChat).toHaveBeenCalledWith(
      [{ role: 'user', content: 'hi' }],
      false,
      'anthropic.claude-opus-5',
    );
  });

  it('explains itself when a Bedrock model is picked without AWS_REGION', async () => {
    const llm = new LlmProvider(configWith({ DEFAULT_CHAT_MODEL: 'gpt-5.6-luna' }));
    await expect(llm.chat([{ role: 'user', content: 'hi' }], false, 'claude-opus')).rejects.toThrow(
      /AWS_REGION is not set/,
    );
  });
});

describe('TenantModelService', () => {
  const defaults = { chat: 'gpt-5.6-luna', rerank: 'gpt-5.6-luna' };
  const llm = { chatModel: 'gpt-5.6-luna', rerankModel: 'gpt-5.6-luna' } as LlmProvider;

  function build(opts: {
    mapping?: { installationId: number } | null;
    install?: { modelKey: string | null } | null;
    slack?: { modelKey: string | null } | null;
    escalation?: { enabled: boolean; model: string };
  }) {
    return new TenantModelService(
      configWith({
        ESCALATION_ENABLED: opts.escalation?.enabled ?? false,
        ESCALATION_MODEL: opts.escalation?.model,
      }),
      { findOne: jest.fn().mockResolvedValue(opts.install ?? null) } as never,
      { findOne: jest.fn().mockResolvedValue(opts.mapping ?? null) } as never,
      { findOne: jest.fn().mockResolvedValue(opts.slack ?? null) } as never,
      llm,
    );
  }

  it('uses the tenant model when one is set', async () => {
    const svc = build({ mapping: { installationId: 1 }, install: { modelKey: 'claude-opus' } });
    await expect(svc.forRepo('acme/api')).resolves.toEqual({
      chat: 'claude-opus',
      rerank: 'claude-opus',
    });
  });

  it('falls back to defaults for an unmapped repo', async () => {
    await expect(build({ mapping: null }).forRepo('nobody/repo')).resolves.toEqual(defaults);
  });

  it('falls back to defaults when the tenant has expressed no preference', async () => {
    const svc = build({ mapping: { installationId: 1 }, install: { modelKey: null } });
    await expect(svc.forRepo('acme/api')).resolves.toEqual(defaults);
  });

  it('degrades a stale model key instead of failing the run', async () => {
    const svc = build({ mapping: { installationId: 1 }, install: { modelKey: 'retired-model' } });
    await expect(svc.forRepo('acme/api')).resolves.toEqual(defaults);
  });

  it('resolves Slack workspaces by team ID', async () => {
    const svc = build({ slack: { modelKey: 'claude-haiku' } });
    await expect(svc.forSlackTeam('T123')).resolves.toEqual({
      chat: 'claude-haiku',
      rerank: 'claude-haiku',
    });
  });
});

describe('escalation targets', () => {
  const llm = { chatModel: 'gpt-5.6-luna', rerankModel: 'gpt-5.6-luna' } as LlmProvider;

  function svc(values: Record<string, unknown>, modelKey: string | null) {
    return new TenantModelService(
      configWith(values),
      { findOne: jest.fn().mockResolvedValue({ modelKey }) } as never,
      { findOne: jest.fn().mockResolvedValue({ installationId: 1 }) } as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      llm,
    );
  }

  it('offers an escalation target when it outranks the tenant model', async () => {
    const s = svc({ ESCALATION_ENABLED: true, ESCALATION_MODEL: 'claude-opus' }, 'gpt-5.6-luna');
    await expect(s.forRepo('acme/api')).resolves.toMatchObject({ escalate: 'claude-opus' });
  });

  it('offers none when the tenant already outranks it — no downgrade retries', async () => {
    const s = svc({ ESCALATION_ENABLED: true, ESCALATION_MODEL: 'gpt-5.6-luna' }, 'claude-opus');
    await expect(s.forRepo('acme/api')).resolves.not.toHaveProperty('escalate');
  });

  it('offers none when the tenant is already on the escalation tier', async () => {
    const s = svc({ ESCALATION_ENABLED: true, ESCALATION_MODEL: 'claude-opus' }, 'claude-opus');
    await expect(s.forRepo('acme/api')).resolves.not.toHaveProperty('escalate');
  });

  it('offers none when escalation is switched off', async () => {
    const s = svc({ ESCALATION_ENABLED: false, ESCALATION_MODEL: 'claude-opus' }, 'gpt-5.6-luna');
    await expect(s.forRepo('acme/api')).resolves.not.toHaveProperty('escalate');
  });
});
