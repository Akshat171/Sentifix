/**
 * Minimal structural types for the Fastify request/reply we use in controllers,
 * so we don't depend on `fastify` types directly (it's a transitive dep).
 */
export interface HttpReply {
  code(statusCode: number): HttpReply;
  header(name: string, value: string): HttpReply;
  redirect(url: string): void;
  type(contentType: string): HttpReply;
  send(body?: string): void;
}

export interface HttpRequest {
  headers?: Record<string, unknown>;
}
