import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { cache, metrics } from "../container.js";

export function getMetrics(req: Request, res: Response): void {
  if (env.METRICS_TOKEN && req.header("x-metrics-token") !== env.METRICS_TOKEN) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Missing or invalid metrics token." });
    return;
  }
  res.json({ ...metrics.snapshot(), cacheEntries: cache.size });
}
