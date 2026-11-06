import type { Metadata } from "next";
import Link from "next/link";
import { ClosingForm } from "@/components/ledger/closing-form";
import { Money } from "@/components/ledger/money";
import { Pagination } from "@/components/ledger/pagination";
import { ReasonForm } from "@/components/ledger/reason-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { can, isOwner } from "@/lib/auth/permissions";
import { requireAnyPermission } from "@/lib/auth/session";
import { describeVariance } from "@/lib/closing";
import { fetchClosingDetail, fetchClosings, fetchDashboardFacts } from "@/lib/data/queries";
import { formatManilaDateTime, isBusinessDateString, todayBusinessDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { amendClosingAction, saveClosingAction } from "./actions";

export const metadata: Metadata = { title: "Daily closing" };

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ClosingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile } = await requireAnyPermission(["closing.perform", "reports.view"]);
  const sp = await searchParams;
  const today = todayBusinessDate();
  const asked = str(sp.date) ?? "";
  const date = isBusinessDateString(asked) && asked <= today ? asked : today;
  const pageNumber = Number(str(sp.page));
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= 100000 ? pageNumber : 1;

  const [detail, history, facts] = await Promise.all([fetchClosingDetail(date), fetchClosings(page), fetchDashboardFacts()]);
  const canClose = can(profile, "closing.perform");
  const unclosed = facts.unreconciledDates ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[24px] leading-8 font-medium">Daily closing</h1>
        <p className="max-w-[65ch] text-[14px] text-muted-foreground">
          Count the cash in the drawer, the GCash wallet and the load balance, and compare them with what the records say you should have. A difference is never hidden: it is recorded with your reason.
        </p>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5"><label htmlFor="date" className="text-[12px] text-muted-foreground">Day</label><Input id="date" name="date" type="date" defaultValue={date} max={today} /></div>
          <Button type="submit" size="sm" variant="outline">Show</Button>
        </form>
        {unclosed.length > 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Not closed yet:{" "}
            {unclosed.slice(-8).map((d, i) => <span key={d}>{i > 0 ? ", " : ""}<Link href={`/closing?date=${d}`} className="underline underline-offset-4">{d}</Link></span>)}
          </p>
        ) : null}
      </header>

      <section aria-labelledby="day-title" className="rounded-card bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="day-title" className="text-[16px] leading-6 font-medium">{date}{date === today ? " (today)" : ""}</h2>
          {detail.status === "final" ? <Pill tone="positive">Closed{detail.revision && detail.revision > 1 ? ` (revision ${detail.revision})` : ""}</Pill> : detail.status === "draft" ? <Pill tone="warning">Counts saved, not closed</Pill> : <Pill>Not started</Pill>}
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {detail.transactionCount} {detail.transactionCount === 1 ? "transaction" : "transactions"} recorded this day.{" "}
          {can(profile, "customers.view") || can(profile, "reports.view") || isOwner(profile) ? <Link href={`/transactions?from=${date}&to=${date}`} className="underline underline-offset-4">Review them</Link> : null}
        </p>

        {detail.status === "final" ? (
          <div className="mt-4 flex flex-col gap-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[14px]">
                <thead><tr className="text-left text-[12px] text-muted-foreground">
                  <th className="h-9 px-3 font-normal">Account</th><th className="px-3 text-right font-normal">Expected</th><th className="px-3 text-right font-normal">Counted</th><th className="px-3 text-right font-normal">Difference</th><th className="px-3 font-normal">Reason</th>
                </tr></thead>
                <tbody>
                  {detail.accounts.map((a) => (
                    <tr key={a.code} className="min-h-11 border-t border-rule align-top">
                      <td className="px-3 py-2.5">{a.name}</td>
                      <td className="num px-3 py-2.5 text-right"><Money cents={a.expectedCents} /></td>
                      <td className="num px-3 py-2.5 text-right">{a.actualCents === null ? "–" : <Money cents={a.actualCents} />}</td>
                      <td className={cn("num px-3 py-2.5 text-right", a.varianceCents ? "text-negative" : "")}>{a.varianceCents === null ? "–" : a.varianceCents === 0 ? "Balanced" : <Money cents={a.varianceCents} signed />}</td>
                      <td className="px-3 py-2.5">{a.reason ?? <span className="text-muted-foreground">None needed</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[13px] text-muted-foreground">
              Closed {detail.finalizedAt ? formatManilaDateTime(new Date(detail.finalizedAt)) : ""} by {detail.finalizedByName ?? "someone"}.
              {detail.note ? ` Note: ${detail.note}` : ""}
              {detail.amendmentReason ? ` This revision amends an earlier closing: ${detail.amendmentReason}` : ""}
            </p>
            {isOwner(profile) ? (
              <div className="border-t border-border pt-4">
                <h3 className="text-[14px] font-medium">Something wrong with this day?</h3>
                <p className="mt-0.5 max-w-[60ch] text-[13px] text-muted-foreground">The closed record is kept as it is. Amending reopens the day as a new revision so you can fix it, then count and close it again.</p>
                <div className="mt-3"><ReasonForm action={amendClosingAction} hidden={{ date }} label="Reason for reopening" buttonLabel="Amend this closing" /></div>
              </div>
            ) : null}
          </div>
        ) : canClose ? (
          <div className="mt-4"><ClosingForm key={`${date}-${detail.status}-${detail.revision ?? 0}`} action={saveClosingAction} date={date} accounts={detail.accounts} note={detail.note} /></div>
        ) : (
          <div className="mt-4">
            <p className="text-[14px] text-muted-foreground">This day has not been closed. Expected balances are shown below; you need permission to close the day to count them.</p>
            <ul className="mt-2 text-[14px]">{detail.accounts.map((a) => <li key={a.code} className="flex justify-between gap-4 py-1"><span>{a.name}</span><Money cents={a.expectedCents} /></li>)}</ul>
          </div>
        )}
        {detail.status === "draft" && detail.accounts.some((a) => a.varianceCents !== null && a.varianceCents !== 0) && canClose ? (
          <p className="mt-3 text-[12px] text-muted-foreground">{detail.accounts.filter((a) => a.varianceCents).map((a) => `${a.name}: ${describeVariance((a.actualCents ?? 0), a.expectedCents).text}`).join(" ")}</p>
        ) : null}
      </section>

      <section aria-labelledby="history-title" className="rounded-card bg-surface p-5">
        <h2 id="history-title" className="text-[16px] leading-6 font-medium">Closed days</h2>
        {history.rows.length === 0 ? <p className="py-6 text-[14px] text-muted-foreground">No day has been closed yet.</p> : (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[14px]">
                <thead><tr className="text-left text-[12px] text-muted-foreground"><th className="h-9 px-3 font-normal">Day</th><th className="px-3 font-normal">Closed by</th><th className="px-3 text-right font-normal">Total difference</th><th className="px-3 font-normal">Note</th></tr></thead>
                <tbody>
                  {history.rows.map((c) => (
                    <tr key={`${c.businessDate}-${c.revision}`} className="h-11 border-t border-rule">
                      <td className="num px-3"><Link href={`/closing?date=${c.businessDate}`} className="underline underline-offset-4">{c.businessDate}</Link>{c.revision > 1 ? <span className="text-muted-foreground"> · rev {c.revision}</span> : null}</td>
                      <td className="px-3">{c.finalizedByName ?? "–"}</td>
                      <td className="num px-3 text-right">{c.totalVarianceCents === 0 ? <span className="text-muted-foreground">Balanced</span> : <Money cents={c.totalVarianceCents} />}</td>
                      <td className="px-3">{c.note ?? <span className="text-muted-foreground">None</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={history.total} page={page} hrefFor={(p) => `/closing?date=${date}${p > 1 ? `&page=${p}` : ""}`} />
          </>
        )}
      </section>
    </div>
  );
}
