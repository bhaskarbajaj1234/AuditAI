import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      LLM_PROVIDER: "mock",
      MOCK_DELAY_MS: "0",
      RATE_LIMIT_PER_MINUTE: "1000",
    },
  },
});
