import { expect, test } from "@playwright/test";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { registerGeoLocationAutoDismiss } from "../lib/geoLocationPopup";
import { loadSalesforceCredentials } from "../lib/loadCredentials";
import { runLeadCreationModalPart3 } from "../lib/leadCreationModalPart3";
import { runProcurementClassificationPart1 } from "../lib/procurementClassificationPart1";
import { runProcurementClassificationPart2 } from "../lib/procurementClassificationPart2";
import { stepPassed } from "../lib/stepStatus";
import {
  captureLeadListViewScreenshot,
  captureProcurementClassificationSectionScreenshot,
  clickNewLeadButton,
  homeSettleMs,
  leadListSettleMs,
  navigateToLeadList,
  procurementClassificationSection,
  waitForNewLeadModal,
  waitForSalesforceHome,
} from "../lib/salesforceNavigation";

/**
 * Login → Home → Lead list → **New** — returns the open New Lead modal container.
 */
async function authenticateAndOpenNewLeadModal(
  page: Page,
  testInfo: TestInfo,
): Promise<Locator> {
  const creds = loadSalesforceCredentials();
  await registerGeoLocationAutoDismiss(page);

  await test.step("Login", async () => {
    await page.goto(creds.url, { waitUntil: "domcontentloaded" });
    await page.locator("#username").fill(creds.username);
    await page.locator("#password").fill(creds.password);
    await page.locator("#Login").click();
    await expect(page.locator("#error")).toBeHidden({ timeout: 120_000 });
    stepPassed("Login");
  });

  await test.step("Homepage", async () => {
    await waitForSalesforceHome(page);
    await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => {});
    await page
      .locator(".oneContent, .slds-template__container, #oneAppContainerRoot")
      .first()
      .waitFor({ state: "attached", timeout: 45_000 })
      .catch(() => {});
    await page.waitForTimeout(homeSettleMs());
    stepPassed("Homepage");
  });

  await test.step("Lead List View", async () => {
    await navigateToLeadList(page);
    await expect(page).toHaveURL(/\/lightning\/o\/Lead\/list/i, {
      timeout: 60_000,
    });
    await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(leadListSettleMs());
    await page
      .locator(
        'lightning-datatable, [role="grid"], table.slds-table, .listViewManager, [data-aura-class*="ListView"]',
      )
      .first()
      .waitFor({ state: "visible", timeout: 60_000 })
      .catch(() => {});

    const shotPath = await captureLeadListViewScreenshot(page);
    await testInfo.attach("lead-list-view.png", {
      path: shotPath,
      contentType: "image/png",
    });
    stepPassed("Lead List View");
  });

  await test.step("New Lead modal", async () => {
    await clickNewLeadButton(page);
    await waitForNewLeadModal(page);
    await page.waitForTimeout(800);
    stepPassed("New Lead modal");
  });

  return waitForNewLeadModal(page);
}

/**
 * Part 3 (Excel vs UI audit + Jira bug drafts) → Procurement Classification Part 1 + Part 2.
 * No Save — modal stays open. Jira bugs are pushed after the run via Config+JIRA.bat when credentials are set.
 */
test("Lead — Part 3, Procurement Classification Part 1 and Part 2 (modal, no Save)", async ({
  page,
}, testInfo) => {
  await authenticateAndOpenNewLeadModal(page, testInfo);

  await test.step("Lead Creation Modal — Part 3 (Excel vs UI fields)", async () => {
    const modal = await waitForNewLeadModal(page);
    await page.waitForTimeout(600);
    await runLeadCreationModalPart3(page, modal);
    stepPassed("Lead Creation Modal — Part 3");
  });

  await test.step("Procurement Classification section", async () => {
    const modal = await waitForNewLeadModal(page);
    const section = await procurementClassificationSection(modal);
    const sectionPath =
      await captureProcurementClassificationSectionScreenshot(section);
    await testInfo.attach("procurement-classification-section.png", {
      path: sectionPath,
      contentType: "image/png",
    });
    stepPassed("Procurement Classification section");
  });

  await test.step("Procurement Classification — Part 1", async () => {
    const modal = await waitForNewLeadModal(page);
    await runProcurementClassificationPart1(page, modal);
    stepPassed("Procurement Classification — Part 1");
  });

  await test.step("Procurement Classification — Part 2", async () => {
    const modal = await waitForNewLeadModal(page);
    await runProcurementClassificationPart2(page, modal);
    stepPassed("Procurement Classification — Part 2");
  });

  await test.step("New Lead modal still open (no Save)", async () => {
    const modal = await waitForNewLeadModal(page);
    await expect(modal).toBeVisible({ timeout: 15_000 });
    stepPassed("New Lead modal still open");
  });
});
