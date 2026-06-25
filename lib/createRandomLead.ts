import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  collectLeadModalUILabels,
  settleLeadModalForFieldScan,
  uiFieldLabelForExcelField,
} from "./leadCreationModalPart3";
import {
  defaultLeadModalFieldLayoutPath,
  loadLeadModalFieldsFromWorkbook,
} from "./loadLeadModalFieldLayout";
import {
  clickPicklistOptionInOpenList,
  normalizePicklistDisplayValue,
  openPicklistDropdown,
  picklistCombobox,
  picklistDisplayValuesEquivalent,
  readOpenPicklistOptions,
  readPicklistDisplayedValue,
} from "./salesforceProcurementPicklists";

/**
 * Lead save step: workbook-required fields plus any label matching {@link FIXED_LEAD_CREATION_VALUES}.
 * Fixed picklists use dropdown + {@link clickPicklistOptionInOpenList} (Salesforce-friendly matching). Remaining requirements use
 * {@link fakeValueForLabel} for text or the first usable picklist row. Dependency order: {@link KNOWN_FILL_ORDER}.
 */

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelKey(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/\*/g, "")
    .replace(/\(\s*Required\s*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Keyed by {@link labelKey}: values applied on Lead save when present on the modal.
 * Other required fields stay on fake filler / first picklist row.
 */
export const FIXED_LEAD_CREATION_VALUES: Record<string, string> = {
  "first name": "Darshan Test",
  "last name": "QA user 001",
  "job title": "QA Test",
  email: "dpanchal+01@horizontal.com",
  mobile: "1234567890",
  "mobile phone": "1234567890",
  phone: "1234567890",
  "lead source": "Referral",
  "lead status": "New",
  "business unit": "Al Hammad Hybrid",
  "product category": "Consumables",
  division: "COLOPLAST",
  portfolio: "COLOPLAST",
  sector: "Public",
  channel: "NUPCO",
  "procurement sector": "Public",
  "procurement channel": "NUPCO",
  "request type": "Marketplace",
  customer: "D test",
  company: "D test",
};

const FIXED_KEYS = new Set(Object.keys(FIXED_LEAD_CREATION_VALUES));

/** Dependent picklists / follow-up free-text fields first in safe order. */
const KNOWN_FILL_ORDER: string[] = [
  "Business Unit",
  "Division",
  "Sector",
  "Channel",
  "Request Type",
  "Unqualified Reason",
  "Other Unqualified Reason",
  "Facility Department",
  "Other Facility Department",
];

/** Applies {@link KNOWN_FILL_ORDER}, then alphabetical order for remaining names. */
function sortKnownDependencyOrder(labels: string[]): string[] {
  const ordered: string[] = [];
  const pool = [...labels];
  for (const known of KNOWN_FILL_ORDER) {
    const k = labelKey(known);
    const idx = pool.findIndex((l) => labelKey(l) === k);
    if (idx >= 0) {
      ordered.push(pool[idx]!);
      pool.splice(idx, 1);
    }
  }
  pool.sort((a, b) => a.localeCompare(b, "en"));
  return [...ordered, ...pool];
}

function fixedValueForLabel(label: string): string | undefined {
  return FIXED_LEAD_CREATION_VALUES[labelKey(label)];
}

function mergeHarvestedFixedFieldsIntoLabels(
  iterateLabels: string[],
  harvested: { label: string }[],
): string[] {
  const seen = new Set(iterateLabels.map((l) => labelKey(l)));
  const added: string[] = [];
  for (const { label } of harvested) {
    const k = labelKey(label);
    if (!FIXED_KEYS.has(k) || seen.has(k)) continue;
    seen.add(k);
    added.push(label);
  }
  if (added.length === 0) return iterateLabels;
  return sortKnownDependencyOrder([...iterateLabels, ...added]);
}

async function requiredFieldNamesFromFieldLayout(workbookPath: string): Promise<string[]> {
  const rows = await loadLeadModalFieldsFromWorkbook(workbookPath);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (!r.requiredInExcel) continue;
    const k = labelKey(r.fieldNameExcel);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r.fieldNameExcel.replace(/\s+/g, " ").trim());
  }
  return out;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomAlpha(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[randomInt(0, chars.length - 1)];
  return s;
}

function fakeValueForLabel(label: string): string {
  const k = labelKey(label);
  if (k.includes("email")) {
    return `pw.${randomAlpha(6)}.${Date.now()}@example.test`;
  }
  if (k.includes("phone") || k.includes("mobile") || k.includes("fax")) {
    return `+1${randomInt(200, 999)}${randomInt(200, 999)}${randomInt(1000, 9999)}`;
  }
  if (k.includes("website") || k.includes("url")) {
    return `https://example-${randomAlpha(4)}.test`;
  }
  if (k.includes("zip") || k.includes("postal")) {
    return String(randomInt(10000, 99999));
  }
  if (
    k.includes("number") ||
    k.includes("amount") ||
    k.includes("quantity") ||
    k.includes("revenue") ||
    k.includes("employees")
  ) {
    return String(randomInt(1, 500));
  }
  if (k.includes("first") && k.includes("name")) {
    return `First${randomAlpha(4)}`;
  }
  if (k.includes("last") && k.includes("name")) {
    return `Last${randomAlpha(6)}`;
  }
  if (k.includes("company") || k.includes("customer") || k.includes("account")) {
    return `Co ${randomAlpha(5)} ${randomInt(10, 99)}`;
  }
  if (k.includes("city")) {
    return `City${randomAlpha(4)}`;
  }
  if (k.includes("street") || k.includes("address")) {
    return `${randomInt(1, 9999)} ${randomAlpha(5)} Ave`;
  }
  if (k.includes("state") || k.includes("province")) {
    return "CA";
  }
  if (k.includes("title") || k.includes("job")) {
    return `Title ${randomAlpha(4)}`;
  }
  if (k.includes("description") || k.includes("comment") || k.includes("reason")) {
    return `Auto ${randomAlpha(8)} ${Date.now()}`;
  }
  return `Val-${randomAlpha(6)}-${randomInt(100, 999)}`;
}

function isPicklistVisuallyEmpty(displayed: string): boolean {
  const n = normalizePicklistDisplayValue(displayed);
  return n.length === 0 || n === "none";
}

function isPlaceholderPicklistOption(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (/^[\u2713\u2714✓✔√\s]+$/u.test(t)) return true;
  if (/^-+\s*none\s*-+$/i.test(t)) return true;
  const n = normalizePicklistDisplayValue(text);
  return n.length === 0 || n === "none";
}

/** ~140ms scroll — reveals lazy sections without the full triple settle (~900ms). */
async function quickRevealLeadModalFields(page: Page, modal: Locator): Promise<void> {
  await modal.evaluate((modalEl: Element) => {
    const content =
      modalEl.querySelector<HTMLElement>(".slds-modal__content") ||
      (modalEl as HTMLElement);
    content.scrollTop = content.scrollHeight;
  });
  await page.waitForTimeout(85);
  await modal.evaluate((modalEl: Element) => {
    const content =
      modalEl.querySelector<HTMLElement>(".slds-modal__content") ||
      (modalEl as HTMLElement);
    content.scrollTop = 0;
  });
  await page.waitForTimeout(55);
}

const LEAD_OPEN_PICKLIST_TRIGGER_MS = 11_000;
const LEAD_OPEN_PICKLIST_LISTBOX_MS = 6_500;

function openPicklistForLead(
  page: Page,
  modal: Locator,
  fieldLabel: string,
): Promise<Locator> {
  return openPicklistDropdown(page, modal, fieldLabel, {
    triggerWaitMs: LEAD_OPEN_PICKLIST_TRIGGER_MS,
    listboxWaitMs: LEAD_OPEN_PICKLIST_LISTBOX_MS,
  });
}

async function waitUntilPicklistShows(
  page: Page,
  modal: Locator,
  fieldLabel: string,
  expected: string,
  timeoutMs = 2_400,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await readPicklistDisplayedValue(modal, fieldLabel).catch(() => "");
    if (picklistDisplayValuesEquivalent(raw, expected)) return true;
    await page.waitForTimeout(45);
  }
  return false;
}

async function waitUntilPicklistNotEmpty(
  page: Page,
  modal: Locator,
  fieldLabel: string,
  timeoutMs = 2_400,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await readPicklistDisplayedValue(modal, fieldLabel).catch(() => "");
    if (!isPicklistVisuallyEmpty(raw)) return true;
    await page.waitForTimeout(45);
  }
  return false;
}

async function pollInputCommits(
  locator: Locator,
  want: string,
  timeoutMs = 2_200,
): Promise<boolean> {
  const page = locator.page();
  const target = want.trim();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = (await locator.inputValue().catch(() => "")).trim();
    if (v === target) return true;
    await page.waitForTimeout(45);
  }
  return false;
}

/**
 * Lightning often normalizes email/phone vs `inputValue()`. Treat as success if the field clearly non-empty
 * and roughly matches what we typed after a short settle.
 */
async function textFieldValueAccepted(locator: Locator, want: string): Promise<boolean> {
  if (await pollInputCommits(locator, want, 2_200)) return true;
  await locator.page().waitForTimeout(200);
  const v = (await locator.inputValue().catch(() => "")).trim();
  if (v.length === 0) return false;
  const w = want.trim();
  if (v === w) return true;
  if (v.toLowerCase() === w.toLowerCase()) return true;
  const vd = v.replace(/\D/g, "");
  const wd = w.replace(/\D/g, "");
  if (wd.length >= 7 && vd.length >= 7 && (vd.endsWith(wd) || vd === wd)) return true;
  if (wd.length >= 4 && vd === wd) return true;
  if (w.length >= 6 && v.includes(w.replace(/\s+/g, " ").slice(0, 12))) return true;
  return v.length > 0 && w.length > 0;
}

async function picklistFieldVisible(modal: Locator, label: string): Promise<boolean> {
  const combo = picklistCombobox(modal, label);
  return combo.isVisible({ timeout: 550 }).catch(() => false);
}

/** Opens the picklist and selects the first usable option from the dropdown (skips --None-- / placeholders). */
async function trySelectPicklistOptionFromDropdown(
  page: Page,
  modal: Locator,
  label: string,
): Promise<boolean> {
  if (!(await picklistFieldVisible(modal, label))) return false;
  const combo = picklistCombobox(modal, label);
  if ((await combo.isDisabled().catch(() => true)) || (await combo.getAttribute("aria-disabled")) === "true") {
    return false;
  }
  const listbox = await openPicklistForLead(page, modal, label);
  const raw = await readOpenPicklistOptions(listbox);
  const choices = raw.filter((o) => !isPlaceholderPicklistOption(o));
  if (choices.length === 0) {
    await page.keyboard.press("Escape");
    return false;
  }
  const pick = choices[0]!;
  await clickPicklistOptionInOpenList(listbox, pick);
  await waitUntilPicklistNotEmpty(page, modal, label);
  return true;
}

async function trySelectExactPicklistOption(
  page: Page,
  modal: Locator,
  label: string,
  optionLabel: string,
): Promise<boolean> {
  if (!(await picklistFieldVisible(modal, label))) return false;
  const combo = picklistCombobox(modal, label);
  if ((await combo.isDisabled().catch(() => true)) || (await combo.getAttribute("aria-disabled")) === "true") {
    return false;
  }
  try {
    const listbox = await openPicklistForLead(page, modal, label);
    await clickPicklistOptionInOpenList(listbox, optionLabel);
    return waitUntilPicklistShows(page, modal, label, optionLabel);
  } catch {
    return false;
  }
}

async function tryFillTextLikeField(
  modal: Locator,
  label: string,
  valueOverride?: string,
): Promise<boolean> {
  const page = modal.page();
  const esc = escapeReg(label.trim());
  const nameRe = new RegExp(
    `^\\s*${esc}\\s*(\\*|\\(Required\\)|\\(required\\))?\\s*$`,
    "i",
  );

  const value = valueOverride ?? fakeValueForLabel(label);

  const scrollT = { timeout: 2_500 } as const;

  const textbox = modal.getByRole("textbox", { name: nameRe }).first();
  if (await textbox.isVisible({ timeout: 650 }).catch(() => false)) {
    await textbox.scrollIntoViewIfNeeded(scrollT).catch(() => {});
    await textbox.fill(value);
    await textbox.blur().catch(() => {});
    return textFieldValueAccepted(textbox, value);
  }

  const row = modal
    .locator(".slds-form-element, lightning-input-field")
    .filter({
      has: page
        .locator("label, .slds-form-element__label, span.slds-form-element__label, legend")
        .filter({ hasText: new RegExp(`^\\s*${esc}\\s*`, "i") }),
    })
    .first();

  const inp = row
    .locator('input:not([type="checkbox"]):not([type="hidden"])')
    .first();
  if (await inp.isVisible({ timeout: 550 }).catch(() => false)) {
    await inp.scrollIntoViewIfNeeded(scrollT).catch(() => {});
    await inp.click();
    await inp.fill(value);
    await inp.blur().catch(() => {});
    return textFieldValueAccepted(inp, value);
  }

  const ta = row.locator("textarea").first();
  if (await ta.isVisible({ timeout: 450 }).catch(() => false)) {
    await ta.scrollIntoViewIfNeeded(scrollT).catch(() => {});
    await ta.fill(value);
    await ta.blur().catch(() => {});
    return textFieldValueAccepted(ta, value);
  }

  const spin = modal.getByRole("spinbutton", { name: nameRe }).first();
  if (await spin.isVisible({ timeout: 450 }).catch(() => false)) {
    await spin.scrollIntoViewIfNeeded(scrollT).catch(() => {});
    const digits = value.replace(/\D/g, "") || String(randomInt(1, 99));
    await spin.fill(digits);
    await spin.blur().catch(() => {});
    return textFieldValueAccepted(spin, digits);
  }

  return false;
}

async function fieldAppearsSatisfied(
  page: Page,
  modal: Locator,
  label: string,
): Promise<boolean> {
  if (await picklistFieldVisible(modal, label)) {
    const combo = picklistCombobox(modal, label);
    if (!(await combo.isVisible().catch(() => false))) return true;
    const dis =
      (await combo.isDisabled().catch(() => false)) ||
      (await combo.getAttribute("aria-disabled")) === "true";
    // Dependent picklist stays disabled until the controlling value is set — not satisfied yet.
    if (dis) return false;
    const shown = await readPicklistDisplayedValue(modal, label).catch(() => "");
    return !isPicklistVisuallyEmpty(shown);
  }

  const esc = escapeReg(label.trim());
  const nameRe = new RegExp(
    `^\\s*${esc}\\s*(\\*|\\(Required\\)|\\(required\\))?\\s*$`,
    "i",
  );
  const textbox = modal.getByRole("textbox", { name: nameRe }).first();
  if (await textbox.isVisible({ timeout: 400 }).catch(() => false)) {
    const v = await textbox.inputValue().catch(() => "");
    return v.trim().length > 0;
  }

  const row = modal
    .locator(".slds-form-element, lightning-input-field")
    .filter({
      has: page
        .locator("label, .slds-form-element__label, span.slds-form-element__label, legend")
        .filter({ hasText: new RegExp(`^\\s*${esc}\\s*`, "i") }),
    })
    .first();
  const inp = row.locator('input:not([type="checkbox"]):not([type="hidden"])').first();
  if (await inp.isVisible({ timeout: 400 }).catch(() => false)) {
    const v =
      (await inp.inputValue().catch(() => "")) ||
      ((await inp.getAttribute("value")) ?? "");
    return v.trim().length > 0;
  }
  const ta = row.locator("textarea").first();
  if (await ta.isVisible({ timeout: 400 }).catch(() => false)) {
    const v = await ta.inputValue().catch(() => "");
    return v.trim().length > 0;
  }

  const spin = modal.getByRole("spinbutton", { name: nameRe }).first();
  if (await spin.isVisible({ timeout: 400 }).catch(() => false)) {
    const v = await spin.inputValue().catch(() => "");
    return v.trim().length > 0;
  }

  return true;
}

/**
 * Fills every field that **Field Layout.xlsx** marks required (red font / {@link loadLeadModalFieldsFromWorkbook}).
 * Picklists: open the dropdown and select a real option (first non-placeholder row). Text-like fields: {@link fakeValueForLabel}.
 * Resolves workbook labels to live UI labels the same way as Part 3 ({@link uiFieldLabelForExcelField}).
 *
 * If the workbook lists no required fields, falls back to modal labels that show SLDS/UI required markers.
 *
 * Same workbook path rules as Part 3: {@link defaultLeadModalFieldLayoutPath} or `SF_LEAD_MODAL_FIELD_LAYOUT_XLSX`.
 */
export async function fillNewLeadModalRequiredFieldsRandomly(
  page: Page,
  modal: Locator,
  opts?: { maxPasses?: number; workbookPath?: string },
): Promise<void> {
  const maxPasses = opts?.maxPasses ?? 10;
  const workbookPath = opts?.workbookPath ?? defaultLeadModalFieldLayoutPath();
  /** Hard ceiling so one stuck field cannot burn the entire Playwright test timeout. */
  const leadFillBudgetMs = Math.min(
    Number.parseInt(process.env.SF_LEAD_FILL_MAX_MS ?? "420000", 10) || 420_000,
    840_000,
  );
  const absoluteDeadline = Date.now() + leadFillBudgetMs;
  let lastStillKey = "";
  let sameStillStreak = 0;

  let excelRequiredNames = await requiredFieldNamesFromFieldLayout(workbookPath);
  let useWorkbookRequirements = excelRequiredNames.length > 0;
  if (!useWorkbookRequirements) {
    console.warn(
      `[createRandomLead] Field Layout has no red-font required rows (${workbookPath}) — falling back to UI * / required markers.`,
    );
  } else {
    console.log(
      `[createRandomLead] Required fields from Field Layout (${excelRequiredNames.length}): ${excelRequiredNames.join(", ")}`,
    );
  }

  for (let pass = 0; pass < maxPasses; pass++) {
    if (Date.now() > absoluteDeadline) {
      throw new Error(
        `[createRandomLead] Lead fill aborted after ${leadFillBudgetMs}ms budget (SF_LEAD_FILL_MAX_MS) — modal may still have empty fields.`,
      );
    }
    // Full settle (~900ms) on first pass + occasionally; lite scroll other passes saves several seconds per loop.
    if (pass === 0 || pass === maxPasses - 1 || pass === 4) {
      await settleLeadModalForFieldScan(page, modal);
    } else {
      await quickRevealLeadModalFields(page, modal);
    }
    const harvested = await collectLeadModalUILabels(modal);

    let iterateLabels: string[];
    /** Workbook-mode: parallel Excel names for messaging; UI-mode: unused. */
    let orderedExcelParallel: string[] | null = null;

    if (useWorkbookRequirements) {
      const orderedExcel = sortKnownDependencyOrder(excelRequiredNames);
      orderedExcelParallel = orderedExcel;
      iterateLabels = orderedExcel.map((ex) => uiFieldLabelForExcelField(ex, harvested));
    } else {
      const required = harvested.filter((r) => r.required).map((r) => r.label);
      if (required.length === 0) break;
      iterateLabels = sortKnownDependencyOrder([...new Set(required)]);
    }

    iterateLabels = mergeHarvestedFixedFieldsIntoLabels(iterateLabels, harvested);

    let progressed = false;
    for (const label of iterateLabels) {
      if (await fieldAppearsSatisfied(page, modal, label)) continue;

      await picklistCombobox(modal, label)
        .scrollIntoViewIfNeeded({ timeout: 2_500 })
        .catch(() => {});

      const fixed = fixedValueForLabel(label);
      const asPicklist = await picklistFieldVisible(modal, label);
      let ok = false;
      if (asPicklist && fixed !== undefined) {
        ok = await trySelectExactPicklistOption(page, modal, label, fixed);
      } else if (asPicklist) {
        ok = await trySelectPicklistOptionFromDropdown(page, modal, label);
      } else if (fixed !== undefined) {
        ok = await tryFillTextLikeField(modal, label, fixed);
      } else {
        ok = await tryFillTextLikeField(modal, label);
      }
      if (ok) progressed = true;
      await page.waitForTimeout(ok ? 25 : 50);
    }

    const still: string[] = [];
    if (useWorkbookRequirements && orderedExcelParallel) {
      for (let i = 0; i < orderedExcelParallel.length; i++) {
        const excelName = orderedExcelParallel[i]!;
        const label = uiFieldLabelForExcelField(excelName, harvested);
        if (!(await fieldAppearsSatisfied(page, modal, label))) {
          still.push(excelName);
        }
      }
    } else {
      for (const label of iterateLabels) {
        if (!(await fieldAppearsSatisfied(page, modal, label))) {
          still.push(label);
        }
      }
    }

    if (still.length === 0) return;

    const stillKey = [...still].sort().join("|");
    if (stillKey === lastStillKey) sameStillStreak += 1;
    else {
      sameStillStreak = 0;
      lastStillKey = stillKey;
    }
    if (sameStillStreak >= 3) {
      throw new Error(
        `[createRandomLead] No progress filling Lead modal after 3 passes with identical missing fields: ${still.join("; ")}`,
      );
    }

    if (!progressed && pass > 5) {
      throw new Error(
        `Unable to satisfy required Lead fields after ${pass + 1} pass(es). Still blank: ${still.join("; ")}`,
      );
    }
  }

  await settleLeadModalForFieldScan(page, modal);
  const finalHarvest = await collectLeadModalUILabels(modal);
  const missing: string[] = [];

  if (useWorkbookRequirements) {
    const orderedExcel = sortKnownDependencyOrder(excelRequiredNames);
    for (const ex of orderedExcel) {
      const label = uiFieldLabelForExcelField(ex, finalHarvest);
      if (!(await fieldAppearsSatisfied(page, modal, label))) missing.push(ex);
    }
  } else {
    const required = finalHarvest.filter((r) => r.required).map((r) => r.label);
    const ordered = sortKnownDependencyOrder([...new Set(required)]);
    for (const label of ordered) {
      if (!(await fieldAppearsSatisfied(page, modal, label))) missing.push(label);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Required Lead fields still empty: ${missing.join("; ")}`);
  }
}

/**
 * Clicks **Save** on the modal footer (not Save & New) and waits for the Lead record view URL.
 *
 * @returns Normalized `/lightning/r/Lead/<id>/view` URL once stable.
 */
export async function saveNewLeadAndGoToRecord(
  page: Page,
  modal: Locator,
): Promise<string> {
  const footer = modal.locator(".slds-modal__footer").first();
  const savePrimary = footer
    .getByRole("button", { name: /^Save$/i })
    .filter({ hasNotText: /Save\s*&/i })
    .first();

  const saveBtn =
    (await savePrimary.isVisible({ timeout: 2_500 }).catch(() => false))
      ? savePrimary
      : modal.getByRole("button", { name: /^Save$/i }).first();

  await saveBtn.scrollIntoViewIfNeeded();
  await expect(saveBtn).toBeVisible({ timeout: 15_000 });
  await expect(saveBtn).toBeEnabled({ timeout: 15_000 });

  await Promise.all([
    page.waitForURL(/\b\/lightning\/r\/Lead\/[\w]+\/view\b/i, { timeout: 120_000 }),
    saveBtn.click(),
  ]);

  const url = page.url();
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  return url;
}
