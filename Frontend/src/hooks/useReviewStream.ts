import { useCallback, useEffect, useRef, useState } from "react";
import { streamReview } from "../lib/api";
import { normalizeCode, sha256Hex } from "../lib/hash";
import type { Finding, Language, Timings } from "../types";

export type Status = "idle" | "loading" | "streaming" | "done" | "error";

export interface ReviewView {
  status: Status;
  text: string;
  findings: Finding[];
  chunks: number;
  cached: boolean;
  timings: Timings | null;
  error: string | null;
}

export interface Counters {
  /** Editor changes made while auto-review was on = the number of calls a naive "review on every change" would make. */
  edits: number;
  autoRequests: number;
  manualRequests: number;
  clientCacheHits: number;
  cancelled: number;
}

const INITIAL_VIEW: ReviewView = { status: "idle", text: "", findings: [], chunks: 1, cached: false, timings: null, error: null };
const INITIAL_COUNTERS: Counters = { edits: 0, autoRequests: 0, manualRequests: 0, clientCacheHits: 0, cancelled: 0 };
const CLIENT_CACHE_LIMIT = 50;

interface CachedReview {
  text: string;
  findings: Finding[];
  chunks: number;
  timings: Timings | null;
}

export type ReviewSource = "auto" | "manual";

/**
 * Owns the whole request lifecycle:
 *   client cache lookup -> cancel the previous request -> stream the new one -> batch UI updates.
 *
 * Why these pieces exist:
 *  - Client cache (SHA-256 key): identical code never leaves the browser twice.
 *  - AbortController: a newer review cancels the older one, which also makes the server stop the paid LLM call.
 *  - requestId guard: late events of a cancelled request can never overwrite the newer result (race condition).
 *  - requestAnimationFrame batching: tokens arrive faster than the screen refreshes, so they are merged
 *    into at most one React render per frame instead of one render per token.
 */
export function useReviewStream() {
  const [view, setView] = useState<ReviewView>(INITIAL_VIEW);
  const [counters, setCounters] = useState<Counters>(INITIAL_COUNTERS);

  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const clientCache = useRef(new Map<string, CachedReview>());

  const pending = useRef("");
  const raf = useRef(0);
  const flushStartedAt = useRef<number | null>(null);
  const commitSamples = useRef<number[]>([]);

  const bump = useCallback((key: keyof Counters) => setCounters((c: Counters) => ({ ...c, [key]: c[key] + 1 })), []);

  const flushNow = useCallback(() => {
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
    const chunk = pending.current;
    if (!chunk) return;
    pending.current = "";
    flushStartedAt.current = performance.now();
    setView((v: ReviewView) => ({ ...v, text: v.text + chunk }));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      flushNow();
    });
  }, [flushNow]);

  const review = useCallback(
    async (code: string, language: Language, source: ReviewSource) => {
      if (!code.trim()) return;
      const id = ++requestId.current;

      // A newer request always wins: stop the old stream immediately.
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
        if (inFlight.current) {
          inFlight.current = false;
          bump("cancelled");
        }
      }
      pending.current = "";
      if (raf.current) {
        cancelAnimationFrame(raf.current);
        raf.current = 0;
      }

      const key = await sha256Hex(`${language}|${normalizeCode(code)}`);
      if (id !== requestId.current) return; // superseded while hashing

      const hit = clientCache.current.get(key);
      if (hit) {
        bump("clientCacheHits");
        setView({
          status: "done",
          text: hit.text,
          findings: hit.findings,
          chunks: hit.chunks,
          cached: true,
          timings: hit.timings,
          error: null,
        });
        return;
      }

      bump(source === "auto" ? "autoRequests" : "manualRequests");
      const controller = new AbortController();
      abortRef.current = controller;
      inFlight.current = true;
      setView({ ...INITIAL_VIEW, status: "loading" });

      let fullText = "";
      let findings: Finding[] = [];
      let chunks = 1;

      try {
        await streamReview({
          code,
          language,
          signal: controller.signal,
          onEvent: (event) => {
            if (id !== requestId.current) return; // stale event from a cancelled request
            switch (event.type) {
              case "meta":
                findings = event.findings;
                chunks = event.chunks;
                setView((v: ReviewView) => ({ ...v, status: "streaming", findings: event.findings, chunks: event.chunks, cached: event.cached }));
                break;
              case "token":
                fullText += event.text;
                pending.current += event.text;
                scheduleFlush();
                break;
              case "done":
                if (raf.current) {
                  cancelAnimationFrame(raf.current);
                  raf.current = 0;
                }
                pending.current = "";
                clientCache.current.set(key, { text: fullText, findings, chunks, timings: event.timings });
                if (clientCache.current.size > CLIENT_CACHE_LIMIT) {
                  const oldest = clientCache.current.keys().next().value;
                  if (oldest !== undefined) clientCache.current.delete(oldest);
                }
                // Ensure `text: fullText` is explicitly preserved in the view state
                setView((v: ReviewView) => ({
                  ...v,
                  text: fullText,
                  status: "done",
                  cached: event.cached,
                  timings: event.timings,
                }));
                break;
              case "error":
                flushNow();
                setView((v: ReviewView) => ({ ...v, status: "error", error: event.message }));
                break;
            }
          },
        });
      } catch (err) {
        if (controller.signal.aborted || id !== requestId.current) return;
        flushNow();
        const message = err instanceof Error ? err.message : "Could not reach the server.";
        setView((v) => ({ ...v, status: "error", error: message }));
      } finally {
        if (id === requestId.current) inFlight.current = false;
      }
    },
    [bump, flushNow, scheduleFlush],
  );

  const recordEdit = useCallback(() => bump("edits"), [bump]);

  /** Called by the review panel right after React committed a streamed update to the DOM. */
  const markCommit = useCallback(() => {
    if (flushStartedAt.current === null) return;
    commitSamples.current.push(performance.now() - flushStartedAt.current);
    flushStartedAt.current = null;
    if (commitSamples.current.length > 300) commitSamples.current.shift();
  }, []);

  const getRenderStats = useCallback(() => {
    const sorted = [...commitSamples.current].sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    return {
      samples: sorted.length,
      p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] as number,
      max: sorted[sorted.length - 1] as number,
    };
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    [],
  );

  return { view, counters, review, recordEdit, markCommit, getRenderStats };
}
