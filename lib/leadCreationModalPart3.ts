import * as fs from "fs";
import * as path from "path";
import type { Locator, Page } from "@playwright/test";
import {
  defaultLeadModalFieldLayoutPath,
  loadLeadModalFieldsFromWorkbook,
  type LeadModalFieldFromExcel,
} from "./loadLeadModalFieldLayout";

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
  console.table(rows);
}

export type Part3JiraBugOptions = {
  workbookFileName?: string;
  priority?: string;
  severity?: string;
};

/**
 * One JIRA-ready bug draft per failed Part 3 row (paste into JIRA).
 */
export function formatPart3JiraBug(
  row: LeadCreationModalPart3Row,
  opts?: Part3JiraBugOptions,
): string {
  const workbookFileName = opts?.workbookFileName ?? "Field Layout.xlsx";
  const priority = opts?.priority ?? "Medium";
  const severity = opts?.severity ?? "Major";
  const field = row["Fields in Excel"];
  const ui = row["Fields on UI"];
  const reqExcel = row["Required in Excel"];
  const reqUi = row["Required on UI"];

  const bugSummary = `New Lead modal: "${field}" does not match ${workbookFileName} (Part 3 audit — Fail)`;

  const bugDescription =
    `Automated Lead Creation Modal Part 3 compared ${workbookFileName} to the live New Lead form. ` +
    `In that workbook, red font marks required fields; on the UI, required fields show an asterisk (*). ` +
    `This row failed the comparison for "${field}".`;

  const stepsToReproduce =
    `1. Log in to Salesforce.\n` +
    `2. Open Leads → click **New** to open the New Lead modal.\n` +
    `3. Run the Playwright flow that executes **Lead Creation Modal — Part 3** (Excel vs UI audit).\n` +
    `4. Inspect the Part 3 \`console.table\` output for the row **${field}**.`;

  let actualResult: string;
  if (ui === "—") {
    actualResult =
      `The workbook lists "${field}", but no matching field label was detected on the modal at audit time. ` +
      `Required in Excel: ${reqExcel}. Required on UI: ${reqUi} (not applicable when the field is missing).`;
  } else {
    actualResult =
      `UI shows "${ui}". Required in Excel: ${reqExcel}. Required on UI: ${reqUi}. ` +
      `Presence or required flag does not match the workbook expectation (see Expected Result).`;
  }

  let expectedResult: string;
  if (ui === "—") {
    expectedResult =
      `"${field}" should be discoverable on the New Lead modal when listed in ${workbookFileName}, ` +
      `with labeling consistent with the layout (note: dependent fields may only appear after controlling values are set).`;
  } else {
    expectedResult =
      `Required on the UI should match ${workbookFileName}: Required in Excel is **${reqExcel}** (red = Yes). ` +
      `Currently Required on UI is **${reqUi}**.`;
  }

  return [
    "Bug Summary:",
    bugSummary,
    "",
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
    "Priority:",
    priority,
    "",
    "Severity:",
    severity,
  ].join("\n");
}

/**
 * Writes one JIRA draft per failed row to **test-results/part3-jira-bugs.txt** and returns full text.
 */
export function writePart3JiraBugDraftsFile(
  failed: LeadCreationModalPart3Row[],
  workbookPath: string,
  opts?: Part3JiraBugOptions,
): { filePath: string; combinedText: string } {
  const workbookFileName = path.basename(workbookPath);
  const blocks = failed.map((row, index) => {
    const header = `--- JIRA draft ${index + 1} of ${failed.length} (Part 3) ---`;
    return `${header}\n\n${formatPart3JiraBug(row, { ...opts, workbookFileName })}`;
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
 */
export async function runLeadCreationModalPart3(
  page: Page,
  modal: Locator,
): Promise<void> {
  const workbookPath = defaultLeadModalFieldLayoutPath();
  const excelFields = await loadLeadModalFieldsFromWorkbook(workbookPath);
  await settleLeadModalForFieldScan(page, modal);
  const uiFields = await collectLeadModalUILabels(modal);
  const rows = buildLeadCreationModalPart3Rows(excelFields, uiFields);
  logLeadCreationModalPart3Table(rows);

  const failed = rows.filter((r) => r.Status === "Fail");
  if (failed.length === 0) {
    console.log("\n[Part 3] All rows passed — no JIRA drafts generated.\n");
    return;
  }

  const priority =
    process.env.SF_PART3_JIRA_PRIORITY?.trim() || "Medium";
  const severity =
    process.env.SF_PART3_JIRA_SEVERITY?.trim() || "Major";

  const { filePath, combinedText } = writePart3JiraBugDraftsFile(
    failed,
    workbookPath,
    { priority, severity },
  );

  console.log(
    `\n[Part 3] ${failed.length} row(s) with Status=Fail — JIRA draft(s) saved to:\n${filePath}\n`,
  );
  console.log(combinedText);
  console.log("");
}
