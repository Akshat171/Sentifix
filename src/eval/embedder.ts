import OpenAI from 'openai';

/**
 * A candidate embedding model for the A/B harness. Any provider exposing an
 * OpenAI-compatible embeddings endpoint works by setting `baseURL` + `apiKeyEnv`
 * — e.g. a code-specific model like voyage-code-3 (Article 2's recommendation)
 * — so we can measure it against the current text-embedding-3-small before
 * committing to a production re-index.
 */
export interface EmbedderSpec {
  label: string;
  model: string;
  baseURL?: string;
  apiKeyEnv?: string;
}

export interface Embedder {
  label: string;
  model: string;
  embedBatch(texts: string[]): Promise<number[][]>;
}

// Sub-batch size — most embedding endpoints cap inputs per request.
const BATCH = 96;

export function createEmbedder(spec: EmbedderSpec): Embedder {
  const apiKey = process.env[spec.apiKeyEnv ?? 'OPENAI_API_KEY'];
  const client = new OpenAI({ apiKey, baseURL: spec.baseURL });

  return {
    label: spec.label,
    model: spec.model,
    async embedBatch(texts: string[]): Promise<number[][]> {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH) {
        const slice = texts.slice(i, i + BATCH);
        const res = await client.embeddings.create({ model: spec.model, input: slice });
        res.data
          .sort((a, b) => a.index - b.index)
          .forEach((d) => out.push(d.embedding as number[]));
      }
      return out;
    },
  };
}

/**
 * Parse EMBED_AB_MODELS ("label=model" or "model", comma-separated) into specs.
 * Defaults to two OpenAI models so the harness runs with no extra keys; add a
 * code-specific model via baseURL/apiKeyEnv in code or extend this parser.
 */
export function parseModelSpecs(env?: string): EmbedderSpec[] {
  if (!env || !env.trim()) {
    return [
      { label: 'openai-small', model: 'text-embedding-3-small' },
      { label: 'openai-large', model: 'text-embedding-3-large' },
    ];
  }
  return env
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [labelOrModel, model] = entry.split('=').map((x) => x.trim());
      return model ? { label: labelOrModel, model } : { label: labelOrModel, model: labelOrModel };
    });
}
