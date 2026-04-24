import * as fs from "fs";
import * as path from "path";
import type { Page } from "@playwright/test";

/** Wait until Salesforce is past login (Lightning / My Domain home or app shell). */
export async function waitForSalesforceHome(
  page: Page,
  timeout = 120_000,
): Promise<void> {
  await page.waitForFunction(
    () => {
      const href = location.href;
      if (/login\.salesforce\.com|login\.test\.salesforce\.com/i.test(href)) {
        return false;
      }
      return (
        /lightning\.force\.com|one\.salesforce\.com/i.test(href) ||
        /\/lightning\//i.test(href) ||
        (/\.my\.salesforce\.com/i.test(href) &&
          !/\/login(\?|\/|$)/i.test(href) &&
          !/\/secur\/login/i.test(href))
      );
    },
    { timeout },
  );
  await page.waitForLoadState("domcontentloaded");
}

/** Standard Lightning Lead object list view for the current org. */
export function leadListViewUrl(pageUrl: string): string {
  const u = new URL(pageUrl);
  return `${u.origin}/lightning/o/Lead/list`;
}

export async function navigateToLeadList(page: Page): Promise<void> {
  const target = leadListViewUrl(page.url());
  await page.goto(target, { waitUntil: "domcontentloaded" });
}

/** Milliseconds to wait on Home after it loads (settle UI / One.app). */
export function homeSettleMs(): number {
  const n = parseInt(process.env.SF_HOME_SETTLE_MS || "5000", 10);
  return Number.isFinite(n) && n >= 0 ? n : 5000;
}

/** Milliseconds to wait on Lead list after navigation. */
export function leadListSettleMs(): number {
  const n = parseInt(process.env.SF_LEADS_LIST_SETTLE_MS || "4000", 10);
  return Number.isFinite(n) && n >= 0 ? n : 4000;
}

/**
 * Saves a full-page screenshot of the current Lead list view under test-results/.
 */
export async function captureLeadListViewScreenshot(
  page: Page,
  fileName = "lead-list-view.png",
): Promise<string> {
  const outDir = path.join(process.cwd(), "test-results");
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}
