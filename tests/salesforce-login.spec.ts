import { test, expect } from "@playwright/test";
import { loadSalesforceCredentials } from "../lib/loadCredentials";

test("Salesforce login using Excel credentials", async ({ page }) => {
  const creds = loadSalesforceCredentials();

  await page.goto(creds.url, { waitUntil: "domcontentloaded" });

  await page.locator("#username").fill(creds.username);
  await page.locator("#password").fill(creds.password);
  await page.locator("#Login").click();

  await expect(page.locator("#error")).toBeHidden({ timeout: 120_000 });
});
