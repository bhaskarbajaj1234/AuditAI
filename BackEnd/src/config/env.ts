import "dotenv/config";
import { z, type ZodIssue } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(5000),
    LLM_PROVIDER: z.enum(["gemini", "mock"]).default("gemini"),
    GOOGLE_GEMINI_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
    CORS_ORIGINS: z.string().default("http://localhost:5173"),
    MAX_CODE_CHARS: z.coerce.number().int().positive().default(200_000),
    CHUNK_TOKEN_BUDGET: z.coerce.number().int().min(200).default(3000),
    CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(500),
    CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    MOCK_DELAY_MS: z.coerce.number().int().min(0).default(5),
    METRICS_TOKEN: z.string().optional(),
  })
  .refine((v: Record<string, any>) => v.LLM_PROVIDER !== "gemini" || Boolean(v.GOOGLE_GEMINI_KEY), {
    message: "GOOGLE_GEMINI_KEY is required when LLM_PROVIDER=gemini (or set LLM_PROVIDER=mock)",
    path: ["GOOGLE_GEMINI_KEY"],
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i: ZodIssue) => `  - ${i.path.join(".") || "env"}: ${i.message}`);
  throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
}

export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGINS.split(",").map((s: string) => s.trim()).filter(Boolean);