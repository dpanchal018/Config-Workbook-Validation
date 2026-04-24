import * as fs from "fs";
import * as path from "path";
import type { Locator, Page } from "@playwright/test";

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

/**
 * Standard Lightning Lead list URL. Maps *.my.salesforce.com → *.lightning.force.com
 * because list views are usually served from the Lightning host.
 */
export function leadListViewUrl(pageUrl: string): string {
  const u = new URL(pageUrl);
  let { hostname, protocol } = u;
  const h = hostname.toLowerCase();

  if (h.endsWith(".sandbox.my.salesforce.com")) {
    hostname = hostname.replace(
      /\.sandbox\.my\.salesforce\.com$/i,
      ".sandbox.lightning.force.com",
    );
  } else if (h.endsWith(".my.salesforce.com")) {
    hostname = hostname.replace(
      /\.my\.salesforce\.com$/i,
      ".lightning.force.com",
    );
  }

  return `${protocol}//${hostname}/lightning/o/Lead/list`;
}

export async function navigateToLeadList(page: Page): Promise<void> {
  const target = leadListViewUrl(page.url());
  await page.goto(target, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
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

/** Clicks the standard List View "New" action to start creating a Lead. */
export async function clickNewLeadButton(page: Page): Promise<void> {
  const listRegion = page
    .locator(".listViewManager, .slds-page-header, .oneContent")
    .first();
  const scoped = listRegion.getByRole("button", { name: /^New$/i }).first();
  if (await scoped.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await scoped.click();
    return;
  }

  const titleNew = page.locator('button[title="New"], a[title="New"]').first();
  if (await titleNew.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await titleNew.click();
    return;
  }

  await page.getByRole("button", { name: /^New$/i }).first().click();
}

/**
 * Waits for the Lightning "New Lead" modal (SLDS modal or dialog role).
 * Returns the locator to screenshot (modal container).
 */
export async function waitForNewLeadModal(page: Page): Promise<Locator> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const outer = page.locator(".slds-modal.slds-fade-in-open").first();
    if (await outer.isVisible().catch(() => false)) {
      const inner = outer.locator(".slds-modal__container").first();
      if (await inner.isVisible().catch(() => false)) {
        return inner;
      }
      return outer;
    }

    const dialog = page.getByRole("dialog").first();
    if (await dialog.isVisible().catch(() => false)) {
      const inner = dialog.locator(".slds-modal__container").first();
      if (await inner.isVisible().catch(() => false)) {
        return inner;
      }
      return dialog;
    }

    await page.waitForTimeout(250);
  }

  throw new Error("New Lead modal did not open within 45s");
}

/** Saves a screenshot of the New Lead modal under test-results/. */
export async function captureNewLeadModalScreenshot(
  modal: Locator,
  fileName = "new-lead-modal.png",
): Promise<string> {
  const outDir = path.join(process.cwd(), "test-results");
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, fileName);
  await modal.screenshot({ path: filePath });
  return filePath;
}

const PROCUREMENT_SECTION = /Procurement Classification/i;

/**
 * The "Procurement Classification" block inside the New Lead modal (SLDS section, fieldset, or layout section).
 */
export async function procurementClassificationSection(
  modal: Locator,
): Promise<Locator> {
  const section = modal
    .locator(
      ".slds-section, fieldset.slds-form-element, lightning-record-layout-section, .slds-card",
    )
    .filter({ hasText: PROCUREMENT_SECTION })
    .first();

  await section.waitFor({ state: "visible", timeout: 45_000 });
  return section;
}

/** Screenshot of the Procurement Classification section only (not the full modal). */
export async function captureProcurementClassificationSectionScreenshot(
  section: Locator,
  fileName = "procurement-classification-section.png",
): Promise<string> {
  const outDir = path.join(process.cwd(), "test-results");
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, fileName);
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: filePath });
  return filePath;
}
