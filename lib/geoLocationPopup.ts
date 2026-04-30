import type { BrowserContext, Page } from "@playwright/test";

type ChromiumPermissionSession = Awaited<ReturnType<BrowserContext["newCDPSession"]>>;

/** Matches browser / in-app copy for geolocation permission prompts (not generic "Location" fields). */
const GEO_TEXT =
  /access to\s+geo|geolocation|geo\s*-?\s*location|know your location|use your location|wants to know your location|location permission|allow.*location|block.*location|location services/i;

const pagesWithGeoHandler = new WeakSet<Page>();
/** Init script + navigation listener: only register once per {@link Page}. */
const pagesWithNativeGeoBlock = new WeakSet<Page>();

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
function salesforcePairedOrigins(pageUrl: string): string[] {
  try {
    const u = new URL(pageUrl);
    if (!/^https?:/i.test(u.href)) return [];
    const origins = new Set<string>([u.origin]);
    const h = u.hostname.toLowerCase();
    if (h.endsWith(".sandbox.lightning.force.com")) {
      const base = h.replace(/\.sandbox\.lightning\.force\.com$/i, "");
      origins.add(`${u.protocol}//${base}.sandbox.my.salesforce.com`);
    } else if (h.endsWith(".lightning.force.com")) {
      const base = h.replace(/\.lightning\.force\.com$/i, "");
      origins.add(`${u.protocol}//${base}.my.salesforce.com`);
    } else if (h.endsWith(".sandbox.my.salesforce.com")) {
      const base = h.replace(/\.sandbox\.my\.salesforce\.com$/i, "");
      origins.add(`${u.protocol}//${base}.sandbox.lightning.force.com`);
    } else if (h.endsWith(".my.salesforce.com")) {
      const base = h.replace(/\.my\.salesforce\.com$/i, "");
      origins.add(`${u.protocol}//${base}.lightning.force.com`);
    }
    return [...origins];
  } catch {
    return [];
  }
}

async function cdpSetGeolocationDenied(
  page: Page,
  origins: string[],
): Promise<void> {
  const send = async (session: ChromiumPermissionSession) => {
    for (const origin of origins) {
      try {
        await session.send("Browser.setPermission", {
          permission: { name: "geolocation" },
          setting: "denied",
          origin,
        });
      } catch {
        // One origin may fail; continue with others.
      }
    }
  };

  const browser = page.context().browser();
  if (browser) {
    try {
      const browserSession = await browser.newBrowserCDPSession();
      try {
        await send(browserSession as unknown as ChromiumPermissionSession);
      } finally {
        await browserSession.detach().catch(() => {});
      }
    } catch {
      // Browser-level CDP unavailable; try page session below.
    }
  }

  try {
    const pageSession = await page.context().newCDPSession(page);
    await send(pageSession);
  } catch {
    // Page CDP may be unavailable; init-script stub still applies.
  }
}

export async function denyGeolocationForCurrentOrigin(page: Page): Promise<void> {
  const href = page.url();
  if (!href || !/^https?:/i.test(href)) return;
  const origins = salesforcePairedOrigins(href);
  if (origins.length === 0) return;
  await cdpSetGeolocationDenied(page, origins);
}

/**
 * Chromium shows a **browser-native** "Know your location" sheet that Playwright cannot
 * click (it is not in the DOM). Stubbing Geolocation before page scripts run avoids the
 * prompt; CDP deny is kept as a backup.
 */
async function installNativeGeolocationNeverAllow(page: Page): Promise<void> {
  if (pagesWithNativeGeoBlock.has(page)) return;
  pagesWithNativeGeoBlock.add(page);

  await page.context().addInitScript(() => {
    try {
      const g = navigator.geolocation;
      if (!g) return;
      const denied = (error?: PositionErrorCallback | null) => {
        if (typeof error === "function") {
          error({
            code: 1,
            message: "User denied Geolocation",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError);
        }
      };
      g.getCurrentPosition = function (_success, error) {
        denied(error);
      };
      g.watchPosition = function (_success, error) {
        denied(error);
        return 0;
      };
    } catch {
      /* ignore */
    }
  });

  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const url = frame.url();
    if (!url || !/^https?:/i.test(url)) return;
    void denyGeolocationForCurrentOrigin(page);
  });
}

async function tryDismissGeoDomOnce(page: Page): Promise<boolean> {
  const dlg = geoDialogLocator(page);
  if (!(await dlg.isVisible().catch(() => false))) return false;

  const neverAllowControl = dlg
    .getByRole("button", { name: /never allow/i })
    .or(dlg.getByRole("link", { name: /never allow/i }))
    .or(dlg.getByText(/^never allow$/i))
    .first();
  if (await neverAllowControl.isVisible().catch(() => false)) {
    await neverAllowControl.click({ timeout: 5_000 }).catch(() => {});
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
    name: /close|block|not now|no thanks|dismiss|got it|don'?t allow|never allow/i,
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
 * Blocks native Chromium geolocation prompts (not in the DOM) and dismisses in-page geo UI.
 * Call once at the start of a test, **before** the first {@link Page.goto}.
 */
export async function registerGeoLocationAutoDismiss(page: Page): Promise<void> {
  await installNativeGeolocationNeverAllow(page);

  if (pagesWithGeoHandler.has(page)) return;
  pagesWithGeoHandler.add(page);

  await page.addLocatorHandler(geoDialogLocator(page), async () => {
    await tryDismissGeoDomOnce(page);
  });
}
