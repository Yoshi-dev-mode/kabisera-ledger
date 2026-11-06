import { sumCentavos } from "@/lib/money";

export type OpeningDebt = { seed_key: string; display_name: string; amount_cents: number };
export type OpeningDebtsSeed = {
  source: string;
  expectedTotalCents: number;
  dateKnown: false;
  debts: OpeningDebt[];
};

export class SeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedError";
  }
}

/**
 * Reads supabase/seed/opening-debts.json and re-checks it before anything is sent to the database:
 * unique keys, unique names (so "Cee jay" and "Cj" stay two people but nobody is listed twice), whole positive
 * amounts, a total that matches the file's own expected total, and NO invented date.
 */
export function parseOpeningDebtsSeed(json: unknown): OpeningDebtsSeed {
  if (typeof json !== "object" || json === null) throw new SeedError("The opening debts file is not an object");
  const root = json as { batch?: Record<string, unknown>; debts?: unknown };
  const batch = root.batch;
  if (!batch || typeof batch !== "object") throw new SeedError("The opening debts file has no batch section");
  if (batch.kind !== "opening_debts") throw new SeedError("This is not an opening debts file");
  if (batch.date_known !== false || batch.reported_on !== null) {
    throw new SeedError("Opening debts must not carry an invented date");
  }
  if (typeof batch.source !== "string" || batch.source.trim().length < 3) throw new SeedError("The file must say where the debts came from");
  if (typeof batch.expected_total_cents !== "number" || !Number.isSafeInteger(batch.expected_total_cents)) throw new SeedError("The expected total is missing");
  if (!Array.isArray(root.debts) || root.debts.length === 0) throw new SeedError("There are no debts in the file");

  const debts: OpeningDebt[] = root.debts.map((d, i) => {
    const row = d as Record<string, unknown>;
    const keys = Object.keys(row).sort().join(",");
    if (keys !== "amount_cents,display_name,seed_key") throw new SeedError(`Debt ${i + 1} has unexpected fields (${keys})`);
    if (typeof row.seed_key !== "string" || row.seed_key.trim() === "") throw new SeedError(`Debt ${i + 1} needs a key`);
    if (typeof row.display_name !== "string" || row.display_name.trim() === "") throw new SeedError(`Debt ${i + 1} needs a name`);
    if (typeof row.amount_cents !== "number" || !Number.isSafeInteger(row.amount_cents) || row.amount_cents <= 0) {
      throw new SeedError(`${row.display_name}: the amount must be a whole number of centavos above zero`);
    }
    return { seed_key: row.seed_key, display_name: row.display_name, amount_cents: row.amount_cents };
  });

  const keys = debts.map((d) => d.seed_key);
  if (new Set(keys).size !== keys.length) throw new SeedError("Two debts share a key");
  const names = debts.map((d) => d.display_name.toLowerCase().replace(/\s+/g, " ").trim());
  if (new Set(names).size !== names.length) throw new SeedError("Two debts share a name");

  const total = sumCentavos(debts.map((d) => d.amount_cents));
  if (total !== batch.expected_total_cents) {
    throw new SeedError(`The debts add up to ${total} centavos but the file expects ${batch.expected_total_cents}`);
  }
  return { source: batch.source.trim(), expectedTotalCents: batch.expected_total_cents, dateKnown: false, debts };
}
