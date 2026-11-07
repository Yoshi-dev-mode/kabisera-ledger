import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/ledger/money";
import { PageHeading } from "@/components/shell/page-heading";
import { Pagination } from "@/components/ledger/pagination";
import { Pill } from "@/components/ui/pill";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { can } from "@/lib/auth/permissions";
import { requireAnyPermission } from "@/lib/auth/session";
import { fetchCustomers } from "@/lib/data/queries";
import { customerQueryString, parseCustomerQuery } from "@/lib/filters";
import { formatManilaDate } from "@/lib/time";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile } = await requireAnyPermission(["customers.view", "customers.manage"]);
  const query = parseCustomerQuery(await searchParams);
  const { rows, total } = await fetchCustomers(query);
  const canManage = can(profile, "customers.manage");
  const filtered = Boolean(query.query || query.onlyWithDebt || query.status !== "active");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <PageHeading icon="users">Customers</PageHeading>
        {canManage ? (
          <Link href="/customers/new" className={buttonVariants({ size: "default" })}>Add customer</Link>
        ) : null}
      </header>

      <section className="rounded-card bg-surface p-5" aria-label="Customer list">
        <form method="get" action="/customers" className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <label htmlFor="q" className="text-[12px] text-muted-foreground">Search name or contact number</label>
            <Input id="q" name="q" defaultValue={query.query ?? ""} maxLength={80} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="status" className="text-[12px] text-muted-foreground">Show</label>
            <select id="status" name="status" defaultValue={query.status} className="h-9 rounded-control border border-input bg-surface px-2 text-[14px]">
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </div>
          <label className="flex h-9 items-center gap-2 text-[14px]">
            <input type="checkbox" name="debt" value="1" defaultChecked={query.onlyWithDebt} className="size-4 accent-[var(--primary)]" />
            Owes money
          </label>
          <Button type="submit" size="sm">Apply</Button>
          {filtered ? <Link href="/customers" className="text-[13px] underline underline-offset-4">Clear</Link> : null}
        </form>

        {rows.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[16px] font-medium">{filtered ? "No customers match" : "No customers yet"}</p>
            <p className="mt-1 text-[14px] text-muted-foreground">
              {filtered ? "Try a different search or clear the filters." : canManage ? "Add your first customer to start keeping their history." : "Ask the owner to add customers."}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[640px] border-collapse text-[14px]">
                <thead>
                  <tr className="text-left text-[12px] text-muted-foreground">
                    <th className="h-9 px-3 font-normal">Customer</th>
                    <th className="px-3 font-normal">Contact</th>
                    <th className="px-3 text-right font-normal">Owes</th>
                    <th className="px-3 font-normal">Last activity</th>
                    <th className="px-3 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="h-11 border-t border-rule hover:bg-[#fafafa]">
                      <td className="px-3">
                        <Link href={`/customers/${c.id}`} className="font-medium hover:underline">{c.displayName}</Link>
                        <span className="num ml-2 text-[12px] text-muted-foreground">#{c.customerNo}</span>
                      </td>
                      <td className="num px-3">{c.contactNumber ?? <span className="text-muted-foreground">–</span>}</td>
                      <td className="num px-3 text-right">
                        {c.outstandingCents === null ? <span className="text-muted-foreground">–</span> : c.outstandingCents > 0 ? <Money cents={c.outstandingCents} /> : <span className="text-muted-foreground">Nothing</span>}
                      </td>
                      <td className="num px-3">{c.lastActivityAt ? formatManilaDate(new Date(c.lastActivityAt)) : <span className="text-muted-foreground">None yet</span>}</td>
                      <td className="px-3">{c.status === "archived" ? <Pill>Archived</Pill> : <Pill tone="positive">Active</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-2 flex flex-col divide-y divide-rule md:hidden">
              {rows.map((c) => (
                <li key={c.id} className="py-3">
                  <Link href={`/customers/${c.id}`} className="flex items-center justify-between gap-3">
                    <span>
                      <span className="block text-[14px] font-medium">{c.displayName}</span>
                      <span className="block text-[12px] text-muted-foreground">{c.contactNumber ?? "No contact number"}</span>
                    </span>
                    <span className="text-right">
                      {c.outstandingCents && c.outstandingCents > 0 ? <Money cents={c.outstandingCents} className="block text-[14px]" /> : null}
                      {c.status === "archived" ? <Pill className="mt-1">Archived</Pill> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination total={total} page={query.page} hrefFor={(page) => `/customers${customerQueryString(query, { page })}`} />
          </>
        )}
      </section>
    </div>
  );
}
