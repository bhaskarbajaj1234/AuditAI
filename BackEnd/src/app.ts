import cors from "cors";
import express from "express";
import helmet from "helmet";
import { corsOrigins } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import reviewRoutes from "./routes/review.routes.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1); // behind a platform proxy (Vercel/Render): rate limiting needs the real client IP
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json({ limit: "1mb" })); // hard cap; the exact character limit is enforced by Zod

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/api", reviewRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
