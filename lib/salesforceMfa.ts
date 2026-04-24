import type { Page } from "@playwright/test";
import { authenticator } from "otplib";

function normalizeTotpSecret(secret: string): string {
  return secret.replace(/\s/g, "").toUpperCase();
}

/** Current 6-digit code for Salesforce Authenticator–style TOTP (same algorithm as Google Authenticator). */
export function generateTotpCode(secret: string): string {
  const normalized = normalizeTotpSecret(secret);
  return authenticator.generate(normalized);
}

function isLoginHost(url: string): boolean {
  return /login\.salesforce\.com|test\.salesforce\.com/i.test(url);
}

async function sessionLooksEstablished(page: Page): Promise<boolean> {
  const url = page.url();
  if (/lightning\.force\.com|\.lightning\.force\.com|one\.salesforce\.com/i.test(url)) {
    return true;
  }
  if (/\.my\.salesforce\.com\//i.test(url) && !/\/login/i.test(url)) {
    return true;
  }
  if (!isLoginHost(url) && /salesforce\.com/i.test(url)) {
    return true;
  }
  return false;
}

async function loginErrorText(page: Page): Promise<string | null> {
  const err = page.locator("#error");
  if (await err.isVisible().catch(() => false)) {
    return err.innerText();
  }
  return null;
}

/**
 * Fills the 6-digit verification field (single input or six boxes) and submits when possible.
 */
export async function fillSixDigitVerification(
  page: Page,
  code: string,
): Promise<void> {
  if (!/^\d{6}$/.test(code)) {
    throw new Error(`Expected a 6-digit code, got: "${code}"`);
  }

  const deadline = Date.now() + 90_000;
  let filled = false;

  while (Date.now() < deadline && !filled) {
    const err = await loginErrorText(page);
    if (err) {
      throw new Error(err);
    }

    const multi = page.locator(
      'input[inputmode="numeric"][maxlength="1"], input[type="tel"][maxlength="1"]',
    );
    if (
      (await multi.count()) >= 6 &&
      (await multi.first().isVisible().catch(() => false))
    ) {
      for (let i = 0; i < 6; i++) {
        await multi.nth(i).fill(code[i]!);
      }
      filled = true;
      break;
    }

    const singles = [
      'input[autocomplete="one-time-code"]',
      "input#tc",
      'input[name="emc"]',
      'input[name="tc"]',
      'input[name="otp"]',
      'input[type="tel"][maxlength="6"]',
      'input[inputmode="numeric"][maxlength="6"]',
    ];

    for (const sel of singles) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) {
        await loc.fill(code);
        filled = true;
        break;
      }
    }

    if (!filled) {
      await page.waitForTimeout(400);
    }
  }

  if (!filled) {
    throw new Error(
      "Verification code field not found within 90s. If MFA is SMS or email only, " +
        "register an Authenticator App in Salesforce and put the Base32 TOTP secret in the " +
        '"TOTP Secret" column of your credentials workbook.',
    );
  }

  const submit = page
    .getByRole("button", { name: /verify|submit|continue/i })
    .first();
  if (await submit.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await submit.click();
  }
}

/**
 * After clicking the main Log In button: waits for MFA challenge or home, generates a fresh TOTP,
 * fills the 6-digit verification UI, submits, then waits until the session leaves the login host.
 */
export async function afterPasswordSubmit(
  page: Page,
  totpSecret: string,
): Promise<void> {
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    const err = await loginErrorText(page);
    if (err) {
      throw new Error(err);
    }

    if (await sessionLooksEstablished(page)) {
      return;
    }

    const multi = page.locator(
      'input[inputmode="numeric"][maxlength="1"], input[type="tel"][maxlength="1"]',
    );
    const multiReady =
      (await multi.count()) >= 6 &&
      (await multi.first().isVisible().catch(() => false));

    const singleReady = await page
      .locator(
        [
          'input[autocomplete="one-time-code"]',
          "input#tc",
          'input[name="emc"]',
          'input[name="tc"]',
          'input[name="otp"]',
          'input[type="tel"][maxlength="6"]',
          'input[inputmode="numeric"][maxlength="6"]',
        ].join(", "),
      )
      .first()
      .isVisible()
      .catch(() => false);

    if (multiReady || singleReady) {
      const code = generateTotpCode(totpSecret);
      await fillSixDigitVerification(page, code);
      await page.waitForFunction(
        () => {
          const u = location.href;
          return (
            /lightning\.force\.com|\.lightning\.force\.com|one\.salesforce\.com/i.test(
              u,
            ) ||
            (/\.my\.salesforce\.com\//i.test(u) && !/\/login/i.test(u)) ||
            (!/login\.salesforce\.com|test\.salesforce\.com/i.test(u) &&
              /salesforce\.com/i.test(u))
          );
        },
        undefined,
        { timeout: 120_000 },
      );
      return;
    }

    await page.waitForTimeout(400);
  }

  throw new Error(
    "Timed out waiting for Salesforce home or MFA verification screen.",
  );
}
