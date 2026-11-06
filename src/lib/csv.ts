/**
 * CSV export helpers.
 * - Cells that could be executed as spreadsheet formulas are neutralised (CSV injection).
 * - Genuine numbers are left alone so negative amounts stay numeric.
 * - Optional UTF-8 BOM so Excel on Windows opens names and ₱ correctly.
 */
export type CsvValue = string | number | null | undefined;

export type CsvColumn<Row> = {
  header: string;
  value: (row: Row) => CsvValue;
  /** "number" means the value is a plain decimal like -12.50 and must not be prefixed. */
  kind?: "text" | "number";
};

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function csvCell(value: CsvValue, kind: "text" | "number" = "text"): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new RangeError("CSV numbers must be finite");
  }
  let text = typeof value === "number" ? String(value) : value;
  const isNumber = (kind === "number" || typeof value === "number") && PLAIN_NUMBER.test(text);
  if (!isNumber && FORMULA_START.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<Row>(
  rows: readonly Row[],
  columns: readonly CsvColumn<Row>[],
  options: { bom?: boolean; newline?: string } = {},
): string {
  const { bom = false, newline = "\r\n" } = options;
  const lines: string[] = [columns.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(c.value(row), c.kind ?? "text")).join(","));
  }
  return `${bom ? "\uFEFF" : ""}${lines.join(newline)}${newline}`;
}
