import { env } from "./config/env.js";
import { LruTtlCache } from "./services/cache.service.js";
import { Metrics } from "./services/metrics.service.js";
import { createProvider } from "./services/llm/index.js";
import type { Finding } from "./types.js";

/** Process-wide singletons (one cache, one metrics store, one model client). */
export interface CachedReview {
  text: string;
  findings: Finding[];
  chunks: number;
  estimatedTokens: number;
}

export const provider = createProvider();
export const cache = new LruTtlCache<CachedReview>(env.CACHE_MAX_ENTRIES, env.CACHE_TTL_SECONDS * 1000);
export const metrics = new Metrics();
