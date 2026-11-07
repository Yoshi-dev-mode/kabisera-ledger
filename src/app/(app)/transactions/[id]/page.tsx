import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Money } from "@/components/ledger/money";
import { ReasonForm } from "@/components/ledger/reason-form";
import { Pill } from "@/components/ui/pill";
import { can, isOwner } from "@/lib/auth/permissions";
import { requireAnyPermission } from "@/lib/auth/session";
import { fetchTransactionDetail } from "@/lib/data/queries";
import { METHOD_LABELS, TYPE_LABELS } from "@/lib/data/transactions";
import { formatManilaDateTime } from "@/lib/time";
import { isUuid } from "@/lib/uuid";
import { requestVoidAction, voidTransactionAction } from "./actions";

export const metadata: Metadata = { title: "Transaction" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-6">
      <dt className="w-48 shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      <dd className="text-[14px]">{children}</dd>
    </div>
  );
}

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { profile } = await requireAnyPermission(["reports.view", "customers.view", "transactions.record", "repayments.record"]);
  const t = await fetchTransactionDetail(id);
  if (!t) notFound();

  const owner = isOwner(profile);
  const canRequest = can(profile, "transactions.request_void") && !owner;
  const open = t.status === "posted";
  const lineTotal = t.lines.reduce((sum, l) => sum + (l.amountCents > 0 ? l.amountCents : 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <PageHeading icon="list">{TYPE_LABELS[t.type]}</PageHeading>
          {t.status === "voided" ? <Pill tone="negative">Voided</Pill> : t.voidRequestedAt ? <Pill tone="warning">Void requested</Pill> : <Pill tone="positive">Posted</Pill>}
        </div>
        <p className="text-[14px] text-muted-foreground"><span className="num">{t.publicRef}</span> · <span className="num">{formatManilaDateTime(new Date(t.occurredAt))}</span> Philippine time</p>
        {t.customerId ? <p className="text-[14px]">Customer: <Link href={`/customers/${t.customerId}`} className="underline underline-offset-4">{t.customerName}</Link></p> : null}
      </header>

      <section aria-labelledby="details-title" className="rounded-card bg-surface p-5">
        <h2 id="details-title" className="sr-only">Details</h2>
        <dl className="divide-y divide-rule">
          <Row label="Amount"><Money cents={t.principalCents} /></Row>
          {t.type === "cash_in" || t.type === "cash_out" ? (
            <>
              <Row label="Service fee"><Money cents={t.feeCents} />{t.feeMode ? <span className="text-muted-foreground"> · {t.feeMode === "on_top" ? "charged on top" : "deducted from the amount"}</span> : null}</Row>
              {t.providerCostCents ? <Row label="Provider cost"><Money cents={t.providerCostCents} /></Row> : null}
            </>
          ) : null}
          {t.type === "mobile_load" ? (
            <>
              <Row label="Sold for">{t.customerPriceCents === null ? "–" : <Money cents={t.customerPriceCents} />}</Row>
              <Row label="Load cost">{t.loadCostCents === null ? "–" : <Money cents={t.loadCostCents} />}{t.loadSource ? <span className="text-muted-foreground"> · {t.loadSource === "prepaid_wallet" ? "from the load balance" : "bought from GCash"}</span> : null}</Row>
            </>
          ) : null}
          {t.creditCents ? <Row label="Left unpaid"><Money cents={t.creditCents} /></Row> : null}
          {t.paymentMethod ? <Row label="Payment">{METHOD_LABELS[t.paymentMethod] ?? t.paymentMethod}</Row> : null}
          {t.gcashReference ? <Row label="GCash reference"><span className="num">{t.gcashReference}</span></Row> : null}
          {t.adjustmentKind ? <Row label="Kind">{t.adjustmentKind.replaceAll("_", " ")}</Row> : null}
          <Row label="Recorded by">{t.recordedByName ?? "–"}</Row>
          {t.notes ? <Row label="Notes">{t.notes}</Row> : null}
          {t.voidRequestedAt ? <Row label="Void requested">{t.voidRequestedByName ?? "Someone"} on {formatManilaDateTime(new Date(t.voidRequestedAt))}: {t.voidRequestReason}</Row> : null}
          {t.voidedAt ? <Row label="Voided">{t.voidedByName ?? "The owner"} on {formatManilaDateTime(new Date(t.voidedAt))}: {t.voidReason}</Row> : null}
        </dl>
      </section>

      <section aria-labelledby="lines-title" className="rounded-card bg-surface p-5">
        <h2 id="lines-title" className="text-[16px] leading-6 font-medium">What it did to the books</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Debit (+) and credit (−) entries. A void adds a mirror image; the original entries are never changed.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-[14px]">
            <thead><tr className="text-left text-[12px] text-muted-foreground"><th className="h-9 px-3 font-normal">Entry</th><th className="px-3 font-normal">Account</th><th className="px-3 text-right font-normal">Amount</th></tr></thead>
            <tbody>
              {t.lines.map((l, i) => (
                <tr key={i} className="h-11 border-t border-rule">
                  <td className="px-3">{l.entryKind === "reversal" ? "Void (reversal)" : l.entryKind === "opening" ? "Opening" : l.entryKind === "adjustment" ? "Adjustment" : "Posting"}<span className="num text-[12px] text-muted-foreground"> · {l.entryDate}</span></td>
                  <td className="px-3">{l.account}</td>
                  <td className="num px-3 text-right"><Money cents={l.amountCents} signed /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="num mt-2 text-[12px] text-muted-foreground">Total debits <Money cents={lineTotal} /> = total credits <Money cents={lineTotal} /></p>
      </section>

      {t.debts.length > 0 || t.allocations.length > 0 ? (
        <section aria-labelledby="links-title" className="rounded-card bg-surface p-5">
          <h2 id="links-title" className="text-[16px] leading-6 font-medium">Linked debt records</h2>
          <ul className="mt-2 flex flex-col gap-1 text-[14px]">
            {t.debts.map((d) => <li key={d.debtId}>Created a debt of <Money cents={d.originalCents} /> ({d.origin === "manual" ? "cash advance" : "left unpaid"}).</li>)}
            {t.allocations.map((a) => <li key={a.debtId}>Paid <Money cents={a.amountCents} /> toward a debt{t.customerId ? <> of <Link href={`/customers/${t.customerId}`} className="underline underline-offset-4">{t.customerName}</Link></> : null}.</li>)}
          </ul>
        </section>
      ) : null}

      {open && (owner || canRequest) ? (
        <section aria-labelledby="void-title" className="rounded-card bg-surface p-5">
          <h2 id="void-title" className="text-[16px] leading-6 font-medium">{owner ? "Void this transaction" : "Ask the owner to void this"}</h2>
          <p className="mt-0.5 max-w-[60ch] text-[13px] text-muted-foreground">
            A void never deletes anything. It adds a reversing entry dated today and marks this transaction voided. Use it for mistakes.
          </p>
          <div className="mt-3">
            {owner ? (
              <ReasonForm
                action={voidTransactionAction}
                hidden={{ id: t.id }}
                label="Reason for the void"
                buttonLabel="Void transaction"
                danger
                extra={{ name: "override", label: "Override reason (only if needed)", help: "Fill this in only if the void would leave the cash drawer, GCash wallet or load balance below zero." }}
              />
            ) : t.voidRequestedAt ? (
              <p className="text-[14px] text-muted-foreground">A void has already been requested. The owner will review it.</p>
            ) : (
              <ReasonForm action={requestVoidAction} hidden={{ id: t.id }} label="What was wrong?" buttonLabel="Send void request" />
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
