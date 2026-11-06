import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/ledger/money";
import { Pagination } from "@/components/ledger/pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { can } from "@/lib/auth/permissions";
import { requireAnyPermission } from "@/lib/auth/session";
import { fetchDebtAging, fetchDebts, fetchDebtSummary } from "@/lib/data/queries";
import { DEBT_STATUS_LABELS } from "@/lib/data/debts";
import { formatManilaDate } from "@/lib/time";

export const metadata: Metadata = { title: "Debts" };

const STATUSES = [
  ["unpaid", "Unpaid and part paid"],
  ["outstanding", "Unpaid"],
  ["partially_paid", "Part paid"],
  ["paid", "Paid"],
  ["voided", "Voided"],
  ["all", "All"],
] as const;

function str(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] : v; }

export default async function DebtsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile } = await requireAnyPermission(["debts.view", "repayments.record"]);
  const sp = await searchParams;
  const query = str(sp.q)?.trim().slice(0, 80) || null;
  const rawStatus = str(sp.status);
  const status = STATUSES.some(([v]) => v === rawStatus) ? (rawStatus as string) : "unpaid";
  const overdueOnly = str(sp.overdue) === "1";
  const pageNumber = Number(str(sp.page));
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= 100000 ? pageNumber : 1;

  const seeAll = can(profile, "debts.view");
  const [list, summary, aging] = await Promise.all([
    fetchDebts({ query, status, overdueOnly, page }),
    seeAll ? fetchDebtSummary() : Promise.resolve(null),
    seeAll ? fetchDebtAging() : Promise.resolve([]),
  ]);
  const link = (p: number) => {
    const q = new URLSearchParams();
    if (query) q.set("q", query);
    if (status !== "unpaid") q.set("status", status);
    if (overdueOnly) q.set("overdue", "1");
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `/debts${s ? `?${s}` : ""}`;
  };
  const owner = profile.role === "owner";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] leading-8 font-medium">Debts</h1>
        <div className="flex flex-wrap gap-2">
          {can(profile, "repayments.record") ? <Link href="/debts/repayment" className={buttonVariants({})}>Record repayment</Link> : null}
          {can(profile, "transactions.record") ? <Link href="/debts/new" className={buttonVariants({ variant: "outline" })}>New cash advance</Link> : null}
          {owner ? <Link href="/debts/import" className={buttonVariants({ variant: "outline" })}>Opening debts</Link> : null}
        </div>
      </header>

      {summary ? (
        <section aria-labelledby="owed-title" className="rounded-card bg-surface p-5">
          <h2 id="owed-title" className="text-[12px] font-normal text-muted-foreground">Customers owe you</h2>
          <p className="mt-1 text-[30px] leading-9 font-medium"><Money cents={summary.totalOutstandingCents} /></p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {summary.customersOwing} {summary.customersOwing === 1 ? "customer" : "customers"} · {summary.openDebts} open {summary.openDebts === 1 ? "debt" : "debts"}.
            This is money to collect, not cash in hand.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
            <div><dt className="text-[12px] text-muted-foreground">Overdue (past a due date)</dt><dd className="num text-[16px] font-medium"><Money cents={summary.overdueCents} /> <span className="text-[12px] font-normal text-muted-foreground">({summary.overdueCount})</span></dd></div>
            <div><dt className="text-[12px] text-muted-foreground">Of which the date is unknown</dt><dd className="num text-[16px] font-medium"><Money cents={summary.unknownDateCents} /></dd></div>
          </dl>
        </section>
      ) : null}

      {aging.length > 0 ? (
        <section aria-labelledby="aging-title" className="rounded-card bg-surface p-5">
          <h2 id="aging-title" className="text-[16px] leading-6 font-medium">Age of unpaid debts</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">How long ago the debt was recorded. Opening debts have no known date, so they are shown on their own line instead of being guessed.</p>
          <table className="mt-3 w-full max-w-[560px] border-collapse text-[14px]">
            <thead><tr className="text-left text-[12px] text-muted-foreground"><th className="h-9 px-3 font-normal">Age</th><th className="px-3 text-right font-normal">Debts</th><th className="px-3 text-right font-normal">Owed</th></tr></thead>
            <tbody>
              {aging.map((b) => (
                <tr key={b.bucket} className="h-11 border-t border-rule">
                  <td className="px-3">{b.bucket}</td>
                  <td className="num px-3 text-right">{b.debts}</td>
                  <td className="num px-3 text-right"><Money cents={b.outstandingCents} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section aria-label="Debt list" className="rounded-card bg-surface p-5">
        <form method="get" action="/debts" className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <label htmlFor="q" className="text-[12px] text-muted-foreground">Customer</label>
            <Input id="q" name="q" defaultValue={query ?? ""} maxLength={80} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="status" className="text-[12px] text-muted-foreground">Show</label>
            <select id="status" name="status" defaultValue={status} className="h-9 rounded-control border border-input bg-surface px-2 text-[14px]">
              {STATUSES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
          <label className="flex h-9 items-center gap-2 text-[14px]">
            <input type="checkbox" name="overdue" value="1" defaultChecked={overdueOnly} className="size-4 accent-[var(--primary)]" /> Overdue only
          </label>
          <Button type="submit" size="sm">Apply</Button>
        </form>

        {list.rows.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[16px] font-medium">No debts to show</p>
            <p className="mt-1 text-[14px] text-muted-foreground">{status === "unpaid" && !query && !overdueOnly ? "Nobody owes you anything recorded here." : "Try different filters."}</p>
          </div>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-[14px]">
                <thead>
                  <tr className="text-left text-[12px] text-muted-foreground">
                    <th className="h-9 px-3 font-normal">Customer</th>
                    <th className="px-3 font-normal">Debt</th>
                    <th className="px-3 text-right font-normal">Original</th>
                    <th className="px-3 text-right font-normal">Repaid</th>
                    <th className="px-3 text-right font-normal">Owed now</th>
                    <th className="px-3 font-normal">Due</th>
                    <th className="px-3 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((d) => (
                    <tr key={d.debtId} className="h-11 border-t border-rule hover:bg-[#fafafa]">
                      <td className="px-3"><Link href={`/customers/${d.customerId}`} className="font-medium hover:underline">{d.customerName}</Link></td>
                      <td className="px-3">
                        {owner ? <Link href={`/debts/${d.debtId}`} className="underline underline-offset-4">{d.reference ?? "Cash advance"}</Link> : (d.reference ?? "Cash advance")}
                        <span className="num block text-[12px] text-muted-foreground">{d.dateKnown ? formatManilaDate(new Date(d.debtAt)) : "Date unknown"}</span>
                      </td>
                      <td className="num px-3 text-right"><Money cents={d.originalCents} /></td>
                      <td className="num px-3 text-right"><Money cents={d.repaidCents} /></td>
                      <td className="num px-3 text-right font-medium"><Money cents={d.outstandingCents} /></td>
                      <td className="num px-3">{d.dueDate ?? <span className="text-muted-foreground">None</span>}{d.isOverdue ? <Pill tone="negative" className="ml-2">Overdue</Pill> : null}</td>
                      <td className="px-3"><Pill tone={d.status === "paid" ? "positive" : d.status === "voided" ? "negative" : d.status === "partially_paid" ? "warning" : "neutral"}>{DEBT_STATUS_LABELS[d.status]}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={list.total} page={page} hrefFor={link} />
          </>
        )}
      </section>
    </div>
  );
}
