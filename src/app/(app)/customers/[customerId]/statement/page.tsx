import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Money } from "@/components/ledger/money";
import { PrintButton } from "@/components/ledger/print-button";
import { TransactionTable } from "@/components/ledger/transaction-table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { requirePermission } from "@/lib/auth/session";
import { fetchCustomer, fetchDebtEvents, fetchTransactions } from "@/lib/data/queries";
import { METHOD_LABELS } from "@/lib/data/transactions";
import { parseHistoryFilters } from "@/lib/filters";
import { buildStatement } from "@/lib/statement";
import { formatManilaDate, formatManilaDateTime, isBusinessDateString, todayBusinessDate } from "@/lib/time";
import { isUuid } from "@/lib/uuid";

export const metadata: Metadata = { title: "Customer statement" };

export default async function StatementPage({
  params, searchParams,
}: { params: Promise<{ customerId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { customerId } = await params;
  if (!isUuid(customerId)) notFound();
  await requirePermission("customers.view");

  const sp = await searchParams;
  const today = todayBusinessDate();
  const rawFrom = typeof sp.from === "string" ? sp.from : "";
  const rawTo = typeof sp.to === "string" ? sp.to : "";
  let from = isBusinessDateString(rawFrom) ? rawFrom : `${today.slice(0, 8)}01`;
  let to = isBusinessDateString(rawTo) ? rawTo : today;
  if (from > to) [from, to] = [to, from];

  const [customer, events, activity] = await Promise.all([
    fetchCustomer(customerId),
    fetchDebtEvents(customerId),
    fetchTransactions(parseHistoryFilters({ from, to, order: "oldest" }), { customerId, all: true }),
  ]);
  if (!customer) notFound();
  const s = buildStatement(events, from, to);
  const exportHref = `/customers/${customer.id}/statement/export?from=${from}&to=${to}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-[24px] leading-8 font-medium">Statement: {customer.displayName}</h1>
        <p className="text-[14px] text-muted-foreground">
          {formatManilaDate(new Date(`${from}T00:00:00+08:00`))} to {formatManilaDate(new Date(`${to}T00:00:00+08:00`))}
          {customer.contactNumber ? <> · <span className="num">{customer.contactNumber}</span></> : null}
        </p>
        <form method="get" className="flex flex-wrap items-end gap-3" data-noprint>
          <div className="flex flex-col gap-1.5"><label htmlFor="from" className="text-[12px] text-muted-foreground">From</label><Input id="from" name="from" type="date" defaultValue={from} /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="to" className="text-[12px] text-muted-foreground">To</label><Input id="to" name="to" type="date" defaultValue={to} /></div>
          <Button type="submit" size="sm">Update</Button>
          <a href={exportHref} className={buttonVariants({ variant: "outline", size: "sm" })}>Export (CSV)</a>
          <PrintButton />
          <Link href={`/customers/${customer.id}`} className="text-[13px] underline underline-offset-4">Back to the profile</Link>
        </form>
      </header>

      <section aria-labelledby="debt-title" className="rounded-card bg-surface p-5">
        <h2 id="debt-title" className="text-[16px] leading-6 font-medium">Debt</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Only debt movements are counted here. Ordinary transaction volume is listed separately below.</p>
        <table className="mt-3 w-full border-collapse text-[14px]">
          <tbody>
            <tr className="h-11 border-t border-rule">
              <th scope="row" className="px-3 text-left font-normal">Owed at the start ({from})</th>
              <td className="num px-3 text-right">{s.openingCents === null ? <span className="text-muted-foreground">Not known</span> : <Money cents={s.openingCents} />}</td>
            </tr>
            {s.openingNote ? <tr><td colSpan={2} className="px-3 pb-2 text-[12px] text-muted-foreground">{s.openingNote}</td></tr> : null}
            {s.lines.map((e, i) => (
              <tr key={`${e.transactionId}-${i}`} className="min-h-11 border-t border-rule align-top">
                <td className="px-3 py-2.5">
                  <span className="num text-muted-foreground">{e.dateKnown ? e.businessDate : "date unknown"}</span>{"  "}
                  {e.kind === "debt" ? "Debt added" : e.kind === "repayment" ? "Repayment" : "Adjustment"}
                  {e.method ? ` · ${METHOD_LABELS[e.method] ?? e.method}` : ""}
                  {e.reference ? ` · ${e.reference}` : ""}
                  {e.note ? <span className="block text-[12px] text-muted-foreground">{e.note}</span> : null}
                </td>
                <td className="num px-3 py-2.5 text-right"><Money cents={e.amountCents} signed /></td>
              </tr>
            ))}
            <tr className="h-11 border-t border-rule font-medium">
              <th scope="row" className="px-3 text-left font-medium">Owed at the end ({to})</th>
              <td className="num px-3 text-right">{s.closingCents === null ? <span className="font-normal text-muted-foreground">Not known</span> : <Money cents={s.closingCents} />}</td>
            </tr>
            {s.closingNote ? <tr><td colSpan={2} className="px-3 pb-2 text-[12px] text-muted-foreground">{s.closingNote}</td></tr> : null}
          </tbody>
        </table>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Added <Money cents={s.debtsIncurredCents} /> · Repaid <Money cents={s.repaymentsCents} /> · Adjusted <Money cents={s.adjustmentsCents} signed />
        </p>
        {s.voidedLines.length > 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground"><Pill tone="negative">{s.voidedLines.length} voided</Pill> entries in this period are not counted.</p>
        ) : null}
      </section>

      <section aria-labelledby="activity-title" className="rounded-card bg-surface p-5">
        <h2 id="activity-title" className="text-[16px] leading-6 font-medium">Transactions in this period</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Volume only; this is not the amount owed.</p>
        {activity.rows.length === 0 ? <p className="py-6 text-[14px] text-muted-foreground">No transactions in this period.</p> : <div className="mt-3"><TransactionTable rows={activity.rows} showCustomer={false} /></div>}
      </section>

      <p className="text-[12px] text-muted-foreground">Generated {formatManilaDateTime(new Date())} Philippine time.</p>
    </div>
  );
}
