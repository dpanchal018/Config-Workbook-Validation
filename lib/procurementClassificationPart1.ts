import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import {
  assertPicklistEnabledAfterDependency,
  clickPicklistOptionInOpenList,
  expectPicklistShowsValue,
  openPicklistDropdown,
  readOpenPicklistOptions,
  readPicklistDisplayedValue,
} from "./salesforceProcurementPicklists";

/** Fixed values for Part 1 (per business flow). */
export const PART1_VALUES = {
  procurementSector: "Public",
  procurementChannel: "NUPCO",
  requestType: "Marketplace",
} as const;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Prints picklist values as a numbered table in the terminal. */
export function logPicklistValuesTable(title: string, options: string[]): void {
  console.log(`\n${"─".repeat(72)}`);
  console.log(title);
  console.log("─".repeat(72));
  console.table(options.map((value, idx) => ({ "#": idx + 1, Value: value })));
}

/** Renders the same table on the Salesforce UI for a short time. */
export async function showPicklistValuesTableOnPage(
  page: Page,
  title: string,
  options: string[],
): Promise<void> {
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

export function validateRequestTypePicklistForNupco(
  options: string[],
): void {
  expect(
    options.some((o) => /^marketplace$/i.test(o.trim())),
    `Request Type picklist (Channel=NUPCO) should include Marketplace. Values: ${JSON.stringify(options)}`,
  ).toBeTruthy();
}

/**
 * Part 1 only works when Procurement Sector is Public. Verifies the field shows Public;
 * if not, re-opens the picklist and selects Public again (limited retries), then fails with a clear error.
 */
export async function ensureProcurementSectorIsPublic(
  page: Page,
  section: Locator,
  maxAttempts = 3,
): Promise<void> {
  const label = PART1_VALUES.procurementSector;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await expectPicklistShowsValue(section, "Procurement Sector", label);
      console.log(
        `[Part 1] Confirmed Procurement Sector is "${label}" — downstream steps can run.`,
      );
      return;
    } catch {
      const raw = await readPicklistDisplayedValue(
        section,
        "Procurement Sector",
      ).catch(() => "(unreadable)");
      console.warn(
        `[Part 1] Procurement Sector is not "${label}" yet (shows "${raw}"). ` +
          `Re-opening picklist and selecting "${label}" (attempt ${attempt + 2}/${maxAttempts}).`,
      );
      if (attempt === maxAttempts - 1) {
        throw new Error(
          `Part 1 requires Procurement Sector = "${label}". Last read value: "${raw}". ` +
            `If the option row uses custom HTML/CSS, share that markup so we can add a locator.`,
        );
      }
      await openPicklistDropdown(page, section, "Procurement Sector");
      await clickPicklistOptionInOpenList(page, label);
    }
  }
}

/**
 * Part 1 only: Procurement Sector → Public; Channel → NUPCO; Request Type → Marketplace,
 * with picklist value tables on terminal and UI after each open.
 */
export async function runProcurementClassificationPart1(
  page: Page,
  section: Locator,
): Promise<void> {
  const { procurementSector, procurementChannel, requestType } = PART1_VALUES;

  console.log("\n[Part 1] Steps 1–2: Open Procurement Sector and capture picklist values");
  await openPicklistDropdown(page, section, "Procurement Sector");
  const sectorOptions = await readOpenPicklistOptions(page);
  validateProcurementSectorPicklist(sectorOptions);
  logPicklistValuesTable("Procurement Sector — picklist values", sectorOptions);
  await showPicklistValuesTableOnPage(
    page,
    "Procurement Sector — picklist values",
    sectorOptions,
  );

  console.log("[Part 1] Step 3: Select Public on Procurement Sector");
  await clickPicklistOptionInOpenList(page, procurementSector);
  await ensureProcurementSectorIsPublic(page, section);

  console.log("[Part 1] Step 4: Verify Procurement Channel is enabled");
  await assertPicklistEnabledAfterDependency(
    section,
    "Procurement Channel",
    `after Procurement Sector = "${procurementSector}"`,
  );

  console.log(
    "[Part 1] Steps 5–6: Open Procurement Channel, show values for Sector=Public, select NUPCO",
  );
  await openPicklistDropdown(page, section, "Procurement Channel");
  const channelOptions = await readOpenPicklistOptions(page);
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
  await clickPicklistOptionInOpenList(page, procurementChannel);

  console.log(
    "[Part 1] Step 7: Verify Request Type is enabled after NUPCO on Procurement Channel",
  );
  await assertPicklistEnabledAfterDependency(
    section,
    "Request Type",
    `after Procurement Channel = "${procurementChannel}"`,
  );

  console.log(
    "[Part 1] Steps 8–9: Open Request Type, show values for Channel=NUPCO, select Marketplace",
  );
  await openPicklistDropdown(page, section, "Request Type");
  const requestTypeOptions = await readOpenPicklistOptions(page);
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
  await clickPicklistOptionInOpenList(page, requestType);

  console.log(
    `\n[Part 1] Finished: Procurement Sector="${procurementSector}", Procurement Channel="${procurementChannel}", Request Type="${requestType}"\n`,
  );
}
