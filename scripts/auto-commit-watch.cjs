/* eslint-disable no-console */
const chokidar = require("chokidar");
const { execSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

try {
  execSync("git rev-parse --git-dir", { cwd: root, stdio: "pipe" });
} catch {
  console.error("[auto-commit] Not a git repository:", root);
  process.exit(1);
}

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: "inherit", shell: true });
}

function currentBranch() {
  return execSync("git rev-parse --abbrev-ref HEAD", {
    encoding: "utf8",
    cwd: root,
  }).trim();
}

function tryCommit() {
  const branch = currentBranch();
  if (branch !== "main") {
    console.warn(
      `[auto-commit] Skipping: on branch "${branch}", not main. Switch to main to enable commits.`,
    );
    return;
  }

  run("git add -A");
  try {
    execSync("git diff --cached --quiet", { cwd: root });
    console.log("[auto-commit] Nothing to commit.");
    return;
  } catch {
    // staged changes exist
  }

  const msg = `chore: auto-commit ${new Date().toISOString()}`;
  run(`git commit -m "${msg}"`);
  console.log("[auto-commit] Committed.");
}

const DEBOUNCE_MS = 2500;
let timer = null;

const watcher = chokidar.watch(root, {
  ignored: [
    /(^|[\\/])node_modules([\\/]|$)/,
    /(^|[\\/])\.git([\\/]|$)/,
    /(^|[\\/])test-results([\\/]|$)/,
    /(^|[\\/])playwright-report([\\/]|$)/,
    /(^|[\\/])blob-report([\\/]|$)/,
    /(^|[\\/])playwright[\\/]\.cache([\\/]|$)/,
    /(^|[\\/])\.cursor([\\/]|$)/,
    /\.xlsx$/i,
  ],
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
  depth: 20,
});

watcher.on("all", () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    try {
      tryCommit();
    } catch (e) {
      console.error("[auto-commit] Failed:", e.message || e);
    }
  }, DEBOUNCE_MS);
});

console.log(
  "[auto-commit] Watching project. Commits only on branch main. Ctrl+C to stop.",
);
