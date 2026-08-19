export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** A completion plus the token counts billing needs. */
export interface ChatResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}
