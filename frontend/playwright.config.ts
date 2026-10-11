import { defineConfig } from "@playwright/test";

// Needs the whole stack running: Postgres, Redis, the API, the worker and `npm run dev`
// (or `docker compose up`). With no OpenAI key the app uses its offline mocks, which is what this test expects.
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
});
