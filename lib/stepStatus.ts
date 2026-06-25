/**
 * Prints a successful step to stdout (visible in `npx playwright test`, Config+JIRA.bat, CI).
 * Use after each logical phase completes.
 */
export function stepPassed(label: string): void {
  console.log(`${label} -> Passed`);
}
