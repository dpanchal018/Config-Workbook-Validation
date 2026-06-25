/**
 * Prints test cases derived from QAP-134 acceptance criteria.
 * Does not create Jira issues — terminal output only.
 *
 * Usage: node scripts/print-qap-134-testcases.cjs
 */

const STORY = "QAP-134";
const STORY_TITLE =
  "CPC - Automation (DHE) - Country of Residence and Nationality Fields on My Profile Page";

const CPC_URL =
  "https://cloud.explore.legoland.ae/CPC_LL?sfid=MDAzUXMwMDAwMEVBMDNWSUFU#my-profile";

const COMMON_PRECONDITIONS = [
  "Valid CPC (Marketing Cloud) user credentials are available for the target environment.",
  "Reference sheet with expected **Country of Residence** and **Nationality (UAE Residents Only)** picklist values is available.",
  "Playwright (or agreed automation framework) and project dependencies are installed.",
  "Test user has access to the **My Profile** page on the CPC.",
  "Automation uses a dedicated test profile — not live production customer data unless explicitly approved.",
];

const NAV_TO_MY_PROFILE_EN = [
  "Wait for the CPC home page to load completely after login.",
  "Switch to **English** language if not already selected.",
  "Navigate to the **My Profile** page (direct URL or profile menu).",
  "Wait until the My Profile form and profile fields are fully rendered.",
];

const NAV_TO_MY_PROFILE_AR = [
  "Wait for the CPC home page to load completely after login.",
  "Switch the CPC to **Arabic** language.",
  "Navigate to the **My Profile** page (direct URL or profile menu).",
  "Wait until the My Profile form and profile fields are fully rendered (RTL layout).",
];

function loginStep() {
  return "Log in to the Marketing Cloud CPC using valid username and password.";
}

function printTestCase({ id, title, ac, preconditions, steps, expected }) {
  console.log("=".repeat(88));
  console.log(`${id} — ${title}`);
  console.log(`Story: ${STORY} | Maps to: ${ac}`);
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

const testCases = [
  {
    id: "TC-QAP-134-01",
    ac: "AC6 — Fields available on My Profile",
    title:
      "Verify Country of Residence and Nationality fields are present on My Profile (English)",
    preconditions: COMMON_PRECONDITIONS,
    steps: [
      loginStep(),
      ...NAV_TO_MY_PROFILE_EN,
      "Locate the **Country of Residence** field on the profile form.",
      "Locate the **Nationality (UAE Residents Only)** field (or its placeholder when hidden).",
    ],
    expected: [
      "**Country of Residence** field is visible and accessible on My Profile.",
      "**Nationality (UAE Residents Only)** field label/control is present on the page (enabled or conditionally hidden per rules).",
      "No page errors or broken layout prevent access to profile fields.",
    ],
  },
  {
    id: "TC-QAP-134-02",
    ac: "AC6 — Fields available on My Profile",
    title:
      "Verify Country of Residence and Nationality fields are present on My Profile (Arabic)",
    preconditions: COMMON_PRECONDITIONS,
    steps: [
      loginStep(),
      ...NAV_TO_MY_PROFILE_AR,
      "Locate the **Country of Residence** field (Arabic label).",
      "Locate the **Nationality (UAE Residents Only)** field (Arabic label).",
    ],
    expected: [
      "Both fields are visible and accessible on the Arabic My Profile page.",
      "Arabic labels render correctly in RTL layout.",
      "No localization or rendering errors block field access.",
    ],
  },
  {
    id: "TC-QAP-134-03",
    ac: "AC1 — Country of Residence picklist values",
    title:
      "Verify Country of Residence picklist values match the reference sheet (English)",
    preconditions: [
      ...COMMON_PRECONDITIONS,
      "Reference sheet lists all expected Country of Residence values for English CPC.",
    ],
    steps: [
      loginStep(),
      ...NAV_TO_MY_PROFILE_EN,
      "Open the **Country of Residence** picklist dropdown.",
      "Capture all displayed picklist option labels.",
      "Compare captured values against the reference sheet (order, spelling, completeness).",
    ],
    expected: [
      "Every value on the reference sheet appears in the CPC picklist.",
      "No unexpected extra values appear unless documented.",
      "Value labels match the reference sheet exactly (English).",
      "Validation result is logged (Pass/Fail) with any discrepancies listed.",
    ],
  },
  {
    id: "TC-QAP-134-04",
    ac: "AC1 — Country of Residence picklist values",
    title:
      "Verify Country of Residence picklist values match the reference sheet (Arabic)",
    preconditions: [
      ...COMMON_PRECONDITIONS,
      "Reference sheet lists all expected Country of Residence values for Arabic CPC.",
    ],
    steps: [
      loginStep(),
      ...NAV_TO_MY_PROFILE_AR,
      "Open the **Country of Residence** picklist dropdown.",
      "Capture all displayed picklist option labels in Arabic.",
      "Compare captured values against the Arabic reference sheet.",
    ],
    expected: [
      "All reference-sheet values are present in the Arabic picklist.",
      "Arabic labels match the reference sheet.",
      "Discrepancies (missing, extra, or mislabeled values) are reported as failures.",
    ],
  },
  {
    id: "TC-QAP-134-05",
    ac: "AC2 — Nationality visible when UAE selected",
    title:
      "Verify Nationality field becomes selectable when UAE is Country of Residence (English)",
    preconditions: COMMON_PRECONDITIONS,
    steps: [
      loginStep(),
      ...NAV_TO_MY_PROFILE_EN,
      "Open **Country of Residence** and select **UAE**.",
      "Observe the **Nationality (UAE Residents Only)** field state.",
      "Open the Nationality picklist and capture all displayed values.",
      "Compare Nationality values against the reference sheet.",
    ],
    expected: [
      "After selecting UAE, **Nationality (UAE Residents Only)** becomes available and selectable.",
      "All nationality picklist values match the reference sheet.",
      "User can select a nationality value without UI errors.",
    ],
  },
  {
    id: "TC-QAP-134-06",
    ac: "AC2 — Nationality visible when UAE selected",
    title:
      "Verify Nationality field becomes selectable when UAE is Country of Residence (Arabic)",
    preconditions: COMMON_PRECONDITIONS,
    steps: [
      loginStep(),
      ...NAV_TO_MY_PROFILE_AR,
      "Open **Country of Residence** and select **UAE** (Arabic label).",
      "Observe the **Nationality (UAE Residents Only)** field state.",
      "Open the Nationality picklist and capture all Arabic values.",
      "Compare against the Arabic reference sheet.",
    ],
    expected: [
      "Nationality field becomes available when UAE is selected on Arabic CPC.",
      "All nationality values match the Arabic reference sheet.",
      "Field dependency behaves the same as English CPC.",
    ],
  },
  {
    id: "TC-QAP-134-07",
    ac: "AC3 — Nationality hidden for non-UAE",
    title:
      "Verify Nationality field is not available when Country of Residence is not UAE (English)",
    preconditions: COMMON_PRECONDITIONS,
    steps: [
      loginStep(),
      ...NAV_TO_MY_PROFILE_EN,
      "Open **Country of Residence** and select a country other than UAE (e.g., United Kingdom, India, or any non-UAE value from the list).",
      "Attempt to interact with **Nationality (UAE Residents Only)**.",
    ],
    expected: [
      "**Nationality (UAE Residents Only)** is not available or not selectable.",
      "Field is hidden, disabled, or clearly not applicable for non-UAE residence.",
      "No validation error forces Nationality selection for non-UAE countries.",
    ],
  },
  {
    id: "TC-QAP-134-08",
    ac: "AC3 — Nationality hidden for non-UAE",
    title:
      "Verify Nationality field is not available when Country of Residence is not UAE (Arabic)",
    preconditions: COMMON_PRECONDITIONS,
    steps: [
      loginStep(),
      ...NAV_TO_MY_PROFILE_AR,
      "Select a **Country of Residence** value other than UAE.",
      "Attempt to interact with **Nationality (UAE Residents Only)** (Arabic).",
    ],
    expected: [
      "Nationality field is not available/selectable for non-UAE country on Arabic CPC.",
      "Dependency rule matches English CPC behavior.",
    ],
  },
  {
    id: "TC-QAP-134-09",
    ac: "AC4 — English and Arabic validation",
    title:
      "Verify Country of Residence and Nationality dependency rules pass on English CPC",
    preconditions: [
      ...COMMON_PRECONDITIONS,
      "Automation covers picklist audit and UAE / non-UAE dependency checks.",
    ],
    steps: [
      loginStep(),
      ...NAV_TO_MY_PROFILE_EN,
      "Validate Country of Residence picklist against reference sheet.",
      "Select UAE — validate Nationality picklist and dependency.",
      "Change to a non-UAE country — validate Nationality is unavailable.",
      "Review automation report for English CPC.",
    ],
    expected: [
      "All English CPC validations (AC1–AC3) pass in a single execution.",
      "Report clearly shows Pass/Fail per check.",
      "No dependency rule failures on English My Profile.",
    ],
  },
  {
    id: "TC-QAP-134-10",
    ac: "AC4 — English and Arabic validation",
    title:
      "Verify Country of Residence and Nationality dependency rules pass on Arabic CPC",
    preconditions: [
      ...COMMON_PRECONDITIONS,
      "Arabic reference sheet and language switch path are configured.",
    ],
    steps: [
      loginStep(),
      ...NAV_TO_MY_PROFILE_AR,
      "Validate Country of Residence picklist against Arabic reference sheet.",
      "Select UAE — validate Nationality picklist and dependency.",
      "Change to a non-UAE country — validate Nationality is unavailable.",
      "Review automation report for Arabic CPC.",
    ],
    expected: [
      "All Arabic CPC validations (AC1–AC3) pass.",
      "Arabic labels and RTL layout do not break picklist or dependency logic.",
      "Results are comparable to English CPC outcomes.",
    ],
  },
  {
    id: "TC-QAP-134-11",
    ac: "AC5 — Save profile on CPC and CRM sync",
    title:
      "Verify My Profile saves successfully on CPC when UAE and Nationality are selected",
    preconditions: [
      ...COMMON_PRECONDITIONS,
      "Test user profile can be updated without impacting unauthorized production data.",
    ],
    steps: [
      loginStep(),
      ...NAV_TO_MY_PROFILE_EN,
      "Select **UAE** as **Country of Residence**.",
      "Select a valid **Nationality (UAE Residents Only)** value.",
      "Click **Save** on the My Profile page.",
      "Observe success/error messages on CPC.",
    ],
    expected: [
      "Profile saves successfully on CPC without errors.",
      "Success confirmation is displayed (or profile reflects saved values on reload).",
      "Selected Country of Residence and Nationality persist on the CPC My Profile page.",
      "No synchronization or save-failure errors appear.",
    ],
  },
  {
    id: "TC-QAP-134-12",
    ac: "AC5 — Save profile on CPC and CRM sync",
    title:
      "Verify Country of Residence and Nationality saved on CPC are reflected correctly in CRM",
    preconditions: [
      ...COMMON_PRECONDITIONS,
      "CRM access is approved for validation (sandbox, VDI, or governed prod read access).",
      "CRM login credentials or API access are configured for the test user.",
      "TC-QAP-134-11 (or equivalent save on CPC) has been executed.",
    ],
    steps: [
      loginStep(),
      ...NAV_TO_MY_PROFILE_EN,
      "Select **UAE** and a **Nationality** value; save My Profile on CPC.",
      "Log in to CRM (or connect via approved automation path / VDI).",
      "Locate the same contact/profile record in CRM.",
      "Compare **Country of Residence** and **Nationality** values in CRM against CPC selections.",
    ],
    expected: [
      "CRM stores the same Country of Residence value as selected on CPC.",
      "CRM stores the same Nationality value as selected on CPC.",
      "No data mismatch, sync delay failure, or missing field values in CRM.",
      "CPC-to-CRM synchronization completes without errors.",
    ],
  },
  {
    id: "TC-QAP-134-13",
    ac: "AC5 — Save profile on CPC and CRM sync",
    title:
      "Verify profile save with non-UAE Country of Residence syncs to CRM without Nationality",
    preconditions: [
      ...COMMON_PRECONDITIONS,
      "CRM validation access is available.",
    ],
    steps: [
      loginStep(),
      ...NAV_TO_MY_PROFILE_EN,
      "Select a non-UAE **Country of Residence** (Nationality not applicable).",
      "Save the My Profile page on CPC.",
      "Verify save success on CPC.",
      "Log in to CRM and locate the corresponding record.",
      "Verify Country of Residence in CRM; confirm Nationality handling per business rules.",
    ],
    expected: [
      "CPC save completes successfully for non-UAE country.",
      "CRM reflects the selected Country of Residence.",
      "Nationality is blank, not applicable, or unchanged per requirements — no erroneous Nationality value is synced.",
      "No save or sync errors in CPC or CRM.",
    ],
  },
  {
    id: "TC-QAP-134-14",
    ac: "Automation Part 1 — CPC UI/UX Validation",
    title:
      "Verify automated CPC UI suite validates picklists, dependencies, and EN/AR support",
    preconditions: [
      ...COMMON_PRECONDITIONS,
      "CPC UI automation scripts (Part 1) are implemented and reference sheet is wired to tests.",
      `CPC base URL configured (e.g. ${CPC_URL}).`,
    ],
    steps: [
      loginStep(),
      "Execute CPC UI/UX automation Part 1 (My Profile — Country of Residence & Nationality).",
      "Run validations for English My Profile.",
      "Run validations for Arabic My Profile.",
      "Review terminal/report output for picklist and dependency results.",
    ],
    expected: [
      "Automation validates all picklist values against the reference sheet.",
      "UAE / non-UAE dependency rules pass for both languages.",
      "Users can select values and save profile on CPC without automation errors.",
      "Failures include field name, expected vs actual, and screenshot evidence.",
    ],
  },
  {
    id: "TC-QAP-134-15",
    ac: "Automation Part 2 — CPC-to-CRM Data Validation",
    title:
      "Verify automated CPC-to-CRM suite confirms data synchronization after profile save",
    preconditions: [
      ...COMMON_PRECONDITIONS,
      "CRM validation automation (Part 2) is approved and credentials/VDI path is configured.",
      "Test data strategy avoids unintended modification of live customer records.",
    ],
    steps: [
      loginStep(),
      ...NAV_TO_MY_PROFILE_EN,
      "Select and save Country of Residence and Nationality on CPC (automation-driven).",
      "Execute CPC-to-CRM data validation (Part 2).",
      "Compare CPC saved values with CRM stored values.",
      "Review sync validation report.",
    ],
    expected: [
      "Values saved on CPC match values displayed/stored in CRM.",
      "No data mismatches between CPC and CRM.",
      "Sync validation report lists timestamp, environment, and Pass/Fail per field.",
      "Errors (auth, VDI, MFA, rate limits) are logged with actionable details if sync fails.",
    ],
  },
];

console.log("\n" + "=".repeat(88));
console.log(`JIRA TEST CASES — ${STORY}: ${STORY_TITLE}`);
console.log(`Total test cases: ${testCases.length}`);
console.log(`CPC URL (reference): ${CPC_URL}`);
console.log("Output only — not uploaded to Jira.");
console.log("=".repeat(88) + "\n");

for (const tc of testCases) {
  printTestCase(tc);
}

console.log("=".repeat(88));
console.log("End of test cases.");
console.log("=".repeat(88) + "\n");
