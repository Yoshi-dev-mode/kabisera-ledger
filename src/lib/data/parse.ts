/**
 * Strict readers for rows coming back from the database. Anything that is not the expected shape is rejected
 * rather than guessed, so a mistake in a query shows up as an error instead of as a wrong number on screen.
 */
export class RowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RowError";
  }
}

type Row = Record<string, unknown>;

export function asRow(value: unknown, what: string): Row {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RowError(`${what}: expected an object`);
  }
  return value as Row;
}

export function asRows(value: unknown, what: string): Row[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new RowError(`${what}: expected a list`);
  return value.map((v, i) => asRow(v, `${what}[${i}]`));
}

export function str(row: Row, key: string): string {
  const v = row[key];
  if (typeof v !== "string") throw new RowError(`${key}: expected text`);
  return v;
}
export function strOrNull(row: Row, key: string): string | null {
  const v = row[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new RowError(`${key}: expected text or nothing`);
  return v;
}
export function int(row: Row, key: string): number {
  const v = row[key];
  if (typeof v !== "number" || !Number.isSafeInteger(v)) throw new RowError(`${key}: expected a whole number`);
  return v;
}
export function intOrNull(row: Row, key: string): number | null {
  const v = row[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isSafeInteger(v)) throw new RowError(`${key}: expected a whole number or nothing`);
  return v;
}
export function bool(row: Row, key: string): boolean {
  const v = row[key];
  if (typeof v !== "boolean") throw new RowError(`${key}: expected true or false`);
  return v;
}
