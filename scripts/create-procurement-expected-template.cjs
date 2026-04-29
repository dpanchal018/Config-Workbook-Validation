/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const root = path.join(__dirname, "..");
const dir = path.join(root, "credentials");
const filePath = path.join(dir, "procurement-classification-expected.xlsx");

fs.mkdirSync(dir, { recursive: true });

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([
  ["Procurement Sector", "Procurement Channel", "Request Type"],
  ["REPLACE_WITH_VALID_SECTOR", "REPLACE_WITH_VALID_CHANNEL", "REPLACE_WITH_VALID_REQUEST_TYPE"],
]);
ws["!cols"] = [{ wch: 28 }, { wch: 30 }, { wch: 36 }];
XLSX.utils.book_append_sheet(wb, ws, "Expected");

XLSX.writeFile(wb, filePath);
console.log("Created:", filePath);
console.log(
  "Replace row 2 with exact picklist labels from Salesforce, or copy from your SharePoint workbook.",
);
