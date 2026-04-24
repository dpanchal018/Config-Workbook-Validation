/**
 * Prints a successful step to stdout (visible in `npx playwright test`, run-tests.bat, CI).
 * Use after each logical phase completes.
 */
export function stepPassed(label: string): void {
  console.log(`${label} -> Passed`);
}
