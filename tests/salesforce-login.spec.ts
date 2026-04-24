import { test, expect } from "@playwright/test";
import { loadSalesforceCredentials } from "../lib/loadCredentials";

test("Salesforce login using Excel credentials only", async ({ page }) => {
  const creds = loadSalesforceCredentials();

  const stillTemplate =
    creds.username === "your.username@example.com" &&
    creds.password === "your_password_here";
  test.skip(
    stillTemplate,
    "Replace URL, Username, and Password in credentials/salesforce-credentials.xlsx",
  );

  await page.goto(creds.url, { waitUntil: "domcontentloaded" });

  await page.locator("#username").fill(creds.username);
  await page.locator("#password").fill(creds.password);
  await page.locator("#Login").click();

  await expect(page.locator("#error")).toBeHidden({ timeout: 120_000 });
});
