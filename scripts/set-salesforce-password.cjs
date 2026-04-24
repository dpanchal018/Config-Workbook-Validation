/**
 * Updates the Password cell in the first data row of credentials/salesforce-credentials.xlsx.
 * Usage (PowerShell):  $env:SF_PASSWORD='your-password'; node scripts/set-salesforce-password.cjs
 * Usage (cmd):         set SF_PASSWORD=your-password && node scripts/set-salesforce-password.cjs
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const fp = path.join(root, "credentials", "salesforce-credentials.xlsx");
const pwd = process.env.SF_PASSWORD;

if (!pwd) {
  console.error("Set SF_PASSWORD in the environment (do not commit it).");
  process.exit(1);
}

if (!fs.existsSync(fp)) {
  execSync("node scripts/create-credentials-template.cjs", {
    cwd: root,
    stdio: "inherit",
  });
}

const wb = XLSX.readFile(fp);
const sn = wb.SheetNames[0];
const ws = wb.Sheets[sn];
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
if (aoa.length < 2) {
  console.error("Workbook needs a header row and one data row.");
  process.exit(1);
}
const hdr = aoa[0].map((h) =>
  String(h)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ""),
);
const i = hdr.findIndex((h) => h === "password" || h === "pwd");
if (i < 0) {
  console.error('No "Password" column in first row.');
  process.exit(1);
}
while (aoa[1].length <= i) aoa[1].push("");
aoa[1][i] = pwd;
wb.Sheets[sn] = XLSX.utils.aoa_to_sheet(aoa);

const dir = path.dirname(fp);
const tmp = path.join(dir, `.salesforce-credentials.${process.pid}.tmp.xlsx`);
const fallback = path.join(dir, "salesforce-credentials-updated.xlsx");

function tryWriteTarget() {
  try {
    XLSX.writeFile(wb, fp);
    return true;
  } catch {
    try {
      XLSX.writeFile(wb, tmp);
      try {
        fs.renameSync(tmp, fp);
      } catch {
        fs.copyFileSync(tmp, fp);
        fs.unlinkSync(tmp);
      }
      return true;
    } catch {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      return false;
    }
  }
}

if (!tryWriteTarget()) {
  XLSX.writeFile(wb, fallback);
  console.log("Original file is locked. Wrote workbook with new password to:");
  console.log(fallback);
  console.log(
    "When nothing has the file open, delete or rename the old salesforce-credentials.xlsx,",
    "then rename salesforce-credentials-updated.xlsx to salesforce-credentials.xlsx.",
  );
  process.exit(0);
}

try {
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
} catch {
  /* ignore */
}

console.log("Updated Password in", fp);
