# AuditAI – hybrid (rule-based + LLM) code reviewer

Paste code, get an instant list of static findings, then a streamed AI review that verifies and explains them.

```
Browser (React + TS)                         Express API (TS)
┌──────────────────────────┐   POST /api/review   ┌─────────────────────────────────────────────┐
│ Editor + language picker │ ───────────────────▶ │ rate limit → Zod validation                  │
│ debounce (800 ms)        │                       │ normalise code → SHA-256 cache key           │
│ SHA-256 browser cache    │ ◀── SSE stream ────── │ static analysis (regex + Babel AST)  ~ms     │
│ AbortController          │  meta → token* → done │ chunking at function boundaries              │
│ rAF-batched rendering    │                       │ cache hit? replay : stream Gemini            │
└──────────────────────────┘                       └─────────────────────────────────────────────┘
```

## Run it

```bash
# 1) API
cd BackEnd && cp .env.example .env      # put GOOGLE_GEMINI_KEY in .env (or set LLM_PROVIDER=mock)
npm install && npm run dev              # http://localhost:5000

# 2) UI (new terminal)
cd Frontend && npm install && npm run dev   # http://localhost:5173 (proxies /api to :5000)
```

`LLM_PROVIDER=mock` streams a canned review, so you can demo and test everything without an API key.

## Tests and benchmarks

```bash
cd BackEnd  && npm test          # 36 tests: rules, chunking, cache, SSE API
cd Frontend && npm test          # 8 tests: debounce, request lifecycle, cache, cancellation, render
cd BackEnd  && npm run bench     # needs the server running; prints p50/p95 for YOUR machine and model
curl localhost:5000/api/metrics  # live p50/p95, cache hit rate, LLM calls per review
```

## Folder map

```
BackEnd/src
  config/env.ts                 Zod-validated environment (fails fast at boot)
  routes/ → controllers/ → services/    layered architecture
  services/heuristics.service   regex rules + Babel AST rules (static analysis)
  services/payload.service      normalise, line-number, chunk, outline, prompt building
  services/review.service       the pipeline as an async generator of events
  services/cache.service        LRU + TTL cache
  services/metrics.service      ring buffers → p50/p95
  services/llm/                 provider interface, Gemini + mock providers, prompts
  middleware/                   rate limiting, error handling
Frontend/src
  hooks/useReviewStream         request lifecycle: cache, abort, stream, batch renders
  hooks/useDebouncedCallback    debounce with stable callbacks
  components/                   CodeEditor, ReviewPanel, FindingsList, StatsBar
```

## Design decisions (interview answers)

| Decision | Why | Trade-off |
|---|---|---|
| Hybrid: rules first, LLM second | Rules are deterministic, free and take milliseconds; the LLM adds judgement and explanations. Rule findings are passed to the LLM as hints so it verifies instead of rediscovering. | Rules only cover known patterns; regex rules can false-positive. |
| Babel AST for JS/TS | Regex cannot reliably detect structure (empty `catch`, `await` in loops, function length, complexity). | Only JS/TS get AST rules; other languages get regex rules. |
| SSE streaming (not WebSocket) | One-way server→client, plain HTTP, works through proxies, trivial to implement. | `EventSource` cannot POST, so the client parses the stream from `fetch`. |
| Static findings are sent before the LLM starts | Users see useful output in milliseconds, and keep it if the LLM fails or times out. | Two-phase UI. |
| Chunk at top-level boundaries | A function is reviewed with its whole body; big files stay under the token budget. | A chunk cannot see code from other chunks, so an outline of the file is added to each prompt. |
| Line-numbered code, blank lines dropped | Model can cite exact lines; blank lines cost tokens and carry no meaning. | Numbers add tokens (~10%). |
| SHA-256 cache key over normalised code + language + model + prompt version | Whitespace-only edits hit the cache; changing the prompt invalidates old results. | In-memory cache is per instance; use Redis for several instances. |
| Debounce (not throttle) for auto-review | We want "user stopped typing", not "at most once per N ms". | 800 ms delay before feedback. |
| AbortController + request id | New request cancels the old one; the server stops the paid LLM call when the client disconnects; stale events can never overwrite newer results. | – |
| Batch token renders with `requestAnimationFrame` | Tokens arrive faster than 60 fps; one render per frame instead of one per token. | Up to ~16 ms display delay. |
| `thinkingBudget: 0` on Gemini 2.5 Flash | Skips hidden reasoning tokens, so the first visible token arrives much sooner. | Slightly less deep analysis. |
| Prompt-injection hardening | Code is wrapped in delimiters, a closing delimiter inside user code is neutralised, and the system prompt says the content is data, not instructions. | Reduces, does not eliminate, the risk. Output is rendered as Markdown without raw HTML, so it cannot inject markup. |

## Known limits

- Rate limiting and caching are in-memory (single instance). For several instances use a shared store (Redis).
- Chunks are reviewed one after another; parallel chunk review with a concurrency limit would be faster for huge files.
- Token counts are estimated (≈ 4 chars/token), not exact.
- Streaming long responses on a serverless platform can hit the platform's function time limit; a long-running host (Render, Railway, Fly.io) is simpler for SSE.
