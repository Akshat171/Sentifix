import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class LlmProvider {
  private readonly client: OpenAI;
  private readonly logger = new Logger(LlmProvider.name);
  readonly chatModel: string;
  readonly embeddingModel: string;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({ apiKey: config.get<string>('OPENAI_API_KEY') });
    this.chatModel = config.get<string>('OPENAI_CHAT_MODEL') ?? 'gpt-4o-mini';
    this.embeddingModel = config.get<string>('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-small';
  }

  async chat(messages: ChatMessage[], jsonMode = false): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.chatModel,
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
