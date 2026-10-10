import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { cache, metrics } from "../container.js";
import type { ReviewEvent } from "../types.js";

const app = createApp();

const parseSse = (body: string): ReviewEvent[] =>
  body
    .split("\n\n")
    .filter((b) => b.startsWith("data: "))
    .map((b) => JSON.parse(b.slice(6)) as ReviewEvent);

const post = (payload: unknown) => request(app).post("/api/review").send(payload as object);

beforeEach(() => {
  cache.clear();
  metrics.reset();
});

describe("POST /api/review", () => {
  it("streams meta -> tokens -> done and reports static findings", async () => {
    const res = await post({ code: `var a = 1;\neval("x");`, language: "javascript" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    const events = parseSse(res.text);
    expect(events[0]?.type).toBe("meta");
    expect(events.at(-1)?.type).toBe("done");
    const meta = events[0] as Extract<ReviewEvent, { type: "meta" }>;
    expect(meta.cached).toBe(false);
    expect(meta.findings.map((f) => f.ruleId)).toContain("JS001");
    expect(events.filter((e) => e.type === "token").length).toBeGreaterThan(0);
  });

  it("serves the second identical request from cache without calling the LLM again", async () => {
    const payload = { code: "const a = 1;", language: "javascript" };
    const first = parseSse((await post(payload)).text);
    const callsAfterFirst = metrics.counters.llmCalls;
    const second = parseSse((await post(payload)).text);

    expect((second[0] as Extract<ReviewEvent, { type: "meta" }>).cached).toBe(true);
    expect(metrics.counters.llmCalls).toBe(callsAfterFirst);
    const text = (events: ReviewEvent[]) =>
      events.filter((e): e is Extract<ReviewEvent, { type: "token" }> => e.type === "token").map((e) => e.text).join("");
    expect(text(second)).toBe(text(first));
  });

  it("treats whitespace-only differences as the same cache entry", async () => {
    await post({ code: "const a = 1;", language: "javascript" });
    const res = parseSse((await post({ code: "const a = 1;   \r\n", language: "javascript" })).text);
    expect((res[0] as Extract<ReviewEvent, { type: "meta" }>).cached).toBe(true);
  });

  it("does not share cache entries across languages", async () => {
    await post({ code: "x = 1", language: "python" });
    const res = parseSse((await post({ code: "x = 1", language: "go" })).text);
    expect((res[0] as Extract<ReviewEvent, { type: "meta" }>).cached).toBe(false);
  });

  it("chunks large input into multiple parts", async () => {
    const code = Array.from({ length: 120 }, (_, i) => `function f${i}(a) {\n${"  doWork(a);\n".repeat(20)}}\n`).join("\n");
    const events = parseSse((await post({ code, language: "javascript" })).text);
    const meta = events[0] as Extract<ReviewEvent, { type: "meta" }>;
    expect(meta.chunks).toBeGreaterThan(1);
    expect(events.some((e) => e.type === "token" && e.text.includes("### Part 2/"))).toBe(true);
  });

  const invalidPayloads: Array<[string, object]> = [
    ["missing code", {}],
    ["blank code", { code: "   " }],
    ["non-string code", { code: 123 }],
    ["unknown language", { code: "x", language: "cobol" }],
    ["too long", { code: "x".repeat(200_001) }],
  ];

  it.each(invalidPayloads)("rejects invalid input with 400 JSON: %s", async (_name, payload) => {
    const res = await post(payload);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_INPUT");
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await request(app).post("/api/review").set("Content-Type", "application/json").send("{oops");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_JSON");
  });
});

describe("misc routes", () => {
  it("exposes health and metrics, and 404s unknown routes", async () => {
    expect((await request(app).get("/health")).body).toEqual({ status: "ok" });
    await post({ code: "const a = 1;" });
    const m = await request(app).get("/api/metrics");
    expect(m.status).toBe(200);
    expect(m.body.counters.reviews).toBe(1);
    expect((await request(app).get("/nope")).status).toBe(404);
  });
});
