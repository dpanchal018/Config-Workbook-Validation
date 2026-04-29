import type { Page } from "@playwright/test";

/** Matches browser / in-app copy for geolocation permission prompts (not generic "Location" fields). */
const GEO_TEXT =
  /access to\s+geo|geolocation|know your location|use your location|wants to know your location|location permission|allow.*location|block.*location/i;

const pagesWithGeoHandler = new WeakSet<Page>();

function geoDialogLocator(page: Page) {
  return page
    .locator(
      '[role="dialog"], [role="alertdialog"], .slds-modal.slds-fade-in-open',
    )
    .filter({ hasText: GEO_TEXT })
    .first();
}

async function isGeoPopupVisible(page: Page): Promise<boolean> {
  return geoDialogLocator(page).isVisible().catch(() => false);
}

/**
 * Denies geolocation for the current page origin via CDP so Chromium does not show the
 * native "know your location" permission bar when the app requests geolocation.
 */
export async function denyGeolocationForCurrentOrigin(page: Page): Promise<void> {
  let origin: string;
  try {
    const href = page.url();
    if (!href || !/^https?:/i.test(href)) return;
    origin = new URL(href).origin;
  } catch {
    return;
  }
  try {
    const session = await page.context().newCDPSession(page);
    await session.send("Browser.setPermission", {
      permission: { name: "geolocation" },
      setting: "denied",
      origin,
    });
  } catch {
    // CDP may be unavailable or the session shape may differ; DOM dismissal still applies.
  }
}

async function tryDismissGeoDomOnce(page: Page): Promise<boolean> {
  const dlg = geoDialogLocator(page);
  if (!(await dlg.isVisible().catch(() => false))) return false;

  const neverAllow = dlg.getByRole("button", { name: /never allow/i }).first();
  if (await neverAllow.isVisible().catch(() => false)) {
    await neverAllow.click({ timeout: 3_000 }).catch(() => {});
    return true;
  }

  const dismissButtons = dlg.getByRole("button", {
    name: /^(Close|×|Block|Not now|No thanks|Dismiss|OK|Got it)$/i,
  });
  if (await dismissButtons.first().isVisible().catch(() => false)) {
    await dismissButtons.first().click({ timeout: 3_000 }).catch(() => {});
    return true;
  }

  const loose = dlg.getByRole("button", {
    name: /close|block|not now|no thanks|dismiss|got it|don'?t allow/i,
  });
  if (await loose.first().isVisible().catch(() => false)) {
    await loose.first().click({ timeout: 3_000 }).catch(() => {});
    return true;
  }

  const sldsClose = dlg.locator("button.slds-modal__close").first();
  if (await sldsClose.isVisible().catch(() => false)) {
    await sldsClose.click({ timeout: 3_000 }).catch(() => {});
    return true;
  }

  await page.keyboard.press("Escape");
  return true;
}

/**
 * Closes in-page geolocation permission UI if it appears (polls up to timeoutMs while visible).
 * Returns immediately when no matching UI is shown.
 */
export async function dismissGeoLocationPopupIfPresent(
  page: Page,
  timeoutMs = 12_000,
): Promise<void> {
  if (!(await isGeoPopupVisible(page))) return;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await tryDismissGeoDomOnce(page);
    await page.waitForTimeout(150);
    if (!(await isGeoPopupVisible(page))) return;
  }
}

/**
 * Registers a Playwright locator handler so a geolocation dialog is dismissed as soon as it becomes visible.
 * Safe to call once per page at the start of a test.
 */
export async function registerGeoLocationAutoDismiss(page: Page): Promise<void> {
  if (pagesWithGeoHandler.has(page)) return;
  pagesWithGeoHandler.add(page);

  await page.addLocatorHandler(geoDialogLocator(page), async () => {
    await tryDismissGeoDomOnce(page);
  });
}
