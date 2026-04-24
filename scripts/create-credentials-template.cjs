/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const root = path.join(__dirname, "..");
const dir = path.join(root, "credentials");
const filePath = path.join(dir, "salesforce-credentials.xlsx");

fs.mkdirSync(dir, { recursive: true });

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([
  ["URL", "Username", "Password"],
  [
    "https://login.salesforce.com",
    "your.username@example.com",
    "your_password_here",
  ],
]);
ws["!cols"] = [{ wch: 55 }, { wch: 36 }, { wch: 28 }];
XLSX.utils.book_append_sheet(wb, ws, "Credentials");

XLSX.writeFile(wb, filePath);
console.log("Created:", filePath);
console.log("Edit the workbook with your real URL, username, and password.");
