import { env } from "../../config/env.js";
import { GeminiProvider } from "./gemini.provider.js";
import { MockProvider } from "./mock.provider.js";
import type { LlmProvider } from "./types.js";

export function createProvider(): LlmProvider {
  if (env.LLM_PROVIDER === "mock") return new MockProvider(env.MOCK_DELAY_MS);
  return new GeminiProvider(env.GOOGLE_GEMINI_KEY as string, env.GEMINI_MODEL);
}

export type { LlmProvider } from "./types.js";
