/**
 * Measure real latency against a running server:  npm run dev  (another terminal)  then  npm run bench
 *
 *   BASE_URL=http://localhost:5000 RUNS=20 npm run bench
 *
 * For every run it sends UNIQUE code (cache miss) and records:
 *   - time to static findings  (first "meta" event)
 *   - time to first LLM token  (first "token" event)
 *   - total time
 * Then it re-sends identical code to measure the cache-hit path.
 * Use these numbers (p50/p95) on your resume and in interviews. Never quote numbers you did not measure.
 */
import { performance } from "node:perf_hooks";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const RUNS = Number(process.env.RUNS ?? 20);
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 3500); // stay under the default rate limit (20/min)

const SAMPLE = `
import express from "express";
const app = express();

app.get("/user", async (req, res) => {
  const rows = [];
  for (const id of req.query.ids) {
    rows.push(await db.query("SELECT * FROM users WHERE id = " + id));
  }
  try { res.json(rows); } catch (e) {}
});
`;

interface Sample { meta: number; firstToken: number | null; total: number; cached: boolean }

async function reviewOnce(code: string): Promise<Sample> {
  const t0 = performance.now();
  const res = await fetch(`${BASE_URL}/api/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, language: "javascript" }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

  let meta = NaN;
  let firstToken: number | null = null;
  let cached = false;
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const part of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(part, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (!block.startsWith("data: ")) continue;
      const event = JSON.parse(block.slice(6)) as { type: string; cached?: boolean };
      const now = performance.now() - t0;
      if (event.type === "meta") { meta = now; cached = Boolean(event.cached); }
      if (event.type === "token" && firstToken === null) firstToken = now;
      if (event.type === "error") throw new Error(`stream error: ${JSON.stringify(event)}`);
    }
  }
  return { meta, firstToken, total: performance.now() - t0, cached };
}

const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? NaN;
};
const fmt = (n: number) => `${n.toFixed(1)} ms`;
const row = (label: string, values: number[]) =>
  console.log(`${label.padEnd(28)} p50 ${fmt(percentile(values, 50)).padStart(11)}   p95 ${fmt(percentile(values, 95)).padStart(11)}   n=${values.length}`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`Benchmarking ${BASE_URL} with ${RUNS} unique reviews (cache MISS)...`);
  const misses: Sample[] = [];
  for (let i = 0; i < RUNS; i++) {
    misses.push(await reviewOnce(`${SAMPLE}\n// run ${i} ${Date.now()}`));
    if (i < RUNS - 1) await sleep(PAUSE_MS);
  }

  const fixed = `${SAMPLE}\n// cache probe ${Date.now()}`;
  await reviewOnce(fixed);
  await sleep(PAUSE_MS);
  const hits: Sample[] = [];
  for (let i = 0; i < Math.min(RUNS, 15); i++) {
    hits.push(await reviewOnce(fixed));
    await sleep(PAUSE_MS);
  }

  console.log("\n--- Cache MISS (real LLM call) ---");
  row("static findings visible", misses.map((s) => s.meta));
  row("first LLM token", misses.flatMap((s) => (s.firstToken === null ? [] : [s.firstToken])));
  row("full review", misses.map((s) => s.total));
  console.log("\n--- Cache HIT ---");
  console.log(`all cached: ${hits.every((s) => s.cached)}`);
  row("full review (from cache)", hits.map((s) => s.total));
  console.log("\nServer-side view:  GET /api/metrics");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
