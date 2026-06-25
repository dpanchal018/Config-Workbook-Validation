import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { consoleTableWithStatusHighlight } from "./consoleTableStatus";
import {
  assertPicklistEnabledAfterDependency,
  clickPicklistOptionInOpenList,
  dismissOpenPicklistIfVisible,
  expectPicklistShowsValue,
  openPicklistDropdown,
  picklistOptionMatchKey,
  PROCUREMENT_CHANNEL_FIELD,
  PROCUREMENT_SECTOR_FIELD,
  readOpenPicklistOptions,
  readPicklistDisplayedValue,
} from "./salesforceProcurementPicklists";
import { prepareProcurementClassificationForInteraction } from "./salesforceNavigation";
import {
  isProcurementTestVerbose,
  PROCUREMENT_TEST_VERBOSE_ENV,
} from "./procurementTestLog";

export { PROCUREMENT_TEST_VERBOSE_ENV };

function part1DetailLog(...args: Parameters<typeof console.log>): void {
  if (isProcurementTestVerbose()) console.log(...args);
}

function part1DetailWarn(...args: Parameters<typeof console.warn>): void {
  if (isProcurementTestVerbose()) console.warn(...args);
}

/** Fixed values for Part 1 (per business flow). */
export const PART1_VALUES = {
  procurementSector: "Public",
  procurementChannel: "NUPCO",
  /** Request Type: first value, then same picklist reopened for Tender, then reopened again for Direct Purchase. */
  requestType: "Marketplace",
  requestTypeTender: "Tender",
  requestTypeFinal: "Direct Purchase",
  /** First Procurement Channel change in phase 2 (reopen channel after Direct Purchase; Etimad is a channel value only). */
  part2ProcurementChannel: "Etimad",
  part3ProcurementChannel: "Non-NUPCO",
  /** Request Type when Procurement Channel = Non-NUPCO (first selection on that dependent picklist). */
  part3RequestType: "Tender",
  /** Re-open Request Type after Tender (still Non-NUPCO) and select KFSH. */
  part3RequestTypeKfsh: "KFSH",
} as const;

/**
 * Legacy env name (no longer required): continuation after Direct Purchase runs by default.
 * Kept so existing docs/scripts that reference this constant still resolve.
 */
export const PART1_CONTINUE_AFTER_CHANNEL_ETIMAD_ENV =
  "SF_PART1_CONTINUE_AFTER_CHANNEL_ETIMAD" as const;

/** When set to `1`, Part 1 stops after Request Type = Direct Purchase (skips channel Etimad → Non-NUPCO and later steps). */
export const PART1_SKIP_CHANNEL_ETIMAD_CONTINUATION_ENV =
  "SF_PART1_SKIP_CHANNEL_ETIMAD_CONTINUATION" as const;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Status for each matrix row in {@link logPart1ProcurementClassificationMatrix}. */
export type Part1ProcurementClassificationMatrixStatus =
  | "Pass"
  | "Fail"
  | "Skip";

export type Part1ProcurementClassificationMatrixRow = {
  Sector: string;
  Channel: string;
  "Request Type": string;
  Status: Part1ProcurementClassificationMatrixStatus;
};

/**
 * Rows for the spreadsheet-style checklist (Public + each channel/request-type pair Part 1 covers).
 * When `fullContinuation` is false (stopped after NUPCO Direct Purchase), Etimad / Non-NUPCO rows are **Skip**.
 */
export function getPart1ProcurementClassificationMatrixRows(
  fullContinuation: boolean,
): Part1ProcurementClassificationMatrixRow[] {
  const v = PART1_VALUES;
  const sector = v.procurementSector;
  const definitions: Omit<
    Part1ProcurementClassificationMatrixRow,
    "Status"
  >[] = [
    {
      Sector: sector,
      Channel: v.procurementChannel,
      "Request Type": v.requestType,
    },
    {
      Sector: sector,
      Channel: v.procurementChannel,
      "Request Type": v.requestTypeTender,
    },
    {
      Sector: sector,
      Channel: v.procurementChannel,
      "Request Type": v.requestTypeFinal,
    },
    {
      Sector: sector,
      Channel: v.part2ProcurementChannel,
      "Request Type": v.requestTypeFinal,
    },
    {
      Sector: sector,
      Channel: v.part3ProcurementChannel,
      "Request Type": v.part3RequestType,
    },
    {
      Sector: sector,
      Channel: v.part3ProcurementChannel,
      "Request Type": v.part3RequestTypeKfsh,
    },
  ];

  return definitions.map((row, index) => ({
    ...row,
    Status: fullContinuation
      ? "Pass"
      : index < 3
        ? "Pass"
        : "Skip",
  }));
}

/** Prints the Part 1 matrix (Pass / Skip) to the terminal — the default summary when verbose logging is off. */
export function logPart1ProcurementClassificationMatrix(
  fullContinuation: boolean,
): void {
  const rows = getPart1ProcurementClassificationMatrixRows(fullContinuation);
  consoleTableWithStatusHighlight(rows);
}

/** Prints picklist values as a numbered table in the terminal. */
export function logPicklistValuesTable(title: string, options: string[]): void {
  if (!isProcurementTestVerbose()) return;
  part1DetailLog(`\n${"─".repeat(72)}`);
  part1DetailLog(title);
  part1DetailLog("─".repeat(72));
  console.table(options.map((value, idx) => ({ "#": idx + 1, Value: value })));
}

/** Renders the same table on the Salesforce UI for a short time. */
export async function showPicklistValuesTableOnPage(
  page: Page,
  title: string,
  options: string[],
): Promise<void> {
  if (!isProcurementTestVerbose()) return;
  const rows = options
    .map(
      (v, i) =>
        `<tr><td style="padding:6px 10px;border:1px solid #334155">${i + 1}</td><td style="padding:6px 10px;border:1px solid #334155">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:system-ui,Segoe UI,sans-serif"><strong>${escapeHtml(title)}</strong><table style="border-collapse:collapse;margin-top:8px;width:100%">${rows}</table></div>`;

  await page.evaluate((inner) => {
    const id = "pw-procurement-part1-table";
    document.getElementById(id)?.remove();
    const el = document.createElement("div");
    el.id = id;
    el.style.cssText = [
      "position:fixed",
      "top:72px",
      "right:20px",
      "max-width:440px",
      "max-height:70vh",
      "overflow:auto",
      "z-index:2147483646",
      "background:#0f172a",
      "color:#e2e8f0",
      "padding:14px 16px",
      "font-size:13px",
      "border-radius:10px",
      "box-shadow:0 8px 32px rgba(0,0,0,.45)",
      "border:1px solid #334155",
    ].join(";");
    el.innerHTML = inner;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 18_000);
  }, html);
}

export function validateProcurementSectorPicklist(options: string[]): void {
  const text = options.join(" | ").toLowerCase();
  expect(
    text.includes("public"),
    `Sector picklist should include Public. Values: ${JSON.stringify(options)}`,
  ).toBeTruthy();
  expect(
    text.includes("private"),
    `Sector picklist should include Private. Values: ${JSON.stringify(options)}`,
  ).toBeTruthy();
}

export function validateProcurementChannelPicklistForPublic(
  options: string[],
): void {
  expect(
    options.some((o) => /^nupco$/i.test(o.trim())),
    `Channel picklist (Sector=Public) should include NUPCO. Values: ${JSON.stringify(options)}`,
  ).toBeTruthy();
}

/** Procurement Channel when **Procurement Sector** = Private (Part 2). */
export function validateProcurementChannelPicklistForPrivateIncludesTender(
  options: string[],
): void {
  expect(
    options.some((o) => /^tender$/i.test(o.trim())),
    `Channel picklist (Sector=Private) should include Tender. Values: ${JSON.stringify(options)}`,
  ).toBeTruthy();
}

export function validateProcurementChannelPicklistIncludesDirectPurchase(
  options: string[],
): void {
  expect(
    options.some((o) => {
      const n = o.trim().replace(/\s+/g, " ").toLowerCase();
      return n === "direct purchase";
    }),
    `Procurement Channel picklist should include Direct Purchase. Values: ${JSON.stringify(options)}`,
  ).toBeTruthy();
}

export function validateRequestTypePicklistForNupco(
  options: string[],
): void {
  expect(
    options.some((o) => /^marketplace$/i.test(o.trim())),
    `Request Type picklist (Channel=NUPCO) should include Marketplace. Values: ${JSON.stringify(options)}`,
  ).toBeTruthy();
}

export function validateRequestTypePicklistIncludesTender(
  options: string[],
): void {
  expect(
    options.some((o) => /^tender$/i.test(o.trim())),
    `Request Type picklist should include Tender. Values: ${JSON.stringify(options)}`,
  ).toBeTruthy();
}

export function validateRequestTypePicklistIncludesNormal(
  options: string[],
): void {
  expect(
    options.some((o) => /^normal$/i.test(o.trim())),
    `Request Type picklist should include Normal. Values: ${JSON.stringify(options)}`,
  ).toBeTruthy();
}

export function validateRequestTypePicklistIncludesBudgetary(
  options: string[],
): void {
  expect(
    options.some((o) => /^budgetary$/i.test(o.trim())),
    `Request Type picklist should include Budgetary. Values: ${JSON.stringify(options)}`,
  ).toBeTruthy();
}

export function validateRequestTypePicklistIncludesKfsh(
  options: string[],
): void {
  expect(
    options.some((o) => /^kfsh$/i.test(o.trim())),
    `Request Type picklist (Non-NUPCO, after Tender) should include KFSH. Values: ${JSON.stringify(options)}`,
  ).toBeTruthy();
}

export function validateProcurementChannelPicklistIncludesEtimad(
  options: string[],
): void {
  expect(
    options.some((o) => /^etimad$/i.test(o.trim())),
    `Procurement Channel picklist should include Etimad (Public is a Sector value, not Channel). Values: ${JSON.stringify(options)}`,
  ).toBeTruthy();
}

export function validateProcurementChannelPicklistIncludesNonNupco(
  options: string[],
): void {
  const wantKey = picklistOptionMatchKey(PART1_VALUES.part3ProcurementChannel);
  expect(
    options.some((o) => picklistOptionMatchKey(o) === wantKey),
    `Procurement Channel picklist should include Non-NUPCO (hyphen/space variants). Values: ${JSON.stringify(options)}`,
  ).toBeTruthy();
}

export function validateProcurementSectorPicklistIncludesEtimad(
  options: string[],
): void {
  expect(
    options.some((o) => /^etimad$/i.test(o.trim())),
    `Procurement Sector picklist should include Etimad. Values: ${JSON.stringify(options)}`,
  ).toBeTruthy();
}

export function validateRequestTypePicklistIncludesDirectPurchase(
  options: string[],
): void {
  expect(
    options.some((o) => {
      const n = o.trim().replace(/\s+/g, " ").toLowerCase();
      return n === "direct purchase";
    }),
    `Request Type picklist should include Direct Purchase (reopen after Tender). Values: ${JSON.stringify(options)}`,
  ).toBeTruthy();
}

/**
 * Part 1 only works when Procurement Sector is Public. Verifies the field shows Public;
 * if not, re-opens the picklist and selects Public again (limited retries), then fails with a clear error.
 */
export async function ensureProcurementSectorIsPublic(
  page: Page,
  modal: Locator,
  maxAttempts = 3,
): Promise<void> {
  const label = PART1_VALUES.procurementSector;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await expectPicklistShowsValue(modal, PROCUREMENT_SECTOR_FIELD, label);
      part1DetailLog(
        `[Part 1] Confirmed Procurement Sector is "${label}" — downstream steps can run.`,
      );
      return;
    } catch {
      const raw = await readPicklistDisplayedValue(
        modal,
        PROCUREMENT_SECTOR_FIELD,
      ).catch(() => "(unreadable)");
      part1DetailWarn(
        `[Part 1] Procurement Sector is not "${label}" yet (shows "${raw}"). ` +
          `Re-opening picklist and selecting "${label}" (attempt ${attempt + 2}/${maxAttempts}).`,
      );
      if (attempt === maxAttempts - 1) {
        throw new Error(
          `Part 1 requires Procurement Sector = "${label}". Last read value: "${raw}". ` +
            `If the option row uses custom HTML/CSS, share that markup so we can add a locator.`,
        );
      }
      const sectorListbox = await openPicklistDropdown(
        page,
        modal,
        PROCUREMENT_SECTOR_FIELD,
      );
      await clickPicklistOptionInOpenList(sectorListbox, label);
    }
  }
}

/**
 * Escape would close the whole New Lead SLDS modal when no picklist listbox is focused.
 * Only send Escape if a listbox is actually open (stuck overlay from a prior dropdown).
 */
async function dismissOpenListboxIfVisible(page: Page): Promise<void> {
  await dismissOpenPicklistIfVisible(page);
}

/**
 * Opens Procurement Channel, validates options, then selects the value with retries
 * (Etimad / Non-NUPCO). Does not press Escape unless a listbox is open — avoids closing the modal.
 */
async function selectProcurementChannelOptionWithRetry(
  page: Page,
  modal: Locator,
  optionLabel: string,
  validateOptions: (options: string[]) => void,
  logTableTitle: string,
  showPageTitle: string,
): Promise<void> {
  await dismissOpenListboxIfVisible(page);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        await dismissOpenListboxIfVisible(page);
        await page.waitForTimeout(150);
      }
      const listbox = await openPicklistDropdown(page, modal, PROCUREMENT_CHANNEL_FIELD);
      await page.waitForTimeout(250);
      const opts = await readOpenPicklistOptions(listbox);
      validateOptions(opts);
      if (attempt === 0) {
        logPicklistValuesTable(logTableTitle, opts);
        await showPicklistValuesTableOnPage(page, showPageTitle, opts);
      }
      await clickPicklistOptionInOpenList(listbox, optionLabel);
      await expectPicklistShowsValue(modal, PROCUREMENT_CHANNEL_FIELD, optionLabel);
      return;
    } catch (e) {
      if (attempt === 2) throw e;
      part1DetailWarn(
        `[Part 1] Procurement Channel → "${optionLabel}" attempt ${attempt + 1}/3 failed; retrying.`,
      );
    }
  }
}

/**
 * Part 1: Procurement Sector → Public; Channel → NUPCO; Request Type → Marketplace → Tender → Direct Purchase,
 * then by default continues with Procurement Channel → **Etimad** → **Non-NUPCO**,
 * keeps **Procurement Sector** = Public, then Request Type → Tender → reopen → **KFSH** for Non-NUPCO (see {@link continueProcurementClassificationPart1AfterChannelEtimad}).
 * Set {@link PART1_SKIP_CHANNEL_ETIMAD_CONTINUATION_ENV}=`1` to stop after Direct Purchase only.
 *
 * Terminal output is quiet by default (only the final Pass/Skip matrix). Set
 * {@link PROCUREMENT_TEST_VERBOSE_ENV}=`1` for step logs, picklist tables, and on-page overlays.
 */
export async function runProcurementClassificationPart1(
  page: Page,
  modal: Locator,
): Promise<void> {
  const {
    procurementSector,
    procurementChannel,
    requestType,
    requestTypeTender,
    requestTypeFinal,
  } = PART1_VALUES;

  await prepareProcurementClassificationForInteraction(page, modal);

  part1DetailLog("\n[Part 1] Steps 1–2: Open Procurement Sector and capture picklist values");
  const sectorListbox = await openPicklistDropdown(
    page,
    modal,
    PROCUREMENT_SECTOR_FIELD,
  );
  const sectorOptions = await readOpenPicklistOptions(sectorListbox);
  validateProcurementSectorPicklist(sectorOptions);
  logPicklistValuesTable("Procurement Sector — picklist values", sectorOptions);
  await showPicklistValuesTableOnPage(
    page,
    "Procurement Sector — picklist values",
    sectorOptions,
  );

  part1DetailLog("[Part 1] Step 3: Select Public on Procurement Sector");
  await clickPicklistOptionInOpenList(sectorListbox, procurementSector);
  await ensureProcurementSectorIsPublic(page, modal);

  part1DetailLog("[Part 1] Step 4: Verify Procurement Channel is enabled");
  await assertPicklistEnabledAfterDependency(
    modal,
    PROCUREMENT_CHANNEL_FIELD,
    `after Procurement Sector = "${procurementSector}"`,
  );

  part1DetailLog(
    "[Part 1] Steps 5–6: Open Procurement Channel, show values for Sector=Public, select NUPCO",
  );
  const channelListbox = await openPicklistDropdown(
    page,
    modal,
    PROCUREMENT_CHANNEL_FIELD,
  );
  const channelOptions = await readOpenPicklistOptions(channelListbox);
  validateProcurementChannelPicklistForPublic(channelOptions);
  logPicklistValuesTable(
    `Procurement Channel — picklist values (Procurement Sector = "${procurementSector}")`,
    channelOptions,
  );
  await showPicklistValuesTableOnPage(
    page,
    `Procurement Channel (Procurement Sector = ${procurementSector})`,
    channelOptions,
  );
  await clickPicklistOptionInOpenList(channelListbox, procurementChannel);

  part1DetailLog(
    "[Part 1] Step 7: Verify Request Type is enabled after NUPCO on Procurement Channel",
  );
  await assertPicklistEnabledAfterDependency(
    modal,
    "Request Type",
    `after Procurement Channel = "${procurementChannel}"`,
  );

  part1DetailLog(
    "[Part 1] Steps 8–9: Open Request Type, show values for Channel=NUPCO, select Marketplace",
  );
  const requestTypeListbox = await openPicklistDropdown(
    page,
    modal,
    "Request Type",
  );
  const requestTypeOptions = await readOpenPicklistOptions(requestTypeListbox);
  validateRequestTypePicklistForNupco(requestTypeOptions);
  logPicklistValuesTable(
    `Request Type — picklist values (Procurement Channel = "${procurementChannel}")`,
    requestTypeOptions,
  );
  await showPicklistValuesTableOnPage(
    page,
    `Request Type (Procurement Channel = ${procurementChannel})`,
    requestTypeOptions,
  );
  await clickPicklistOptionInOpenList(requestTypeListbox, requestType);
  await expectPicklistShowsValue(modal, "Request Type", requestType);

  part1DetailLog(
    `[Part 1] Steps 10–11: Re-open Request Type and select "${requestTypeTender}"`,
  );
  const requestTypeListboxTender = await openPicklistDropdown(
    page,
    modal,
    "Request Type",
  );
  const requestTypeOptionsTender =
    await readOpenPicklistOptions(requestTypeListboxTender);
  validateRequestTypePicklistIncludesTender(requestTypeOptionsTender);
  logPicklistValuesTable(
    `Request Type — picklist values (after "${requestType}", before "${requestTypeTender}")`,
    requestTypeOptionsTender,
  );
  await showPicklistValuesTableOnPage(
    page,
    `Request Type — reopen 1 (${requestType} → ${requestTypeTender})`,
    requestTypeOptionsTender,
  );
  await clickPicklistOptionInOpenList(
    requestTypeListboxTender,
    requestTypeTender,
  );
  await expectPicklistShowsValue(modal, "Request Type", requestTypeTender);

  part1DetailLog(
    `[Part 1] Steps 12–13: Re-open Request Type and select "${requestTypeFinal}"`,
  );
  const requestTypeListboxDirect = await openPicklistDropdown(
    page,
    modal,
    "Request Type",
  );
  const requestTypeOptionsDirect =
    await readOpenPicklistOptions(requestTypeListboxDirect);
  validateRequestTypePicklistIncludesDirectPurchase(requestTypeOptionsDirect);
  logPicklistValuesTable(
    `Request Type — picklist values (after "${requestTypeTender}", before "${requestTypeFinal}")`,
    requestTypeOptionsDirect,
  );
  await showPicklistValuesTableOnPage(
    page,
    `Request Type — reopen 2 (${requestTypeTender} → ${requestTypeFinal})`,
    requestTypeOptionsDirect,
  );
  await clickPicklistOptionInOpenList(
    requestTypeListboxDirect,
    requestTypeFinal,
  );
  await expectPicklistShowsValue(modal, "Request Type", requestTypeFinal);

  if (
    process.env[PART1_SKIP_CHANNEL_ETIMAD_CONTINUATION_ENV]?.trim() === "1"
  ) {
    part1DetailLog(
      `\n[Part 1] Stopped after Request Type="${requestTypeFinal}" (${PART1_SKIP_CHANNEL_ETIMAD_CONTINUATION_ENV}=1).\n`,
    );
    logPart1ProcurementClassificationMatrix(false);
    return;
  }

  await continueProcurementClassificationPart1AfterChannelEtimad(page, modal);
}

/**
 * After Request Type = Direct Purchase (with Channel still NUPCO): reopen **Procurement Channel** → **Etimad**,
 * then **Non-NUPCO**; sector stays **Public**; then **Request Type** → `part3RequestType` (Tender), reopen, → `part3RequestTypeKfsh` (KFSH).
 * Invoked automatically from {@link runProcurementClassificationPart1} unless the skip env is set.
 */
export async function continueProcurementClassificationPart1AfterChannelEtimad(
  page: Page,
  modal: Locator,
): Promise<void> {
  const {
    procurementChannel,
    procurementSector,
    requestTypeFinal,
    part2ProcurementChannel,
    part3ProcurementChannel,
    part3RequestType,
    part3RequestTypeKfsh,
  } = PART1_VALUES;

  part1DetailLog(
    `[Part 1] Continuation — Step 17: Expect Request Type = "${requestTypeFinal}" and Procurement Channel = "${procurementChannel}"`,
  );
  await expectPicklistShowsValue(modal, "Request Type", requestTypeFinal);
  await expectPicklistShowsValue(modal, PROCUREMENT_CHANNEL_FIELD, procurementChannel);

  part1DetailLog(
    `[Part 1] Continuation — Step 18: Verify Procurement Channel after Request Type = "${requestTypeFinal}"`,
  );
  await assertPicklistEnabledAfterDependency(
    modal,
    PROCUREMENT_CHANNEL_FIELD,
    `after Request Type = "${requestTypeFinal}"`,
  );

  part1DetailLog(
    `[Part 1] Continuation — Steps 19–20: Procurement Channel → ${part2ProcurementChannel}`,
  );
  await selectProcurementChannelOptionWithRetry(
    page,
    modal,
    part2ProcurementChannel,
    validateProcurementChannelPicklistIncludesEtimad,
    `Procurement Channel — continuation (after Request Type = "${requestTypeFinal}")`,
    `Procurement Channel — continuation → ${part2ProcurementChannel}`,
  );

  part1DetailLog(
    `[Part 1] Continuation — Steps 21–22: Re-open Procurement Channel → ${part3ProcurementChannel}`,
  );
  await selectProcurementChannelOptionWithRetry(
    page,
    modal,
    part3ProcurementChannel,
    validateProcurementChannelPicklistIncludesNonNupco,
    `Procurement Channel — after "${part2ProcurementChannel}", select "${part3ProcurementChannel}"`,
    `Procurement Channel — ${part2ProcurementChannel} → ${part3ProcurementChannel}`,
  );

  part1DetailLog(
    `[Part 1] Continuation — Step 23: Verify Procurement Sector after Procurement Channel = "${part3ProcurementChannel}"`,
  );
  await assertPicklistEnabledAfterDependency(
    modal,
    PROCUREMENT_SECTOR_FIELD,
    `after Procurement Channel = "${part3ProcurementChannel}"`,
  );

  part1DetailLog(
    `[Part 1] Continuation — Steps 24–25: Confirm Procurement Sector stays "${procurementSector}" (Etimad applies to Procurement Channel only)`,
  );
  await ensureProcurementSectorIsPublic(page, modal);

  part1DetailLog(
    `[Part 1] Continuation — Step 26: Verify Request Type after Procurement Channel = "${part3ProcurementChannel}"`,
  );
  await assertPicklistEnabledAfterDependency(
    modal,
    "Request Type",
    `after Procurement Channel = "${part3ProcurementChannel}" (Procurement Sector = "${procurementSector}")`,
  );

  part1DetailLog(
    `[Part 1] Continuation — Steps 27–28: Request Type → ${part3RequestType} (Procurement Channel = "${part3ProcurementChannel}"; no Direct Purchase on this picklist)`,
  );
  const nonNupcoRequestTypeListbox = await openPicklistDropdown(
    page,
    modal,
    "Request Type",
  );
  const nonNupcoRequestTypeOptions = await readOpenPicklistOptions(
    nonNupcoRequestTypeListbox,
  );
  validateRequestTypePicklistIncludesTender(nonNupcoRequestTypeOptions);
  logPicklistValuesTable(
    `Request Type — after Procurement Channel = "${part3ProcurementChannel}" (Sector = "${procurementSector}")`,
    nonNupcoRequestTypeOptions,
  );
  await showPicklistValuesTableOnPage(
    page,
    `Request Type — Non-NUPCO → ${part3RequestType}`,
    nonNupcoRequestTypeOptions,
  );
  await clickPicklistOptionInOpenList(
    nonNupcoRequestTypeListbox,
    part3RequestType,
  );
  await expectPicklistShowsValue(modal, "Request Type", part3RequestType);
  await page.waitForTimeout(600);

  part1DetailLog(
    `[Part 1] Continuation — Step 29: Verify Request Type after "${part3RequestType}" (Procurement Channel = "${part3ProcurementChannel}")`,
  );
  await assertPicklistEnabledAfterDependency(
    modal,
    "Request Type",
    `after Request Type = "${part3RequestType}" (Procurement Channel = "${part3ProcurementChannel}")`,
  );

  part1DetailLog(
    `[Part 1] Continuation — Steps 30–31: Re-open Request Type → ${part3RequestTypeKfsh} (after "${part3RequestType}")`,
  );
  const kfshRequestTypeListbox = await openPicklistDropdown(
    page,
    modal,
    "Request Type",
  );
  const kfshRequestTypeOptions =
    await readOpenPicklistOptions(kfshRequestTypeListbox);
  validateRequestTypePicklistIncludesKfsh(kfshRequestTypeOptions);
  logPicklistValuesTable(
    `Request Type — after "${part3RequestType}" (Channel = "${part3ProcurementChannel}") → ${part3RequestTypeKfsh}`,
    kfshRequestTypeOptions,
  );
  await showPicklistValuesTableOnPage(
    page,
    `Request Type — reopen (${part3RequestType} → ${part3RequestTypeKfsh})`,
    kfshRequestTypeOptions,
  );
  await clickPicklistOptionInOpenList(
    kfshRequestTypeListbox,
    part3RequestTypeKfsh,
  );
  await expectPicklistShowsValue(modal, "Request Type", part3RequestTypeKfsh);

  logPart1ProcurementClassificationMatrix(true);
  part1DetailLog(
    `\n[Part 1] Finished (with continuation): Procurement Sector="${procurementSector}", Procurement Channel="${part3ProcurementChannel}", ` +
      `Request Type="${part3RequestTypeKfsh}" (channel: NUPCO → Etimad → Non-NUPCO; Request Type: ${part3RequestType} → ${part3RequestTypeKfsh})\n`,
  );
}
