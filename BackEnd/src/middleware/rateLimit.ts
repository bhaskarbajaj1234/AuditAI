import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

/**
 * Every review can trigger a paid LLM call, so the endpoint is rate limited per IP.
 * (In-memory store: fine for one instance. With several instances, use a shared store such as Redis.)
 */
export const reviewLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.RATE_LIMIT_PER_MINUTE,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "RATE_LIMITED", message: "Too many review requests. Please wait a minute and try again." },
});
