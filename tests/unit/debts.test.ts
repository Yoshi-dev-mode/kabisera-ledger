import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAging, parseDebtList, parseDebtSummary, parseImportResult, parsePostResult } from "@/lib/data/debts";
import { formDate, formMethod, formMoney, formText } from "@/lib/forms";
import { parseOpeningDebtsSeed, SeedError } from "@/lib/opening-debts";
import { isBusinessDateString } from "@/lib/time";

const seedJson: unknown = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../supabase/seed/opening-debts.json", import.meta.url)), "utf8"),
);

describe("parseOpeningDebtsSeed (the real file)", () => {
  it("accepts the owner's eleven debts totalling 11,349.00 with no date", () => {
    const seed = parseOpeningDebtsSeed(seedJson);
    expect(seed.debts).toHaveLength(11);
    expect(seed.expectedTotalCents).toBe(1134900);
    expect(seed.dateKnown).toBe(false);
    expect(seed.debts.map((d) => d.display_name)).toContain("Cee jay");
    expect(seed.debts.map((d) => d.display_name)).toContain("Cj");
  });
});

describe("parseOpeningDebtsSeed (tampered files are refused)", () => {
  const base = () => JSON.parse(JSON.stringify(seedJson)) as { batch: Record<string, unknown>; debts: Record<string, unknown>[] };

  it("refuses a wrong total", () => {
    const s = base();
    s.debts[0]!.amount_cents = 1;
    expect(() => parseOpeningDebtsSeed(s)).toThrow("add up to");
  });
  it("refuses an invented date", () => {
    const a = base(); a.batch.reported_on = "2026-01-01";
    expect(() => parseOpeningDebtsSeed(a)).toThrow("invented date");
    const b = base(); b.batch.date_known = true;
    expect(() => parseOpeningDebtsSeed(b)).toThrow("invented date");
  });
  it("refuses extra fields, so no fee, reference or staff member can sneak in", () => {
    const s = base(); s.debts[0]!.gcash_reference = "123";
    expect(() => parseOpeningDebtsSeed(s)).toThrow("unexpected fields");
  });
  it("refuses duplicate keys and duplicate names but keeps Cee jay and Cj apart", () => {
    const k = base(); k.debts[1]!.seed_key = k.debts[0]!.seed_key;
    expect(() => parseOpeningDebtsSeed(k)).toThrow("share a key");
    const n = base(); n.debts[1]!.display_name = "  JHANREY ";
    expect(() => parseOpeningDebtsSeed(n)).toThrow("share a name");
    expect(() => parseOpeningDebtsSeed(base())).not.toThrow();
  });
  it("refuses bad amounts and an empty file", () => {
    const f = base(); f.debts[0]!.amount_cents = 10.5;
    expect(() => parseOpeningDebtsSeed(f)).toThrow(SeedError);
    const z = base(); z.debts[0]!.amount_cents = 0;
    expect(() => parseOpeningDebtsSeed(z)).toThrow("above zero");
    const e = base(); e.debts = [];
    expect(() => parseOpeningDebtsSeed(e)).toThrow("no debts");
    expect(() => parseOpeningDebtsSeed(null)).toThrow(SeedError);
  });
});

describe("debt parsers", () => {
  const row = {
    debt_id: "d1", customer_id: "c1", customer_name: "Ken", origin: "transaction", original_cents: 52000, repaid_cents: 30000,
    adjusted_cents: 0, outstanding_cents: 22000, debt_status: "partially_paid", is_overdue: true, due_date: "2026-10-20",
    debt_at: "2026-10-12T03:00:00Z", date_known: true, reference: "KL-20261012-0001", notes: null, total_count: 9,
  };
  it("reads debts with their status and the total", () => {
    const { rows, total } = parseDebtList([row, { ...row, debt_id: "d2", origin: "opening", date_known: false, debt_status: "paid", outstanding_cents: 0 }]);
    expect(total).toBe(9);
    expect(rows[0]?.status).toBe("partially_paid");
    expect(rows[0]?.isOverdue).toBe(true);
    expect(rows[1]?.dateKnown).toBe(false);
    expect(() => parseDebtList([{ ...row, debt_status: "lost" }])).toThrow("unknown debt status");
    expect(() => parseDebtList([{ ...row, origin: "gift" }])).toThrow("unknown debt origin");
  });
  it("reads the summary, aging and results", () => {
    expect(parseDebtSummary([{ total_outstanding_cents: 1134900, customers_owing: 11, open_debts: 11, overdue_cents: 0, overdue_count: 0, unknown_date_cents: 1134900 }]).customersOwing).toBe(11);
    expect(parseAging([{ bucket: "Date unknown", sort_order: 6, debts: 11, outstanding_cents: 1134900 }])[0]?.bucket).toBe("Date unknown");
    expect(parseImportResult([{ batch_id: "b", tx_id: null, customers_created: 0, debts_created: 0, total_cents: 5, was_duplicate: true }]).wasDuplicate).toBe(true);
    expect(parsePostResult([{ tx_id: "t", tx_ref: "KL-1", was_duplicate: false }]).txRef).toBe("KL-1");
    expect(() => parsePostResult([])).toThrow();
  });
});

describe("form helpers", () => {
  const form = (entries: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.set(k, v);
    return f;
  };
  it("reads pesos exactly", () => {
    expect(formMoney(form({ a: "1,250.50" }), "a", "the amount")).toEqual({ ok: true, cents: 125050 });
    expect(formMoney(form({ a: "" }), "a", "the amount")).toEqual({ ok: false, message: "Enter the amount." });
    expect(formMoney(form({ a: "0" }), "a", "the amount")).toEqual({ ok: false, message: "The amount must be more than zero." });
    expect(formMoney(form({ a: "0" }), "a", "the fee", { allowZero: true })).toEqual({ ok: true, cents: 0 });
    expect(formMoney(form({ a: "-5" }), "a", "the amount").ok).toBe(false);
    expect(formMoney(form({ a: "-5" }), "a", "the adjustment", { allowNegative: true })).toEqual({ ok: true, cents: -500 });
    const bad = formMoney(form({ a: "12.345" }), "a", "the amount");
    expect(bad.ok === false && bad.message).toContain("two decimal");
  });
  it("reads methods, dates and text", () => {
    expect(formMethod(form({ m: "gcash" }), "m")).toBe("gcash");
    expect(formMethod(form({ m: "credit" }), "m")).toBeNull();
    expect(formDate(form({ d: "2026-10-31" }), "d", isBusinessDateString)).toBe("2026-10-31");
    expect(formDate(form({ d: "2026-02-31" }), "d", isBusinessDateString)).toBeNull();
    expect(formText(form({ t: "  hi  " }), "t")).toBe("hi");
    expect(formText(new FormData(), "missing")).toBe("");
  });
});
