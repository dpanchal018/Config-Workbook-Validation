/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Serves the last Playwright HTML report and opens it in Google Chrome.
 * Uses CI=1 so Playwright does not launch the default browser (Chrome only).
 *
 * Usage: node scripts/open-playwright-report-chrome.cjs
 */

const { spawn, execFile } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.join(__dirname, "..");
const reportIndex = path.join(root, "playwright-report", "index.html");
const ports = [9323, 9324, 9325];

function chromeExecutable() {
  const candidates = [
    path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function isReportServerUp(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      res.resume();
      resolve(res.statusCode != null && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function waitForReportServer(port, timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      if (await isReportServerUp(port)) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Report server did not start on port ${port}`));
        return;
      }
      setTimeout(poll, 350);
    };
    poll();
  });
}

function openInChrome(port) {
  const url = `http://localhost:${port}/`;
  const chrome = chromeExecutable();
  if (!chrome) {
    console.warn(`[report] Google Chrome not found — open ${url} manually.`);
    return;
  }
  execFile(chrome, [url], (err) => {
    if (err) console.warn(`[report] Could not open Chrome: ${err.message}`);
    else console.log(`[report] Opened Google Chrome → ${url}`);
  });
}

function spawnReportServer(port) {
  return spawn("npx", ["playwright", "show-report", "--port", String(port)], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, CI: "1" },
  });
}

async function findExistingReportPort() {
  for (const port of ports) {
    if (await isReportServerUp(port)) return port;
  }
  return null;
}

async function tryStartServerOnPort(port) {
  const child = spawnReportServer(port);
  let exitedEarly = false;
  child.on("exit", () => {
    exitedEarly = true;
  });

  await new Promise((r) => setTimeout(r, 600));
  if (exitedEarly) return null;

  try {
    await waitForReportServer(port, 15000);
    return child;
  } catch {
    child.kill();
    return null;
  }
}

async function main() {
  if (!fs.existsSync(reportIndex)) {
    console.error("[report] playwright-report/index.html not found. Run tests first.");
    process.exit(1);
  }

  const existing = await findExistingReportPort();
  if (existing != null) {
    console.log(`[report] Using existing report server on port ${existing}.`);
    openInChrome(existing);
    return;
  }

  console.log("[report] Starting HTML report server…");
  console.log("[report] Press Ctrl+C in this window when finished reviewing the report.\n");

  for (const port of ports) {
    const child = await tryStartServerOnPort(port);
    if (!child) continue;
    console.log(`[report] Serving HTML report at http://localhost:${port}/`);
    openInChrome(port);
    await new Promise((resolve) => child.on("exit", (code) => resolve(code ?? 0)));
    return;
  }

  console.error("[report] Could not start report server. Ports tried: " + ports.join(", "));
  process.exit(1);
}

main().catch((err) => {
  console.error("[report]", err.message || err);
  process.exit(1);
});
