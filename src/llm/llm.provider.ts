import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BedrockChat } from './bedrock.chat';
import type { ChatMessage } from './chat.types';

export type { ChatMessage } from './chat.types';

/**
 * Single entry point for model calls.
 *
 * Chat routes to either OpenAI or Claude-on-Bedrock via LLM_PROVIDER, so the
 * seven call sites across the pipeline, judge and reranker stay unchanged and a
 * bad rollout is one env var away from a rollback.
 *
 * Embeddings always go to OpenAI: Anthropic ships no embedding model, so the
 * vector store's dimension is unaffected by the chat provider.
 */
@Injectable()
export class LlmProvider {
  private readonly client: OpenAI;
  private readonly bedrock?: BedrockChat;
  private readonly logger = new Logger(LlmProvider.name);

  readonly provider: 'openai' | 'bedrock';
  readonly chatModel: string;
  readonly judgeModel: string;
  readonly rerankModel: string | undefined;
  readonly embeddingModel: string;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({ apiKey: config.get<string>('OPENAI_API_KEY') });
    this.provider = config.get<'openai' | 'bedrock'>('LLM_PROVIDER') ?? 'openai';
    this.embeddingModel = config.get<string>('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-small';

    if (this.provider === 'bedrock') {
      const region = config.get<string>('AWS_REGION')!;
      this.chatModel = config.get<string>('BEDROCK_CHAT_MODEL') ?? 'anthropic.claude-sonnet-5';
      this.judgeModel = config.get<string>('BEDROCK_JUDGE_MODEL') ?? 'anthropic.claude-opus-5';
      this.rerankModel = config.get<string>('BEDROCK_RERANK_MODEL');
      this.bedrock = new BedrockChat(
        region,
        this.chatModel,
        config.get<number>('BEDROCK_MAX_TOKENS') ?? 16000,
      );
      this.logger.log(
        `Chat provider: bedrock (${region}) — chat=${this.chatModel} judge=${this.judgeModel}`,
      );
    } else {
      this.chatModel = config.get<string>('OPENAI_CHAT_MODEL') ?? 'gpt-4o-mini';
      this.judgeModel = config.get<string>('OPENAI_JUDGE_MODEL') ?? this.chatModel;
      this.rerankModel = config.get<string>('OPENAI_RERANK_MODEL');
      this.logger.log(`Chat provider: openai — chat=${this.chatModel} judge=${this.judgeModel}`);
    }
  }

  async chat(messages: ChatMessage[], jsonMode = false, model?: string): Promise<string> {
    if (this.bedrock) return this.bedrock.chat(messages, jsonMode, model);

    const response = await this.client.chat.completions.create({
      model: model ?? this.chatModel,
      messages,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    });
    return response.choices[0]?.message?.content ?? '';
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
