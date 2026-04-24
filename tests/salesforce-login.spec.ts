import { test, expect } from "@playwright/test";
import { loadSalesforceCredentials } from "../lib/loadCredentials";
import { afterPasswordSubmit } from "../lib/salesforceMfa";

test("Salesforce login with password and 6-digit authenticator (TOTP)", async ({
  page,
}) => {
  const creds = loadSalesforceCredentials();

  const stillTemplate =
    creds.username === "your.username@example.com" &&
    creds.password === "your_password_here";
  const stillTotpPlaceholder =
    creds.totpSecret === "BASE32_SECRET_FROM_AUTHENTICATOR_APP_SETUP" ||
    !creds.totpSecret.trim();
  test.skip(
    stillTemplate || stillTotpPlaceholder,
    "Fill credentials/salesforce-credentials.xlsx: URL, Username, Password, and TOTP Secret (from Authenticator App registration in Salesforce).",
  );

  await page.goto(creds.url, { waitUntil: "domcontentloaded" });

  await page.locator("#username").fill(creds.username);
  await page.locator("#password").fill(creds.password);
  await page.locator("#Login").click();

  await afterPasswordSubmit(page, creds.totpSecret);

  await expect(page.locator("#error")).toHaveCount(0);
});
