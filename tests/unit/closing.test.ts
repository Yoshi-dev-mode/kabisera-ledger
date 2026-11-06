import { describe, expect, it } from "vitest";
import { describeVariance, groupSeries, weekStart } from "@/lib/closing";
import {
  parseClosingDetail, parseClosingList, parseDiscrepancies, parseFloatReport, parsePeriodReport, parseStaffReport,
} from "@/lib/data/closing";
import { discrepanciesCsv, floatCsv, periodCsv, seriesCsv, staffCsv } from "@/lib/exports";
import type { DayPoint } from "@/lib/data/dashboard";

describe("describeVariance (variance = counted - expected)", () => {
  it("says balanced, more, or less in plain words", () => {
    expect(describeVariance(100000, 100000)).toEqual({ kind: "balanced", text: "Balanced: what you counted matches what was expected." });
    expect(describeVariance(100500, 100000)).toEqual({ kind: "above", text: "₱5.00 more than expected." });
    expect(describeVariance(99000, 100000)).toEqual({ kind: "below", text: "₱10.00 less than expected." });
    expect(describeVariance(0, 5).kind).toBe("below");
  });
});

describe("grouping the series", () => {
  const day = (businessDate: string, net: number, n = 1): DayPoint => ({ businessDate, feesCents: net, loadMarginCents: 0, costsCents: 0, netProfitCents: net, transactionCount: n });
  it("finds the Monday of a week, across month and year ends", () => {
    expect(weekStart("2026-10-26")).toBe("2026-10-26"); // a Monday
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // Sunday belongs to the week before
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
    expect(weekStart("2028-03-01")).toBe("2028-02-28");
  });
  it("adds days into weeks and months without losing or doubling anything", () => {
    const series = [day("2026-10-31", 100), day("2026-11-01", 200), day("2026-11-02", 300, 2), day("2026-10-26", 50)];
    const total = series.reduce((s, d) => s + d.netProfitCents, 0);
    const weeks = groupSeries(series, "week");
    expect(weeks.map((w) => [w.key, w.netProfitCents, w.transactionCount])).toEqual([["2026-10-26", 350, 3], ["2026-11-02", 300, 2]].map((x) => x));
    expect(weeks.reduce((s, w) => s + w.netProfitCents, 0)).toBe(total);
    const months = groupSeries(series, "month");
    expect(months.map((m) => [m.key, m.label, m.netProfitCents])).toEqual([["2026-10", "October 2026", 150], ["2026-11", "November 2026", 500]]);
    expect(groupSeries(series, "day")).toHaveLength(4);
    expect(groupSeries([], "week")).toEqual([]);
  });
});

describe("closing and report parsers", () => {
  it("reads a closing detail", () => {
    const d = parseClosingDetail({
      business_date: "2026-10-24", status: "draft", closing_id: "c1", revision: 1, note: null, amendment_reason: null,
      finalized_at: null, finalized_by_name: null, transaction_count: 4,
      accounts: [{ code: "CASH_DRAWER", name: "Cash drawer", opening_cents: 1, inflow_cents: 2, outflow_cents: -3, expected_cents: 0, actual_cents: null, variance_cents: null, reason: null }],
    });
    expect(d.status).toBe("draft");
    expect(d.accounts[0]?.actualCents).toBeNull();
    expect(() => parseClosingDetail({ business_date: "x", status: "weird" })).toThrow("unknown closing status");
  });
  it("reads lists and reports", () => {
    expect(parseClosingList([{ business_date: "2026-10-24", revision: 2, finalized_by_name: "Owner", finalized_at: "t", total_variance_cents: 500, note: null, total_count: 9 }]).total).toBe(9);
    expect(parseStaffReport([{ staff_name: "Maria", transaction_count: 3, volume_cents: 1, fees_cents: 2 }])[0]?.staffName).toBe("Maria");
    expect(parseFloatReport([{ code: "CASH_DRAWER", name: "Cash drawer", opening_cents: 1, inflow_cents: 2, outflow_cents: -1, closing_cents: 2 }])[0]?.closingCents).toBe(2);
    expect(parseDiscrepancies([{ business_date: "d", revision: 1, account_name: "a", expected_cents: 1, actual_cents: 2, variance_cents: 1, reason: "r" }])[0]?.reason).toBe("r");
    const p = parsePeriodReport([{ transaction_count: 1, voided_count: 0, cash_in_count: 1, cash_in_volume_cents: 5, cash_out_count: 0, cash_out_volume_cents: 0, load_count: 0, load_sales_cents: 0, repayments_cents: 0, new_debt_cents: 0, fees_cents: 1, load_margin_cents: 0, provider_cost_cents: 0, expenses_cents: 0, write_offs_cents: 0, variance_cents: 0, net_profit_cents: 1 }]);
    expect(p.netProfitCents).toBe(1);
  });
});

describe("report CSV exports", () => {
  const at = new Date("2026-10-25T02:00:00Z");
  const period = parsePeriodReport([{ transaction_count: 4, voided_count: 1, cash_in_count: 1, cash_in_volume_cents: 100000, cash_out_count: 1, cash_out_volume_cents: 50000, load_count: 1, load_sales_cents: 10000, repayments_cents: 30000, new_debt_cents: 52000, fees_cents: 3000, load_margin_cents: 300, provider_cost_cents: 0, expenses_cents: 5000, write_offs_cents: 0, variance_cents: -200, net_profit_cents: -1700 }]);

  it("keeps volume, earnings, costs and profit in separate labelled groups", () => {
    const csv = periodCsv(period, "2026-10-01", "2026-10-31", at);
    for (const heading of ["TRANSACTION VOLUME (not income)", "EARNED", "COSTS", "NET PROFIT"]) expect(csv).toContain(heading);
    expect(csv).toContain("Cash-in volume (1),1000.00");
    expect(csv).toContain("Operating expenses,-50.00");
    expect(csv).toContain("NET PROFIT,-17.00");
    expect(csv).toContain("Repayments received,300.00,not income");
    expect(csv).toContain("reported separately, not in profit");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Generated 2026-10-25 10:00 Philippine time");
  });
  it("exports the other reports with plain decimals and spreadsheet-safe text", () => {
    expect(floatCsv([{ code: "CASH_DRAWER", name: "Cash drawer", openingCents: 100, inflowCents: 250, outflowCents: -50, closingCents: 300 }], "2026-10-01", "2026-10-31", at)).toContain("Cash drawer,1.00,2.50,-0.50,3.00");
    expect(staffCsv([{ staffName: "=Evil", transactionCount: 2, volumeCents: 500, feesCents: 10 }], at)).toContain("'=Evil,2,5.00,0.10");
    expect(discrepanciesCsv([{ businessDate: "2026-10-23", revision: 1, accountName: "Cash drawer", expectedCents: 1000, actualCents: 900, varianceCents: -100, reason: "short change" }], at)).toContain("-1.00,short change");
    expect(seriesCsv([{ key: "2026-10", label: "October 2026", feesCents: 100, loadMarginCents: 0, costsCents: 50, netProfitCents: 50, transactionCount: 3 }], at)).toContain("October 2026,3,1.00,0.00,-0.50,0.50");
  });
});

import { addDays, daysBetween, groupedToChart, parseReportRange } from "@/lib/closing";

describe("report date range", () => {
  const today = "2026-10-24";
  it("defaults to the last 30 days, ending today", () => {
    expect(parseReportRange({}, today)).toEqual({ from: "2026-09-25", to: "2026-10-24", grain: "day", clamped: false });
  });
  it("reads a valid range and picks a sensible grouping", () => {
    expect(parseReportRange({ from: "2026-09-01", to: "2026-10-24" }, today).grain).toBe("week");
    expect(parseReportRange({ from: "2026-01-01", to: "2026-10-24" }, today).grain).toBe("month");
    expect(parseReportRange({ from: "2026-10-01", to: "2026-10-10", grain: "month" }, today).grain).toBe("month");
    expect(parseReportRange({ grain: "hourly" }, today).grain).toBe("day");
  });
  it("swaps a reversed range, pulls the future back to today and ignores junk", () => {
    const r = parseReportRange({ from: "2026-10-20", to: "2026-10-01" }, today);
    expect([r.from, r.to]).toEqual(["2026-10-01", "2026-10-20"]);
    expect(parseReportRange({ to: "2027-05-05" }, today).to).toBe(today);
    const future = parseReportRange({ from: "2027-05-05", to: "2027-06-01" }, today);
    expect([future.from, future.to]).toEqual([today, today]);
    expect(parseReportRange({ from: "nonsense", to: "2026-02-31" }, today).to).toBe(today);
  });
  it("shortens a range longer than a year and says so", () => {
    const r = parseReportRange({ from: "2020-01-01", to: "2026-10-24" }, today);
    expect(r.clamped).toBe(true);
    expect(daysBetween(r.from, r.to)).toBe(365);
  });
  it("does date arithmetic across month, leap-day and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-01", "2026-10-24")).toBe(23);
  });
  it("turns grouped points into chart points", () => {
    expect(groupedToChart([{ key: "2026-10", label: "October 2026", feesCents: 100, loadMarginCents: 20, costsCents: 50, netProfitCents: 70, transactionCount: 3 }]))
      .toEqual([{ date: "2026-10", label: "October 2026", profitCents: 70, feesCents: 120, costsCents: 50 }]);
  });
});
