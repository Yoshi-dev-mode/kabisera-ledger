import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/ledger/money";
import { PageHeading } from "@/components/shell/page-heading";
import { ProfitChart } from "@/components/ledger/profit-chart";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requirePermission } from "@/lib/auth/session";
import { groupedToChart, groupSeries, parseReportRange } from "@/lib/closing";
import {
  fetchDailySeries, fetchDiscrepancyReport, fetchFloatReport, fetchPeriodReport, fetchStaffReport,
} from "@/lib/data/queries";
import { todayBusinessDate } from "@/lib/time";

export const metadata: Metadata = { title: "Reports" };

function Group({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <div>
      <h3 className="text-[12px] font-normal text-muted-foreground">{title}</h3>
      {note ? <p className="text-[12px] text-muted-foreground">{note}</p> : null}
      <dl className="mt-1 divide-y divide-rule">{children}</dl>
    </div>
  );
}
const Row = ({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) => (
  <div className={`flex items-baseline justify-between gap-4 py-2 text-[14px] ${strong ? "font-medium" : ""}`}><dt>{label}</dt><dd className="num">{children}</dd></div>
);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("reports.view");
  const range = parseReportRange(await searchParams, todayBusinessDate());
  const { from, to, grain } = range;
  const [period, series, floats, staff, discrepancies] = await Promise.all([
    fetchPeriodReport(from, to), fetchDailySeries(from, to), fetchFloatReport(from, to), fetchStaffReport(from, to), fetchDiscrepancyReport(from, to),
  ]);
  const grouped = groupSeries(series, grain);
  const q = `from=${from}&to=${to}&grain=${grain}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <PageHeading icon="chart">Reports</PageHeading>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5"><label htmlFor="from" className="text-[12px] text-muted-foreground">From</label><Input id="from" name="from" type="date" defaultValue={from} /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="to" className="text-[12px] text-muted-foreground">To</label><Input id="to" name="to" type="date" defaultValue={to} /></div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="grain" className="text-[12px] text-muted-foreground">Group by</label>
            <select id="grain" name="grain" defaultValue={grain} className="h-9 rounded-control border border-input bg-surface px-2 text-[14px]">
              <option value="day">Day</option><option value="week">Week</option><option value="month">Month</option>
            </select>
          </div>
          <Button type="submit" size="sm">Show</Button>
        </form>
        {range.clamped ? <p role="status" className="text-[13px] text-warning">Reports cover at most one year. Showing the most recent year of what you asked for.</p> : null}
      </header>

      <section aria-labelledby="summary-title" className="rounded-card bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="summary-title" className="text-[16px] leading-6 font-medium">Summary, {from} to {to}</h2>
          <a href={`/reports/export?report=summary&${q}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Export (CSV)</a>
        </div>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <Group title="Transactions">
            <Row label="Recorded">{period.transactionCount}</Row>
            <Row label="Voided">{period.voidedCount}</Row>
          </Group>
          <Group title="Transaction volume" note="Money that passed through. Not income.">
            <Row label={`Cash-in (${period.cashInCount})`}><Money cents={period.cashInVolumeCents} /></Row>
            <Row label={`Cash-out (${period.cashOutCount})`}><Money cents={period.cashOutVolumeCents} /></Row>
            <Row label={`Mobile load sold (${period.loadCount})`}><Money cents={period.loadSalesCents} /></Row>
            <Row label="Debt payments"><Money cents={period.repaymentsCents} /></Row>
            <Row label="New debt created"><Money cents={period.newDebtCents} /></Row>
          </Group>
          <Group title="Earned">
            <Row label="Service fees"><Money cents={period.feesCents} /></Row>
            <Row label="Mobile-load margin"><Money cents={period.loadMarginCents} /></Row>
            <Row label="Tip income"><Money cents={period.tipIncomeCents} /></Row>
          </Group>
          <Group title="Costs">
            <Row label="Provider costs"><Money cents={-period.providerCostCents} /></Row>
            <Row label="Operating expenses"><Money cents={-period.expensesCents} /></Row>
            <Row label="Debt write-offs and corrections"><Money cents={-period.writeOffsCents} /></Row>
          </Group>
        </div>
        <div className="mt-4 border-t border-border pt-3">
          <Row label="Net profit (earned minus costs)" strong><Money cents={period.netProfitCents} signed /></Row>
          <p className="mt-1 text-[12px] text-muted-foreground">Counting differences from daily closings (<Money cents={-period.varianceCents} signed />) are reported separately and are not in profit.</p>
        </div>
      </section>

      <section aria-labelledby="activity-title" className="rounded-card bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="activity-title" className="text-[16px] leading-6 font-medium">Activity by {grain}</h2>
          <a href={`/reports/export?report=activity&${q}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Export (CSV)</a>
        </div>
        <div className="mt-3"><ProfitChart points={groupedToChart(grouped)} /></div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-[14px]">
            <thead><tr className="text-left text-[12px] text-muted-foreground"><th className="h-9 px-3 font-normal">Period</th><th className="px-3 text-right font-normal">Transactions</th><th className="px-3 text-right font-normal">Fees</th><th className="px-3 text-right font-normal">Load margin</th><th className="px-3 text-right font-normal">Tip income</th><th className="px-3 text-right font-normal">Costs</th><th className="px-3 text-right font-normal">Net profit</th></tr></thead>
            <tbody>
              {grouped.map((g) => (
                <tr key={g.key} className="h-11 border-t border-rule">
                  <td className="px-3">{g.label}</td>
                  <td className="num px-3 text-right">{g.transactionCount}</td>
                  <td className="num px-3 text-right"><Money cents={g.feesCents} /></td>
                  <td className="num px-3 text-right"><Money cents={g.loadMarginCents} /></td>
                  <td className="num px-3 text-right"><Money cents={g.tipIncomeCents} /></td>
                  <td className="num px-3 text-right"><Money cents={-g.costsCents} /></td>
                  <td className="num px-3 text-right font-medium"><Money cents={g.netProfitCents} signed /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="float-title" className="rounded-card bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="float-title" className="text-[16px] leading-6 font-medium">Cash, GCash and load movement</h2>
          <a href={`/reports/export?report=float&${q}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Export (CSV)</a>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[14px]">
            <thead><tr className="text-left text-[12px] text-muted-foreground"><th className="h-9 px-3 font-normal">Account</th><th className="px-3 text-right font-normal">At the start</th><th className="px-3 text-right font-normal">Money in</th><th className="px-3 text-right font-normal">Money out</th><th className="px-3 text-right font-normal">At the end</th></tr></thead>
            <tbody>
              {floats.map((f) => (
                <tr key={f.code} className="h-11 border-t border-rule">
                  <td className="px-3">{f.name}</td>
                  <td className="num px-3 text-right"><Money cents={f.openingCents} /></td>
                  <td className="num px-3 text-right"><Money cents={f.inflowCents} signed /></td>
                  <td className="num px-3 text-right"><Money cents={f.outflowCents} /></td>
                  <td className="num px-3 text-right font-medium"><Money cents={f.closingCents} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="staff-title" className="rounded-card bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="staff-title" className="text-[16px] leading-6 font-medium">By staff member</h2>
          <a href={`/reports/export?report=staff&${q}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Export (CSV)</a>
        </div>
        {staff.length === 0 ? <p className="py-6 text-[14px] text-muted-foreground">No transactions in this period.</p> : (
          <table className="mt-3 w-full max-w-[640px] border-collapse text-[14px]">
            <thead><tr className="text-left text-[12px] text-muted-foreground"><th className="h-9 px-3 font-normal">Staff member</th><th className="px-3 text-right font-normal">Transactions</th><th className="px-3 text-right font-normal">Amount handled</th><th className="px-3 text-right font-normal">Fees</th></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.staffName} className="h-11 border-t border-rule">
                  <td className="px-3">{s.staffName}</td><td className="num px-3 text-right">{s.transactionCount}</td>
                  <td className="num px-3 text-right"><Money cents={s.volumeCents} /></td><td className="num px-3 text-right"><Money cents={s.feesCents} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="disc-title" className="rounded-card bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="disc-title" className="text-[16px] leading-6 font-medium">Counting differences</h2>
          <a href={`/reports/export?report=discrepancies&${q}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Export (CSV)</a>
        </div>
        {discrepancies.length === 0 ? <p className="py-6 text-[14px] text-muted-foreground">No differences were found in the days closed in this period.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <thead><tr className="text-left text-[12px] text-muted-foreground"><th className="h-9 px-3 font-normal">Day</th><th className="px-3 font-normal">Account</th><th className="px-3 text-right font-normal">Expected</th><th className="px-3 text-right font-normal">Counted</th><th className="px-3 text-right font-normal">Difference</th><th className="px-3 font-normal">Reason</th></tr></thead>
              <tbody>
                {discrepancies.map((d) => (
                  <tr key={`${d.businessDate}-${d.revision}-${d.accountName}`} className="min-h-11 border-t border-rule align-top">
                    <td className="num px-3 py-2.5"><Link href={`/closing?date=${d.businessDate}`} className="underline underline-offset-4">{d.businessDate}</Link></td>
                    <td className="px-3 py-2.5">{d.accountName}</td>
                    <td className="num px-3 py-2.5 text-right"><Money cents={d.expectedCents} /></td>
                    <td className="num px-3 py-2.5 text-right"><Money cents={d.actualCents} /></td>
                    <td className="num px-3 py-2.5 text-right text-negative"><Money cents={d.varianceCents} signed /></td>
                    <td className="px-3 py-2.5">{d.reason ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="more-title" className="rounded-card bg-surface p-5">
        <h2 id="more-title" className="text-[16px] leading-6 font-medium">Other reports</h2>
        <ul className="mt-2 flex flex-col gap-1 text-[14px]">
          <li><Link href={`/transactions?from=${from}&to=${to}`} className="underline underline-offset-4">Every transaction in this period</Link> (with CSV export)</li>
          <li><Link href="/debts" className="underline underline-offset-4">Debts, repayments and the age of unpaid debts</Link></li>
          <li><Link href="/customers" className="underline underline-offset-4">Customer histories and statements</Link></li>
        </ul>
      </section>
    </div>
  );
}
