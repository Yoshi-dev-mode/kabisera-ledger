import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePesos, sumCentavos } from "@/lib/money";

type Seed = {
  batch: {
    kind: string;
    reported_on: string | null;
    date_known: boolean;
    expected_total_cents: number;
  };
  debts: { seed_key: string; display_name: string; amount_cents: number }[];
};

const seed: Seed = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../supabase/seed/opening-debts.json", import.meta.url)), "utf8"),
);

// The amounts exactly as the owner reported them.
const REPORTED: [string, string][] = [
  ["Jhanrey", "305.00"],
  ["Ralfh", "2,024.00"],
  ["Thy", "210.00"],
  ["Ken", "2,045.00"],
  ["Denver", "205.00"],
  ["Cee jay", "1,000.00"],
  ["Von", "2,390.00"],
  ["Gab", "2,000.00"],
  ["Cj", "885.00"],
  ["Alexis", "65.00"],
  ["Isid", "220.00"],
];

describe("opening customer debts", () => {
  it("lists the eleven reported customers with their exact amounts", () => {
    expect(seed.debts).toHaveLength(11);
    for (const [name, pesos] of REPORTED) {
      const row = seed.debts.find((d) => d.display_name === name);
      expect(row?.amount_cents).toBe(parsePesos(pesos));
    }
  });

  it("totals exactly ₱11,349.00", () => {
    const total = sumCentavos(seed.debts.map((d) => d.amount_cents));
    expect(total).toBe(1134900);
    expect(total).toBe(seed.batch.expected_total_cents);
    expect(total).toBe(parsePesos("11,349.00"));
  });

  it("keeps Cee jay and Cj as two different customers", () => {
    const ceeJay = seed.debts.find((d) => d.display_name === "Cee jay");
    const cj = seed.debts.find((d) => d.display_name === "Cj");
    expect(ceeJay?.seed_key).toBe("opening-debt:cee-jay");
    expect(cj?.seed_key).toBe("opening-debt:cj");
    expect(ceeJay?.amount_cents).toBe(100000);
    expect(cj?.amount_cents).toBe(88500);
  });

  it("uses unique keys and names so a re-run cannot duplicate a debt", () => {
    const keys = seed.debts.map((d) => d.seed_key);
    const names = seed.debts.map((d) => d.display_name.toLowerCase().replace(/\s+/g, " ").trim());
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("does not invent a date for the opening debts", () => {
    expect(seed.batch.kind).toBe("opening_debts");
    expect(seed.batch.reported_on).toBeNull();
    expect(seed.batch.date_known).toBe(false);
    for (const d of seed.debts) {
      expect(Object.keys(d).sort()).toEqual(["amount_cents", "display_name", "seed_key"]);
    }
  });
});
