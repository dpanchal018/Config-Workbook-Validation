import { test, expect } from "@playwright/test";
import { loadSalesforceCredentials } from "../lib/loadCredentials";
import {
  captureLeadListViewScreenshot,
  homeSettleMs,
  leadListSettleMs,
  navigateToLeadList,
  waitForSalesforceHome,
} from "../lib/salesforceNavigation";

test("Salesforce login, open Leads list, capture screenshot", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  const creds = loadSalesforceCredentials();

  await page.goto(creds.url, { waitUntil: "domcontentloaded" });

  await page.locator("#username").fill(creds.username);
  await page.locator("#password").fill(creds.password);
  await page.locator("#Login").click();

  await expect(page.locator("#error")).toBeHidden({ timeout: 120_000 });

  await waitForSalesforceHome(page);
  // Lightning keeps long-lived connections; "networkidle" often never fires and burns the test timeout.
  await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => {});
  await page
    .locator(".oneContent, .slds-template__container, #oneAppContainerRoot")
    .first()
    .waitFor({ state: "attached", timeout: 45_000 })
    .catch(() => {});
  await page.waitForTimeout(homeSettleMs());

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
});
