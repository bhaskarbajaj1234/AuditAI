/**
 * Tiny in-process metrics store. It exists so every performance claim can be answered with
 * "I measured it, here is p50/p95" instead of "it felt fast".
 * Samples live in fixed-size ring buffers, so memory stays bounded.
 */
class Ring {
  private readonly values: number[] = [];
  constructor(private readonly size: number) {}

  push(v: number): void {
    this.values.push(v);
    if (this.values.length > this.size) this.values.shift();
  }

  /** Nearest-rank percentile. */
  percentile(p: number): number | null {
    if (this.values.length === 0) return null;
    const sorted = [...this.values].sort((a, b) => a - b);
    const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
    return Math.round((sorted[rank - 1] as number) * 10) / 10;
  }

  get count(): number {
    return this.values.length;
  }
}

export class Metrics {
  readonly counters = { reviews: 0, cacheHits: 0, cacheMisses: 0, llmCalls: 0, errors: 0 };
  private readonly heuristicMs = new Ring(500);
  private readonly firstTokenMs = new Ring(500);
  private readonly totalMsMiss = new Ring(500);
  private readonly totalMsHit = new Ring(500);

  recordHeuristic(ms: number): void { this.heuristicMs.push(ms); }
  recordFirstToken(ms: number): void { this.firstTokenMs.push(ms); }
  recordTotal(ms: number, cached: boolean): void { (cached ? this.totalMsHit : this.totalMsMiss).push(ms); }

  reset(): void {
    this.counters.reviews = 0;
    this.counters.cacheHits = 0;
    this.counters.cacheMisses = 0;
    this.counters.llmCalls = 0;
    this.counters.errors = 0;
  }

  snapshot() {
    const { reviews, cacheHits, cacheMisses } = this.counters;
    const lookups = cacheHits + cacheMisses;
    const stat = (r: Ring) => ({ samples: r.count, p50: r.percentile(50), p95: r.percentile(95) });
    return {
      counters: { ...this.counters },
      cacheHitRate: lookups === 0 ? null : Math.round((cacheHits / lookups) * 1000) / 10,
      llmCallsPerReview: reviews === 0 ? null : Math.round((this.counters.llmCalls / reviews) * 100) / 100,
      latencyMs: {
        staticFindings: stat(this.heuristicMs),
        firstLlmToken: stat(this.firstTokenMs),
        totalCacheMiss: stat(this.totalMsMiss),
        totalCacheHit: stat(this.totalMsHit),
      },
    };
  }
}
