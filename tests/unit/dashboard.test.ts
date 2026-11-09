import { describe, expect, it } from "vitest";
import { buildAlerts, compactPesos, lastNDates, shortDayLabel, toChartPoints } from "@/lib/dashboard";
import {
  parseAccountLedger, parseAccountOverview, parseDailySeries, parseDailySummary, parseDashboardFacts,
} from "@/lib/data/dashboard";

const none = { lowAccounts: [], overdue: { count: 0, cents: 0 }, unreconciledDates: [], discrepancies: [] };

describe("buildAlerts", () => {
  it("never invents alerts: nothing to report means no alerts", () => {
    expect(buildAlerts(none)).toEqual([]);
    expect(buildAlerts({ lowAccounts: null, overdue: null, unreconciledDates: null, discrepancies: null })).toEqual([]);
  });

  it("warns about a low balance, and is critical when it is empty or negative", () => {
    const a = buildAlerts({ ...none, lowAccounts: [
      { code: "CASH_DRAWER", name: "Cash drawer", balanceCents: 150000, thresholdCents: 500000 },
      { code: "GCASH_WALLET", name: "GCash wallet", balanceCents: -2000, thresholdCents: 100000 },
    ] });
    expect(a).toHaveLength(2);
    expect([a[0]?.severity, a[0]?.title, a[0]?.href]).toEqual(["warning", "Cash drawer is low", "/accounts"]);
    expect(a[0]?.detail).toBe("₱1,500.00 left. Your warning level is ₱5,000.00.");
    expect(a[1]?.severity).toBe("critical");
    expect(a[1]?.detail).toContain("\u2212₱20.00");
  });

  it("reports overdue debts with the right wording", () => {
    expect(buildAlerts({ ...none, overdue: { count: 1, cents: 5000 } })[0]?.title).toBe("1 debt is overdue");
    const many = buildAlerts({ ...none, overdue: { count: 3, cents: 123400 } })[0];
    expect(many?.title).toBe("3 debts are overdue");
    expect(many?.detail).toBe("₱1,234.00 is past its due date.");
    expect(many?.href).toBe("/debts?overdue=1");
  });

  it("reports days that were not closed, naming the most recent", () => {
    const one = buildAlerts({ ...none, unreconciledDates: ["2026-10-22"] })[0];
    expect(one?.title).toBe("1 earlier day is not closed");
    const five = buildAlerts({ ...none, unreconciledDates: ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"] })[0];
    expect(five?.title).toBe("5 earlier days are not closed");
    expect(five?.detail).toContain("2026-10-20, 2026-10-21, 2026-10-22 and earlier");
  });

  it("reports closing discrepancies, saying below or above", () => {
    const a = buildAlerts({ ...none, discrepancies: [
      { businessDate: "2026-10-23", account: "Cash drawer", varianceCents: -5000 },
      { businessDate: "2026-10-22", account: "GCash wallet", varianceCents: 100 },
    ] });
    expect(a[0]?.title).toBe("Cash drawer was ₱50.00 below what was expected");
    expect(a[1]?.title).toBe("GCash wallet was ₱1.00 above what was expected");
    expect(a[0]?.href).toBe("/closing?date=2026-10-23");
  });
});

describe("chart helpers", () => {
  it("labels days and amounts compactly", () => {
    expect(shortDayLabel("2026-10-24")).toBe("Oct 24");
    expect(shortDayLabel("2026-01-05")).toBe("Jan 5");
    expect(shortDayLabel("junk")).toBe("junk");
    expect([500, 250000, 1500000, 120000000, -250000, 0].map(compactPesos)).toEqual(["₱5", "₱2.5k", "₱15k", "₱1.2M", "\u2212₱2.5k", "₱0"]);
  });
  it("lists the last N days, oldest first, across month and year ends", () => {
    expect(lastNDates("2026-10-24", 3)).toEqual(["2026-10-22", "2026-10-23", "2026-10-24"]);
    expect(lastNDates("2027-01-02", 4)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(lastNDates("2028-03-01", 2)).toEqual(["2028-02-29", "2028-03-01"]);
  });
  it("turns the series into chart points", () => {
    const pts = toChartPoints([{ businessDate: "2026-10-24", feesCents: 2000, loadMarginCents: 300, tipIncomeCents: 100, costsCents: 500, netProfitCents: 1900, transactionCount: 4 }]);
    expect(pts).toEqual([{ date: "2026-10-24", label: "Oct 24", profitCents: 1900, feesCents: 2300, tipIncomeCents: 100, costsCents: 500 }]);
  });
});

describe("dashboard parsers", () => {
  it("reads facts, keeping 'not allowed to see' (null) apart from 'nothing' (empty)", () => {
    const f = parseDashboardFacts({ low_accounts: null, overdue: { count: 2, cents: 900 }, unreconciled_dates: ["2026-10-22"], discrepancies: [] });
    expect(f.lowAccounts).toBeNull();
    expect(f.overdue).toEqual({ count: 2, cents: 900 });
    expect(f.unreconciledDates).toEqual(["2026-10-22"]);
    expect(f.discrepancies).toEqual([]);
    expect(() => parseDashboardFacts({ unreconciled_dates: [5] })).toThrow("list of dates");
  });
  it("reads balances, the daily summary, the series and the ledger", () => {
    const a = parseAccountOverview([{ code: "CASH_DRAWER", name: "Cash drawer", balance_cents: 1000, low_threshold_cents: null, is_low: false, last_reconciled_on: null, last_variance_cents: null }]);
    expect(a[0]?.lastReconciledOn).toBeNull();
    const s = parseDailySummary([{ transaction_count: 4, voided_count: 1, cash_in_volume_cents: 1, cash_out_volume_cents: 2, load_sales_cents: 3, fees_cents: 4, load_margin_cents: 5, provider_cost_cents: 6, expenses_cents: 7, write_offs_cents: 8, variance_cents: 9, net_profit_cents: -2 }]);
    expect(s.netProfitCents).toBe(-2);
    expect(s.tipIncomeCents).toBe(0);
    expect(parseDailySeries([{ business_date: "2026-10-24", fees_cents: 1, load_margin_cents: 2, costs_cents: 3, net_profit_cents: 0, transaction_count: 1 }])[0]?.businessDate).toBe("2026-10-24");
    const l = parseAccountLedger([{ line_id: 1, entry_date: "2026-10-24", created_at: "2026-10-24T01:00:00Z", transaction_id: "t", public_ref: "KL-1", tx_type: "cash_in", customer_name: null, entry_kind: "posting", change_cents: 5, balance_after_cents: 5, memo: null, total_count: 12 }]);
    expect(l.total).toBe(12);
    expect(() => parseAccountLedger([{ tx_type: "gift" }])).toThrow();
  });
});
