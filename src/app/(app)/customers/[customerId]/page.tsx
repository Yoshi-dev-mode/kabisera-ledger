import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FilterBar } from "@/components/ledger/filter-bar";
import { Money } from "@/components/ledger/money";
import { Pagination } from "@/components/ledger/pagination";
import { ReasonForm } from "@/components/ledger/reason-form";
import { TransactionTable } from "@/components/ledger/transaction-table";
import { buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { fetchCustomer, fetchCustomerOverview, fetchDebtEvents, fetchTransactions } from "@/lib/data/queries";
import { METHOD_LABELS, type TransactionType } from "@/lib/data/transactions";
import { parseHistoryFilters, toQueryString } from "@/lib/filters";
import { withRunningBalance } from "@/lib/statement";
import { formatManilaDate, formatManilaDateTime, todayBusinessDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { isUuid } from "@/lib/uuid";
import { archiveCustomerAction } from "../actions";
import { RestoreForm } from "./restore-form";

export const metadata: Metadata = { title: "Customer" };

const CUSTOMER_TYPES: readonly TransactionType[] = ["cash_in", "cash_out", "mobile_load", "debt_creation", "debt_repayment", "debt_adjustment"];
const EVENT_LABEL = { debt: "Debt added", repayment: "Repayment", adjustment: "Adjustment" } as const;

function Stat({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="num text-[16px] leading-6 font-medium">{children}</dd>
      {note ? <p className="text-[12px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export default async function CustomerProfilePage({
  params, searchParams,
}: { params: Promise<{ customerId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { customerId } = await params;
  if (!isUuid(customerId)) notFound();
  const { profile } = await requirePermission("customers.view");
  const filters = parseHistoryFilters(await searchParams);

  const [customer, overview, events, history] = await Promise.all([
    fetchCustomer(customerId),
    fetchCustomerOverview(customerId),
    fetchDebtEvents(customerId),
    fetchTransactions(filters, { customerId }),
  ]);
  if (!customer) notFound();

  const ledger = withRunningBalance(events);
  const canManage = can(profile, "customers.manage");
  const base = `/customers/${customer.id}`;
  const today = todayBusinessDate();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[24px] leading-8 font-medium">{customer.displayName}</h1>
          {customer.status === "archived" ? <Pill>Archived</Pill> : <Pill tone="positive">Active</Pill>}
        </div>
        <p className="text-[14px] text-muted-foreground">
          <span className="num">Customer #{customer.customerNo}</span>
          {customer.contactNumber ? <> · <span className="num">{customer.contactNumber}</span></> : null}
          {" · "}Added {formatManilaDate(new Date(customer.createdAt))}
        </p>
        {customer.notes ? <p className="max-w-[70ch] text-[14px]">{customer.notes}</p> : null}
        <div className="flex flex-wrap items-center gap-2" data-noprint>
          <Link href={`${base}/statement`} className={buttonVariants({ variant: "outline", size: "sm" })}>Statement</Link>
          <a href={`${base}/export${toQueryString(filters, { page: 1 })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Export history (CSV)</a>
          {can(profile, "repayments.record") && overview.outstandingCents > 0 ? <Link href={`/debts/repayment?customer=${customer.id}`} className={buttonVariants({ size: "sm" })}>Record repayment</Link> : null}
          {can(profile, "transactions.record") && customer.status === "active" ? <Link href={`/debts/new?customer=${customer.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>New cash advance</Link> : null}
          {canManage ? <Link href={`${base}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>Edit</Link> : null}
        </div>
      </header>

      <section aria-labelledby="owed-title" className="rounded-card bg-surface p-5">
        <h2 id="owed-title" className="text-[12px] font-normal text-muted-foreground">Currently owes you</h2>
        <p className="num mt-1 text-[30px] leading-9 font-medium">
          <Money cents={overview.outstandingCents} />
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {overview.outstandingCents === 0 ? "Nothing outstanding." : "This is money to collect, not cash in hand."}
        </p>
      </section>

      <section aria-labelledby="activity-title" className="rounded-card bg-surface p-5">
        <h2 id="activity-title" className="text-[16px] leading-6 font-medium">Activity</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Historical totals of posted transactions. These are not what the customer owes.</p>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 lg:grid-cols-4">
          <Stat label="Cash-in"><Money cents={overview.cashInCents} /></Stat>
          <Stat label="Cash-out"><Money cents={overview.cashOutCents} /></Stat>
          <Stat label="Mobile load bought"><Money cents={overview.loadCents} /></Stat>
          <Stat label="Service fees paid"><Money cents={overview.feeCents} /></Stat>
          <Stat label="Repayments"><Money cents={overview.repaymentCents} /></Stat>
          <Stat label="Transactions">{overview.transactionCount}{overview.voidedCount ? <span className="text-[12px] font-normal text-muted-foreground"> (+{overview.voidedCount} voided)</span> : null}</Stat>
          <Stat label="Most recent">{overview.lastActivityAt ? formatManilaDate(new Date(overview.lastActivityAt)) : "None yet"}</Stat>
        </dl>
      </section>

      <section aria-labelledby="debt-title" className="rounded-card bg-surface p-5">
        <h2 id="debt-title" className="text-[16px] leading-6 font-medium">Debt and repayments</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Every debt, repayment and correction, oldest first. Nothing is deleted when a debt is paid. Opening debts were reported by the owner and have no known date.
        </p>
        {ledger.length === 0 ? (
          <p className="py-6 text-[14px] text-muted-foreground">No debt has been recorded for this customer.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-muted-foreground">
                  <th className="h-9 px-3 font-normal">Date</th>
                  <th className="px-3 font-normal">What</th>
                  <th className="px-3 font-normal">Reference</th>
                  <th className="px-3 text-right font-normal">Amount</th>
                  <th className="px-3 text-right font-normal">Owed after</th>
                  <th className="px-3 font-normal">Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((e, i) => (
                  <tr key={`${e.transactionId ?? e.debtId}-${i}`} className={cn("min-h-11 border-t border-rule align-top", e.isVoided && "text-muted-foreground line-through decoration-1")}>
                    <td className="num px-3 py-2.5 whitespace-nowrap">
                      {e.dateKnown ? formatManilaDate(new Date(e.at)) : <span title="The original date was not recorded">Date unknown</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {EVENT_LABEL[e.kind]}
                      {e.method ? <span className="text-muted-foreground"> · {METHOD_LABELS[e.method] ?? e.method}</span> : null}
                      {e.isVoided ? <Pill tone="negative" className="ml-2 no-underline">Voided</Pill> : null}
                      {e.note ? <span className="block text-[12px] text-muted-foreground">{e.note}</span> : null}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {e.transactionId && e.reference ? <Link href={`/transactions/${e.transactionId}`} className="underline underline-offset-4">{e.reference}</Link> : (e.reference ?? "–")}
                    </td>
                    <td className="num px-3 py-2.5 text-right"><Money cents={e.amountCents} signed /></td>
                    <td className="num px-3 py-2.5 text-right">{e.balanceAfterCents === null ? "–" : <Money cents={e.balanceAfterCents} />}</td>
                    <td className="px-3 py-2.5">{e.recordedByName ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="history-title" className="rounded-card bg-surface p-5">
        <h2 id="history-title" className="text-[16px] leading-6 font-medium">Transaction history</h2>
        <div className="mt-3" data-noprint>
          <FilterBar basePath={base} filters={filters} allowedTypes={CUSTOMER_TYPES} />
        </div>
        {history.rows.length === 0 ? (
          <p className="py-8 text-center text-[14px] text-muted-foreground">
            {filters.from || filters.to || filters.types.length || filters.status || filters.search ? "No transactions match these filters." : "No transactions have been recorded for this customer yet."}
          </p>
        ) : (
          <div className="mt-3">
            <TransactionTable rows={history.rows} showCustomer={false} />
            <Pagination total={history.total} page={filters.page} hrefFor={(page) => `${base}${toQueryString(filters, { page })}`} />
          </div>
        )}
      </section>

      {canManage ? (
        <section aria-labelledby="archive-title" className="rounded-card bg-surface p-5" data-noprint>
          <h2 id="archive-title" className="text-[16px] leading-6 font-medium">{customer.status === "archived" ? "Archived" : "Archive this customer"}</h2>
          {customer.status === "archived" ? (
            <div className="mt-2 flex flex-col gap-3">
              <p className="text-[14px] text-muted-foreground">
                Archived {customer.archivedAt ? `on ${formatManilaDateTime(new Date(customer.archivedAt))}` : ""}{customer.archiveReason ? `: ${customer.archiveReason}` : ""}. Their history is kept in full.
              </p>
              <RestoreForm id={customer.id} />
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-3">
              <p className="max-w-[60ch] text-[14px] text-muted-foreground">
                Archiving hides them from pickers but keeps every transaction, debt and repayment. {overview.outstandingCents > 0 ? "They still owe money, so only the owner can archive them." : ""}
              </p>
              <ReasonForm action={archiveCustomerAction} hidden={{ id: customer.id }} label="Reason" buttonLabel="Archive customer" danger />
            </div>
          )}
        </section>
      ) : null}
      <p className="text-[12px] text-muted-foreground" data-noprint>As of {today}.</p>
    </div>
  );
}
