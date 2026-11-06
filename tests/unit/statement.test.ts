import { describe, expect, it } from "vitest";
import type { DebtEvent } from "@/lib/data/transactions";
import { buildStatement } from "@/lib/statement";
import { statementCsv, transactionsCsv } from "@/lib/exports";
import { parseTransactionList } from "@/lib/data/transactions";

const ev = (over: Partial<DebtEvent>): DebtEvent => ({
  kind: "debt", at: "2026-10-10T02:00:00Z", dateKnown: true, amountCents: 0, reference: null, method: null,
  gcashReference: null, recordedByName: null, note: null, isVoided: false, debtId: "d1", transactionId: "t1", ...over,
});

// Opening debt imported on 10 Oct (date unknown), credit sale 12 Oct, repayment 15 Oct, adjustment 20 Oct.
const events: DebtEvent[] = [
  ev({ kind: "debt", at: "2026-10-10T02:00:00Z", dateKnown: false, amountCents: 100000, reference: "Opening balance" }),
  ev({ kind: "debt", at: "2026-10-12T03:00:00Z", amountCents: 52000, reference: "KL-20261012-0001", debtId: "d2" }),
  ev({ kind: "repayment", at: "2026-10-15T04:00:00Z", amountCents: -30000, reference: "KL-20261015-0003", method: "cash" }),
  ev({ kind: "adjustment", at: "2026-10-20T05:00:00Z", amountCents: -2000, reference: "KL-20261020-0001", note: "agreed discount" }),
  ev({ kind: "debt", at: "2026-10-16T05:00:00Z", amountCents: 9999, reference: "KL-20261016-0001", isVoided: true, debtId: "d3" }),
];

describe("buildStatement", () => {
  it("computes opening, movements and closing for a period inside the records", () => {
    const s = buildStatement(events, "2026-10-12", "2026-10-31");
    expect(s.openingCents).toBe(100000);
    expect(s.debtsIncurredCents).toBe(52000);
    expect(s.repaymentsCents).toBe(30000);
    expect(s.adjustmentsCents).toBe(-2000);
    expect(s.closingCents).toBe(120000);
    expect(s.openingCents! + s.debtsIncurredCents - s.repaymentsCents + s.adjustmentsCents).toBe(s.closingCents);
    expect(s.lines).toHaveLength(3);
  });

  it("does not invent an opening balance before the records start", () => {
    const s = buildStatement(events, "2026-09-01", "2026-10-31");
    expect(s.openingCents).toBeNull();
    expect(s.openingNote).toContain("2026-10-10");
    expect(s.closingCents).toBe(120000); // what is recorded up to the end date
  });

  it("has no closing balance for a period that ends before any record", () => {
    const s = buildStatement(events, "2026-08-01", "2026-09-30");
    expect(s.closingCents).toBeNull();
    expect(s.closingNote).toContain("2026-10-10");
  });

  it("lists voided events but never counts them", () => {
    const s = buildStatement(events, "2026-10-01", "2026-10-31");
    expect(s.voidedLines).toHaveLength(1);
    expect(s.lines.some((l) => l.isVoided)).toBe(false);
    expect(s.debtsIncurredCents).toBe(152000);
    expect(s.closingCents).toBe(120000);
  });

  it("keeps the unknown-date flag on opening debts", () => {
    const s = buildStatement(events, "2026-10-01", "2026-10-31");
    const opening = s.lines.find((l) => l.reference === "Opening balance");
    expect(opening?.dateKnown).toBe(false);
  });

  it("treats a customer with no records as zero, not unknown", () => {
    const s = buildStatement([], "2026-10-01", "2026-10-31");
    expect([s.openingCents, s.closingCents, s.recordsStart]).toEqual([0, 0, null]);
  });

  it("uses Philippine dates: 16:00 UTC is already the next day", () => {
    const late = [ev({ at: "2026-10-31T16:30:00Z", amountCents: 500 })]; // 1 Nov in Manila
    expect(buildStatement(late, "2026-10-01", "2026-10-31").debtsIncurredCents).toBe(0);
    expect(buildStatement(late, "2026-11-01", "2026-11-30").debtsIncurredCents).toBe(500);
  });
});

describe("exports", () => {
  const generated = new Date("2026-10-25T02:00:00Z");

  it("writes a statement CSV that is spreadsheet-safe and says when values are unknown", () => {
    const s = buildStatement(events, "2026-09-01", "2026-10-31");
    const csv = statementCsv("=Evil Name", s, generated);
    expect(csv.startsWith("\uFEFF'=Evil Name")).toBe(true);
    expect(csv).toContain("Opening balance");
    expect(csv).toContain("not known");
    expect(csv).toContain("original date unknown");
    expect(csv).toContain("1200.00");
    expect(csv).toContain("Generated 2026-10-25 10:00 Philippine time");
    expect(/09\d{9}/.test(csv)).toBe(false); // no mobile numbers are ever exported
  });

  it("writes a transactions CSV with decimal pesos and no contact numbers", () => {
    const { rows } = parseTransactionList([{
      id: "t1", public_ref: "KL-20261024-0001", occurred_at: "2026-10-24T01:30:00+00:00", business_date: "2026-10-24",
      type: "cash_in", customer_id: "c1", customer_name: "Ken", principal_cents: 100000, fee_cents: 2000,
      customer_price_cents: null, credit_cents: 0, payment_method: "cash", gcash_reference: "=1234", status: "posted",
      recorded_by_name: "Maria", notes: "a, b", shop_cash_cents: 102000, shop_gcash_cents: -100000, void_requested: false, total_count: 1,
    }]);
    const csv = transactionsCsv(rows, generated);
    expect(csv).toContain("2026-10-24 09:30");
    expect(csv).toContain("Cash-in");
    expect(csv).toContain("1000.00,20.00");
    expect(csv).toContain("1020.00,-1000.00");
    expect(csv).toContain("'=1234");
    expect(csv).toContain('"a, b"');
    expect(csv).toContain("Generated");
  });
});

import { withRunningBalance } from "@/lib/statement";

describe("withRunningBalance", () => {
  it("tracks what is owed after each event and skips voided ones", () => {
    const out = withRunningBalance(events);
    expect(out.map((e) => e.balanceAfterCents)).toEqual([100000, 152000, 122000, null, 120000]);
    expect(out.map((e) => e.kind)).toEqual(["debt", "debt", "repayment", "debt", "adjustment"]);
    expect(out[3]?.isVoided).toBe(true);
  });

  it("is empty for no events", () => {
    expect(withRunningBalance([])).toEqual([]);
  });
});
