import { expect } from "@playwright/test";
import { isProcurementTestVerbose } from "./procurementTestLog";
import type { Locator, Page } from "@playwright/test";

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolves the combobox for a field label inside a modal section.
 * Prefers the SLDS / lightning-input-field row whose label matches exactly — so
 * "Procurement Channel" never binds to the "Procurement Sector" control when Lightning
 * tweaks accessible names or document order (common cause of flaky `.first()` on role alone).
 */
export function picklistCombobox(scope: Locator, fieldLabel: string): Locator {
  const page = scope.page();
  const labelLine = new RegExp(
    `^\\s*${escapeReg(fieldLabel)}\\s*(\\*|\\(Required\\)|\\(required\\))?$`,
    "i",
  );

  const byFormRow = scope
    .locator(".slds-form-element, lightning-input-field")
    .filter({
      has: page
        .locator(
          "label, .slds-form-element__label, span.slds-form-element__label, legend",
        )
        .filter({ hasText: labelLine }),
    })
    .first()
    .getByRole("combobox")
    .first();

  const labelRe = new RegExp(escapeReg(fieldLabel), "i");
  const byRole = scope.getByRole("combobox", { name: labelRe }).first();

  const fallback = scope
    .locator("lightning-combobox, lightning-picklist, lightning-base-combobox")
    .filter({ hasText: labelRe })
    .locator('button[role="combobox"], .slds-combobox__input')
    .first();

  return byFormRow.or(byRole).or(fallback);
}

export async function picklistTrigger(
  scope: Locator,
  fieldLabel: string,
): Promise<Locator> {
  return picklistCombobox(scope, fieldLabel);
}

/**
 * Resolves the listbox opened by a combobox click. Using `page.locator('[role=listbox]').first()`
 * is wrong because other picklists (e.g. Salutation) stay in the DOM hidden and sort first.
 */
async function listboxForOpenedPicklist(
  page: Page,
  trigger: Locator,
  fieldLabel: string,
): Promise<Locator> {
  const deadline = Date.now() + 3_000;
  let controlsId: string | null = null;

  while (Date.now() < deadline) {
    let raw =
      ((await trigger.getAttribute("aria-controls")) ?? "").trim() || null;
    if (!raw) {
      const host = trigger.locator(
        'xpath=ancestor::*[contains(@class,"slds-combobox") or self::lightning-base-combobox or self::lightning-combobox][1]',
      );
      const withAttr = host
        .locator(
          'input[aria-controls], button[aria-controls], input.slds-combobox__input, button[role="combobox"]',
        )
        .first();
      if ((await withAttr.count()) > 0) {
        raw =
          ((await withAttr.getAttribute("aria-controls")) ?? "").trim() ||
          null;
      }
    }
    if (raw) {
      controlsId = raw.split(/\s+/)[0] ?? raw;
      break;
    }
    await page.waitForTimeout(40);
  }

  if (controlsId) {
    if (/^[\w.-]+$/.test(controlsId)) {
      return page.locator(`[role="listbox"]#${controlsId}`);
    }
    return page.locator(
      `[role="listbox"][id="${controlsId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`,
    );
  }

  return page.getByRole("listbox", {
    name: new RegExp(escapeReg(fieldLabel), "i"),
  });
}

/** Opens the Lightning picklist dropdown and waits for that field's listbox. */
export async function openPicklistDropdown(
  page: Page,
  scope: Locator,
  fieldLabel: string,
): Promise<Locator> {
  const trigger = await picklistTrigger(scope, fieldLabel);
  await trigger.waitFor({ state: "visible", timeout: 30_000 });
  await trigger.click();
  const listbox = await listboxForOpenedPicklist(page, trigger, fieldLabel);
  await listbox.waitFor({ state: "visible", timeout: 15_000 });
  return listbox;
}

/** Reads option labels from the listbox returned by {@link openPicklistDropdown}. */
export async function readOpenPicklistOptions(listbox: Locator): Promise<string[]> {
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

/** Collapses label to letters/digits so "Non-NUPCO", "Non NUPCO", and "NON NUPCO" match. */
export function picklistOptionMatchKey(s: string): string {
  return normalizePicklistDisplayValue(s).replace(/[^a-z0-9]/g, "");
}

/** True when normalized text or alphanumeric keys match (hyphen vs space in picklists). */
export function picklistDisplayValuesEquivalent(a: string, b: string): boolean {
  const na = normalizePicklistDisplayValue(a);
  const nb = normalizePicklistDisplayValue(b);
  if (na === nb) return true;
  const ka = picklistOptionMatchKey(a);
  const kb = picklistOptionMatchKey(b);
  return ka.length > 0 && kb.length > 0 && ka === kb;
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
  if (t.toLowerCase() === w) return true;
  const tk = picklistOptionMatchKey(text);
  const wk = picklistOptionMatchKey(wanted);
  return tk.length > 0 && wk.length > 0 && tk === wk;
}

/** Regex for option accessible name when UI uses spaces vs hyphens (e.g. Non-NUPCO). */
function optionRoleNamePattern(optionLabel: string): RegExp {
  const tokens = optionLabel.split(/[\s\-–—]+/).filter(Boolean);
  if (tokens.length === 0) {
    return new RegExp(`^\\s*${escapeReg(optionLabel)}\\s*$`, "i");
  }
  return new RegExp(
    `^\\s*${tokens.map(escapeReg).join("[\\s\\-–—]*")}\\s*$`,
    "i",
  );
}

/** Substring-style match for option row text (Lightning often exposes labels differently than aria-name). */
function optionRowHasTextPattern(optionLabel: string): RegExp {
  const tokens = optionLabel.split(/[\s\-–—]+/).filter(Boolean);
  if (tokens.length === 0) return new RegExp(escapeReg(optionLabel), "i");
  return new RegExp(tokens.map(escapeReg).join("[\\s\\-–—\\u00A0]*"), "i");
}

/**
 * Clicks an option in the open listbox. Prefers `[role=option]` + `hasText` (Lightning-friendly),
 * then scans rows, then getByRole("option") with a flexible name pattern.
 */
export async function clickPicklistOptionInOpenList(
  listbox: Locator,
  optionLabel: string,
): Promise<void> {
  const page = listbox.page();
  await listbox.waitFor({ state: "visible", timeout: 10_000 });

  const tryCloseListbox = async (): Promise<void> => {
    await listbox
      .waitFor({ state: "hidden", timeout: 15_000 })
      .catch(() => {});
    await page.waitForTimeout(500);
  };

  const textPat = optionRowHasTextPattern(optionLabel);
  const byRowText = listbox
    .locator('[role="option"]')
    .filter({ hasText: textPat })
    .first();
  if (await byRowText.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await byRowText.scrollIntoViewIfNeeded();
    await byRowText.click({ force: true, timeout: 15_000 });
    await tryCloseListbox();
    if (!(await listbox.isVisible().catch(() => false))) return;
  }

  const options = listbox.locator('[role="option"]');
  const n = await options.count();
  let clicked = false;
  for (let i = 0; i < n; i++) {
    const opt = options.nth(i);
    const raw = await opt.innerText().catch(() => "");
    if (optionTextMatchesCell(raw, optionLabel)) {
      await opt.scrollIntoViewIfNeeded();
      await opt.click({ force: true, timeout: 15_000 });
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    const opt = listbox
      .getByRole("option", { name: optionRoleNamePattern(optionLabel) })
      .first();
    await opt.scrollIntoViewIfNeeded();
    await opt.click({ force: true, timeout: 15_000 });
  }

  await tryCloseListbox();
}

/** Confirms the picklist shows the expected label after selection (with normalization). */
export async function expectPicklistShowsValue(
  scope: Locator,
  fieldLabel: string,
  expected: string,
): Promise<void> {
  const raw = await readPicklistDisplayedValue(scope, fieldLabel);
  if (!picklistDisplayValuesEquivalent(raw, expected)) {
    const got = normalizePicklistDisplayValue(raw);
    const want = normalizePicklistDisplayValue(expected);
    throw new Error(
      `Picklist "${fieldLabel}" must show "${expected}" (normalized "${want}"). ` +
        `Current raw: "${raw}" (normalized "${got}").`,
    );
  }
}

export async function selectPicklistOption(
  page: Page,
  scope: Locator,
  fieldLabel: string,
  optionLabel: string,
): Promise<void> {
  const listbox = await openPicklistDropdown(page, scope, fieldLabel);

  const option = listbox
    .getByRole("option", {
      name: new RegExp(`^\\s*${escapeReg(optionLabel)}\\s*$`, "i"),
    })
    .first();
  await option.waitFor({ state: "visible", timeout: 20_000 });
  await option.click();

  await listbox
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

  const raw = await combo.innerText().catch(() => "");
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
  if (isProcurementTestVerbose()) {
    console.log(`${fieldLabel} -> Disabled (${because})`);
  }
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
  if (isProcurementTestVerbose()) {
    console.log(`${fieldLabel} -> Enabled (${because})`);
  }
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
