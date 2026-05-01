import type { Locator, Page } from "@playwright/test";
import {
  logPicklistValuesTable,
  showPicklistValuesTableOnPage,
  type Part1ProcurementClassificationMatrixRow,
  validateProcurementChannelPicklistForPrivateIncludesTender,
  validateProcurementChannelPicklistIncludesDirectPurchase,
  validateProcurementSectorPicklist,
  validateRequestTypePicklistIncludesBudgetary,
  validateRequestTypePicklistIncludesNormal,
} from "./procurementClassificationPart1";
import {
  assertPicklistDisabledForDependency,
  assertPicklistEnabledAfterDependency,
  clickPicklistOptionInOpenList,
  expectPicklistShowsValue,
  openPicklistDropdown,
  readOpenPicklistOptions,
} from "./salesforceProcurementPicklists";
import { isProcurementTestVerbose } from "./procurementTestLog";

function part2DetailLog(...args: Parameters<typeof console.log>): void {
  if (isProcurementTestVerbose()) console.log(...args);
}

async function dismissOpenListboxIfVisible(page: Page): Promise<void> {
  const lb = page.locator('[role="listbox"]').first();
  if (await lb.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await lb.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(300);
  } else {
    await page.waitForTimeout(200);
  }
}

/** Fixed values for Part 2 (after Part 1 completes on Public). */
export const PART2_VALUES = {
  procurementSector: "Private",
  /** Procurement Channel — first selection when Sector = Private. */
  procurementChannel: "Tender",
  /** Procurement Channel — reopen after Request Type = Budgetary and select Direct Purchase. */
  procurementChannelDirectPurchase: "Direct Purchase",
  /** Request Type — first selection after Procurement Channel = Tender. */
  requestTypeNormal: "Normal",
  /** Request Type — reopen after Normal and select Budgetary. */
  requestTypeBudgetary: "Budgetary",
} as const;

/** Matrix **Request Type** cell after Direct Purchase channel makes the picklist non-interactive. */
export const PART2_MATRIX_REQUEST_TYPE_DISABLED_LABEL =
  "(disabled — not selectable)" as const;

/** Same shape as Part 1 matrix rows; values mirror {@link PART2_VALUES} only. */
export type Part2ProcurementClassificationMatrixRow =
  Part1ProcurementClassificationMatrixRow;

/**
 * Part 2 UI progression: **Normal** → **Budgetary** on Request Type (channel **Tender**), then channel **Direct Purchase**.
 * Row 3 **Request Type** is **(disabled)** — the control is not selectable after Direct Purchase channel (may still show prior value on screen).
 */
export function getPart2ProcurementClassificationMatrixRows(): Part2ProcurementClassificationMatrixRow[] {
  const v = PART2_VALUES;
  return [
    {
      "Procurement Sector": v.procurementSector,
      "Procurement Channel": v.procurementChannel,
      "Request Type": v.requestTypeNormal,
      Status: "Pass",
    },
    {
      "Procurement Sector": v.procurementSector,
      "Procurement Channel": v.procurementChannel,
      "Request Type": v.requestTypeBudgetary,
      Status: "Pass",
    },
    {
      "Procurement Sector": v.procurementSector,
      "Procurement Channel": v.procurementChannelDirectPurchase,
      "Request Type": PART2_MATRIX_REQUEST_TYPE_DISABLED_LABEL,
      Status: "Pass",
    },
  ];
}

/** Terminal summary: `console.table` matching Part 2 picklist steps through Direct Purchase channel. */
export function logPart2ProcurementClassificationMatrix(): void {
  console.table(getPart2ProcurementClassificationMatrixRows());
}

/**
 * After Part 1: **Private** → channel **Tender** → **Request Type** **Normal** → **Budgetary** →
 * reopen **Procurement Channel** → **Direct Purchase**; then **Request Type** must be **disabled**.
 */
export async function runProcurementClassificationPart2(
  page: Page,
  section: Locator,
): Promise<void> {
  const {
    procurementSector,
    procurementChannel,
    procurementChannelDirectPurchase,
    requestTypeNormal,
    requestTypeBudgetary,
  } = PART2_VALUES;

  await dismissOpenListboxIfVisible(page);

  part2DetailLog(
    `[Part 2] Re-open Procurement Sector and select "${procurementSector}"`,
  );
  const listbox = await openPicklistDropdown(
    page,
    section,
    "Procurement Sector",
  );
  const options = await readOpenPicklistOptions(listbox);
  validateProcurementSectorPicklist(options);
  logPicklistValuesTable(
    `Part 2 — Procurement Sector (re-open before "${procurementSector}")`,
    options,
  );
  await showPicklistValuesTableOnPage(
    page,
    `Part 2 — Procurement Sector → ${procurementSector}`,
    options,
  );
  await clickPicklistOptionInOpenList(listbox, procurementSector);
  await expectPicklistShowsValue(section, "Procurement Sector", procurementSector);

  part2DetailLog(
    `[Part 2] Confirmed Procurement Sector = "${procurementSector}".`,
  );

  await dismissOpenListboxIfVisible(page);

  part2DetailLog(
    `[Part 2] Verify Procurement Channel enabled after Procurement Sector = "${procurementSector}"`,
  );
  await assertPicklistEnabledAfterDependency(
    section,
    "Procurement Channel",
    `after Procurement Sector = "${procurementSector}"`,
  );

  part2DetailLog(
    `[Part 2] Open Procurement Channel and select "${procurementChannel}"`,
  );
  const channelListbox = await openPicklistDropdown(
    page,
    section,
    "Procurement Channel",
  );
  const channelOptions = await readOpenPicklistOptions(channelListbox);
  validateProcurementChannelPicklistForPrivateIncludesTender(channelOptions);
  logPicklistValuesTable(
    `Part 2 — Procurement Channel (Sector = "${procurementSector}")`,
    channelOptions,
  );
  await showPicklistValuesTableOnPage(
    page,
    `Part 2 — Procurement Channel → ${procurementChannel}`,
    channelOptions,
  );
  await clickPicklistOptionInOpenList(channelListbox, procurementChannel);
  await expectPicklistShowsValue(
    section,
    "Procurement Channel",
    procurementChannel,
  );

  part2DetailLog(
    `[Part 2] Confirmed Procurement Channel = "${procurementChannel}".`,
  );

  await dismissOpenListboxIfVisible(page);

  part2DetailLog(
    `[Part 2] Continuation — verify Request Type enabled after Procurement Channel = "${procurementChannel}"`,
  );
  await assertPicklistEnabledAfterDependency(
    section,
    "Request Type",
    `after Procurement Channel = "${procurementChannel}" (Procurement Sector = "${procurementSector}")`,
  );

  part2DetailLog(
    `[Part 2] Continuation — open Request Type and select "${requestTypeNormal}"`,
  );
  const requestTypeListbox = await openPicklistDropdown(
    page,
    section,
    "Request Type",
  );
  const requestTypeOptions =
    await readOpenPicklistOptions(requestTypeListbox);
  validateRequestTypePicklistIncludesNormal(requestTypeOptions);
  logPicklistValuesTable(
    `Part 2 — Request Type (Sector = "${procurementSector}", Channel = "${procurementChannel}")`,
    requestTypeOptions,
  );
  await showPicklistValuesTableOnPage(
    page,
    `Part 2 — Request Type → ${requestTypeNormal}`,
    requestTypeOptions,
  );
  await clickPicklistOptionInOpenList(
    requestTypeListbox,
    requestTypeNormal,
  );
  await expectPicklistShowsValue(section, "Request Type", requestTypeNormal);

  part2DetailLog(
    `[Part 2] Confirmed Request Type = "${requestTypeNormal}".`,
  );

  await dismissOpenListboxIfVisible(page);

  part2DetailLog(
    `[Part 2] Continuation — verify Request Type after "${requestTypeNormal}"`,
  );
  await assertPicklistEnabledAfterDependency(
    section,
    "Request Type",
    `after Request Type = "${requestTypeNormal}" (Channel = "${procurementChannel}")`,
  );

  part2DetailLog(
    `[Part 2] Continuation — re-open Request Type and select "${requestTypeBudgetary}"`,
  );
  const budgetaryListbox = await openPicklistDropdown(
    page,
    section,
    "Request Type",
  );
  const budgetaryOptions = await readOpenPicklistOptions(budgetaryListbox);
  validateRequestTypePicklistIncludesBudgetary(budgetaryOptions);
  logPicklistValuesTable(
    `Part 2 — Request Type after "${requestTypeNormal}" → "${requestTypeBudgetary}"`,
    budgetaryOptions,
  );
  await showPicklistValuesTableOnPage(
    page,
    `Part 2 — Request Type (${requestTypeNormal} → ${requestTypeBudgetary})`,
    budgetaryOptions,
  );
  await clickPicklistOptionInOpenList(
    budgetaryListbox,
    requestTypeBudgetary,
  );
  await expectPicklistShowsValue(
    section,
    "Request Type",
    requestTypeBudgetary,
  );

  part2DetailLog(
    `[Part 2] Confirmed Request Type = "${requestTypeBudgetary}".`,
  );

  await dismissOpenListboxIfVisible(page);

  part2DetailLog(
    `[Part 2] Continuation — verify Procurement Channel after Request Type = "${requestTypeBudgetary}"`,
  );
  await assertPicklistEnabledAfterDependency(
    section,
    "Procurement Channel",
    `after Request Type = "${requestTypeBudgetary}" (Sector = "${procurementSector}")`,
  );

  part2DetailLog(
    `[Part 2] Continuation — re-open Procurement Channel and select "${procurementChannelDirectPurchase}"`,
  );
  const channelDpListbox = await openPicklistDropdown(
    page,
    section,
    "Procurement Channel",
  );
  const channelDpOptions = await readOpenPicklistOptions(channelDpListbox);
  validateProcurementChannelPicklistIncludesDirectPurchase(channelDpOptions);
  logPicklistValuesTable(
    `Part 2 — Procurement Channel after "${requestTypeBudgetary}" → "${procurementChannelDirectPurchase}"`,
    channelDpOptions,
  );
  await showPicklistValuesTableOnPage(
    page,
    `Part 2 — Procurement Channel (${procurementChannel} → ${procurementChannelDirectPurchase})`,
    channelDpOptions,
  );
  await clickPicklistOptionInOpenList(
    channelDpListbox,
    procurementChannelDirectPurchase,
  );
  await expectPicklistShowsValue(
    section,
    "Procurement Channel",
    procurementChannelDirectPurchase,
  );

  part2DetailLog(
    `[Part 2] Confirmed Procurement Channel = "${procurementChannelDirectPurchase}".`,
  );

  part2DetailLog(
    `[Part 2] Expect Request Type disabled after Procurement Channel = "${procurementChannelDirectPurchase}"`,
  );
  await assertPicklistDisabledForDependency(
    section,
    "Request Type",
    `after Procurement Channel = "${procurementChannelDirectPurchase}" (Sector = "${procurementSector}")`,
  );

  logPart2ProcurementClassificationMatrix();
}
