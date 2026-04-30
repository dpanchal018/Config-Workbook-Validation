/**
 * Set to `1` to print Part 1 step logs, picklist option tables, on-page overlays,
 * and dependency picklist enable/disable lines. When unset, only the final Part 1
 * matrix (`console.table`) is printed on success.
 */
export const PROCUREMENT_TEST_VERBOSE_ENV =
  "SF_PROCUREMENT_PART1_VERBOSE" as const;

export function isProcurementTestVerbose(): boolean {
  return process.env[PROCUREMENT_TEST_VERBOSE_ENV]?.trim() === "1";
}
