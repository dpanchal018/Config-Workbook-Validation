import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Resolves the combobox / picklist trigger for a field label inside a modal section. */
export function picklistCombobox(
  scope: Locator,
  fieldLabel: string,
): Locator {
  return scope.getByRole("combobox", {
    name: new RegExp(fieldLabel, "i"),
  }).first();
}

export async function picklistTrigger(
  scope: Locator,
  fieldLabel: string,
): Promise<Locator> {
  const labelRe = new RegExp(fieldLabel, "i");

  const byRole = picklistCombobox(scope, fieldLabel);
  if ((await byRole.count()) > 0) {
    return byRole;
  }

  return scope
    .locator("lightning-combobox, lightning-picklist, lightning-base-combobox")
    .filter({ hasText: labelRe })
    .locator('button[role="combobox"], .slds-combobox__input')
    .first();
}

/** Opens the Lightning picklist dropdown and waits for the listbox. */
export async function openPicklistDropdown(
  page: Page,
  scope: Locator,
  fieldLabel: string,
): Promise<void> {
  const trigger = await picklistTrigger(scope, fieldLabel);
  await trigger.waitFor({ state: "visible", timeout: 30_000 });
  await trigger.click();
  await page
    .locator('[role="listbox"]')
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
}

/** Reads option labels from the currently open listbox (anywhere on the page). */
export async function readOpenPicklistOptions(page: Page): Promise<string[]> {
  const listbox = page.locator('[role="listbox"]').first();
  await listbox.waitFor({ state: "visible", timeout: 5_000 });
  const options = listbox.locator('[role="option"]');
  const n = await options.count();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = (await options.nth(i).innerText()).trim().replace(/\s+/g, " ");
    if (t) out.push(t);
  }
  return out;
}

/** Normalizes picklist chip / readonly text for assertions (handles --None--, checkmarks). */
export function normalizePicklistDisplayValue(s: string): string {
  return s
    .replace(/[\u2713\u2714✓✔√\u00A0]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/--\s*none\s*--/gi, "")
    .trim()
    .toLowerCase();
}

function optionTextMatchesCell(text: string, wanted: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  const w = wanted.trim().toLowerCase();
  const stripped = t
    .replace(/^[✓✔√\s]+/u, "")
    .replace(/--\s*none\s*--/gi, "")
    .trim()
    .toLowerCase();
  if (stripped === w) return true;
  return t.toLowerCase() === w;
}

/**
 * Clicks an option in the open listbox. Prefers scanning each [role=option] row
 * (matches Salesforce Lightning visible text); falls back to getByRole("option").
 */
export async function clickPicklistOptionInOpenList(
  page: Page,
  optionLabel: string,
): Promise<void> {
  const listbox = page.locator('[role="listbox"]').first();
  await listbox.waitFor({ state: "visible", timeout: 10_000 });

  const options = listbox.locator('[role="option"]');
  const n = await options.count();
  let clicked = false;
  for (let i = 0; i < n; i++) {
    const opt = options.nth(i);
    const raw = (await opt.innerText()).catch(() => "");
    if (optionTextMatchesCell(raw, optionLabel)) {
      await opt.scrollIntoViewIfNeeded();
      await opt.click();
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    await page
      .getByRole("option", {
        name: new RegExp(`^\\s*${escapeReg(optionLabel)}\\s*$`, "i"),
      })
      .first()
      .click();
  }

  await page
    .locator('[role="listbox"]')
    .first()
    .waitFor({ state: "hidden", timeout: 15_000 })
    .catch(() => {});
  await page.waitForTimeout(500);
}

/** Confirms the picklist shows the expected label after selection (with normalization). */
export async function expectPicklistShowsValue(
  scope: Locator,
  fieldLabel: string,
  expected: string,
): Promise<void> {
  const raw = await readPicklistDisplayedValue(scope, fieldLabel);
  const got = normalizePicklistDisplayValue(raw);
  const want = normalizePicklistDisplayValue(expected);
  if (got !== want) {
    throw new Error(
      `Picklist "${fieldLabel}" must show "${expected}" (normalized "${want}"). ` +
        `Current raw: "${raw}" (normalized "${got}"). Part 1 requires Public on Procurement Sector.`,
    );
  }
}

export async function selectPicklistOption(
  page: Page,
  scope: Locator,
  fieldLabel: string,
  optionLabel: string,
): Promise<void> {
  await openPicklistDropdown(page, scope, fieldLabel);

  const option = page
    .getByRole("option", {
      name: new RegExp(`^\\s*${escapeReg(optionLabel)}\\s*$`, "i"),
    })
    .first();
  await option.waitFor({ state: "visible", timeout: 20_000 });
  await option.click();

  await page
    .locator('[role="listbox"]')
    .first()
    .waitFor({ state: "hidden", timeout: 15_000 })
    .catch(() => {});
  await page.waitForTimeout(500);
}

export async function readPicklistDisplayedValue(
  scope: Locator,
  fieldLabel: string,
): Promise<string> {
  const combo = picklistCombobox(scope, fieldLabel);

  const box = combo.locator(
    "xpath=ancestor::div[contains(@class,'slds-combobox')][1]",
  );
  const displayed = box.locator(".slds-combobox__input-value").first();
  if (await displayed.isVisible().catch(() => false)) {
    return (await displayed.innerText()).trim();
  }

  const inp = combo.locator("input").first();
  const v =
    (await inp.getAttribute("value").catch(() => "")) ||
    (await inp.getAttribute("title").catch(() => ""));
  if (v?.trim()) return v.trim();

  const raw = (await combo.innerText()).catch(() => "");
  return raw.replace(/\s+/g, " ").trim();
}

async function picklistLooksDisabled(combo: Locator): Promise<boolean> {
  if (await combo.isDisabled().catch(() => false)) return true;
  if ((await combo.getAttribute("aria-disabled")) === "true") return true;
  const inp = combo.locator("input").first();
  if ((await inp.count()) > 0 && (await inp.getAttribute("disabled")) !== null) {
    return true;
  }
  const base = combo.locator("xpath=ancestor::lightning-base-combobox[1]").first();
  if ((await base.count()) > 0) {
    const cls = (await base.getAttribute("class")) || "";
    if (cls.includes("slds-is-disabled")) return true;
  }
  return false;
}

async function picklistLooksEnabled(combo: Locator): Promise<boolean> {
  if (await combo.isDisabled().catch(() => false)) return false;
  if ((await combo.getAttribute("aria-disabled")) === "true") return false;
  const inp = combo.locator("input").first();
  if ((await inp.count()) > 0 && (await inp.getAttribute("disabled")) !== null) {
    return false;
  }
  const base = combo.locator("xpath=ancestor::lightning-base-combobox[1]").first();
  if ((await base.count()) > 0) {
    const cls = (await base.getAttribute("class")) || "";
    if (cls.includes("slds-is-disabled")) return false;
  }
  return true;
}

/**
 * Asserts a dependent picklist is not usable yet (greyed / disabled), and logs to the terminal.
 */
export async function assertPicklistDisabledForDependency(
  scope: Locator,
  fieldLabel: string,
  because: string,
  timeout = 15_000,
): Promise<void> {
  const combo = picklistCombobox(scope, fieldLabel);
  await expect
    .poll(async () => picklistLooksDisabled(combo), {
      timeout,
      intervals: [200, 400, 600],
      message: `${fieldLabel} should be disabled (${because})`,
    })
    .toBe(true);
  console.log(`${fieldLabel} -> Disabled (${because})`);
}

/**
 * Asserts a dependent picklist becomes usable after the controlling value is set, and logs to the terminal.
 */
export async function assertPicklistEnabledAfterDependency(
  scope: Locator,
  fieldLabel: string,
  because: string,
  timeout = 45_000,
): Promise<void> {
  const combo = picklistCombobox(scope, fieldLabel);
  await expect
    .poll(async () => picklistLooksEnabled(combo), {
      timeout,
      intervals: [200, 400, 600, 1000],
      message: `${fieldLabel} should become enabled (${because})`,
    })
    .toBe(true);
  await expect(combo).toBeEnabled({ timeout: 5_000 });
  console.log(`${fieldLabel} -> Enabled (${because})`);
}

/** @deprecated use assertPicklistEnabledAfterDependency */
export async function waitForPicklistEnabled(
  scope: Locator,
  fieldLabel: string,
  timeout = 45_000,
): Promise<void> {
  await assertPicklistEnabledAfterDependency(
    scope,
    fieldLabel,
    "dependency satisfied",
    timeout,
  );
}

export type ProcurementRowCheck = {
  field: string;
  uiValue: string;
  expected: string;
  match: boolean;
};

export function logProcurementComparison(rows: ProcurementRowCheck[]): void {
  console.log("\n========== Procurement Classification (UI vs Excel) ==========");
  for (const r of rows) {
    const status = r.match ? "MATCH" : "MISMATCH";
    console.log(
      `${r.field}: UI="${r.uiValue}" | Expected="${r.expected}" | ${status}`,
    );
  }
  console.log("================================================================\n");
}

/** Fixed overlay on the Salesforce page (~12s) mirroring the terminal comparison. */
export async function showProcurementComparisonOnPage(
  page: Page,
  rows: ProcurementRowCheck[],
): Promise<void> {
  const text = rows
    .map((r) => {
      const s = r.match ? "MATCH" : "MISMATCH";
      return `${r.field}\n  UI: ${r.uiValue}\n  Expected: ${r.expected}\n  ${s}`;
    })
    .join("\n\n");

  await page.evaluate((body) => {
    const el = document.createElement("div");
    el.id = "pw-procurement-compare";
    el.setAttribute("data-playwright", "procurement-summary");
    el.style.cssText = [
      "position:fixed",
      "bottom:24px",
      "left:50%",
      "transform:translateX(-50%)",
      "max-width:560px",
      "width:calc(100% - 48px)",
      "z-index:2147483647",
      "background:#0f172a",
      "color:#e2e8f0",
      "padding:16px 20px",
      "font:13px/1.45 system-ui,Segoe UI,sans-serif",
      "border-radius:12px",
      "box-shadow:0 12px 40px rgba(0,0,0,.5)",
      "white-space:pre-line",
      "border:1px solid #334155",
    ].join(";");
    el.textContent = body;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 12_000);
  }, `Procurement Classification — UI vs workbook\n\n${text}`);
}
