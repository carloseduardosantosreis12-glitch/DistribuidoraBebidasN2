import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-secret-with-at-least-32-characters-long",
      SEED_ADMIN_PASSWORD: "TestAdmin123",
      ACCESS_TOKEN_TTL: "15m",
    },
  },
});
