import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BedrockChat } from './bedrock.chat';
import { requireModel } from './model-catalog';
import type { ChatMessage } from './chat.types';
import { recordUsage } from '../billing/usage-context';

export type { ChatMessage } from './chat.types';

/**
 * Single entry point for model calls.
 *
 * Routing is per-call, not per-boot: every `chat()` takes a catalog key and the
 * vendor is looked up from that key, so one process can serve an OpenAI tenant
 * and a Bedrock tenant concurrently. See `model-catalog.ts` for the menu.
 *
 * Embeddings always go to OpenAI: Anthropic ships no embedding model, so the
 * vector store's dimension is unaffected by whichever chat model a tenant picks.
 */
@Injectable()
export class LlmProvider {
  private readonly client: OpenAI;
  private readonly logger = new Logger(LlmProvider.name);

  /** Built on first Bedrock call so a deploy with no AWS access still boots. */
  private bedrock?: BedrockChat;

  /** Catalog keys, not wire IDs. */
  readonly chatModel: string;
  readonly judgeModel: string;
  readonly rerankModel: string;
  readonly embeddingModel: string;

  constructor(private readonly config: ConfigService) {
    // Bounded deliberately. The SDK defaults to a 10-minute timeout and 2
    // retries, so one wedged call can hold a triage for half an hour — past
    // RabbitMQ's 30-minute consumer_timeout, at which point the broker decides
    // the consumer is dead and redelivers the job. That is the loop that
    // re-triaged one issue 47 times, and acking cannot prevent it because the
    // handler never reaches its `finally` while the call is still hanging.
    //
    // A triage that cannot answer in 90s will not answer better in ten minutes;
    // failing fast leaves the run marked failed and the message acked, inside
    // the window.
    const timeout = Number(config.get<number>('LLM_TIMEOUT_MS') ?? 90_000);
    const maxRetries = Number(config.get<number>('LLM_MAX_RETRIES') ?? 1);

    this.client = new OpenAI({
      apiKey: config.get<string>('OPENAI_API_KEY'),
      timeout,
      maxRetries,
    });
    this.embeddingModel = config.get<string>('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-small';

    this.chatModel = config.get<string>('DEFAULT_CHAT_MODEL') ?? 'gpt-4o-mini';
    this.rerankModel = config.get<string>('DEFAULT_RERANK_MODEL') ?? this.chatModel;
    // Pinned for everyone — see ModelSelection in model-catalog.ts.
    this.judgeModel = config.get<string>('JUDGE_MODEL') ?? 'gpt-4o';

    // Fail at boot rather than mid-triage if a key is misspelled.
    for (const key of [this.chatModel, this.rerankModel, this.judgeModel]) {
      requireModel(key);
    }

    this.logger.log(
      `Models — chat=${this.chatModel} rerank=${this.rerankModel} judge=${this.judgeModel} (pinned)`,
    );
  }

  /** Wire ID behind a catalog key, for logging and persistence. */
  modelIdFor(key: string): string {
    return requireModel(key).modelId;
  }

  async chat(messages: ChatMessage[], jsonMode = false, modelKey?: string): Promise<string> {
    const entry = requireModel(modelKey ?? this.chatModel);

    if (entry.vendor === 'bedrock') {
      const result = await this.bedrockClient().chat(messages, jsonMode, entry.modelId);
      recordUsage({
        modelKey: entry.key,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
      return result.text;
    }

    const response = await this.client.chat.completions.create({
      model: entry.modelId,
      messages,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    });

    // Metered by catalog key, not vendor model ID: the key is what the tenant
    // was sold and what the rate is defined against.
    recordUsage({
      modelKey: entry.key,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    });

    return response.choices[0]?.message?.content ?? '';
  }

  private bedrockClient(): BedrockChat {
    if (this.bedrock) return this.bedrock;

    const region = this.config.get<string>('AWS_REGION');
    if (!region) {
      throw new Error(
        'A Bedrock model was requested but AWS_REGION is not set. ' +
          'Set it, or move this tenant to an OpenAI model.',
      );
    }

    this.bedrock = new BedrockChat(
      region,
      // Per-call model always overrides this, so it is only a safety net.
      requireModel('claude-sonnet').modelId,
      this.config.get<number>('BEDROCK_MAX_TOKENS') ?? 16000,
    );
    this.logger.log(`Bedrock client initialised (${region})`);
    return this.bedrock;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: texts,
    });
    return response.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}
