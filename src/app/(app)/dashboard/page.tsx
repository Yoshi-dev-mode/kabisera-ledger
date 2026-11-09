import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/ledger/money";
import { ProfitChart } from "@/components/ledger/profit-chart";
import { TransactionTable } from "@/components/ledger/transaction-table";
import { PageHeading } from "@/components/shell/page-heading";
import { buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { can, canAny, isOwner } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { buildAlerts, lastNDates, toChartPoints } from "@/lib/dashboard";
import {
  fetchAccountOverview, fetchDailySeries, fetchDailySummary, fetchDashboardFacts, fetchDebtSummary, fetchTransactions,
} from "@/lib/data/queries";
import { parseHistoryFilters } from "@/lib/filters";
import { formatManilaDate, todayBusinessDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

function Kpi({ label, children, note, strong }: { label: string; children: React.ReactNode; note?: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className={cn("num leading-6", strong ? "text-[20px] font-medium" : "text-[16px]")}>{children}</dd>
      {note ? <p className="text-[12px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export default async function DashboardPage() {
  const { profile } = await requireSession();
  const today = todayBusinessDate();
  const seeBalances = can(profile, "accounts.view");
  const seeProfit = can(profile, "reports.view");
  const seeDebts = can(profile, "debts.view");
  const seeActivity = canAny(profile, ["reports.view", "customers.view", "transactions.record", "repayments.record"]);
  const canRecord = can(profile, "transactions.record");
  const days = lastNDates(today, 14);

  const [accounts, summary, series, facts, debts, activity] = await Promise.all([
    seeBalances ? fetchAccountOverview() : Promise.resolve(null),
    seeProfit ? fetchDailySummary(today) : Promise.resolve(null),
    seeProfit ? fetchDailySeries(days[0] ?? today, today) : Promise.resolve(null),
    fetchDashboardFacts(),
    seeDebts ? fetchDebtSummary() : Promise.resolve(null),
    seeActivity ? fetchTransactions(parseHistoryFilters({ from: today, to: today }), {}) : Promise.resolve(null),
  ]);

  const alerts = buildAlerts(facts);
  const seesAlerts = Object.values(facts).some((v) => v !== null);
  const allZero = accounts !== null && accounts.every((a) => a.balanceCents === 0) && (activity?.total ?? 0) === 0 && (series?.every((d) => d.transactionCount === 0) ?? true);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <PageHeading icon="dashboard">Dashboard</PageHeading>
          <p className="text-[14px] text-muted-foreground">{formatManilaDate(new Date())} · Philippine time</p>
        </div>
        {canRecord ? <Link href="/transactions/new" className={buttonVariants({})}>New transaction</Link> : null}
      </header>

      {allZero ? (
        <section aria-labelledby="start-title" className="rounded-card bg-surface p-5">
          <h2 id="start-title" className="text-[16px] leading-6 font-medium">Nothing recorded yet</h2>
          <p className="mt-1 max-w-[65ch] text-[14px] text-muted-foreground">
            Count the cash in your drawer, your GCash wallet and your load balance, and enter them as opening balances. Nothing is assumed, and every figure here comes from what you record.
          </p>
          {isOwner(profile) ? <div className="mt-3"><Link href="/transactions/new?type=opening" className={buttonVariants({ variant: "outline" })}>Enter opening balances</Link></div> : <p className="mt-2 text-[13px] text-muted-foreground">Ask the owner to enter the opening balances.</p>}
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="order-2 flex min-w-0 flex-col gap-6 lg:order-1">
          {seesAlerts ? (
            <section aria-labelledby="alerts-title" className="rounded-card bg-surface p-5">
              <h2 id="alerts-title" className="text-[16px] leading-6 font-medium">Needs attention</h2>
              {alerts.length === 0 ? (
                <p className="mt-1 text-[14px] text-muted-foreground">Nothing needs attention right now.</p>
              ) : (
                <ul className="mt-2 flex flex-col divide-y divide-border">
                  {alerts.map((a) => (
                    <li key={a.id} className="py-3">
                      <Link href={a.href} className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2 text-[14px] font-medium">{a.title}{a.severity === "critical" ? <Pill tone="negative">Urgent</Pill> : null}</span>
                        <span className="text-[13px] text-muted-foreground">{a.detail}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <section aria-labelledby="today-title" className="rounded-card bg-surface p-5">
            <h2 id="today-title" className="text-[16px] leading-6 font-medium">Today</h2>
            {summary ? (
              <>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
                  <Kpi label="Transactions">{summary.transactionCount}{summary.voidedCount ? <span className="text-[12px] text-muted-foreground"> (+{summary.voidedCount} voided)</span> : null}</Kpi>
                  <Kpi label="Service fees earned"><Money cents={summary.feesCents} /></Kpi>
                  <Kpi label="Load margin"><Money cents={summary.loadMarginCents} /></Kpi>
                  <Kpi label="Tip income"><Money cents={summary.tipIncomeCents} /></Kpi>
                  <Kpi label="Costs and expenses" note="Provider costs, expenses, write-offs"><Money cents={summary.providerCostCents + summary.expensesCents + summary.writeOffsCents} /></Kpi>
                  <Kpi label="Net profit today" strong><Money cents={summary.netProfitCents} signed /></Kpi>
                </dl>
                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 md:grid-cols-3">
                  <Kpi label="Cash-in volume"><Money cents={summary.cashInVolumeCents} /></Kpi>
                  <Kpi label="Cash-out volume"><Money cents={summary.cashOutVolumeCents} /></Kpi>
                  <Kpi label="Load sold"><Money cents={summary.loadSalesCents} /></Kpi>
                </dl>
                <p className="mt-3 text-[12px] text-muted-foreground">Net profit includes service fees, load margin and tips, minus costs. Repayment principal reduces customer debt. A void made today is counted today.</p>
                {summary.varianceCents !== 0 ? <p className="mt-1 text-[12px] text-muted-foreground">Counting differences are reported separately: <Money cents={-summary.varianceCents} signed />.</p> : null}
              </>
            ) : activity ? (
              <p className="mt-2 text-[14px] text-muted-foreground">{activity.total === 0 ? "No transactions yet today." : `${activity.total} ${activity.total === 1 ? "transaction" : "transactions"} recorded today.`}</p>
            ) : (
              <p className="mt-2 text-[14px] text-muted-foreground">Ask the owner for access to see today&rsquo;s figures.</p>
            )}
          </section>

          {series ? (
            <section aria-labelledby="chart-title" className="rounded-card bg-surface p-5">
              <h2 id="chart-title" className="text-[16px] leading-6 font-medium">Net profit, last 14 days</h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">Fees, load margin and tips, minus costs.</p>
              <div className="mt-3"><ProfitChart points={toChartPoints(series)} /></div>
            </section>
          ) : null}

          {activity ? (
            <section aria-labelledby="recent-title" className="rounded-card bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 id="recent-title" className="text-[16px] leading-6 font-medium">Today&rsquo;s activity</h2>
                <Link href="/transactions" className="text-[13px] underline underline-offset-4">See all transactions</Link>
              </div>
              {activity.rows.length === 0 ? <p className="py-6 text-[14px] text-muted-foreground">Nothing has been recorded today.</p> : <div className="mt-2"><TransactionTable rows={activity.rows.slice(0, 8)} showCustomer /></div>}
            </section>
          ) : null}
        </div>

        {accounts || debts ? (
          <aside aria-label="Balances" className="order-1 flex flex-col gap-4 lg:order-2">
            {accounts ? (
              <section aria-labelledby="bal-title" className="rounded-card bg-surface p-5">
                <h2 id="bal-title" className="text-[16px] leading-6 font-medium">What you should have</h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">Expected from what you recorded. Count the real amounts when you close the day.</p>
                <ul className="mt-3 flex flex-col divide-y divide-border">
                  {accounts.map((a) => (
                    <li key={a.code} className="py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[14px]">{a.name}</span>
                        <span className={cn("num text-[20px] leading-6 font-medium", a.balanceCents < 0 && "text-negative")}><Money cents={a.balanceCents} /></span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                        {a.isLow ? <Pill tone="negative">Low</Pill> : null}
                        <span>{a.lowThresholdCents === null ? "No warning level set" : <>Warns below <Money cents={a.lowThresholdCents} /></>}</span>
                      </div>
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        {a.lastReconciledOn === null ? "Never counted" : <>Counted {a.lastReconciledOn}{a.lastVarianceCents ? <> · off by <Money cents={a.lastVarianceCents} signed /></> : " · matched"}</>}
                      </p>
                    </li>
                  ))}
                </ul>
                <Link href="/accounts" className="mt-2 inline-block text-[13px] underline underline-offset-4">See every movement</Link>
              </section>
            ) : null}
            {debts ? (
              <section aria-labelledby="owed-title" className="rounded-card bg-surface p-5">
                <h2 id="owed-title" className="text-[16px] leading-6 font-medium">Owed to you</h2>
                <p className="num mt-1 text-[20px] leading-6 font-medium"><Money cents={debts.totalOutstandingCents} /></p>
                <p className="mt-1 text-[12px] text-muted-foreground">Not cash. {debts.customersOwing} {debts.customersOwing === 1 ? "customer owes" : "customers owe"} you{debts.overdueCount ? `; ${debts.overdueCount} overdue` : ""}.</p>
                <Link href="/debts" className="mt-2 inline-block text-[13px] underline underline-offset-4">See debts</Link>
              </section>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
