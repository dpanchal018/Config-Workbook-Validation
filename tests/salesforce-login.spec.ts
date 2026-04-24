import { test, expect } from "@playwright/test";
import { loadSalesforceCredentials } from "../lib/loadCredentials";
import { afterPasswordSubmit } from "../lib/salesforceMfa";

test("Salesforce login with password and 6-digit authenticator (TOTP)", async ({
  page,
}) => {
  const creds = loadSalesforceCredentials();

  await page.goto(creds.url, { waitUntil: "domcontentloaded" });

  await page.locator("#username").fill(creds.username);
  await page.locator("#password").fill(creds.password);
  await page.locator("#Login").click();

  await afterPasswordSubmit(page, creds.totpSecret);

  await expect(page.locator("#error")).toHaveCount(0);
});
