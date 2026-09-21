import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright smoke + a11y (T-037).
 *
 * Prerequisites (local):
 *   docker compose up -d postgres
 *   pnpm db:migrate && pnpm db:seed
 *   pnpm dev   # api :3001, client :3000
 *
 *   pnpm --filter client test:e2e:install   # Chromium (CI / unrestricted networks)
 *   pnpm --filter client test:e2e
 *
 * If Playwright CDN is geo-blocked, use a system browser:
 *   set PLAYWRIGHT_CHANNEL=msedge   # or chrome
 *   pnpm --filter client test:e2e
 *
 * Env:
 *   PLAYWRIGHT_BASE_URL   default http://localhost:3000
 *   E2E_API_URL           default http://localhost:3001 (health gate)
 *   E2E_REQUIRE_STACK=1   fail (do not skip) when API health is down
 *   PLAYWRIGHT_CHANNEL    chrome | msedge | chrome-beta | …
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const channel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // video needs playwright ffmpeg download; keep off for geo-restricted installs
    video: "off",
    ...(channel ? { channel } : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
