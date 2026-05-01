import * as fs from "fs";
import * as path from "path";
import ExcelJS from "exceljs";

/** Override default `Field Layout.xlsx` in project root. */
export const LEAD_MODAL_FIELD_LAYOUT_XLSX_ENV =
  "SF_LEAD_MODAL_FIELD_LAYOUT_XLSX" as const;

const SECTION_HEADER_FILL_ARGB = "FFC6E0B4";

export type LeadModalFieldFromExcel = {
  /** Label text from the workbook (trimmed). */
  fieldNameExcel: string;
  /** True when the cell uses red font (Excel “required” convention for this project). */
  requiredInExcel: boolean;
};

function isRedFontArgb(color?: Partial<ExcelJS.Color>): boolean {
  if (!color || typeof color !== "object") return false;
  const a = color.argb ? String(color.argb).toUpperCase() : "";
  if (a === "FFFF0000") return true;
  if (a.length === 8) {
    const r = parseInt(a.slice(2, 4), 16);
    const g = parseInt(a.slice(4, 6), 16);
    const b = parseInt(a.slice(6, 8), 16);
    return r >= 200 && g <= 90 && b <= 90;
  }
  return false;
}

function cellDisplayString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null || v === "") return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (typeof v === "object" && v !== null && "richText" in v) {
    return (v as ExcelJS.CellRichTextValue).richText
      .map((t) => t.text)
      .join("")
      .trim();
  }
  if (typeof v === "object" && v !== null && "result" in v) {
    const r = (v as { result?: unknown }).result;
    return r == null ? "" : String(r).trim();
  }
  return "";
}

function cellRequiredFromExcel(cell: ExcelJS.Cell): boolean {
  const v = cell.value;
  if (typeof v === "object" && v !== null && "richText" in v) {
    return (v as ExcelJS.CellRichTextValue).richText.some((rt) =>
      isRedFontArgb(rt.font?.color),
    );
  }
  return isRedFontArgb(cell.font?.color);
}

function isSectionHeaderRow(row: ExcelJS.Row): boolean {
  const fill = row.getCell(1).fill;
  if (!fill || fill.type !== "pattern") return false;
  const argb = fill.fgColor?.argb;
  return typeof argb === "string" && argb.toUpperCase() === SECTION_HEADER_FILL_ARGB;
}

/**
 * Reads **Field Layout.xlsx** (sheet 1): two columns of labels, green rows = section headers (skipped).
 * **Required** rows use red font ({@link cellRequiredFromExcel}).
 */
export async function loadLeadModalFieldsFromWorkbook(
  filePath: string,
): Promise<LeadModalFieldFromExcel[]> {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Lead modal field layout workbook not found: ${filePath}. Set ${LEAD_MODAL_FIELD_LAYOUT_XLSX_ENV} or add Field Layout.xlsx to the project root.`,
    );
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) {
    throw new Error(`Workbook has no sheets: ${filePath}`);
  }

  const out: LeadModalFieldFromExcel[] = [];
  const seen = new Set<string>();

  ws.eachRow((row) => {
    if (isSectionHeaderRow(row)) return;

    for (const col of [1, 2]) {
      const cell = row.getCell(col);
      const text = cellDisplayString(cell);
      if (!text) continue;
      const key = text.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        fieldNameExcel: text.replace(/\s+/g, " ").trim(),
        requiredInExcel: cellRequiredFromExcel(cell),
      });
    }
  });

  return out;
}

export function defaultLeadModalFieldLayoutPath(): string {
  const fromEnv = process.env[LEAD_MODAL_FIELD_LAYOUT_XLSX_ENV]?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(process.cwd(), "Field Layout.xlsx");
}
