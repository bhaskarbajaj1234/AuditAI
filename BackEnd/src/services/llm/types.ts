export interface LlmRequest {
  system: string;
  prompt: string;
  signal: AbortSignal;
}

/** Any model backend only has to stream text. This keeps the pipeline testable and swappable. */
export interface LlmProvider {
  readonly name: string;
  stream(request: LlmRequest): AsyncIterable<string>;
}
