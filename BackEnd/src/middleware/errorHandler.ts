import type { ErrorRequestHandler, RequestHandler } from "express";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "NOT_FOUND", message: "Route not found." });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const e = err as { type?: string; status?: number };
  if (e.type === "entity.parse.failed") {
    res.status(400).json({ error: "INVALID_JSON", message: "Request body is not valid JSON." });
    return;
  }
  if (e.type === "entity.too.large") {
    res.status(413).json({ error: "PAYLOAD_TOO_LARGE", message: "Request body is too large." });
    return;
  }
  console.error("[unhandled]", err);
  res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong on the server." });
};
