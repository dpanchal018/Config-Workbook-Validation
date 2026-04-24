import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  /** Salesforce login + navigation needs more than the default 30s. */
  timeout: 180_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "playwright-report",
        open: "never",
      },
    ],
  ],
  use: {
    headless: !!process.env.CI,
    trace: "on",
    video: "on",
    screenshot: "on",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
