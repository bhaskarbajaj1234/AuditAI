import { describe, expect, it } from "vitest";
import { LruTtlCache } from "../services/cache.service.js";
import { Metrics } from "../services/metrics.service.js";

describe("LruTtlCache", () => {
  it("evicts the least recently used entry", () => {
    const cache = new LruTtlCache<number>(2, 1000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a"); // a is now most recent
    cache.set("c", 3); // evicts b
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
  });

  it("expires entries after the TTL", () => {
    let now = 0;
    const cache = new LruTtlCache<string>(10, 100, () => now);
    cache.set("k", "v");
    now = 99;
    expect(cache.get("k")).toBe("v");
    now = 100;
    expect(cache.get("k")).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});

describe("Metrics", () => {
  it("computes nearest-rank percentiles and cache hit rate", () => {
    const m = new Metrics();
    for (let i = 1; i <= 100; i++) m.recordTotal(i, false);
    m.counters.cacheHits = 1;
    m.counters.cacheMisses = 3;
    const s = m.snapshot();
    expect(s.latencyMs.totalCacheMiss.p50).toBe(50);
    expect(s.latencyMs.totalCacheMiss.p95).toBe(95);
    expect(s.cacheHitRate).toBe(25);
  });
});
