/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Print a Jira issue summary and description to the terminal.
 *
 * Prerequisites (env):
 *   JIRA_CLOUD_ID, JIRA_EMAIL, JIRA_API_TOKEN
 *
 * Usage:
 *   node scripts/print-jira-issue.cjs QAP-74
 *   node scripts/print-jira-issue.cjs QAP-74 QAP-134
 */

function env(name) {
  const v = process.env[name];
  return v != null && String(v).trim() !== "" ? String(v).trim() : "";
}

function adfToText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  const kids = (node.content || []).map(adfToText).join("");
  if (node.type === "paragraph") return `${kids}\n\n`;
  if (node.type === "heading") return `${kids}\n\n`;
  if (node.type === "bulletList" || node.type === "orderedList") return `${kids}\n`;
  if (node.type === "listItem") return `• ${kids.trim()}\n`;
  if (node.type === "rule") return "---\n\n";
  return kids;
}

function descriptionToText(description) {
  if (description == null) return "";
  if (typeof description === "string") return description;
  return adfToText(description).trim();
}

async function jiraFetch(cloudId, email, token, pathname) {
  const url = `https://api.atlassian.com/ex/jira/${cloudId}${pathname}`;
  const auth = Buffer.from(`${email}:${token}`, "utf8").toString("base64");
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
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
    const msg =
      json.errorMessages?.join("; ") ||
      json.message ||
      (typeof json.errors === "string" ? json.errors : JSON.stringify(json.errors)) ||
      raw ||
      res.statusText;
    throw new Error(`Jira API ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }
  return json;
}

function printIssue(issue) {
  const f = issue.fields || {};
  const line = "=".repeat(88);
  const siteKey = issue.key?.includes("-") ? issue.key.split("-")[0] : "jira";
  const browseHost = process.env.JIRA_SITE_HOST?.trim() || "horizontal.atlassian.net";

  console.log(`\n${line}`);
  console.log(`JIRA ${f.issuetype?.name?.toUpperCase() || "ISSUE"}: ${issue.key}`);
  console.log(line);
  console.log(`Summary   : ${f.summary || ""}`);
  console.log(`Type      : ${f.issuetype?.name || ""}`);
  console.log(`Status    : ${f.status?.name || ""}`);
  console.log(`Assignee  : ${f.assignee?.displayName || "Unassigned"}`);
  if (f.priority?.name) console.log(`Priority  : ${f.priority.name}`);
  console.log(`URL       : https://${browseHost}/browse/${issue.key}`);
  console.log(`${line}\n`);
  console.log("DESCRIPTION\n");
  const desc = descriptionToText(f.description);
  console.log(desc || "(no description)");
  console.log(`\n${line}\n`);
}

async function main() {
  const keys = process.argv.slice(2).filter(Boolean);
  if (keys.length === 0) {
    console.error("Usage: node scripts/print-jira-issue.cjs <ISSUE-KEY> [ISSUE-KEY ...]");
    console.error("Example: node scripts/print-jira-issue.cjs QAP-74");
    process.exit(1);
  }

  const cloudId = env("JIRA_CLOUD_ID");
  const email = env("JIRA_EMAIL");
  const token = env("JIRA_API_TOKEN");
  if (!cloudId || !email || !token) {
    console.error(
      "[jira] Missing JIRA_CLOUD_ID, JIRA_EMAIL, or JIRA_API_TOKEN. Set them in the environment and retry.",
    );
    process.exit(1);
  }

  for (const key of keys) {
    const issue = await jiraFetch(
      cloudId,
      email,
      token,
      `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description,status,assignee,issuetype,priority`,
    );
    printIssue(issue);
  }
}

main().catch((e) => {
  console.error("[jira]", e.message || e);
  process.exit(1);
});
