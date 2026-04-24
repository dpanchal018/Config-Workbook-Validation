import { test, expect } from "@playwright/test";
import { loadSalesforceCredentials } from "../lib/loadCredentials";
import { stepPassed } from "../lib/stepStatus";
import {
  captureLeadListViewScreenshot,
  captureNewLeadModalScreenshot,
  captureProcurementClassificationSectionScreenshot,
  clickNewLeadButton,
  homeSettleMs,
  leadListSettleMs,
  navigateToLeadList,
  procurementClassificationSection,
  waitForNewLeadModal,
  waitForSalesforceHome,
} from "../lib/salesforceNavigation";

test("Salesforce login, Leads, New Lead modal, Procurement Classification section", async ({
  page,
}, testInfo) => {
  const creds = loadSalesforceCredentials();

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
    const modal = await waitForNewLeadModal(page);
    await page.waitForTimeout(800);

    const modalShotPath = await captureNewLeadModalScreenshot(modal);
    await testInfo.attach("new-lead-modal.png", {
      path: modalShotPath,
      contentType: "image/png",
    });
    stepPassed("New Lead modal");
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
});
