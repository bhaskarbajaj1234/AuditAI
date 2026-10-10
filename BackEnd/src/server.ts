import { env } from "./config/env.js";
import { createApp } from "./app.js";

const app = createApp();

// On serverless platforms (Vercel) the platform calls the exported app; locally we listen on a port.
if (!process.env.VERCEL) {
  const server = app.listen(env.PORT, () => {
    console.log(`AuditAI API on http://localhost:${env.PORT} (provider: ${env.LLM_PROVIDER})`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

export default app;
