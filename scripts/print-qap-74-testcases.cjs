/**
 * Jira test cases for QAP-74 — derived ONLY from story acceptance criteria.
 * Terminal output only (not uploaded to Jira).
 *
 * Usage: node scripts/print-qap-74-testcases.cjs
 */

const STORY = "QAP-74";
const STORY_TITLE =
  "Automate Lead Creation Modal Validation Using Cursor + Playwright";
const STORY_URL = "https://horizontal.atlassian.net/browse/QAP-74";

const BASE_PRECONDITIONS = [
  "Story QAP-74 acceptance criteria are approved and in scope.",
  "Valid Salesforce user credentials and org access are available.",
  "Expected Lead Creation field and picklist configuration is documented (e.g. Config Workbook / reference documentation).",
  "User can access the Lead object and open the New Lead / Lead Creation modal.",
];

const LOGIN = [
  "Log in to Salesforce with a valid username and password.",
];

const NAV_TO_LEAD_CREATION_MODAL = [
  "From Salesforce Home, navigate to the Lead List View.",
  "Click **New** to open the **Lead Creation Modal**.",
  "Wait until the modal and its fields have finished loading.",
];

function printTestCase({ id, title, ac, preconditions, steps, expected }) {
  console.log("=".repeat(88));
  console.log(`${id} — ${title}`);
  console.log(`Story: ${STORY} | ${STORY_URL}`);
  console.log(`Acceptance Criteria: ${ac}`);
  console.log("-".repeat(88));
  console.log("\n1. Test Case Title");
  console.log(`   ${title}`);
  console.log("\n2. Preconditions / Pre-requisite");
  for (const p of preconditions) console.log(`   • ${p}`);
  console.log("\n3. Test Steps");
  steps.forEach((s, i) => console.log(`   ${i + 1}. ${s}`));
  console.log("\n4. Expected Result");
  for (const e of expected) console.log(`   • ${e}`);
  console.log("");
}

/** Test cases map 1:1 to QAP-74 acceptance criteria bullets. */
const testCases = [
  // ── AC1: Lead Creation Modal Accessibility ──────────────────────────────
  {
    id: "TC-QAP-74-AC1-01",
    ac: "AC1 — Automation successfully navigates to the Lead Creation Modal",
    title: "Verify automation navigates to the Lead Creation Modal",
    preconditions: BASE_PRECONDITIONS,
    steps: [...LOGIN, ...NAV_TO_LEAD_CREATION_MODAL],
    expected: [
      "Automation completes login successfully.",
      "Automation reaches the Lead Creation Modal without manual intervention.",
      "Lead Creation Modal is displayed to the user/automation.",
    ],
  },
  {
    id: "TC-QAP-74-AC1-02",
    ac: "AC1 — Modal loads without errors",
    title: "Verify Lead Creation Modal loads without errors",
    preconditions: BASE_PRECONDITIONS,
    steps: [
      ...LOGIN,
      ...NAV_TO_LEAD_CREATION_MODAL,
      "Observe the modal for error messages, fault banners, or failed load states.",
    ],
    expected: [
      "Lead Creation Modal opens without errors.",
      "No blocking error message prevents use of the modal.",
      "Form fields are available for inspection.",
    ],
  },
  {
    id: "TC-QAP-74-AC1-03",
    ac: "AC1 — Validation execution starts only after modal rendering is complete",
    title: "Verify validation starts only after Lead Creation Modal rendering is complete",
    preconditions: BASE_PRECONDITIONS,
    steps: [
      ...LOGIN,
      ...NAV_TO_LEAD_CREATION_MODAL,
      "Start the Lead Creation Modal validation once the modal open step completes.",
      "Review execution order: modal visible before field/picklist checks begin.",
    ],
    expected: [
      "Validation does not start while the modal is still loading.",
      "Field and picklist validation runs only after the modal is fully rendered.",
    ],
  },

  // ── AC2: Field Presence Validation ──────────────────────────────────────
  {
    id: "TC-QAP-74-AC2-01",
    ac: "AC2 — All expected fields configured for Lead Creation are identified",
    title: "Verify all expected Lead Creation fields are identified",
    preconditions: [
      ...BASE_PRECONDITIONS,
      "Expected field list for Lead Creation is defined in configuration documentation.",
    ],
    steps: [
      ...LOGIN,
      ...NAV_TO_LEAD_CREATION_MODAL,
      "Run field presence validation against the expected field list.",
      "Review validation output for each expected field.",
    ],
    expected: [
      "Every expected Lead Creation field is identified on the modal.",
      "Each expected field appears in the validation results.",
    ],
  },
  {
    id: "TC-QAP-74-AC2-02",
    ac: "AC2 — Missing fields are reported as validation failures",
    title: "Verify missing fields are reported as validation failures",
    preconditions: [
      ...BASE_PRECONDITIONS,
      "At least one expected field is missing from the Lead Creation Modal (known discrepancy or test layout).",
    ],
    steps: [
      ...LOGIN,
      ...NAV_TO_LEAD_CREATION_MODAL,
      "Run field presence validation.",
      "Locate results for fields expected in configuration but absent on the UI.",
    ],
    expected: [
      "Each missing expected field is reported as a validation **failure**.",
      "Failure output identifies which field(s) are missing.",
    ],
  },
  {
    id: "TC-QAP-74-AC2-03",
    ac: "AC2 — Unexpected additional fields are reported as validation warnings",
    title: "Verify unexpected additional fields are reported as validation warnings",
    preconditions: [
      ...BASE_PRECONDITIONS,
      "Lead Creation Modal contains a field not listed in expected configuration (if applicable).",
    ],
    steps: [
      ...LOGIN,
      ...NAV_TO_LEAD_CREATION_MODAL,
      "Run field presence validation.",
      "Compare fields displayed on the modal against the expected field list.",
    ],
    expected: [
      "Fields on the UI that are not in expected configuration are reported as validation **warnings**.",
      "Unexpected fields are clearly identified in validation output.",
    ],
  },

  // ── AC3: Field Attribute Validation ─────────────────────────────────────
  {
    id: "TC-QAP-74-AC3-01",
    ac: "AC3 — Validate field label names against expected configuration",
    title: "Verify field label names match expected configuration",
    preconditions: [
      ...BASE_PRECONDITIONS,
      "Expected field labels are documented in configuration.",
    ],
    steps: [
      ...LOGIN,
      ...NAV_TO_LEAD_CREATION_MODAL,
      "Validate each field label on the modal against the expected configuration.",
    ],
    expected: [
      "Field label names on the UI match expected configuration.",
      "Label mismatches are reported as validation failures with expected vs actual label.",
    ],
  },
  {
    id: "TC-QAP-74-AC3-02",
    ac: "AC3 — Validate field type (Text, Number, Date, Email, Phone, Picklist, Checkbox, etc.)",
    title: "Verify field types match expected configuration",
    preconditions: [
      ...BASE_PRECONDITIONS,
      "Expected field types are documented for Lead Creation fields.",
    ],
    steps: [
      ...LOGIN,
      ...NAV_TO_LEAD_CREATION_MODAL,
      "For each configured field, verify the control type on the modal (Text, Number, Date, Email, Phone, Picklist, Checkbox, etc.).",
      "Compare against expected field type in configuration.",
    ],
    expected: [
      "Each field displays the correct control type per expected configuration.",
      "Field type mismatches are reported in validation results.",
    ],
  },
  {
    id: "TC-QAP-74-AC3-03",
    ac: "AC3 — Validate required/optional field indicators",
    title: "Verify required and optional field indicators match expected configuration",
    preconditions: [
      ...BASE_PRECONDITIONS,
      "Required vs optional status is documented for each Lead Creation field.",
    ],
    steps: [
      ...LOGIN,
      ...NAV_TO_LEAD_CREATION_MODAL,
      "Inspect required/optional indicators on each field (e.g. asterisk, Required label).",
      "Compare against expected required/optional configuration.",
    ],
    expected: [
      "Required fields show required indicators where expected.",
      "Optional fields are not marked as required when configuration says optional.",
      "Required/optional mismatches are reported as validation failures.",
    ],
  },
  {
    id: "TC-QAP-74-AC3-04",
    ac: "AC3 — Validate read-only fields where applicable",
    title: "Verify read-only fields behave as configured",
    preconditions: [
      ...BASE_PRECONDITIONS,
      "Read-only fields are identified in expected configuration where applicable.",
    ],
    steps: [
      ...LOGIN,
      ...NAV_TO_LEAD_CREATION_MODAL,
      "Locate fields designated as read-only in configuration.",
      "Attempt to edit those fields.",
    ],
    expected: [
      "Read-only fields are not editable or are clearly marked read-only.",
      "Deviations from expected read-only behaviour are reported in validation results.",
    ],
  },
  {
    id: "TC-QAP-74-AC3-05",
    ac: "AC3 — Validate default values for pre-populated fields",
    title: "Verify default values for pre-populated fields match expected configuration",
    preconditions: [
      ...BASE_PRECONDITIONS,
      "Default values for pre-populated fields are documented in configuration.",
    ],
    steps: [
      ...LOGIN,
      ...NAV_TO_LEAD_CREATION_MODAL,
      "Open the modal without changing pre-populated fields.",
      "Compare displayed default values to expected configuration.",
    ],
    expected: [
      "Pre-populated fields show the expected default values.",
      "Default value mismatches are reported in validation results.",
    ],
  },

  // ── AC4: Picklist Value Validation ──────────────────────────────────────
  {
    id: "TC-QAP-74-AC4-01",
    ac: "AC4 — Retrieve all available picklist values; compare against expected configuration",
    title: "Verify picklist values are retrieved and compared to expected configuration",
    preconditions: [
      ...BASE_PRECONDITIONS,
      "Expected picklist values for Lead Creation fields are documented.",
    ],
    steps: [
      ...LOGIN,
      ...NAV_TO_LEAD_CREATION_MODAL,
      "Open each applicable picklist on the Lead Creation Modal.",
      "Retrieve all available picklist values.",
      "Compare retrieved values to expected configuration.",
    ],
    expected: [
      "All available picklist values are successfully retrieved from the modal.",
      "Retrieved values are compared against expected configuration.",
      "Comparison results are recorded in validation output.",
    ],
  },
  {
    id: "TC-QAP-74-AC4-02",
    ac: "AC4 — Report missing, additional, incorrect labels, and incorrect sort order",
    title: "Verify picklist discrepancies are reported correctly",
    preconditions: [
      ...BASE_PRECONDITIONS,
      "Expected picklist values (and sort order where business-critical) are documented.",
    ],
    steps: [
      ...LOGIN,
      ...NAV_TO_LEAD_CREATION_MODAL,
      "Run picklist value validation for Lead Creation picklists.",
      "Review validation output for discrepancy categories.",
    ],
    expected: [
      "**Missing picklist values** (in config but not on UI) are reported.",
      "**Additional picklist values** (on UI but not in config) are reported.",
      "**Incorrect value labels** are reported.",
      "**Incorrect sort order** is reported when order is business-critical and does not match.",
    ],
  },

  // ── AC5: Validation Reporting ───────────────────────────────────────────
  {
    id: "TC-QAP-74-AC5-01",
    ac: "AC5 — Generate execution report with timestamp, environment, counts, and discrepancy list",
    title: "Verify validation execution report contains required information",
    preconditions: [
      ...BASE_PRECONDITIONS,
      "Full Lead Creation Modal validation suite is executed.",
    ],
    steps: [
      ...LOGIN,
      ...NAV_TO_LEAD_CREATION_MODAL,
      "Execute the complete Lead Creation Modal validation.",
      "Open or review the generated execution report.",
    ],
    expected: [
      "Report includes **validation timestamp**.",
      "Report includes **environment name**.",
      "Report includes **total validations executed**.",
      "Report includes **passed validations** count.",
      "Report includes **failed validations** count.",
      "Report includes a **detailed discrepancy list** for failures.",
    ],
  },

  // ── AC6: Error Handling ─────────────────────────────────────────────────
  {
    id: "TC-QAP-74-AC6-01",
    ac: "AC6 — Graceful handling of failures; errors logged with actionable details",
    title: "Verify framework handles errors gracefully with actionable logging",
    preconditions: [
      "Automation framework is configured for Lead Creation Modal validation.",
    ],
    steps: [
      "Execute validation scenarios that may trigger: page load failure, authentication failure, modal rendering issue, or element identification failure.",
      "Review error logs and execution report for each scenario.",
    ],
    expected: [
      "**Page load failures** are handled gracefully; execution does not hang silently.",
      "**Authentication failures** are handled gracefully with clear failure indication.",
      "**Modal rendering issues** are handled gracefully with clear failure indication.",
      "**Element identification failures** are handled gracefully with clear failure indication.",
      "All errors are **logged with actionable details** (what failed, where, and enough context to troubleshoot).",
    ],
  },

  // ── AC7: Reusability ────────────────────────────────────────────────────
  {
    id: "TC-QAP-74-AC7-01",
    ac: "AC7 — Validation logic configurable and reusable across environments",
    title: "Verify validation logic is reusable across environments",
    preconditions: [
      "Access to at least one alternate Salesforce environment (or configurable target URL).",
      "Credentials for the alternate environment are available.",
    ],
    steps: [
      "Configure automation for Environment A; run Lead Creation Modal validation.",
      "Configure automation for Environment B (change environment/credentials only); run the same validation.",
    ],
    expected: [
      "Same validation logic runs on both environments without code changes.",
      "Results reflect each environment's Lead Creation configuration.",
    ],
  },
  {
    id: "TC-QAP-74-AC7-02",
    ac: "AC7 — Expected metadata maintained in centralized configuration file",
    title: "Verify expected field metadata and picklist values use centralized configuration",
    preconditions: [
      "Centralized configuration file contains expected field metadata and picklist values.",
    ],
    steps: [
      ...LOGIN,
      ...NAV_TO_LEAD_CREATION_MODAL,
      "Run validation driven by the centralized configuration file.",
      "Update a non-code configuration value and re-run validation.",
    ],
    expected: [
      "Validation reads expected field metadata from the centralized configuration file.",
      "Validation reads expected picklist values from the centralized configuration file.",
      "Configuration updates apply to validation without changing validation scripts.",
    ],
  },

  // ── AC8: CI/CD Compatibility ────────────────────────────────────────────
  {
    id: "TC-QAP-74-AC8-01",
    ac: "AC8 — CI/CD pipeline support; no manual intervention once configured",
    title: "Verify automation runs through CI/CD without manual intervention",
    preconditions: [
      "CI/CD pipeline (or unattended batch run) is configured with credentials and environment settings.",
    ],
    steps: [
      "Trigger Lead Creation Modal validation from CI/CD pipeline or unattended scheduled run.",
      "Do not perform manual steps during execution.",
      "Review pipeline exit status and archived report artifacts.",
    ],
    expected: [
      "Automation **supports execution through CI/CD pipelines**.",
      "Execution completes **without manual intervention** once configured.",
      "Pass/fail outcome is available for pipeline gating.",
    ],
  },
];

console.log("\n" + "=".repeat(88));
console.log(`JIRA TEST CASES — ${STORY} (Acceptance Criteria only)`);
console.log(STORY_TITLE);
console.log(`Story URL: ${STORY_URL}`);
console.log(`Total test cases: ${testCases.length}`);
console.log("Output only — not uploaded to Jira.");
console.log("=".repeat(88) + "\n");

console.log("Mapping:");
console.log("  AC1: 3 test cases  |  AC2: 3  |  AC3: 5  |  AC4: 2");
console.log("  AC5: 1 test case  |  AC6: 1  |  AC7: 2  |  AC8: 1");
console.log("  Total: 18 test cases (one per AC bullet)\n");

for (const tc of testCases) {
  printTestCase(tc);
}

console.log("=".repeat(88));
console.log("End of test cases.");
console.log("Re-run: node scripts/print-qap-74-testcases.cjs");
console.log("=".repeat(88) + "\n");
