import { defineConfig, devices } from "@playwright/test";

/**
 * Phase 5 smoke E2E configuration.
 *
 * The repository previously had only a deprecated spec under e2e/ and no
 * Playwright config. Without an explicit testDir Playwright also discovers
 * Vitest *.spec.ts files under src/, which makes the E2E command fail before
 * a browser is started. Keep E2E scope explicit and leave the dev server
 * lifecycle to run-localhosts.ps1/CI.
 */
export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/__deprecated__/**"],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["line"]] : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5100",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
});
