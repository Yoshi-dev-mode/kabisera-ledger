import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdjustDebtForm, DueDateForm } from "@/components/ledger/debt-forms";
import { Money } from "@/components/ledger/money";
import { buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { requireOwner } from "@/lib/auth/session";
import { fetchOneDebt } from "@/lib/data/queries";
import { DEBT_STATUS_LABELS } from "@/lib/data/debts";
import { formatManilaDate } from "@/lib/time";
import { isUuid } from "@/lib/uuid";
import { adjustDebtAction, setDueDateAction } from "../actions";

export const metadata: Metadata = { title: "Debt" };

export default async function DebtPage({ params }: { params: Promise<{ debtId: string }> }) {
  const { debtId } = await params;
  if (!isUuid(debtId)) notFound();
  await requireOwner();
  const d = await fetchOneDebt(debtId);
  if (!d) notFound();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <PageHeading icon="debt">{d.customerName}: {d.reference ?? "Cash advance"}</PageHeading>
          <Pill tone={d.status === "paid" ? "positive" : d.status === "voided" ? "negative" : d.status === "partially_paid" ? "warning" : "neutral"}>{DEBT_STATUS_LABELS[d.status]}</Pill>
          {d.isOverdue ? <Pill tone="negative">Overdue</Pill> : null}
        </div>
        <p className="text-[14px] text-muted-foreground">{d.dateKnown ? `Recorded ${formatManilaDate(new Date(d.debtAt))}` : "The original date was not recorded."}</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/customers/${d.customerId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Customer profile</Link>
          {d.outstandingCents > 0 ? <Link href={`/debts/repayment?customer=${d.customerId}&debt=${d.debtId}`} className={buttonVariants({ size: "sm" })}>Record repayment</Link> : null}
        </div>
      </header>

      <section aria-labelledby="breakdown-title" className="rounded-card bg-surface p-5">
        <h2 id="breakdown-title" className="text-[16px] leading-6 font-medium">Breakdown</h2>
        <table className="mt-3 w-full max-w-[460px] border-collapse text-[14px]">
          <tbody>
            <tr className="h-10 border-t border-rule"><th scope="row" className="px-3 text-left font-normal">Original debt</th><td className="num px-3 text-right"><Money cents={d.originalCents} /></td></tr>
            <tr className="h-10 border-t border-rule"><th scope="row" className="px-3 text-left font-normal">Repaid so far</th><td className="num px-3 text-right"><Money cents={-d.repaidCents} signed /></td></tr>
            <tr className="h-10 border-t border-rule"><th scope="row" className="px-3 text-left font-normal">Adjustments</th><td className="num px-3 text-right"><Money cents={d.adjustedCents} signed /></td></tr>
            <tr className="h-11 border-t border-rule font-medium"><th scope="row" className="px-3 text-left font-medium">Owed now</th><td className="num px-3 text-right"><Money cents={d.outstandingCents} /></td></tr>
          </tbody>
        </table>
        <p className="mt-3 text-[13px] text-muted-foreground">Paid debts are kept. Their repayments and adjustments stay on the customer&rsquo;s debt history.</p>
      </section>

      <section aria-labelledby="due-title" className="rounded-card bg-surface p-5">
        <h2 id="due-title" className="text-[16px] leading-6 font-medium">Due date and notes</h2>
        <div className="mt-3"><DueDateForm action={setDueDateAction} debtId={d.debtId} dueDate={d.dueDate} notes={d.notes} /></div>
      </section>

      {d.status !== "voided" ? (
        <section aria-labelledby="adjust-title" className="rounded-card bg-surface p-5">
          <h2 id="adjust-title" className="text-[16px] leading-6 font-medium">Adjust the debt</h2>
          <p className="mt-0.5 max-w-[65ch] text-[13px] text-muted-foreground">
            Only the owner can do this, and a reason is required. Reducing a debt is recorded as a cost and lowers profit; it never changes cash. Nothing is edited or deleted, and the adjustment appears on the customer&rsquo;s history.
          </p>
          <div className="mt-3"><AdjustDebtForm action={adjustDebtAction} idempotencyKey={crypto.randomUUID()} debtId={d.debtId} /></div>
        </section>
      ) : null}
    </div>
  );
}
