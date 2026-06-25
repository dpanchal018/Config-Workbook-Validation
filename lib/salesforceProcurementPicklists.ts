import { expect } from "@playwright/test";
import { isProcurementTestVerbose } from "./procurementTestLog";
import type { Locator, Page } from "@playwright/test";

/** New Lead modal — Procurement Classification picklist labels (Salesforce UI). */
export const PROCUREMENT_SECTOR_FIELD = "Sector";
export const PROCUREMENT_CHANNEL_FIELD = "Channel";
/** Dependent on Business Unit on the New Lead modal. */
export const DIVISION_FIELD = "Division";

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolves the combobox for a field label inside a modal section.
 * Prefers the SLDS / lightning-input-field row whose label matches exactly — so
 * **Channel** never binds to the **Sector** control when Lightning tweaks accessible
 * names or document order (common cause of flaky `.first()` on role alone).
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

  // Single target — avoids strict-mode violations when more than one branch matches.
  return byFormRow.or(byRole).or(fallback).first();
}

/**
 * Picks the first **visible** combobox for `fieldLabel` (skips hidden duplicates from collapsed rows / stale DOM).
 */
export async function picklistTrigger(
  scope: Locator,
  fieldLabel: string,
): Promise<Locator> {
  const page = scope.page();
  const labelLine = new RegExp(
    `^\\s*${escapeReg(fieldLabel)}\\s*(\\*|\\(Required\\)|\\(required\\))?$`,
    "i",
  );
  const labelRe = new RegExp(escapeReg(fieldLabel), "i");
  const nameRe = new RegExp(
    `^\\s*${escapeReg(fieldLabel)}\\s*(\\*|\\(Required\\)|\\(required\\))?\\s*$`,
    "i",
  );

  const formRows = scope
    .locator(".slds-form-element, lightning-input-field")
    .filter({
      has: page
        .locator(
          "label, .slds-form-element__label, span.slds-form-element__label, legend",
        )
        .filter({ hasText: labelLine }),
    });
  const rowCount = await formRows.count();
  for (let i = 0; i < rowCount; i++) {
    const combo = formRows.nth(i).getByRole("combobox").first();
    if (await combo.isVisible({ timeout: 700 }).catch(() => false)) return combo;
  }

  const byRole = scope.getByRole("combobox", { name: nameRe });
  const roleCount = await byRole.count();
  for (let i = 0; i < roleCount; i++) {
    const combo = byRole.nth(i);
    if (await combo.isVisible({ timeout: 700 }).catch(() => false)) return combo;
  }

  const fallbackHosts = scope
    .locator("lightning-combobox, lightning-picklist, lightning-base-combobox")
    .filter({ hasText: labelRe });
  const fbCount = await fallbackHosts.count();
  for (let i = 0; i < fbCount; i++) {
    const combo = fallbackHosts
      .nth(i)
      .locator('button[role="combobox"], .slds-combobox__input')
      .first();
    if (await combo.isVisible({ timeout: 700 }).catch(() => false)) return combo;
  }

  return picklistCombobox(scope, fieldLabel);
}

/**
 * Escape only when a picklist listbox is open — avoids closing the New Lead modal when nothing is open.
 */
export async function dismissOpenPicklistIfVisible(page: Page): Promise<void> {
  const lb = page.locator('[role="listbox"]').first();
  if (await lb.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await lb.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
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

export type OpenPicklistDropdownTimeouts = {
  /** Default 30_000 */
  triggerWaitMs?: number;
  /** Default 15_000 */
  listboxWaitMs?: number;
};

/** Opens the Lightning picklist dropdown and waits for that field's listbox. */
export async function openPicklistDropdown(
  page: Page,
  scope: Locator,
  fieldLabel: string,
  timeouts?: OpenPicklistDropdownTimeouts,
): Promise<Locator> {
  const tw = timeouts?.triggerWaitMs ?? 30_000;
  const lw = timeouts?.listboxWaitMs ?? 15_000;
  await dismissOpenPicklistIfVisible(page);
  const trigger = await picklistTrigger(scope, fieldLabel);
  await trigger.scrollIntoViewIfNeeded({ timeout: tw }).catch(() => {});
  await trigger.waitFor({ state: "visible", timeout: tw });
  await trigger.click();
  const listbox = await listboxForOpenedPicklist(page, trigger, fieldLabel);
  await listbox.waitFor({ state: "visible", timeout: lw });
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

export type PicklistSelectOptions = {
  /** Ms to wait after the listbox closes (default 500). */
  listboxCloseSettleMs?: number;
  /** Ms to wait after {@link selectPicklistOption} finishes (overrides SF_PICKLIST_POST_CLICK_MS). */
  postClickSettleMs?: number;
};

function picklistListboxCloseSettleMs(opts?: PicklistSelectOptions): number {
  if (opts?.listboxCloseSettleMs != null && Number.isFinite(opts.listboxCloseSettleMs)) {
    return Math.max(0, Math.min(opts.listboxCloseSettleMs, 2_500));
  }
  return 500;
}

function picklistPostClickSettleMs(opts?: PicklistSelectOptions): number {
  if (opts?.postClickSettleMs != null && Number.isFinite(opts.postClickSettleMs)) {
    return Math.max(0, Math.min(opts.postClickSettleMs, 2_500));
  }
  const settle = parseInt(process.env.SF_PICKLIST_POST_CLICK_MS ?? "200", 10);
  return Number.isFinite(settle) && settle >= 0 ? Math.min(settle, 2_500) : 200;
}

/**
 * Clicks an option in the open listbox. Prefers `[role=option]` + `hasText` (Lightning-friendly),
 * then scans rows, then getByRole("option") with a flexible name pattern.
 */
export async function clickPicklistOptionInOpenList(
  listbox: Locator,
  optionLabel: string,
  opts?: PicklistSelectOptions,
): Promise<void> {
  const page = listbox.page();
  await listbox.waitFor({ state: "visible", timeout: 10_000 });
  const closeSettleMs = picklistListboxCloseSettleMs(opts);

  const tryCloseListbox = async (): Promise<void> => {
    await listbox
      .waitFor({ state: "hidden", timeout: 15_000 })
      .catch(() => {});
    if (closeSettleMs > 0) await page.waitForTimeout(closeSettleMs);
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
  opts?: PicklistSelectOptions,
): Promise<void> {
  const listbox = await openPicklistDropdown(page, scope, fieldLabel);
  await clickPicklistOptionInOpenList(listbox, optionLabel, opts);

  await listbox
    .waitFor({ state: "hidden", timeout: 15_000 })
    .catch(() => {});
  const settle = picklistPostClickSettleMs(opts);
  if (settle > 0) await page.waitForTimeout(settle);
}

export async function readPicklistDisplayedValue(
  scope: Locator,
  fieldLabel: string,
): Promise<string> {
  const combo = await picklistTrigger(scope, fieldLabel);

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

/**
 * Whether the Lightning combobox host in the event path applies `slds-is-disabled`.
 * Uses composedPath so it works when the trigger lives in shadow DOM (XPath ancestor alone often misses the host).
 */
async function lightningPicklistHostHasDisabledClass(
  combo: Locator,
): Promise<boolean | null> {
  try {
    return await combo.evaluate((el: Element): boolean | null => {
      const seen = new Set<Element>();
      let cur: Element | null = el;
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        const tag = cur.tagName.toLowerCase();
        if (tag === "lightning-base-combobox" || tag === "lightning-combobox") {
          const cls = cur.getAttribute("class") || "";
          return cls.includes("slds-is-disabled");
        }
        if (cur.parentElement) {
          cur = cur.parentElement;
        } else {
          const rn = cur.getRootNode();
          if (rn instanceof ShadowRoot) {
            cur = rn.host as Element;
          } else {
            break;
          }
        }
      }
      return null;
    });
  } catch {
    return null;
  }
}

async function picklistComboAppearsDisabled(combo: Locator): Promise<boolean> {
  const hostDis = await lightningPicklistHostHasDisabledClass(combo);
  if (hostDis === true) return true;

  if (await combo.isDisabled().catch(() => false)) return true;
  if ((await combo.getAttribute("aria-disabled")) === "true") return true;

  try {
    const inp = combo.locator("input").first();
    if ((await inp.count()) > 0 && (await inp.getAttribute("disabled")) !== null) {
      return true;
    }
  } catch {
    /* locator may be resolving while DOM updates */
  }

  if (hostDis === null) {
    try {
      const base = combo
        .locator(
          "xpath=ancestor::*[self::lightning-base-combobox or self::lightning-combobox][1]",
        )
        .first();
      if ((await base.count()) > 0) {
        const cls = (await base.getAttribute("class")) || "";
        if (cls.includes("slds-is-disabled")) return true;
      }
    } catch {
      /* detached / strict */
    }
  }

  return false;
}

async function picklistLooksDisabled(combo: Locator): Promise<boolean> {
  return picklistComboAppearsDisabled(combo);
}

async function picklistLooksEnabled(combo: Locator): Promise<boolean> {
  return !(await picklistComboAppearsDisabled(combo));
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
  // Do not also assert `toBeEnabled` on the combobox locator: Salesforce LWC often exposes a
  // composite control where Playwright's enabled check disagrees with the same UX our poll uses.
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
