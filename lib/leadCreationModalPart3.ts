import * as fs from "fs";
import * as path from "path";
import type { Locator, Page } from "@playwright/test";
import { consoleTableWithStatusHighlight, formatFailStatus } from "./consoleTableStatus";
import {
  defaultLeadModalFieldLayoutPath,
  loadLeadModalFieldsFromWorkbook,
  type LeadModalFieldFromExcel,
} from "./loadLeadModalFieldLayout";
import {
  dismissOpenPicklistIfVisible,
  DIVISION_FIELD,
  openPicklistDropdown,
  picklistCombobox,
  picklistDisplayValuesEquivalent,
  picklistTrigger,
  readOpenPicklistOptions,
  readPicklistDisplayedValue,
  selectPicklistOption,
  type PicklistSelectOptions,
} from "./salesforceProcurementPicklists";

/** Controlling field for dependent picklists (e.g. Portfolio) in Part 3. */
const PART3_BUSINESS_UNIT_FIELD_LABEL = "Business Unit";

/** Dependent on {@link PART3_BUSINESS_UNIT_FIELD_LABEL} in Part 3 (Salesforce UI label: Division). */
const PART3_DIVISION_FIELD_LABEL = DIVISION_FIELD;

/** Controlling field for **Other Unqualified Reason** in Part 3. */
const PART3_UNQUALIFIED_REASON_FIELD_LABEL = "Unqualified Reason";

/** Controlling field for **Other Facility Department** in Part 3. */
const PART3_FACILITY_DEPARTMENT_FIELD_LABEL = "Facility Department";

function part3UnqualifiedReasonValueForOtherBranch(): string {
  const v = process.env.SF_PART3_UNQUALIFIED_REASON?.trim();
  return v && v.length > 0 ? v : "Other";
}

function part3FacilityDepartmentValueForOtherBranch(): string {
  const v = process.env.SF_PART3_FACILITY_DEPARTMENT?.trim();
  return v && v.length > 0 ? v : "Other";
}

/**
 * Sets Unqualified Reason to **Other** so **Other Unqualified Reason** is enabled for the Excel vs UI audit.
 * Runs after the BU×Portfolio matrix (when enabled) so Business Unit / Portfolio are not re-selected here.
 */
async function selectPart3UnqualifiedReasonOther(
  page: Page,
  modal: Locator,
): Promise<void> {
  await selectPicklistOption(
    page,
    modal,
    PART3_UNQUALIFIED_REASON_FIELD_LABEL,
    part3UnqualifiedReasonValueForOtherBranch(),
  );
}

/**
 * Sets Facility Department to **Other** so **Other Facility Department** is enabled for the Excel vs UI audit.
 */
async function selectPart3FacilityDepartmentOther(
  page: Page,
  modal: Locator,
): Promise<void> {
  await selectPicklistOption(
    page,
    modal,
    PART3_FACILITY_DEPARTMENT_FIELD_LABEL,
    part3FacilityDepartmentValueForOtherBranch(),
  );
}

/**
 * Picklist values for the Excel vs UI audit **after** {@link runPart3BusinessUnitPortfolioMatrix}.
 * Does **not** set Business Unit or Portfolio — the matrix leaves the last validated pair selected;
 * procurement Part 1/2 must not re-select them.
 */
async function selectPart3ControllingPicklistValues(
  page: Page,
  modal: Locator,
): Promise<void> {
  await selectPart3UnqualifiedReasonOther(page, modal);
  await selectPart3FacilityDepartmentOther(page, modal);
}

function isPicklistNonePlaceholder(label: string): boolean {
  const t = label.replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (/^[\u2713\u2714✓✔√\s]+$/u.test(t)) return true;
  return /^-+\s*none\s*-+$/i.test(t) || normalizePicklistToken(t) === "none";
}

function normalizePicklistToken(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/[\u2713\u2714✓✔√]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizePicklistOptionLabel(label: string): string {
  return label
    .replace(/[\u2713\u2714✓✔√\u00A0]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/--\s*none\s*--/gi, "")
    .trim();
}

/**
 * Scrolls the modal to the top and brings **Business Unit** into view before the matrix.
 */
async function prepareModalForBusinessUnitPortfolioMatrix(
  page: Page,
  modal: Locator,
): Promise<void> {
  await dismissOpenPicklistIfVisible(page);
  await modal.evaluate((modalEl: Element) => {
    const content =
      modalEl.querySelector<HTMLElement>(".slds-modal__content") ||
      (modalEl as HTMLElement);
    content.scrollTop = 0;
  });
  await page.waitForTimeout(150);
  const buTrigger = await picklistTrigger(modal, PART3_BUSINESS_UNIT_FIELD_LABEL);
  await buTrigger.scrollIntoViewIfNeeded({ timeout: 20_000 }).catch(() => {});
  await buTrigger.waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForTimeout(100);
}

function part3MatrixPicklistOptions(): PicklistSelectOptions {
  const listboxCloseSettleMs = Math.min(
    Math.max(
      parseInt(process.env.SF_PART3_MATRIX_LISTBOX_SETTLE_MS ?? "60", 10) || 60,
      0,
    ),
    1_000,
  );
  const postClickSettleMs = Math.min(
    Math.max(
      parseInt(process.env.SF_PART3_MATRIX_PICKLIST_SETTLE_MS ?? "60", 10) || 60,
      0,
    ),
    1_000,
  );
  return { listboxCloseSettleMs, postClickSettleMs };
}

function part3MatrixAfterCloseMs(): number {
  return Math.min(
    Math.max(parseInt(process.env.SF_PART3_MATRIX_AFTER_CLOSE_MS ?? "60", 10) || 60, 0),
    1_000,
  );
}

/** `fast` = read dependent options + one Division select per BU (~6× faster). `full` = select every pair. */
function part3MatrixMode(): "fast" | "full" {
  const raw = (process.env.SF_PART3_MATRIX_MODE ?? "full").trim().toLowerCase();
  return raw === "full" || raw === "all" || raw === "every" ? "full" : "fast";
}

/** Poll until Division is enabled after Business Unit changes (avoids long fixed sleeps). */
async function waitForDivisionPicklistAfterBuChange(
  page: Page,
  modal: Locator,
  maxMs = 900,
): Promise<void> {
  const trigger = await picklistTrigger(modal, PART3_DIVISION_FIELD_LABEL);
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const disabled = await trigger.isDisabled().catch(() => true);
    if (!disabled) return;
    await page.waitForTimeout(40);
  }
}

async function scrollPicklistFieldIntoView(
  modal: Locator,
  fieldLabel: string,
): Promise<void> {
  const trigger = await picklistTrigger(modal, fieldLabel);
  await trigger.scrollIntoViewIfNeeded({ timeout: 12_000 }).catch(() => {});
}

/**
 * Opens a picklist, reads option labels, closes the dropdown without applying a new value.
 */
async function readPicklistOptionsFromClosed(
  page: Page,
  modal: Locator,
  fieldLabel: string,
  afterCloseMs = 200,
): Promise<string[]> {
  await scrollPicklistFieldIntoView(modal, fieldLabel);
  const listbox = await openPicklistDropdown(page, modal, fieldLabel);
  const raw = await readOpenPicklistOptions(listbox);
  await page.keyboard.press("Escape");
  await listbox.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  if (afterCloseMs > 0) await page.waitForTimeout(afterCloseMs);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const option of raw) {
    if (isPicklistNonePlaceholder(option)) continue;
    const normalized = normalizePicklistOptionLabel(option);
    if (!normalized) continue;
    const key = normalizePicklistToken(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export type Part3BusinessUnitPortfolioRow = {
  "#": number;
  "Business Unit": string;
  Division: string;
  Status: "Pass" | "Fail";
};

/**
 * For every Business Unit value, validates dependent Division options.
 * Default **full** mode selects every BU×Division pair. Set `SF_PART3_MATRIX_MODE=fast` for faster runs.
 */
export async function runPart3BusinessUnitPortfolioMatrix(
  page: Page,
  modal: Locator,
): Promise<Part3BusinessUnitPortfolioRow[]> {
  await prepareModalForBusinessUnitPortfolioMatrix(page, modal);

  const matrixMode = part3MatrixMode();

  let businessUnits: string[] = [];
  try {
    businessUnits = await readPicklistOptionsFromClosed(
      page,
      modal,
      PART3_BUSINESS_UNIT_FIELD_LABEL,
    );
  } catch (err) {
    console.error(
      "\n[Part 3] Business Unit × Portfolio matrix: could not read Business Unit options.",
      err,
    );
    return [];
  }

  if (businessUnits.length === 0) {
    console.log(
      "\n[Part 3] Business Unit × Portfolio matrix: no Business Unit options found — skipping matrix.\n",
    );
    return [];
  }

  const rows: Part3BusinessUnitPortfolioRow[] = [];
  let rowNum = 0;
  const matrixPickOpts = part3MatrixPicklistOptions();
  const matrixAfterCloseMs = part3MatrixAfterCloseMs();
  const buSettleMs = Math.min(
    Math.max(
      parseInt(
        process.env.SF_PART3_BU_SETTLE_MS ??
          (matrixMode === "fast" ? "150" : "300"),
        10,
      ) || (matrixMode === "fast" ? 150 : 300),
      0,
    ),
    3_000,
  );

  console.log(
    `\n[Part 3] Business Unit × Portfolio matrix (${businessUnits.length} Business Unit value(s), mode=${matrixMode})…`,
  );
  if (matrixMode === "fast") {
    console.log(
      "[Part 3] Fast mode — lists Division options per BU + smoke-selects first Division. Use SF_PART3_MATRIX_MODE=full for every pair.\n",
    );
  } else {
    console.log(
      "[Part 3] Full mode — selects every Business Unit × Division pair.\n",
    );
  }

  for (const bu of businessUnits) {
    try {
      await scrollPicklistFieldIntoView(modal, PART3_BUSINESS_UNIT_FIELD_LABEL);
      await selectPicklistOption(
        page,
        modal,
        PART3_BUSINESS_UNIT_FIELD_LABEL,
        bu,
        matrixPickOpts,
      );
      if (buSettleMs > 0) {
        await page.waitForTimeout(buSettleMs);
      }
      await waitForDivisionPicklistAfterBuChange(page, modal);

      await scrollPicklistFieldIntoView(modal, PART3_DIVISION_FIELD_LABEL);
      const portfolioOptions = await readPicklistOptionsFromClosed(
        page,
        modal,
        PART3_DIVISION_FIELD_LABEL,
        matrixAfterCloseMs,
      );

      const buShown = await readPicklistDisplayedValue(
        modal,
        PART3_BUSINESS_UNIT_FIELD_LABEL,
      );
      const buOk = picklistDisplayValuesEquivalent(buShown, bu);

      if (portfolioOptions.length === 0) {
        rowNum += 1;
        rows.push({
          "#": rowNum,
          "Business Unit": bu,
          Division: "—",
          Status: buOk ? "Pass" : "Fail",
        });
        continue;
      }

      if (matrixMode === "fast") {
        const buRowStartIdx = rows.length;
        for (const pf of portfolioOptions) {
          rowNum += 1;
          rows.push({
            "#": rowNum,
            "Business Unit": bu,
            Division: pf,
            Status: buOk ? "Pass" : "Fail",
          });
        }
        const firstPf = portfolioOptions[0];
        await selectPicklistOption(
          page,
          modal,
          PART3_DIVISION_FIELD_LABEL,
          firstPf,
          matrixPickOpts,
        );
        const pfShown = await readPicklistDisplayedValue(
          modal,
          PART3_DIVISION_FIELD_LABEL,
        );
        const pfOk = picklistDisplayValuesEquivalent(pfShown, firstPf);
        const buShownAgain = await readPicklistDisplayedValue(
          modal,
          PART3_BUSINESS_UNIT_FIELD_LABEL,
        );
        const rowBuOk = picklistDisplayValuesEquivalent(buShownAgain, bu);
        if (!rowBuOk) {
          for (let i = buRowStartIdx; i < rows.length; i++) {
            rows[i].Status = "Fail";
          }
        } else if (!pfOk) {
          rows[buRowStartIdx].Status = "Fail";
        }
        continue;
      }

      for (let di = 0; di < portfolioOptions.length; di++) {
        const pf = portfolioOptions[di];
        await selectPicklistOption(
          page,
          modal,
          PART3_DIVISION_FIELD_LABEL,
          pf,
          matrixPickOpts,
        );

        const pfShown = await readPicklistDisplayedValue(
          modal,
          PART3_DIVISION_FIELD_LABEL,
        );
        const pfOk = picklistDisplayValuesEquivalent(pfShown, pf);
        let rowBuOk = buOk;
        if (di === portfolioOptions.length - 1) {
          const buShownAgain = await readPicklistDisplayedValue(
            modal,
            PART3_BUSINESS_UNIT_FIELD_LABEL,
          );
          rowBuOk = picklistDisplayValuesEquivalent(buShownAgain, bu);
        }
        rowNum += 1;
        rows.push({
          "#": rowNum,
          "Business Unit": bu,
          Division: pf,
          Status: rowBuOk && pfOk ? "Pass" : "Fail",
        });
      }
    } catch (err) {
      rowNum += 1;
      rows.push({
        "#": rowNum,
        "Business Unit": bu,
        Division: "—",
        Status: "Fail",
      });
      console.error(
        `[Part 3] Business Unit × Portfolio matrix failed for BU="${bu}":`,
        err,
      );
    }
  }

  console.log("[Part 3] Business Unit × Portfolio (all controlling / dependent pairs):\n");
  consoleTableWithStatusHighlight(rows);
  console.log("");

  const failed = rows.filter((r) => r.Status === "Fail");
  if (failed.length > 0) {
    console.warn(
      `[Part 3] Business Unit × Portfolio matrix: ${failed.length} row(s) failed.\n`,
    );
  }

  return rows;
}

export type LeadCreationModalPart3Row = {
  "Fields in Excel": string;
  "Fields on UI": string;
  "Required in Excel": "Yes" | "No";
  "Required on UI": "Yes" | "No" | "—";
  Status: "Pass" | "Fail";
};

function normLabel(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/\s*\*\s*/g, "")
    .replace(/\(\s*Required\s*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchKey(s: string): string {
  return normLabel(s)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, " ");
}

/**
 * Excel label (normalized key) → alternate UI {@link matchKey} values (e.g. org renames **Company** to **Customer**).
 */
const EXCEL_KEY_TO_UI_MATCH_KEYS: Record<string, string[]> = {
  company: ["customer"],
  portfolio: ["division"],
};

function matchKeysForExcelField(excelLabel: string): string[] {
  const primary = matchKey(excelLabel);
  const aliases = EXCEL_KEY_TO_UI_MATCH_KEYS[primary] ?? [];
  return [primary, ...aliases];
}

/**
 * Walk light DOM + open shadow roots (Salesforce LWC) and collect SLDS / `lightning-*` field labels.
 */
export async function collectLeadModalUILabels(
  modal: Locator,
): Promise<{ label: string; required: boolean }[]> {
  return modal.evaluate((root: Element) => {
    function norm(s: string): string {
      return s
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const results: { label: string; required: boolean }[] = [];
    const seen = new Set<string>();

    function addFromRaw(raw: string, required: boolean) {
      const withoutStars = raw.replace(/\*/g, "").trim();
      let label = norm(withoutStars)
        .replace(/\(\s*Required\s*\)/gi, "")
        .trim();
      label = label.replace(/\s*\(Required\)\s*$/i, "").trim();
      if (label.length < 2 || label.length > 120) return;
      const skip = /^(cancel|save|save\s*&\s*new|submit|view all dependencies)$/i.test(
        label,
      );
      if (skip) return;
      const key = label.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return;
      seen.add(key);
      results.push({ label, required });
    }

    function labelRequiredFromElement(lab: HTMLElement): boolean {
      const raw = lab.textContent ?? "";
      return (
        /\*/.test(raw) ||
        !!lab.querySelector(
          "abbr.slds-required, abbr[title='required'], .slds-required",
        )
      );
    }

    function visit(el: Element): void {
      if (el.matches("label, .slds-form-element__label, legend.slds-form-element__legend")) {
        const lab = el as HTMLElement;
        const raw = lab.textContent ?? "";
        if (!raw.trim()) return;
        const req = labelRequiredFromElement(lab);
        addFromRaw(raw, req);
      }

      for (const ch of el.children) visit(ch);
      if (el.shadowRoot) {
        for (const ch of el.shadowRoot.children) {
          if (ch instanceof Element) visit(ch);
        }
      }
    }

    visit(root);

    return results;
  });
}

/** Scroll modal content so lower sections (Company, Address, …) render before label harvest. */
export async function settleLeadModalForFieldScan(
  page: Page,
  modal: Locator,
): Promise<void> {
  await modal.evaluate((modalEl: Element) => {
    const content =
      modalEl.querySelector<HTMLElement>(".slds-modal__content") ||
      (modalEl as HTMLElement);
    content.scrollTop = content.scrollHeight;
  });
  await page.waitForTimeout(450);
  await modal.evaluate((modalEl: Element) => {
    const content =
      modalEl.querySelector<HTMLElement>(".slds-modal__content") ||
      (modalEl as HTMLElement);
    content.scrollTop = Math.floor(content.scrollHeight / 2);
  });
  await page.waitForTimeout(250);
  await modal.evaluate((modalEl: Element) => {
    const content =
      modalEl.querySelector<HTMLElement>(".slds-modal__content") ||
      (modalEl as HTMLElement);
    content.scrollTop = 0;
  });
  await page.waitForTimeout(200);
}

function uiByMatchKey(
  ui: { label: string; required: boolean }[],
): Map<string, { label: string; required: boolean }> {
  const m = new Map<string, { label: string; required: boolean }>();
  for (const row of ui) {
    const k = matchKey(row.label);
    if (!m.has(k)) m.set(k, row);
  }
  return m;
}

function findUiRowForExcel(
  map: Map<string, { label: string; required: boolean }>,
  excelFieldName: string,
): { label: string; required: boolean } | undefined {
  for (const key of matchKeysForExcelField(excelFieldName)) {
    const row = map.get(key);
    if (row) return row;
  }
  return undefined;
}

/**
 * Resolved label for Playwright selectors (combobox / textbox), matching Excel layout names to harvested UI wording
 * (e.g. **Company** in the workbook vs **Customer** on the modal). Falls back to the Excel label if no harvest match.
 */
export function uiFieldLabelForExcelField(
  excelFieldName: string,
  uiHarvest: { label: string; required?: boolean }[],
): string {
  const map = uiByMatchKey(uiHarvest as { label: string; required: boolean }[]);
  const uiRow = findUiRowForExcel(map, excelFieldName);
  if (uiRow) return uiRow.label;
  return excelFieldName.replace(/\s+/g, " ").trim();
}

export function buildLeadCreationModalPart3Rows(
  excel: LeadModalFieldFromExcel[],
  ui: { label: string; required: boolean }[],
): LeadCreationModalPart3Row[] {
  const map = uiByMatchKey(ui);
  return excel.map((ex) => {
    const uiRow = findUiRowForExcel(map, ex.fieldNameExcel);
    const reqExcel: "Yes" | "No" = ex.requiredInExcel ? "Yes" : "No";
    const reqUi: "Yes" | "No" | "—" = !uiRow
      ? "—"
      : uiRow.required
        ? "Yes"
        : "No";
    const status: "Pass" | "Fail" =
      !!uiRow && ex.requiredInExcel === uiRow.required ? "Pass" : "Fail";
    return {
      "Fields in Excel": ex.fieldNameExcel,
      "Fields on UI": uiRow ? uiRow.label : "—",
      "Required in Excel": reqExcel,
      "Required on UI": reqUi,
      Status: status,
    };
  });
}

export function logLeadCreationModalPart3Table(rows: LeadCreationModalPart3Row[]): void {
  consoleTableWithStatusHighlight(rows);
}

export type Part3JiraBugOptions = {
  draftIndex?: number;
};

/** Human-readable name for the layout workbook in all Jira bug text (never the .xlsx file name). */
export const PART3_JIRA_BUG_WORKBOOK_LABEL = "Config Workbook";

/**
 * Short Jira issue title — readable without opening the ticket (no "Part 3 audit — Fail").
 */
export function part3JiraBugSummary(row: LeadCreationModalPart3Row): string {
  const workbook = PART3_JIRA_BUG_WORKBOOK_LABEL;
  const field = row["Fields in Excel"];
  const ui = row["Fields on UI"];
  const reqExcel = row["Required in Excel"];
  const reqUi = row["Required on UI"];
  const renamed = ui !== "—" && field !== ui;

  if (ui === "—") {
    return `New Lead modal: "${field}" from ${workbook} is not visible on the form`;
  }

  if (reqExcel === "Yes" && reqUi === "No") {
    if (renamed) {
      return `New Lead modal: "${ui}" should be required (*) per ${workbook} (workbook label: "${field}")`;
    }
    return `New Lead modal: "${field}" should be required (*) per ${workbook} but appears optional on the form`;
  }

  if (reqExcel === "No" && reqUi === "Yes") {
    if (renamed) {
      return `New Lead modal: "${ui}" is required on the form but optional in ${workbook} (workbook label: "${field}")`;
    }
    return `New Lead modal: "${field}" is required on the form but optional in ${workbook}`;
  }

  if (renamed) {
    return `New Lead modal: "${field}" in ${workbook} does not match UI field "${ui}"`;
  }

  return `New Lead modal: "${field}" does not match ${workbook} layout on the form`;
}

/**
 * One JIRA-ready bug draft per failed Part 3 row.
 * **Bug Title** is written separately in the draft file (Jira issue summary).
 * Body contains: Bug Description, Steps to Reproduce, Actual Result, Expected Result, Attachments.
 * Priority is set by `scripts/jira-create-bugs-from-part3.cjs` on the Jira **Priority** field.
 */
export function formatPart3JiraBug(
  row: LeadCreationModalPart3Row,
  opts?: Part3JiraBugOptions,
): string {
  const workbook = PART3_JIRA_BUG_WORKBOOK_LABEL;
  const field = row["Fields in Excel"];
  const ui = row["Fields on UI"];
  const reqExcel = row["Required in Excel"];
  const reqUi = row["Required on UI"];

  const bugDescription =
    `Automated Lead Creation Modal Part 3 compared ${workbook} to the live New Lead form. ` +
    `In ${workbook}, red font marks required fields; on the UI, required fields show an asterisk (*). ` +
    `This row failed the comparison for "${field}".`;

  const stepsToReproduce =
    `1. Log in to Salesforce.\n` +
    `2. Open Leads → click **New** to open the New Lead modal.\n` +
    `3. Run the Playwright flow that executes **Lead Creation Modal — Part 3** (${workbook} vs UI audit).\n` +
    `4. Inspect the Part 3 \`console.table\` output for the row **${field}**.`;

  let actualResult: string;
  if (ui === "—") {
    actualResult =
      `${workbook} lists "${field}", but no matching field label was detected on the modal at audit time. ` +
      `Required in ${workbook}: ${reqExcel}. Required on UI: ${reqUi} (not applicable when the field is missing).`;
  } else {
    actualResult =
      `UI shows "${ui}". Required in ${workbook}: ${reqExcel}. Required on UI: ${reqUi}. ` +
      `Presence or required flag does not match the ${workbook} expectation (see Expected Result).`;
  }

  let expectedResult: string;
  if (ui === "—") {
    expectedResult =
      `"${field}" should be discoverable on the New Lead modal when listed in ${workbook}, ` +
      `with labeling consistent with the layout (note: dependent fields may only appear after controlling values are set).`;
  } else {
    expectedResult =
      `Required on the UI should match ${workbook}: Required in ${workbook} is **${reqExcel}** (red = Yes). ` +
      `Currently Required on UI is **${reqUi}**.`;
  }

  const attachmentFile =
    opts?.draftIndex != null
      ? `draft-${String(opts.draftIndex).padStart(2, "0")}.png`
      : "draft-NN.png";
  const attachments =
    `${attachmentFile} — Screenshot of the New Lead modal showing the discrepancy for "${field}".`;

  return [
    "Bug Description:",
    bugDescription,
    "",
    "Steps to Reproduce:",
    stepsToReproduce,
    "",
    "Actual Result:",
    actualResult,
    "",
    "Expected Result:",
    expectedResult,
    "",
    "Attachments:",
    attachments,
  ].join("\n");
}

/** Subfolder of `test-results/` for Part 3 discrepancy PNGs (aligned with JIRA draft order). */
export const PART3_BUG_SCREENSHOT_SUBDIR = "part3-bug-screenshots";

function escapeRegExpForLabel(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uiFieldLabelLineRegex(uiLabel: string): RegExp {
  const esc = escapeRegExpForLabel(uiLabel.trim());
  return new RegExp(
    `^\\s*${esc}\\s*(\\*|\\(Required\\)|\\(required\\))?$`,
    "i",
  );
}

async function isUnderPreferredCommunicationPreferenceSection(loc: Locator): Promise<boolean> {
  return loc.evaluate((el) => {
    const bad = /preferred\s+communication|communication\s+preference/i;
    let p: Element | null = el as Element;
    let depth = 0;
    while (p && p !== document.body && depth++ < 48) {
      if (p.matches?.("fieldset")) {
        const leg = p.querySelector("legend");
        if (leg && bad.test((leg.textContent || "").replace(/\s+/g, " ").trim())) return true;
      }
      const tag = p.tagName.toLowerCase();
      if (tag === "legend" || tag === "h2" || tag === "h3" || tag === "h4") {
        const txt = (p.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160);
        if (bad.test(txt)) return true;
      }
      const cls = (p.className && String(p.className)) || "";
      if (
        /\bslds-section__title\b/.test(cls) ||
        /\bslds-form-element__legend\b/.test(cls)
      ) {
        const txt = (p.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160);
        if (bad.test(txt)) return true;
      }
      p = p.parentElement;
    }
    return false;
  });
}

/**
 * Scrolls to the failing control and screenshots the tightest container (LWC field host or SLDS form row).
 * Skips controls under **Preferred Communication** / **Communication Preference** so workbook **Email**
 * targets the address field, not an "Email" option in that section. Uses {@link picklistCombobox} when relevant.
 */
async function screenshotDiscrepancyFieldRow(
  page: Page,
  modal: Locator,
  uiLabel: string,
  excelFieldName: string,
  outPath: string,
): Promise<boolean> {
  const labelLine = uiFieldLabelLineRegex(uiLabel);
  const esc = escapeRegExpForLabel(uiLabel.trim());
  const nameRe = new RegExp(
    `^\\s*${esc}\\s*(\\*|\\(Required\\)|\\(required\\))?\\s*$`,
    "i",
  );
  const isWorkbookEmailAddressField = matchKey(excelFieldName) === "email";

  async function captureFieldScreenshot(loc: Locator): Promise<boolean> {
    if (await isUnderPreferredCommunicationPreferenceSection(loc)) return false;
    await loc.scrollIntoViewIfNeeded({ timeout: 12_000 }).catch(() => {});
    await page.waitForTimeout(140);
    if (!(await loc.isVisible({ timeout: 3_000 }).catch(() => false))) return false;

    const lwcHost = loc
      .locator(
        "lightning-input-field, lightning-textarea-field, lightning-combobox, lightning-picklist, lightning-lookup, lightning-base-combobox",
      )
      .first();
    if (
      (await lwcHost.count()) > 0 &&
      (await lwcHost.isVisible({ timeout: 900 }).catch(() => false))
    ) {
      if (await isUnderPreferredCommunicationPreferenceSection(lwcHost)) return false;
      await lwcHost.screenshot({ path: outPath, type: "png" });
      return true;
    }

    const hostXpaths = [
      "xpath=ancestor::lightning-input-field[1]",
      "xpath=ancestor::lightning-textarea-field[1]",
      "xpath=ancestor::lightning-combobox[1]",
      "xpath=ancestor::lightning-picklist[1]",
    ];
    for (const xp of hostXpaths) {
      const w = loc.locator(xp);
      if ((await w.count()) > 0 && (await w.first().isVisible({ timeout: 500 }).catch(() => false))) {
        if (await isUnderPreferredCommunicationPreferenceSection(w.first())) continue;
        await w.first().screenshot({ path: outPath, type: "png" });
        return true;
      }
    }

    const sldsRow = loc.locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " slds-form-element ")][1]',
    );
    if (
      (await sldsRow.count()) > 0 &&
      (await sldsRow.first().isVisible({ timeout: 500 }).catch(() => false))
    ) {
      if (await isUnderPreferredCommunicationPreferenceSection(sldsRow.first())) return false;
      await sldsRow.first().screenshot({ path: outPath, type: "png" });
      return true;
    }

    await loc.screenshot({ path: outPath, type: "png" });
    return true;
  }

  if (isWorkbookEmailAddressField) {
    const emailInputs = modal.locator('input[type="email"]');
    const n = await emailInputs.count();
    for (let i = 0; i < n; i++) {
      if (await captureFieldScreenshot(emailInputs.nth(i))) return true;
    }
  }

  if (!isWorkbookEmailAddressField) {
    const combo = picklistCombobox(modal, uiLabel);
    if (await captureFieldScreenshot(combo)) return true;
  }

  const textboxes = modal.getByRole("textbox", { name: nameRe });
  const tbCount = await textboxes.count();
  for (let i = 0; i < tbCount; i++) {
    if (await captureFieldScreenshot(textboxes.nth(i))) return true;
  }

  const spins = modal.getByRole("spinbutton", { name: nameRe });
  const spCount = await spins.count();
  for (let i = 0; i < spCount; i++) {
    if (await captureFieldScreenshot(spins.nth(i))) return true;
  }

  const formRows = modal.locator(".slds-form-element, lightning-input-field").filter({
    has: page
      .locator(
        "label, .slds-form-element__label, span.slds-form-element__label, legend",
      )
      .filter({ hasText: labelLine }),
  });
  const frCount = await formRows.count();
  for (let i = 0; i < frCount; i++) {
    if (await captureFieldScreenshot(formRows.nth(i))) return true;
  }

  return false;
}

/**
 * For each failed Part 3 row (same order as JIRA drafts), captures a PNG focused on that field’s control
 * (picklist combobox, textbox, spinbutton, or SLDS / LWC row). If the field is missing from the UI (`—`),
 * falls back to the full modal. If the field exists but cannot be isolated, uses **.slds-modal__content** only.
 *
 * Set `SF_PART3_SKIP_BUG_SCREENSHOTS=1` to skip (e.g. faster local runs).
 */
export async function capturePart3BugDiscrepancyScreenshots(
  page: Page,
  modal: Locator,
  failed: LeadCreationModalPart3Row[],
  uiHarvest: { label: string; required: boolean }[],
): Promise<string[]> {
  if (process.env.SF_PART3_SKIP_BUG_SCREENSHOTS?.trim() === "1") {
    console.log("\n[Part 3] SF_PART3_SKIP_BUG_SCREENSHOTS=1 — skipping discrepancy screenshots.\n");
    return [];
  }

  const dir = path.join(process.cwd(), "test-results", PART3_BUG_SCREENSHOT_SUBDIR);
  try {
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (/^draft-\d+\.png$/i.test(f)) {
          fs.unlinkSync(path.join(dir, f));
        }
      }
    }
  } catch {
    /* ignore */
  }
  fs.mkdirSync(dir, { recursive: true });
  const paths: string[] = [];

  for (let i = 0; i < failed.length; i++) {
    const row = failed[i]!;
    const uiLabel = uiFieldLabelForExcelField(row["Fields in Excel"], uiHarvest);
    const fileName = `draft-${String(i + 1).padStart(2, "0")}.png`;
    const outPath = path.join(dir, fileName);

    if (row["Fields on UI"] !== "—") {
      const fieldShot = await screenshotDiscrepancyFieldRow(
        page,
        modal,
        uiLabel,
        row["Fields in Excel"],
        outPath,
      );
      if (!fieldShot) {
        console.warn(
          `[Part 3] Could not isolate control for "${uiLabel}" (${row["Fields in Excel"]}) — using modal content screenshot.`,
        );
        const content = modal.locator(".slds-modal__content").first();
        if (await content.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await content.screenshot({ path: outPath, type: "png" });
        } else {
          await modal.screenshot({ path: outPath, type: "png" });
        }
      }
    } else {
      await modal.screenshot({ path: outPath, type: "png" });
    }

    paths.push(outPath);
    console.log(`[Part 3] Discrepancy screenshot: ${path.relative(process.cwd(), outPath)} (${row["Fields in Excel"]})`);
  }

  return paths;
}

/**
 * Writes one JIRA draft per failed row to **test-results/part3-jira-bugs.txt** and returns full text.
 */
export function writePart3JiraBugDraftsFile(
  failed: LeadCreationModalPart3Row[],
  workbookPath: string,
  opts?: Part3JiraBugOptions,
): { filePath: string; combinedText: string } {
  const blocks = failed.map((row, index) => {
    const header = `--- JIRA draft ${index + 1} of ${failed.length} (Part 3) ---`;
    const title = part3JiraBugSummary(row);
    const body = formatPart3JiraBug(row, { draftIndex: index + 1, ...opts });
    return `${header}\n\nBug Title:\n${title}\n\n${body}`;
  });
  const combinedText = blocks.join("\n\n\n");
  const outDir = path.join(process.cwd(), "test-results");
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, "part3-jira-bugs.txt");
  fs.writeFileSync(filePath, combinedText, "utf8");
  return { filePath, combinedText };
}

/**
 * **Part 3:** Compare **Field Layout.xlsx** labels (red = required) with the New Lead modal
 * (asterisk / SLDS required). Prints `console.table`. Failed rows do **not** fail the test;
 * they emit JIRA-formatted drafts to stdout and **test-results/part3-jira-bugs.txt**.
 * PNGs for Jira attachments: **test-results/part3-bug-screenshots/draft-NN.png** (see {@link capturePart3BugDiscrepancyScreenshots}).
 */
export type RunLeadCreationModalPart3Options = {
  /**
   * Omit the full BU×Portfolio cross-product (can take many minutes).
   * Env `SF_PART3_SKIP_BU_PORTFOLIO_MATRIX=1` skips as well.
   */
  skipBusinessUnitPortfolioMatrix?: boolean;
};

export async function runLeadCreationModalPart3(
  page: Page,
  modal: Locator,
  opts?: RunLeadCreationModalPart3Options,
): Promise<void> {
  const workbookPath = defaultLeadModalFieldLayoutPath();
  const excelFields = await loadLeadModalFieldsFromWorkbook(workbookPath);
  const skipMatrix =
    opts?.skipBusinessUnitPortfolioMatrix === true ||
    process.env.SF_PART3_SKIP_BU_PORTFOLIO_MATRIX?.trim() === "1";
  if (skipMatrix) {
    console.warn(
      "\n[Part 3] Skipping Business Unit × Portfolio matrix — Procurement Classification Part 1/2 may fail " +
        "without a validated BU/Portfolio pair on the modal (unset SF_PART3_SKIP_BU_PORTFOLIO_MATRIX=1).\n",
    );
  } else {
    await runPart3BusinessUnitPortfolioMatrix(page, modal);
  }
  // Scroll through the modal so lower sections render before the Excel vs UI label harvest.
  await settleLeadModalForFieldScan(page, modal);
  // Unqualified Reason = Other → Facility Department = Other (BU/Portfolio unchanged from matrix).
  await selectPart3ControllingPicklistValues(page, modal);
  const uiFields = await collectLeadModalUILabels(modal);
  const rows = buildLeadCreationModalPart3Rows(excelFields, uiFields);
  logLeadCreationModalPart3Table(rows);

  const failed = rows.filter((r) => r.Status === "Fail");
  if (failed.length === 0) {
    console.log("\n[Part 3] All rows passed — no JIRA drafts generated.\n");
    return;
  }

  await capturePart3BugDiscrepancyScreenshots(page, modal, failed, uiFields);

  const { filePath, combinedText } = writePart3JiraBugDraftsFile(failed, workbookPath);

  console.log(
    `\n[Part 3] ${failed.length} row(s) with Status=${formatFailStatus("Fail")} — JIRA draft(s) saved to:\n${filePath}\n`,
  );
  console.log(combinedText);
  console.log("");
}
