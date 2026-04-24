import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

export type SalesforceCredentials = {
  url: string;
  username: string;
  password: string;
  /** Base32 secret from Salesforce Authenticator (or compatible app) setup — used to derive the 6-digit code. */
  totpSecret: string;
};

function normalizeKey(key: string): string {
  return String(key).trim().toLowerCase().replace(/\s+/g, "");
}

function pick(
  row: Record<string, unknown>,
  candidates: string[],
): string {
  const entries = Object.entries(row);
  const map = new Map<string, string>();
  for (const [k, v] of entries) {
    map.set(normalizeKey(k), String(v ?? "").trim());
  }
  for (const c of candidates) {
    const v = map.get(normalizeKey(c));
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

/**
 * Loads Salesforce URL, username, password, and TOTP secret from the first worksheet
 * of the Excel file. Uses the first data row only (row after the header).
 */
export function loadSalesforceCredentials(
  excelPath?: string,
): SalesforceCredentials {
  const filePath =
    excelPath?.trim() ||
    process.env.CREDENTIALS_XLSX?.trim() ||
    path.join(process.cwd(), "credentials", "salesforce-credentials.xlsx");

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Credentials workbook not found: ${filePath}\n` +
        `Run: npm run init:credentials`,
    );
  }

  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error(`No worksheets in: ${filePath}`);
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  if (rows.length === 0) {
    throw new Error(
      `No data rows in sheet "${sheetName}". Add a header row and one credentials row.`,
    );
  }

  const row = rows[0] as Record<string, unknown>;
  const url = pick(row, ["url", "loginurl", "salesforceurl", "instanceurl"]);
  const username = pick(row, ["username", "user", "email", "userid"]);
  const password = pick(row, ["password", "pwd", "pass"]);
  const totpSecret = pick(row, [
    "totpsecret",
    "totp",
    "mfasecret",
    "authenticatorsecret",
    "2fasecret",
    "otpsecret",
    "verificationsecret",
  ]);

  const missing: string[] = [];
  if (!url) missing.push("URL");
  if (!username) missing.push("Username");
  if (!password) missing.push("Password");
  if (!totpSecret) missing.push("TOTP Secret");
  if (missing.length > 0) {
    throw new Error(
      `Missing columns in first data row (${missing.join(", ")}). ` +
        `Expected URL, Username, Password, TOTP Secret (Base32) in: ${filePath}`,
    );
  }

  return { url, username, password, totpSecret };
}
