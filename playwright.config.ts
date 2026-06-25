import * as path from "path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright writes traces/videos under outputDir. Repos in OneDrive (or other sync)
 * often cause EBUSY when those files are locked during flush. Use a local path on Windows
 * unless PLAYWRIGHT_OUTPUT_DIR is set. App code may still write e.g. part3-jira-bugs.txt under cwd/test-results.
 */
function resolveOutputDir(): string {
  if (process.env.PLAYWRIGHT_OUTPUT_DIR) {
    return process.env.PLAYWRIGHT_OUTPUT_DIR;
  }
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(
      process.env.LOCALAPPDATA,
      "PlaywrightOutput",
      "ProcurementClassification",
      "test-results",
    );
  }
  return path.join(process.cwd(), "test-results");
}

/** Full trace every run (heavy). Default avoids EBUSY + aligns with typical local workflow. */
const fullTraceOn =
  process.env.PW_TRACE_ALL === "1" || process.env.PW_TRACE_ALL === "true";

/**
 * Screen recording (video): `on` by default so runs are always captured under outputDir.
 * Set `PW_VIDEO=off` to disable, or `PW_VIDEO=retain-on-failure` to save only when a test fails.
 */
function resolveVideo(): "on" | "off" | "retain-on-failure" {
  const v = (process.env.PW_VIDEO ?? "").trim().toLowerCase();
  if (v === "off" || v === "0" || v === "false") return "off";
  if (v === "retain-on-failure" || v === "retain") return "retain-on-failure";
  return "on";
}

/** Part 3 BU×Portfolio matrix + procurement + Field Layout fill routinely exceeds 3 minutes. */
function testTimeoutMs(): number {
  const n = parseInt(process.env.PW_TEST_TIMEOUT_MS ?? "900000", 10);
  return Number.isFinite(n) && n >= 120_000 ? n : 900_000;
}

export default defineConfig({
  testDir: "./tests",
  outputDir: resolveOutputDir(),
  /** Override with `PW_TEST_TIMEOUT_MS` (default 900000 = 15m). */
  timeout: testTimeoutMs(),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list", { printSteps: true }],
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
    trace: fullTraceOn ? "on" : "retain-on-failure",
    video: resolveVideo(),
    screenshot: "on",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
