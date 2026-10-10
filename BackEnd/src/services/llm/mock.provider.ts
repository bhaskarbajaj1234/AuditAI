import type { LlmProvider, LlmRequest } from "./types.js";

/** Deterministic offline provider: lets you run, demo and test the whole pipeline without an API key. */
export class MockProvider implements LlmProvider {
  readonly name = "mock";

  constructor(private readonly delayMs: number) {}

  async *stream({ prompt, signal }: LlmRequest): AsyncGenerator<string> {
    const lines = prompt.match(/^\d+\|/gm)?.length ?? 0;
    const review = [
      "## Summary\n",
      `Mock review of ${lines} non-empty lines. Verdict: **Needs work**.\n\n`,
      "## Issues\n",
      "**[medium] L1: Example finding**\n",
      "This text comes from the mock provider, not a real model.\n\n",
      "```js\n// corrected snippet would appear here\n```\n\n",
      "## Positives\n",
      "The pipeline works end to end.\n",
    ].join("");
    for (let i = 0; i < review.length; i += 12) {
      if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
      yield review.slice(i, i + 12);
    }
  }
}
