import type { DayPoint } from "@/lib/data/dashboard";
import { shortDayLabel } from "@/lib/dashboard";
import { formatPesos } from "@/lib/money";

export type Variance = { kind: "balanced" | "above" | "below"; text: string };

/**
 * variance = counted - expected.
 *   zero     -> balanced
 *   positive -> the counted amount is MORE than expected
 *   negative -> the counted amount is LESS than expected
 */
export function describeVariance(counted: number, expected: number): Variance {
  const v = counted - expected;
  if (v === 0) return { kind: "balanced", text: "Balanced: what you counted matches what was expected." };
  if (v > 0) return { kind: "above", text: `${formatPesos(v)} more than expected.` };
  return { kind: "below", text: `${formatPesos(-v)} less than expected.` };
}

export type Grain = "day" | "week" | "month";

/** The Monday of the week containing a date (weeks run Monday to Sunday). */
export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // Monday = 0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

export type GroupedPoint = { key: string; label: string; feesCents: number; loadMarginCents: number; costsCents: number; netProfitCents: number; transactionCount: number };

/** Adds up the daily figures by day, week (starting Monday) or month. Input need not be sorted; output is oldest first. */
export function groupSeries(series: readonly DayPoint[], grain: Grain): GroupedPoint[] {
  const groups = new Map<string, GroupedPoint>();
  for (const d of series) {
    const key = grain === "day" ? d.businessDate : grain === "week" ? weekStart(d.businessDate) : d.businessDate.slice(0, 7);
    const label = grain === "day" ? shortDayLabel(d.businessDate) : grain === "week" ? `Week of ${shortDayLabel(key)}` : monthLabel(key);
    const g = groups.get(key) ?? { key, label, feesCents: 0, loadMarginCents: 0, costsCents: 0, netProfitCents: 0, transactionCount: 0 };
    g.feesCents += d.feesCents;
    g.loadMarginCents += d.loadMarginCents;
    g.costsCents += d.costsCents;
    g.netProfitCents += d.netProfitCents;
    g.transactionCount += d.transactionCount;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? key} ${y}`;
}

import type { ChartPoint } from "@/lib/dashboard";
import { isBusinessDateString } from "@/lib/time";

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const f = from.split("-").map(Number) as [number, number, number];
  const t = to.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(t[0], t[1] - 1, t[2]) - Date.UTC(f[0], f[1] - 1, f[2])) / 86_400_000);
}

export const MAX_REPORT_DAYS = 365;

export type ReportRange = { from: string; to: string; grain: Grain; clamped: boolean };

/**
 * Reads a report's date range from the address. Defaults to the last 30 days. Dates after today are pulled back to
 * today, a reversed range is swapped, and a range longer than a year is shortened (and flagged) rather than rejected.
 */
export function parseReportRange(params: Record<string, string | string[] | undefined>, today: string): ReportRange {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  let to = isBusinessDateString(one(params.to)) ? one(params.to) : today;
  let from = isBusinessDateString(one(params.from)) ? one(params.from) : addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  if (to > today) to = today;
  if (from > to) from = to;
  let clamped = false;
  if (daysBetween(from, to) > MAX_REPORT_DAYS) {
    from = addDays(to, -MAX_REPORT_DAYS);
    clamped = true;
  }
  const span = daysBetween(from, to) + 1;
  const asked = one(params.grain);
  const grain: Grain = asked === "day" || asked === "week" || asked === "month" ? asked : span <= 45 ? "day" : span <= 180 ? "week" : "month";
  return { from, to, grain, clamped };
}

export function groupedToChart(points: readonly GroupedPoint[]): ChartPoint[] {
  return points.map((p) => ({ date: p.key, label: p.label, profitCents: p.netProfitCents, feesCents: p.feesCents + p.loadMarginCents, costsCents: p.costsCents }));
}
