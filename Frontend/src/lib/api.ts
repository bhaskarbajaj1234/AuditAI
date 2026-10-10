import type { Language, ReviewEvent } from "../types";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface StreamParams {
  code: string;
  language: Language;
  signal: AbortSignal;
  onEvent: (event: ReviewEvent) => void;
}

/**
 * POST the code and read the Server-Sent Events response incrementally.
 * (EventSource cannot POST, so we parse the stream from fetch ourselves.)
 */
export async function streamReview({ code, language, signal, onEvent }: StreamParams): Promise<void> {
  const res = await fetch(`${API_BASE}/api/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, language }),
    signal,
  });

  if (!res.ok) {
    let code = "HTTP_ERROR";
    let message = `Request failed (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      code = body.error ?? code;
      message = body.message ?? message;
    } catch {
      /* non-JSON error body: keep the generic message */
    }
    throw new ApiError(code, message);
  }
  if (!res.body) throw new ApiError("NO_STREAM", "The server did not return a readable stream.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (block.startsWith("data: ")) onEvent(JSON.parse(block.slice(6)) as ReviewEvent);
    }
  }
}
