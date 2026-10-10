import { performance } from "node:perf_hooks";
import { env } from "../config/env.js";
import { cache as defaultCache, metrics as defaultMetrics, provider as defaultProvider } from "../container.js";
import type { CachedReview } from "../container.js";
import { analyze } from "./heuristics.service.js";
import { buildChunks, buildOutline, buildPrompt, normalizeCode } from "./payload.service.js";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "./llm/prompts.js";
import type { LlmProvider } from "./llm/types.js";
import type { LruTtlCache } from "./cache.service.js";
import type { Metrics } from "./metrics.service.js";
import { sha256 } from "../utils/hash.js";
import type { Language, ReviewEvent } from "../types.js";

export interface ReviewDeps {
  provider: LlmProvider;
  cache: LruTtlCache<CachedReview>;
  metrics: Metrics;
}

export const defaultDeps: ReviewDeps = {
  provider: defaultProvider,
  cache: defaultCache,
  metrics: defaultMetrics,
};

export const cacheKeyFor = (code: string, language: Language, model: string): string =>
  sha256(`${PROMPT_VERSION}|${model}|${language}|${normalizeCode(code)}`);

/**
 * The whole review pipeline as an async generator of events:
 *
 *   normalise -> static analysis (ms) -> chunking -> cache lookup
 *     hit : replay cached review                       (no LLM call)
 *     miss: stream the LLM review chunk by chunk, then cache it
 *
 * Yielding events (instead of returning one big string) lets the controller stream
 * the static findings immediately and the LLM text token by token.
 */
export async function* runReview(
  input: { code: string; language: Language },
  signal: AbortSignal,
  deps: ReviewDeps = defaultDeps,
): AsyncGenerator<ReviewEvent> {
  const { provider, cache, metrics } = deps;
  const startedAt = performance.now();
  metrics.counters.reviews++;

  const heuristicStart = performance.now();
  const findings = analyze(input.code, input.language);
  const heuristicMs = performance.now() - heuristicStart;
  metrics.recordHeuristic(heuristicMs);

  const chunks = buildChunks(input.code, input.language, env.CHUNK_TOKEN_BUDGET);
  const estimatedTokens = chunks.reduce((sum, c) => sum + c.tokens, 0);
  const key = cacheKeyFor(input.code, input.language, `${provider.name}:${env.GEMINI_MODEL}`);

  const hit = cache.get(key);
  if (hit) {
    metrics.counters.cacheHits++;
    yield { type: "meta", cached: true, findings: hit.findings, chunks: hit.chunks, estimatedTokens: hit.estimatedTokens, heuristicMs };
    yield { type: "token", text: hit.text };
    const totalMs = performance.now() - startedAt;
    metrics.recordTotal(totalMs, true);
    yield { type: "done", cached: true, timings: { heuristicMs, firstTokenMs: null, totalMs } };
    return;
  }

  metrics.counters.cacheMisses++;
  // Static findings are useful on their own, so they go out before the (slow) LLM starts.
  yield { type: "meta", cached: false, findings, chunks: chunks.length, estimatedTokens, heuristicMs };

  const outline = chunks.length > 1 ? buildOutline(input.code) : [];
  const llmSignal = AbortSignal.any([signal, AbortSignal.timeout(env.LLM_TIMEOUT_MS)]);
  let fullText = "";
  let firstTokenMs: number | null = null;

  for (const chunk of chunks) {
    if (chunks.length > 1) {
      const header = `${chunk.index > 1 ? "\n\n" : ""}### Part ${chunk.index}/${chunk.total} (lines ${chunk.startLine}-${chunk.endLine})\n\n`;
      fullText += header;
      yield { type: "token", text: header };
    }
    metrics.counters.llmCalls++;
    const prompt = buildPrompt({ chunk, language: input.language, findings, outline });
    for await (const text of provider.stream({ system: SYSTEM_PROMPT, prompt, signal: llmSignal })) {
      if (firstTokenMs === null) {
        firstTokenMs = performance.now() - startedAt;
        metrics.recordFirstToken(firstTokenMs);
      }
      fullText += text;
      yield { type: "token", text };
    }
  }

  // Only complete, successful reviews are cached (a failure above throws before this line).
  cache.set(key, { text: fullText, findings, chunks: chunks.length, estimatedTokens });
  const totalMs = performance.now() - startedAt;
  metrics.recordTotal(totalMs, false);
  yield { type: "done", cached: false, timings: { heuristicMs, firstTokenMs, totalMs } };
}
