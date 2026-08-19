import { Logger } from '@nestjs/common';
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import type { ChatMessage, ChatResult } from './chat.types';

/**
 * Claude chat via Amazon Bedrock.
 *
 * Three shape differences from the OpenAI path that this class absorbs, so the
 * rest of the codebase keeps calling `LlmProvider.chat()` unchanged:
 *
 *  1. Claude takes `system` as a top-level parameter, not a message role.
 *  2. `max_tokens` is required (OpenAI defaults it); on Claude Opus 5 thinking
 *     is on by default and shares that budget with the response text, so the
 *     ceiling needs real headroom or answers truncate mid-JSON.
 *  3. There is no `response_format: json_object`. The call sites already
 *     describe their schema in the system prompt, so JSON mode is enforced by
 *     instruction and the reply is unwrapped defensively (see `extractJson`).
 */
export class BedrockChat {
  private readonly logger = new Logger(BedrockChat.name);
  private readonly client: AnthropicBedrockMantle;

  constructor(
    region: string,
    readonly defaultModel: string,
    private readonly maxTokens: number,
  ) {
    // Credentials come from the standard AWS chain — on EC2 that is the
    // instance role, so no key material lives in the environment.
    this.client = new AnthropicBedrockMantle({ awsRegion: region });
  }

  async chat(messages: ChatMessage[], jsonMode = false, model?: string): Promise<ChatResult> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const turns = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    if (turns.length === 0) {
      throw new Error('BedrockChat.chat: needs at least one user or assistant message');
    }

    const systemPrompt = jsonMode ? `${system}\n\n${JSON_ONLY_SUFFIX}` : system;

    const response = await this.client.messages.create({
      model: model ?? this.defaultModel,
      max_tokens: this.maxTokens,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: turns,
    });

    // Safety classifiers can decline with HTTP 200 and an empty content array —
    // reading content[0] unconditionally would throw here rather than surface why.
    if (response.stop_reason === 'refusal') {
      this.logger.warn(
        `Bedrock declined the request (${response.stop_details?.category ?? 'unknown'})`,
      );
      throw new Error('Model declined the request');
    }

    if (response.stop_reason === 'max_tokens') {
      this.logger.warn(
        `Bedrock response hit max_tokens (${this.maxTokens}) — output may be truncated`,
      );
    }

    const text = response.content
      .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      text: jsonMode ? extractJson(text) : text,
      // Defensive: a provider that omits usage must not crash a run, but an
      // unmetered call would silently be free — the zero is visible in usage_records.
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    };
  }
}

const JSON_ONLY_SUFFIX =
  'Respond with the JSON object only. No markdown code fences, no explanation before or after it.';

/**
 * Claude honours "JSON only" reliably but not universally — it will occasionally
 * wrap the object in a ```json fence or add a lead-in sentence. Every JSON call
 * site here does a bare `JSON.parse`, so unwrap before handing the string back.
 */
export function extractJson(text: string): string {
  const trimmed = text.trim();

  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenced) return fenced[1].trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;

  // Last resort: carve out the outermost object/array from surrounding prose.
  const start = trimmed.search(/[{[]/);
  if (start === -1) return trimmed;
  const opener = trimmed[start];
  const closer = opener === '{' ? '}' : ']';
  const end = trimmed.lastIndexOf(closer);
  return end > start ? trimmed.slice(start, end + 1) : trimmed;
}
