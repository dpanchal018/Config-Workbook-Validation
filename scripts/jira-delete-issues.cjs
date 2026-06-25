/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Permanently delete Jira issues by key (same auth as other Jira scripts).
 *
 *   node scripts/jira-delete-issues.cjs QAP-80 QAP-81
 *
 * Env: JIRA_CLOUD_ID, JIRA_EMAIL, JIRA_API_TOKEN
 * Optional: JIRA_DRY_RUN=1
 */

function env(name, fallback = "") {
  const v = process.env[name];
  return v != null && String(v).trim() !== "" ? String(v).trim() : fallback;
}

async function deleteIssue(cloudId, email, token, issueKey) {
  const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${encodeURIComponent(issueKey)}?deleteSubtasks=true`;
  const auth = Buffer.from(`${email}:${token}`, "utf8").toString("base64");
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  if (res.status === 204) return;
  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    json = { raw };
  }
  if (!res.ok) {
    const msg = json.errorMessages?.join("; ") || json.message || raw || res.statusText;
    throw new Error(`Jira API ${res.status}: ${msg}`);
  }
}

async function main() {
  const keys = process.argv.slice(2).filter((k) => /^[A-Z][A-Z0-9]+-\d+$/i.test(k));
  const cloudId = env("JIRA_CLOUD_ID");
  const email = env("JIRA_EMAIL");
  const token = env("JIRA_API_TOKEN");
  const dry = env("JIRA_DRY_RUN") === "1";

  if (keys.length === 0) {
    console.error("Usage: node scripts/jira-delete-issues.cjs ISSUE-KEY [ISSUE-KEY ...]");
    process.exit(1);
  }
  if (!dry && (!cloudId || !email || !token)) {
    console.error("[jira] Missing JIRA_CLOUD_ID, JIRA_EMAIL, or JIRA_API_TOKEN.");
    process.exit(1);
  }

  for (const key of keys) {
    if (dry) {
      console.log(`[dry-run] would DELETE ${key}`);
      continue;
    }
    try {
      await deleteIssue(cloudId, email, token, key);
      console.log(`[jira] Deleted ${key}`);
    } catch (e) {
      console.error(`[jira] Failed to delete ${key}: ${e.message || e}`);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
