import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import { FilterBar } from "@/components/ledger/filter-bar";
import { Pagination } from "@/components/ledger/pagination";
import { TransactionTable } from "@/components/ledger/transaction-table";
import { buttonVariants } from "@/components/ui/button";
import { requireAnyPermission } from "@/lib/auth/session";
import { fetchTransactions } from "@/lib/data/queries";
import { parseHistoryFilters, toQueryString } from "@/lib/filters";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile } = await requireAnyPermission(["reports.view", "customers.view", "transactions.record", "repayments.record"]);
  const filters = parseHistoryFilters(await searchParams);
  const { rows, total } = await fetchTransactions(filters);
  const wide = profile.role === "owner" || profile.permissions.includes("reports.view") || profile.permissions.includes("customers.view");
  const filtered = Boolean(filters.from || filters.to || filters.types.length || filters.status || filters.search);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <PageHeading icon="list">Transactions</PageHeading>
          {!wide ? <p className="text-[13px] text-muted-foreground">You see the transactions you recorded.</p> : null}
        </div>
        {wide ? <a href={`/transactions/export${toQueryString(filters, { page: 1 })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Export (CSV)</a> : null}
      </header>
      <section className="rounded-card bg-surface p-5" aria-label="Transaction list">
        <FilterBar basePath="/transactions" filters={filters} />
        {rows.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[16px] font-medium">{filtered ? "No transactions match" : "No transactions yet"}</p>
            <p className="mt-1 text-[14px] text-muted-foreground">{filtered ? "Try different filters." : "Recorded transactions will appear here."}</p>
          </div>
        ) : (
          <div className="mt-4">
            <TransactionTable rows={rows} showCustomer />
            <Pagination total={total} page={filters.page} hrefFor={(page) => `/transactions${toQueryString(filters, { page })}`} />
          </div>
        )}
      </section>
    </div>
  );
}
