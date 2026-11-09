import type { DashboardFacts, DayPoint } from "@/lib/data/dashboard";
import { formatPesos } from "@/lib/money";

export type Alert = {
  id: string;
  severity: "critical" | "warning";
  title: string;
  detail: string;
  href: string;
};

/**
 * Alerts come ONLY from real facts in the ledger. With nothing to report the list is empty:
 * nothing is invented to fill the screen.
 */
export function buildAlerts(facts: DashboardFacts): Alert[] {
  const alerts: Alert[] = [];

  for (const a of facts.lowAccounts ?? []) {
    alerts.push({
      id: `low-${a.code}`,
      severity: a.balanceCents <= 0 ? "critical" : "warning",
      title: `${a.name} is low`,
      detail: `${formatPesos(a.balanceCents)} left. Your warning level is ${formatPesos(a.thresholdCents)}.`,
      href: "/accounts",
    });
  }

  if (facts.overdue && facts.overdue.count > 0) {
    alerts.push({
      id: "overdue-debts",
      severity: "warning",
      title: facts.overdue.count === 1 ? "1 debt is overdue" : `${facts.overdue.count} debts are overdue`,
      detail: `${formatPesos(facts.overdue.cents)} is past its due date.`,
      href: "/debts?overdue=1",
    });
  }

  const unreconciled = facts.unreconciledDates ?? [];
  if (unreconciled.length > 0) {
    const shown = unreconciled.slice(-3).join(", ");
    alerts.push({
      id: "unreconciled",
      severity: "warning",
      title: unreconciled.length === 1 ? "1 earlier day is not closed" : `${unreconciled.length} earlier days are not closed`,
      detail: `Count the cash and GCash and close ${unreconciled.length === 1 ? "it" : "them"}: ${shown}${unreconciled.length > 3 ? " and earlier" : ""}.`,
      href: "/closing",
    });
  }

  for (const d of facts.discrepancies ?? []) {
    const below = d.varianceCents < 0;
    alerts.push({
      id: `variance-${d.businessDate}-${d.account}`,
      severity: "warning",
      title: `${d.account} was ${formatPesos(Math.abs(d.varianceCents))} ${below ? "below" : "above"} what was expected`,
      detail: `Counted when ${d.businessDate} was closed.`,
      href: `/closing?date=${d.businessDate}`,
    });
  }
  return alerts;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-24" -> "Oct 24". */
export function shortDayLabel(date: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const month = MONTHS[Number(m[1]) - 1];
  return month ? `${month} ${Number(m[2])}` : date;
}

/** A short label for chart axes: ₱5, ₱2.5k, ₱15k, ₱1.2M. Negative amounts keep their minus sign. */
export function compactPesos(cents: number): string {
  const sign = cents < 0 ? "\u2212" : "";
  const pesos = Math.abs(cents) / 100;
  const trim = (n: number) => String(Math.round(n * 10) / 10);
  if (pesos >= 1_000_000) return `${sign}₱${trim(pesos / 1_000_000)}M`;
  if (pesos >= 1_000) return `${sign}₱${trim(pesos / 1_000)}k`;
  return `${sign}₱${trim(pesos)}`;
}

export type ChartPoint = { date: string; label: string; profitCents: number; feesCents: number; tipIncomeCents: number; costsCents: number };

export function toChartPoints(series: readonly DayPoint[]): ChartPoint[] {
  return series.map((d) => ({
    date: d.businessDate,
    label: shortDayLabel(d.businessDate),
    profitCents: d.netProfitCents,
    feesCents: d.feesCents + d.loadMarginCents,
    tipIncomeCents: d.tipIncomeCents,
    costsCents: d.costsCents,
  }));
}

/** The dates from `count - 1` days before `today` up to `today`, oldest first. */
export function lastNDates(today: string, count: number): string[] {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}
