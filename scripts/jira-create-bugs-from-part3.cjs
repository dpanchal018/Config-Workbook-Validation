/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Create Jira Bug issues from Part 3 bug drafts and link each to a related ticket (default QAP-74).
 * After each issue is created, uploads **test-results/part3-bug-screenshots/draft-NN.png** when present
 * (same order as drafts; produced by Playwright Part 3 — see `capturePart3BugDiscrepancyScreenshots`).
 *
 * Prerequisites (env):
 *   JIRA_CLOUD_ID      — Atlassian cloud UUID (e.g. from site URL / admin API).
 *   JIRA_EMAIL         — Atlassian account email.
 *   JIRA_API_TOKEN     — API token from https://id.atlassian.com/manage-profile/security/api-tokens
 *
 * Optional:
 *   JIRA_RELATES_TO_KEY — Issue key to link each new Bug to (default QAP-74; same as legacy JIRA_PARENT_KEY).
 *   JIRA_PARENT_KEY     — If set and JIRA_RELATES_TO_KEY is unset, used as the link target (backward compat).
 *   JIRA_PROJECT_KEY    — Default QAP
 *   JIRA_ISSUE_TYPE     — Default Bug
 *   JIRA_LINK_TYPE      — Issue link type name (default Relates)
 *   JIRA_PART3_BUGS_FILE — Path to drafts file (default test-results/part3-jira-bugs.txt)
 *   JIRA_DRY_RUN        — Set to 1 to print payloads only (no POST)
 *   JIRA_PRIORITY_DEFAULT — Jira **Priority** field name when the draft has no `Priority:` line (default P3 - Medium)
 *   JIRA_PART3_PRIORITY_MAP — Optional JSON object mapping draft text (e.g. Medium) to exact Jira priority names
 *   JIRA_SKIP_ATTACHMENTS — Set to 1 to create/link issues but skip PNG uploads
 *
 * Usage (after Playwright Part 3 wrote the file):
 *   node scripts/jira-create-bugs-from-part3.cjs
 *
 * Config+JIRA.bat: after Playwright finishes, if test-results/part3-jira-bugs.txt exists and
 * JIRA_CLOUD_ID, JIRA_EMAIL, JIRA_API_TOKEN are set, this script runs automatically (unless
 * JIRA_SKIP_AUTO_PUSH=1). You can also run push-part3-jira-bugs.bat or npm run jira:push-part3-bugs anytime.
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

/** Matches `PART3_BUG_SCREENSHOT_SUBDIR` in lib/leadCreationModalPart3.ts — draft-N.png order = JIRA draft order. */
const PART3_BUG_SCREENSHOT_SUBDIR = "part3-bug-screenshots";

function part3BugScreenshotPath(draftIndex1Based) {
  const n = String(draftIndex1Based).padStart(2, "0");
  return path.join(root, "test-results", PART3_BUG_SCREENSHOT_SUBDIR, `draft-${n}.png`);
}

function env(name, fallback = "") {
  const v = process.env[name];
  return v != null && String(v).trim() !== "" ? String(v).trim() : fallback;
}

function relatesToKey() {
  return env("JIRA_RELATES_TO_KEY") || env("JIRA_PARENT_KEY", "QAP-74");
}

function plainToAdf(text) {
  const blocks = text.split(/\n\n+/).filter((b) => b.trim());
  const content = blocks.map((block) => paragraphFromString(block.trim()));
  return {
    type: "doc",
    version: 1,
    content: content.length ? content : [{ type: "paragraph", content: [{ type: "text", text: " " }] }],
  };
}

function paragraphFromString(s) {
  const parts = s.split("\n");
  const inner = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) inner.push({ type: "hardBreak" });
    inner.push({ type: "text", text: parts[i] || " " });
  }
  return { type: "paragraph", content: inner.length ? inner : [{ type: "text", text: " " }] };
}

/**
 * Extract `Priority:` line from legacy drafts; new drafts omit it (see {@link stripPrioritySeverityFromDescription}).
 * @returns trimmed value after "Priority:" or null
 */
function extractPart3DraftPriorityKeyword(body) {
  const m = body.match(/\bPriority:\s*\r?\n\s*([^\r\n]+)/i);
  return m ? m[1].trim() : null;
}

/** Remove Priority / Severity blocks from the end of the draft so they are not duplicated in Jira Description. */
function stripPrioritySeverityFromDescription(body) {
  return body.replace(/\r?\n\r?\nPriority:[\s\S]*$/i, "").trimEnd();
}

/**
 * Map Part 3 draft keyword (e.g. Medium) to the exact **name** of a Jira priority for this site.
 * Optional env JIRA_PART3_PRIORITY_MAP: JSON object, keys matched case-insensitively on raw draft value.
 */
function mapDraftPriorityToJiraName(draftKeyword) {
  const raw = draftKeyword != null ? String(draftKeyword).trim() : "";
  const mapJson = env("JIRA_PART3_PRIORITY_MAP");
  if (mapJson) {
    try {
      const m = JSON.parse(mapJson);
      if (raw && m[raw] != null) return String(m[raw]).trim();
      const lower = raw.toLowerCase();
      for (const k of Object.keys(m)) {
        if (k.toLowerCase() === lower) return String(m[k]).trim();
      }
    } catch (_) {
      console.warn("[jira] JIRA_PART3_PRIORITY_MAP is not valid JSON; ignoring.");
    }
  }
  const key = raw.toLowerCase();
  const builtIn = {
    critical: "P1 - Critical",
    highest: "P1 - Critical",
    high: "P2 - High",
    medium: "P3 - Medium",
    low: "P4 - Low",
    lowest: "P5 - Lowest",
  };
  if (key && builtIn[key]) return builtIn[key];
  // Already a Jira-style label (e.g. "P3 - Medium")
  if (raw && /^P[0-9]\s*-/i.test(raw)) return raw;
  return env("JIRA_PRIORITY_DEFAULT", "P3 - Medium");
}

/** Remove Bug Title / legacy Bug Summary from the draft body (title becomes Jira summary). */
function stripTitleFromDescription(body) {
  return body
    .replace(/^\s*Bug Title:\s*\r?\n[^\r\n]+\r?\n\r?\n?/i, "")
    .replace(/^\s*Bug Summary:\s*\r?\n[^\r\n]+\r?\n\r?\n?/i, "")
    .trim();
}

/**
 * @returns {{ summary: string, descriptionBody: string, jiraPriorityName: string }[]}
 */
function parsePart3Drafts(fileText) {
  const text = fileText.replace(/^\uFEFF/, "").trim();
  if (!text) return [];

  const headerRe = /--- JIRA draft \d+ of \d+ \(Part 3\) ---/g;
  const headers = [...text.matchAll(headerRe)];
  if (headers.length === 0) {
    console.error(
      "[jira] No '--- JIRA draft N of M (Part 3) ---' headers found. Run Part 3 tests that emit drafts first.",
    );
    return [];
  }

  const blocks = [];
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index + headers[i][0].length;
    const end = i + 1 < headers.length ? headers[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    blocks.push(body);
  }

  return blocks.map((body, idx) => {
    const titleMatch =
      body.match(/Bug Title:\s*\r?\n([^\r\n]+)/i) ||
      body.match(/Bug Summary:\s*\r?\n([^\r\n]+)/i);
    if (!titleMatch) {
      throw new Error(`Draft block ${idx + 1}: missing "Bug Title:" line`);
    }
    let summary = titleMatch[1].trim();
    if (summary.length > 255) summary = summary.slice(0, 252) + "...";
    const priorityKeyword = extractPart3DraftPriorityKeyword(body);
    const descriptionBody = stripPrioritySeverityFromDescription(stripTitleFromDescription(body));
    const jiraPriorityName = mapDraftPriorityToJiraName(priorityKeyword);
    return { summary, descriptionBody, jiraPriorityName };
  });
}

async function jiraFetch(cloudId, email, token, pathname, options = {}) {
  const url = `https://api.atlassian.com/ex/jira/${cloudId}${pathname}`;
  const auth = Buffer.from(`${email}:${token}`, "utf8").toString("base64");
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    json = { raw };
  }
  if (!res.ok) {
    const msg = json.errorMessages?.join("; ") || json.message || json.errors || raw || res.statusText;
    throw new Error(`Jira API ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }
  return json;
}

async function createBug({
  cloudId,
  email,
  token,
  projectKey,
  issueTypeName,
  summary,
  descriptionAdf,
  jiraPriorityName,
}) {
  const fields = {
    project: { key: projectKey },
    issuetype: { name: issueTypeName },
    summary,
    description: descriptionAdf,
  };
  if (jiraPriorityName) {
    fields.priority = { name: jiraPriorityName };
  }
  return jiraFetch(cloudId, email, token, "/rest/api/3/issue", {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
}

async function createIssueLink({ cloudId, email, token, inwardIssue, outwardIssue, linkTypeName }) {
  return jiraFetch(cloudId, email, token, "/rest/api/3/issueLink", {
    method: "POST",
    body: JSON.stringify({
      type: { name: linkTypeName },
      inwardIssue: { key: inwardIssue },
      outwardIssue: { key: outwardIssue },
    }),
  });
}

/**
 * Upload Part 3 discrepancy PNG to the issue (multipart). Same order as drafts: draft-01.png → first bug.
 * Node 18+ recommended (global FormData + Blob).
 */
async function attachPart3ScreenshotIfPresent({
  cloudId,
  email,
  token,
  issueKey,
  draftIndex1Based,
  skipAttachments,
}) {
  if (skipAttachments) return;
  const abs = part3BugScreenshotPath(draftIndex1Based);
  if (!fs.existsSync(abs)) {
    console.warn(`[jira] No screenshot for draft ${draftIndex1Based} — skip attach (${abs})`);
    return;
  }

  const BodyFormData = globalThis.FormData;
  const BlobCtor = globalThis.Blob;
  if (typeof BodyFormData !== "function" || typeof BlobCtor !== "function") {
    console.warn("[jira] FormData/Blob unavailable — skip screenshot attach (use Node 18+).");
    return;
  }

  const buf = fs.readFileSync(abs);
  const filename = path.basename(abs);
  const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`;

  const blob = new BlobCtor([buf], { type: "image/png" });
  const fd = new BodyFormData();
  fd.append("file", blob, filename);

  const auth = Buffer.from(`${email}:${token}`, "utf8").toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "X-Atlassian-Token": "no-check",
    },
    body: fd,
  });
  const raw = await res.text();
  if (!res.ok) {
    console.warn(`[jira] Screenshot attach failed (${res.status}): ${raw.slice(0, 600)}`);
    return;
  }
  console.log(`[jira] Attached ${filename} → ${issueKey}`);
}

async function main() {
  const cloudId = env("JIRA_CLOUD_ID");
  const email = env("JIRA_EMAIL");
  const token = env("JIRA_API_TOKEN");
  const relateKey = relatesToKey();
  const projectKey = env("JIRA_PROJECT_KEY", "QAP");
  const issueTypeName = env("JIRA_ISSUE_TYPE", "Bug");
  const linkTypeName = env("JIRA_LINK_TYPE", "Relates");
  const bugsFile = env(
    "JIRA_PART3_BUGS_FILE",
    path.join(root, "test-results", "part3-jira-bugs.txt"),
  );
  const dry = env("JIRA_DRY_RUN") === "1";
  const skipAttachments = env("JIRA_SKIP_ATTACHMENTS") === "1";

  if (!dry && (!cloudId || !email || !token)) {
    console.error(
      "[jira] Missing JIRA_CLOUD_ID, JIRA_EMAIL, or JIRA_API_TOKEN. Set them in the environment (or a .env loader) and retry.",
    );
    process.exit(1);
  }

  if (!fs.existsSync(bugsFile)) {
    console.error(`[jira] File not found: ${bugsFile}`);
    console.error("[jira] Run Playwright tests first so Part 3 can write part3-jira-bugs.txt when rows fail.");
    process.exit(1);
  }

  const fileText = fs.readFileSync(bugsFile, "utf8");
  let drafts;
  try {
    drafts = parsePart3Drafts(fileText);
  } catch (e) {
    console.error("[jira]", e.message || e);
    process.exit(1);
  }

  if (drafts.length === 0) {
    console.log("[jira] No draft blocks parsed; nothing to create.");
    process.exit(0);
  }

  console.log(
    `[jira] Link target ${relateKey} — processing ${drafts.length} Bug draft(s) (${linkTypeName}) from:\n  ${bugsFile}\n`,
  );

  let createdCount = 0;

  for (let i = 0; i < drafts.length; i++) {
    const { summary, descriptionBody, jiraPriorityName } = drafts[i];
    const descriptionAdf = plainToAdf(descriptionBody);

    if (dry) {
      const shot = part3BugScreenshotPath(i + 1);
      console.log(
        `[dry-run] ${i + 1}/${drafts.length} summary: ${summary}\n         priority.name: ${jiraPriorityName}\n         screenshot: ${shot}${fs.existsSync(shot) ? " (exists)" : " (missing)"}\n`,
      );
      continue;
    }

    try {
      const created = await createBug({
        cloudId,
        email,
        token,
        projectKey,
        issueTypeName,
        summary,
        descriptionAdf,
        jiraPriorityName,
      });
      const key = created.key;
      await createIssueLink({
        cloudId,
        email,
        token,
        inwardIssue: key,
        outwardIssue: relateKey,
        linkTypeName,
      });
      await attachPart3ScreenshotIfPresent({
        cloudId,
        email,
        token,
        issueKey: key,
        draftIndex1Based: i + 1,
        skipAttachments,
      });
      const self = created.self || "";
      createdCount += 1;
      console.log(`[jira] Created ${key} — ${summary} (${linkTypeName} → ${relateKey}) [Priority: ${jiraPriorityName}]`);
      if (self) console.log(`       ${self}`);
    } catch (e) {
      console.error(`[jira] Failed on draft ${i + 1}: ${e.message || e}`);
      process.exit(1);
    }
  }

  if (dry) {
    console.log("[jira] Dry run only; set JIRA_DRY_RUN=0 (or unset) to POST issues.");
  } else {
    console.log(`\n[jira] Done — created ${createdCount} Bug(s) linked to ${relateKey}.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
