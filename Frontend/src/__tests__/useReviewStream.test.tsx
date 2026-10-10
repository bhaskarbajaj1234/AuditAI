import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReviewStream } from "../hooks/useReviewStream";
import type { ReviewEvent } from "../types";

const meta = (cached = false): ReviewEvent => ({ type: "meta", cached, findings: [], chunks: 1, estimatedTokens: 5, heuristicMs: 1 });
const done: ReviewEvent = { type: "done", cached: false, timings: { heuristicMs: 1, firstTokenMs: 5, totalMs: 10 } };

/** Build a streaming Response from SSE events. */
function sseResponse(events: ReviewEvent[], delayMs = 0): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const e of events) {
          if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        }
        controller.close();
      } catch {
        /* stream was cancelled by the consumer */
      }
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("useReviewStream", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams tokens into the view and finishes", async () => {
    fetchMock.mockImplementation(async () => sseResponse([meta(), { type: "token", text: "Hello " }, { type: "token", text: "world" }, done]));
    const { result } = renderHook(() => useReviewStream());

    await act(async () => {
      await result.current.review("const a = 1;", "javascript", "manual");
    });
    await waitFor(() => expect(result.current.view.status).toBe("done"));
    expect(result.current.view.text).toBe("Hello world");
    expect(result.current.counters.manualRequests).toBe(1);
  });

  it("serves identical code from the browser cache without a second network call", async () => {
    fetchMock.mockImplementation(async () => sseResponse([meta(), { type: "token", text: "ok" }, done]));
    const { result } = renderHook(() => useReviewStream());

    await act(async () => void (await result.current.review("x = 1", "python", "manual")));
    await waitFor(() => expect(result.current.view.status).toBe("done"));
    await act(async () => void (await result.current.review("x = 1   ", "python", "manual"))); // only trailing spaces differ

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.counters.clientCacheHits).toBe(1);
    expect(result.current.view.text).toBe("ok");
  });

  it("a newer request cancels the older one and stale events never win", async () => {
    fetchMock
      .mockImplementationOnce(async () => sseResponse([meta(), { type: "token", text: "OLD" }, done], 40))
      .mockImplementationOnce(async () => sseResponse([meta(), { type: "token", text: "NEW" }, done]));

    const { result } = renderHook(() => useReviewStream());
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.review("one", "javascript", "auto");
    });
    await new Promise((r) => setTimeout(r, 15));
    await act(async () => void (await result.current.review("two", "javascript", "auto")));
    await act(async () => void (await first));

    await waitFor(() => expect(result.current.view.status).toBe("done"));
    expect(result.current.view.text).toBe("NEW");
    expect(result.current.counters.cancelled).toBe(1);
  });

  it("keeps static findings and shows a message when the server reports an error", async () => {
    const finding = { ruleId: "JS004", title: "var", severity: "low", category: "style", line: 1, message: "m" } as const;
    fetchMock.mockImplementation(async () =>
      sseResponse([{ ...meta(), findings: [finding] } as ReviewEvent, { type: "error", code: "LLM_ERROR", message: "AI review failed" }]),
    );
    const { result } = renderHook(() => useReviewStream());
    await act(async () => void (await result.current.review("var a", "javascript", "manual")));
    await waitFor(() => expect(result.current.view.status).toBe("error"));
    expect(result.current.view.findings).toHaveLength(1);
    expect(result.current.view.error).toBe("AI review failed");
  });

  it("surfaces errors returned as JSON before the stream starts (e.g. rate limit)", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ error: "RATE_LIMITED", message: "Too many requests" }), { status: 429, headers: { "Content-Type": "application/json" } }),
    );
    const { result } = renderHook(() => useReviewStream());
    await act(async () => void (await result.current.review("x", "javascript", "manual")));
    expect(result.current.view.status).toBe("error");
    expect(result.current.view.error).toBe("Too many requests");
  });
});
