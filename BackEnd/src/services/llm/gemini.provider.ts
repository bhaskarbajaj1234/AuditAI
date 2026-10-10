import type { LlmProvider, LlmRequest } from "./types.js";

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) { }

  async *stream({ system, prompt, signal }: LlmRequest): AsyncGenerator<string> {
    const modelName = this.model.replace(/^models\//, "");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
      },
    };

    if (system) {
      body.systemInstruction = {
        parts: [{ text: system }],
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok || !res.body) {
      const errText = await res.text();
      throw new Error(`Gemini API Error (${res.status}): ${errText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          try {
            const data = JSON.parse(jsonStr);
            const candidates = data.candidates ?? [];
            for (const candidate of candidates) {
              const parts = candidate.content?.parts ?? [];
              for (const part of parts) {
                if (typeof part.text === "string" && part.text.length > 0) {
                  yield part.text;
                }
              }
            }
          } catch {
            // Incomplete JSON segment, ignore
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}