import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

export type ProcurementExpected = {
  procurementSector: string;
  procurementChannel: string;
  requestType: string;
};

function normalizeKey(key: string): string {
  return String(key).trim().toLowerCase().replace(/\s+/g, "");
}

function pick(
  row: Record<string, unknown>,
  candidates: string[],
): string {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) {
    map.set(normalizeKey(k), String(v ?? "").trim());
  }
  for (const c of candidates) {
    const v = map.get(normalizeKey(c));
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

/**
 * Loads expected picklist values from the first row of the first sheet.
 * Download your SharePoint workbook to this path, or set PROCUREMENT_EXPECTED_XLSX.
 *
 * Expected columns (header row): Procurement Sector, Procurement Channel, Request Type
 */
export function loadProcurementExpected(excelPath?: string): ProcurementExpected {
  const filePath =
    excelPath?.trim() ||
    process.env.PROCUREMENT_EXPECTED_XLSX?.trim() ||
    path.join(
      process.cwd(),
      "credentials",
      "procurement-classification-expected.xlsx",
    );

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Procurement expected-values workbook not found: ${filePath}\n` +
        `Download the SharePoint Excel file into that path, or run: npm run init:procurement-expected\n` +
        "Then set Procurement Sector, Procurement Channel, and Request Type in row 2.",
    );
  }

  const wb = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error(`No worksheets in ${filePath}`);

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets[sheetName],
    { defval: "", raw: false },
  );
  if (rows.length === 0) {
    throw new Error(`No data rows in ${filePath}`);
  }

  const row = rows[0] as Record<string, unknown>;
  const procurementSector = pick(row, [
    "procurementsector",
    "sector",
    "procurement sector",
  ]);
  const procurementChannel = pick(row, [
    "procurementchannel",
    "channel",
    "procurement channel",
  ]);
  const requestType = pick(row, ["requesttype", "request type", "type"]);

  const missing: string[] = [];
  if (!procurementSector) missing.push("Procurement Sector");
  if (!procurementChannel) missing.push("Procurement Channel");
  if (!requestType) missing.push("Request Type");
  if (missing.length) {
    throw new Error(
      `Missing expected columns in first data row: ${missing.join(", ")}. File: ${filePath}`,
    );
  }

  return { procurementSector, procurementChannel, requestType };
}
