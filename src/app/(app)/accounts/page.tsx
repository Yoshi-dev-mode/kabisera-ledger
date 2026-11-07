import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/ledger/money";
import { PageHeading } from "@/components/shell/page-heading";
import { Pagination } from "@/components/ledger/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { requirePermission } from "@/lib/auth/session";
import { fetchAccountLedger, fetchAccountOverview } from "@/lib/data/queries";
import { TYPE_LABELS } from "@/lib/data/transactions";
import { formatManilaDateTime, isBusinessDateString } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Cash and GCash balances" };

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("accounts.view");
  const sp = await searchParams;
  const accounts = await fetchAccountOverview();
  const code = accounts.some((a) => a.code === str(sp.account)) ? (str(sp.account) as string) : (accounts[0]?.code ?? "CASH_DRAWER");
  const rawFrom = str(sp.from) ?? "";
  const rawTo = str(sp.to) ?? "";
  const from = isBusinessDateString(rawFrom) ? rawFrom : null;
  const to = isBusinessDateString(rawTo) ? rawTo : null;
  const pageNumber = Number(str(sp.page));
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= 100000 ? pageNumber : 1;
  const ledger = await fetchAccountLedger({ code, from, to, page });
  const current = accounts.find((a) => a.code === code);
  const href = (p: number) => {
    const q = new URLSearchParams({ account: code });
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (p > 1) q.set("page", String(p));
    return `/accounts?${q.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <PageHeading icon="wallet">Cash and GCash balances</PageHeading>
        <p className="max-w-[65ch] text-[14px] text-muted-foreground">
          These are the balances you SHOULD have, worked out from every movement you recorded. They are kept apart on purpose, and money customers owe you is never counted here. Compare them with what you really count when you close the day.
        </p>
      </header>

      <nav aria-label="Account" className="grid gap-3 md:grid-cols-3">
        {accounts.map((a) => (
          <Link key={a.code} href={`/accounts?account=${a.code}`} aria-current={a.code === code ? "page" : undefined}
            className={cn("rounded-card bg-surface p-4 transition-colors", a.code === code ? "outline outline-2 outline-primary" : "hover:bg-muted")}>
            <span className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">{a.name}{a.isLow ? <Pill tone="negative">Low</Pill> : null}</span>
            <span className={cn("num mt-1 block text-[20px] leading-6 font-medium", a.balanceCents < 0 && "text-negative")}><Money cents={a.balanceCents} /></span>
            <span className="mt-1 block text-[12px] text-muted-foreground">{a.lastReconciledOn ? `Counted ${a.lastReconciledOn}` : "Never counted"}</span>
          </Link>
        ))}
      </nav>

      <section aria-labelledby="ledger-title" className="rounded-card bg-surface p-5">
        <h2 id="ledger-title" className="text-[16px] leading-6 font-medium">{current?.name ?? "Account"}: every movement</h2>
        <form method="get" action="/accounts" className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="account" value={code} />
          <div className="flex flex-col gap-1.5"><label htmlFor="from" className="text-[12px] text-muted-foreground">From</label><Input id="from" name="from" type="date" defaultValue={from ?? ""} /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="to" className="text-[12px] text-muted-foreground">To</label><Input id="to" name="to" type="date" defaultValue={to ?? ""} /></div>
          <Button type="submit" size="sm">Apply</Button>
        </form>
        {ledger.rows.length === 0 ? (
          <p className="py-8 text-center text-[14px] text-muted-foreground">No movements{from || to ? " in this period" : " yet. Enter your opening balances to start"}.</p>
        ) : (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-[14px]">
                <thead><tr className="text-left text-[12px] text-muted-foreground">
                  <th className="h-9 px-3 font-normal">Date</th><th className="px-3 font-normal">What</th><th className="px-3 font-normal">Reference</th>
                  <th className="px-3 text-right font-normal">Change</th><th className="px-3 text-right font-normal">Balance after</th>
                </tr></thead>
                <tbody>
                  {ledger.rows.map((r) => (
                    <tr key={r.lineId} className="h-11 border-t border-rule">
                      <td className="num px-3 whitespace-nowrap">{r.entryDate}<span className="block text-[12px] text-muted-foreground">{formatManilaDateTime(new Date(r.createdAt)).slice(11)}</span></td>
                      <td className="px-3">
                        {TYPE_LABELS[r.txType]}{r.customerName ? <span className="text-muted-foreground"> · {r.customerName}</span> : null}
                        {r.entryKind === "reversal" ? <Pill tone="negative" className="ml-2">Void</Pill> : null}
                      </td>
                      <td className="px-3"><Link href={`/transactions/${r.transactionId}`} className="underline underline-offset-4">{r.publicRef}</Link></td>
                      <td className="num px-3 text-right"><Money cents={r.changeCents} signed /></td>
                      <td className={cn("num px-3 text-right font-medium", r.balanceAfterCents < 0 && "text-negative")}><Money cents={r.balanceAfterCents} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={ledger.total} page={page} hrefFor={href} />
          </>
        )}
      </section>
    </div>
  );
}
