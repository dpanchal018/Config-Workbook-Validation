import * as fs from "fs";
import * as path from "path";
import type { Locator, Page } from "@playwright/test";
import {
  denyGeolocationForCurrentOrigin,
  dismissGeoLocationPopupIfPresent,
} from "./geoLocationPopup";

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
  await denyGeolocationForCurrentOrigin(page);

  const listRegion = page
    .locator(".listViewManager, .slds-page-header, .oneContent")
    .first();
  const scoped = listRegion.getByRole("button", { name: /^New$/i }).first();
  if (await scoped.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await scoped.click();
  } else {
    const titleNew = page.locator('button[title="New"], a[title="New"]').first();
    if (await titleNew.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await titleNew.click();
    } else {
      await page.getByRole("button", { name: /^New$/i }).first().click();
    }
  }

  await denyGeolocationForCurrentOrigin(page);
  await dismissGeoLocationPopupIfPresent(page);
}

/**
 * Geolocation permission modals often share `.slds-modal`; this avoids treating them as the Lead form.
 * Lead copy may live in shadow DOM, so we also treat typical Lead field labels as "leadish".
 */
function modalInnerTextLooksGeoOnly(text: string): boolean {
  const t = text.toLowerCase();
  const geoish =
    /geolocation|geo-?location|access to\s*geo|know your location|use your location|location permission|wants to know your location/.test(
      t,
    );
  const leadish =
    /\bnew\s+lead\b/.test(t) ||
    /\blast name\b/.test(t) ||
    /\bcompany\b/.test(t) ||
    /procurement classification/.test(t);
  return geoish && !leadish;
}

async function returnModalContainer(outer: Locator): Promise<Locator> {
  const inner = outer.locator(".slds-modal__container").first();
  if (await inner.isVisible().catch(() => false)) {
    return inner;
  }
  return outer;
}

/**
 * Waits for the Lightning "New Lead" modal (SLDS modal or dialog role).
 * Returns the locator to screenshot (modal container).
 *
 * Note: requiring `hasText: /new lead/i` on the outer `.slds-modal` often fails because Lightning
 * puts the title inside shadow roots — the modal is visible but that filter never matches. Prefer
 * accessible name / heading / Lead-field heuristics, then the first open SLDS modal.
 */
export async function waitForNewLeadModal(page: Page): Promise<Locator> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    await dismissGeoLocationPopupIfPresent(page, 8_000);

    const namedDialog = page
      .getByRole("dialog", { name: /\bnew\s+lead\b/i })
      .first();
    if (await namedDialog.isVisible().catch(() => false)) {
      return returnModalContainer(namedDialog);
    }

    const withHeading = page
      .locator(".slds-modal.slds-fade-in-open")
      .filter({ has: page.getByRole("heading", { name: /\bnew\s+lead\b/i }) })
      .first();
    if (await withHeading.isVisible().catch(() => false)) {
      return returnModalContainer(withHeading);
    }

    const withLeadFields = page
      .locator(".slds-modal.slds-fade-in-open")
      .filter({
        has: page
          .getByLabel(/\blast name\b/i)
          .or(page.getByLabel(/\bcompany\b/i))
          .or(page.getByPlaceholder(/\blast name\b/i)),
      })
      .first();
    if (await withLeadFields.isVisible().catch(() => false)) {
      return returnModalContainer(withLeadFields);
    }

    const outer = page.locator(".slds-modal.slds-fade-in-open").first();
    if (await outer.isVisible().catch(() => false)) {
      const blob = await outer.innerText().catch(() => "");
      if (modalInnerTextLooksGeoOnly(blob)) {
        await dismissGeoLocationPopupIfPresent(page, 4_000);
        await page.waitForTimeout(250);
        continue;
      }
      return returnModalContainer(outer);
    }

    const dialog = page.getByRole("dialog").first();
    if (await dialog.isVisible().catch(() => false)) {
      const blob = await dialog.innerText().catch(() => "");
      if (!modalInnerTextLooksGeoOnly(blob)) {
        return returnModalContainer(dialog);
      }
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
 * The "Procurement Classification" block inside the New Lead modal (region, SLDS section, fieldset, or layout section).
 */
export async function procurementClassificationSection(
  modal: Locator,
): Promise<Locator> {
  const byRegion = modal
    .getByRole("region", { name: PROCUREMENT_SECTION })
    .first();
  if (await byRegion.isVisible({ timeout: 5_000 }).catch(() => false)) {
    return byRegion;
  }

  const section = modal
    .locator(
      ".slds-section, fieldset.slds-form-element, lightning-record-layout-section",
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
