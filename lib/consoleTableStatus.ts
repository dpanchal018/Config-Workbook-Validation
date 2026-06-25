const ANSI_GREEN = "\u001b[92m";
const ANSI_RED = "\u001b[31m";
const ANSI_RESET = "\u001b[0m";

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

function padVisible(text: string, width: number): string {
  const pad = Math.max(0, width - visibleLength(text));
  return text + " ".repeat(pad);
}

function colorize(text: string, color: "green" | "red"): string {
  const code = color === "red" ? ANSI_RED : ANSI_GREEN;
  return `${code}${text}${ANSI_RESET}`;
}

/** Match `console.table` string/number formatting. */
function formatTableCell(value: unknown): string {
  if (value == null) return String(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return `'${String(value)}'`;
}

function formatColoredCell(
  value: unknown,
  column: string,
  statusKey: string,
): string {
  const text = formatTableCell(value);
  if (column === statusKey && value === "Fail") {
    return colorize(text, "red");
  }
  return colorize(text, "green");
}

/** Red Fail / green everything else for inline log lines. */
export function formatFailStatus(status: string): string {
  if (status === "Fail") return colorize("Fail", "red");
  return colorize(status, "green");
}

/**
 * Prints a `console.table`-style grid with green text; **Fail** in the Status column is red.
 * (`console.table` escapes ANSI codes, so it cannot color individual cells.)
 */
export function consoleTableWithStatusHighlight<T extends Record<string, unknown>>(
  rows: T[],
  statusKey: keyof T & string = "Status",
): void {
  if (rows.length === 0) {
    console.log();
    return;
  }

  const columns = Object.keys(rows[0]);
  const tableColumns = ["(index)", ...columns];

  const indexedRows = rows.map((row, index) => ({ "(index)": index, ...row }));

  const widths: Record<string, number> = {};
  for (const column of tableColumns) {
    let max = column.length;
    for (const row of indexedRows) {
      const raw =
        column === "(index)"
          ? String(row["(index)"])
          : formatTableCell(row[column as keyof typeof row]);
      max = Math.max(max, visibleLength(raw));
    }
    widths[column] = max;
  }

  const header = tableColumns
    .map((column) => padVisible(colorize(column, "green"), widths[column]))
    .join(colorize(" | ", "green"));
  console.log(header);

  for (const row of indexedRows) {
    const line = tableColumns
      .map((column) => {
        if (column === "(index)") {
          return padVisible(colorize(String(row["(index)"]), "green"), widths[column]);
        }
        const cell = formatColoredCell(
          row[column as keyof typeof row],
          column,
          statusKey,
        );
        return padVisible(cell, widths[column]);
      })
      .join(colorize(" | ", "green"));
    console.log(line);
  }
}
