import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests over the real stack: e2e/stack.mjs serves the API from a
 * seeded test database, Vite serves the frontend and proxies /api to it.
 * Tests share that one database, so they run serially; any test that writes
 * puts things back.
 */
const API = "http://127.0.0.1:3100";
const WEB = "http://localhost:5174";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: WEB,
    // Matches the fixture ledger's month bucketing and the app's number format.
    timezoneId: "UTC",
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/stack.mjs",
      url: `${API}/api/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      command: "npm run dev -w frontend -- --port 5174 --strictPort",
      url: WEB,
      env: { API_PROXY_TARGET: API },
      reuseExistingServer: false,
    },
  ],
});
