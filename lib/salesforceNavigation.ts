import * as fs from "fs";
import * as path from "path";
import type { Locator, Page } from "@playwright/test";
import {
  denyGeolocationForCurrentOrigin,
  dismissGeoLocationPopupIfPresent,
} from "./geoLocationPopup";
import {
  dismissOpenPicklistIfVisible,
  picklistTrigger,
  PROCUREMENT_CHANNEL_FIELD,
  PROCUREMENT_SECTOR_FIELD,
} from "./salesforceProcurementPicklists";
import { settleLeadModalForFieldScan } from "./leadCreationModalPart3";

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
    /geolocation|geo\s*-?\s*location|access to\s*geo|know your location|use your location|location permission|wants to know your location|location services/.test(
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

function modalScrollContainer(modal: Locator): Locator {
  return modal.locator(".slds-modal__content").first();
}

async function isProcurementSectorAccessible(modal: Locator): Promise<boolean> {
  const trigger = await picklistTrigger(modal, PROCUREMENT_SECTOR_FIELD);
  return trigger.isVisible({ timeout: 900 }).catch(() => false);
}

async function isProcurementClassificationSectionVisible(modal: Locator): Promise<boolean> {
  return modal
    .getByText(PROCUREMENT_SECTION)
    .first()
    .isVisible({ timeout: 900 })
    .catch(() => false);
}

async function scrollProcurementSectorIntoView(modal: Locator): Promise<void> {
  const trigger = await picklistTrigger(modal, PROCUREMENT_SECTOR_FIELD);
  await trigger.scrollIntoViewIfNeeded({ timeout: 12_000 }).catch(() => {});
}

/**
 * Scrolls the New Lead modal to **Procurement Classification**.
 * Does not set Business Unit, Division, or any other form fields.
 *
 * @returns true when **Sector** picklist is visible and ready for Part 1/2.
 */
export async function scrollLeadModalToProcurementClassification(
  page: Page,
  modal: Locator,
): Promise<boolean> {
  await dismissOpenPicklistIfVisible(page);
  await settleLeadModalForFieldScan(page, modal);
  await expandProcurementSectionIfCollapsed(page, modal);

  if (await isProcurementSectorAccessible(modal)) {
    await scrollProcurementSectorIntoView(modal);
    return true;
  }

  const content = modalScrollContainer(modal);
  const scrollHost =
    (await content.count()) > 0 && (await content.isVisible().catch(() => false))
      ? content
      : modal;

  await scrollHost.evaluate((el: HTMLElement) => {
    el.scrollTop = 0;
  }).catch(() => {});
  await page.waitForTimeout(220);

  for (let step = 0; step < 36; step++) {
    await modal.evaluate((root: Element) => {
      function norm(s: string): string {
        return s.replace(/\s+/g, " ").trim();
      }
      function visit(el: Element): HTMLElement | null {
        if (
          el.matches?.(
            "label, .slds-form-element__label, span.slds-form-element__label, legend, h3, .slds-section__title, button",
          )
        ) {
          const t = norm(el.textContent || "");
          if (
            /^Sector(\*|\s|\(|$)/i.test(t) ||
            /^Procurement Classification(\*|\s|\(|$)/i.test(t)
          ) {
            return el as HTMLElement;
          }
        }
        for (const ch of el.children) {
          const r = visit(ch);
          if (r) return r;
        }
        if (el.shadowRoot) {
          for (const ch of el.shadowRoot.children) {
            if (ch instanceof Element) {
              const r = visit(ch);
              if (r) return r;
            }
          }
        }
        return null;
      }

      const contentEl =
        root.querySelector<HTMLElement>(".slds-modal__content") ||
        (root as HTMLElement);
      const hit = visit(root);
      if (hit) {
        hit.scrollIntoView({ block: "center", inline: "nearest" });
        const tRect = hit.getBoundingClientRect();
        const cRect = contentEl.getBoundingClientRect();
        contentEl.scrollTop +=
          tRect.top - cRect.top - Math.floor(contentEl.clientHeight * 0.22);
        return;
      }
      contentEl.scrollTop += Math.floor(contentEl.clientHeight * 0.72);
    });

    await page.waitForTimeout(380);
    await expandProcurementSectionIfCollapsed(page, modal);
    if (await isProcurementSectorAccessible(modal)) {
      await scrollProcurementSectorIntoView(modal);
      return true;
    }
  }

  await expandProcurementSectionIfCollapsed(page, modal);
  if (await isProcurementSectorAccessible(modal)) {
    await scrollProcurementSectorIntoView(modal);
    return true;
  }

  if (await isProcurementClassificationSectionVisible(modal)) {
    await modal.getByText(PROCUREMENT_SECTION).first().scrollIntoViewIfNeeded().catch(() => {});
    return false;
  }

  return false;
}

async function expandProcurementSectionIfCollapsed(
  page: Page,
  modal: Locator,
): Promise<void> {
  const expandButtons = [
    modal
      .locator('button[aria-expanded="false"]')
      .filter({ hasText: PROCUREMENT_SECTION })
      .first(),
    modal.locator('.slds-section__title-action[aria-expanded="false"]').first(),
    modal.locator('button[aria-expanded="false"]').filter({ hasText: PROCUREMENT_SECTION }).first(),
  ];
  for (const btn of expandButtons) {
    if (await btn.isVisible({ timeout: 1_200 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(500);
      return;
    }
  }
}

/**
 * The "Procurement Classification" block inside the New Lead modal (region, SLDS section, fieldset, or layout section).
 * Prefers a container that includes **Sector** (not just the section title).
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

  const candidates = modal
    .locator(
      ".slds-section, fieldset.slds-form-element, lightning-record-layout-section",
    )
    .filter({ hasText: PROCUREMENT_SECTION });

  const withSector = candidates.filter({ hasText: /^Sector(\*|\s|\(|$)/i });
  const section =
    (await withSector.count()) > 0 ? withSector.first() : candidates.first();

  await section.waitFor({ state: "visible", timeout: 45_000 });
  return section;
}

/**
 * Scroll to Procurement Classification and confirm **Sector** is ready for Part 1 / Part 2.
 * Does not set Business Unit, Division, or run Part 3 validation.
 */
export async function prepareProcurementClassificationForInteraction(
  page: Page,
  modal: Locator,
): Promise<void> {
  const ready = await scrollLeadModalToProcurementClassification(page, modal);
  if (!ready) {
    throw new Error(
      "Sector is not visible after scrolling to Procurement Classification. " +
        "Expand the section if collapsed and confirm the field is on the New Lead layout.",
    );
  }
  const sector = await picklistTrigger(modal, PROCUREMENT_SECTOR_FIELD);
  await sector.waitFor({ state: "visible", timeout: 45_000 });
  await scrollProcurementSectorIntoView(modal);
  await page.waitForTimeout(250);
}

/** Screenshot of the Procurement Classification section only (not the full modal). */
export async function captureProcurementClassificationSectionScreenshot(
  section: Locator,
  fileName = "procurement-classification-section.png",
): Promise<string> {
  const outDir = path.join(process.cwd(), "test-results");
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, fileName);
  const modal = section.page().locator(".slds-modal.slds-fade-in-open").first();
  await scrollLeadModalToProcurementClassification(section.page(), modal).catch(() => {});
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: filePath });
  return filePath;
}
