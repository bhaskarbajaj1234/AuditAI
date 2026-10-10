import type { Request, Response } from "express";
import { z, type ZodIssue } from "zod";
import { env } from "../config/env.js";
import { metrics } from "../container.js";
import { runReview } from "../services/review.service.js";
import { LANGUAGES } from "../types.js";
import type { ReviewEvent } from "../types.js";

const bodySchema = z.object({
  code: z
    .string({ invalid_type_error: "`code` must be a string" })
    .max(env.MAX_CODE_CHARS, { message: `Code is too large (max ${env.MAX_CODE_CHARS} characters)` })
    .refine((s: string) => s.trim().length > 0, { message: "`code` must not be empty" }),
  language: z.enum(LANGUAGES).default("javascript"),
});

const send = (res: Response, event: ReviewEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);

export async function postReview(req: Request, res: Response): Promise<void> {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "INVALID_INPUT",
      message: parsed.error.issues.map((i: ZodIssue) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "),
    });
    return;
  }

  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) abort.abort();
  });

  try {
    for await (const event of runReview(parsed.data, abort.signal)) {
      if (abort.signal.aborted) break;
      send(res, event);
    }
  } catch (err) {
    if (!abort.signal.aborted) {
      metrics.counters.errors++;
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || /timed? ?out/i.test(err.message));
      console.error("[review] failed:", err);
      send(res, {
        type: "error",
        code: timedOut ? "LLM_TIMEOUT" : "LLM_ERROR",
        message: timedOut
          ? "The model took too long to respond. Static findings above are still valid."
          : "The AI review failed. Static findings above are still valid.",
      });
    }
  } finally {
    res.end();
  }
}