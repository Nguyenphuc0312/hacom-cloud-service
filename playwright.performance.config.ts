import baseConfig from "./playwright.config";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  ...baseConfig,
  testDir: "./e2e/performance",
  testMatch: "**/*.spec.ts",
  reporter: process.env.CI ? "github" : "list",
});
