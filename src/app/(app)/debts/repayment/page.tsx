import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import Link from "next/link";
import { RepaymentForm } from "@/components/ledger/debt-forms";
import { requirePermission } from "@/lib/auth/session";
import { fetchCustomersOwing, fetchOneDebt } from "@/lib/data/queries";
import { formatPesos } from "@/lib/money";
import { isUuid } from "@/lib/uuid";
import { recordRepaymentAction } from "../actions";

export const metadata: Metadata = { title: "Record repayment" };

export default async function RepaymentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("repayments.record");
  const sp = await searchParams;
  const customer = typeof sp.customer === "string" && isUuid(sp.customer) ? sp.customer : null;
  const debt = typeof sp.debt === "string" && isUuid(sp.debt) ? sp.debt : null;
  const [owing, target] = await Promise.all([fetchCustomersOwing(), debt ? fetchOneDebt(debt) : null]);
  const options = owing.flatMap((c) => c.outstandingCents !== null && c.outstandingCents > 0
    ? [{ id: c.id, name: `${c.displayName} (owes ${formatPesos(c.outstandingCents)})`, owed: c.outstandingCents }]
    : []);
  const targetCustomer = target ? options.find((c) => c.id === target.customerId) : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <PageHeading icon="debt">Record repayment</PageHeading>
        <Link href="/debts" className="text-[13px] underline underline-offset-4">Back to debts</Link>
      </header>
      <section className="rounded-card bg-surface p-5">
        {debt && (!target || target.outstandingCents <= 0) ? (
          <p className="text-[14px] text-muted-foreground">This debt is unavailable or has already been paid.</p>
        ) : options.length === 0 && !target ? (
          <p className="text-[14px] text-muted-foreground">Nobody currently owes you anything, so there is nothing to repay.</p>
        ) : (
          <RepaymentForm
            action={recordRepaymentAction}
            idempotencyKey={crypto.randomUUID()}
            customers={target ? [targetCustomer ?? { id: target.customerId, name: target.customerName, owed: null }] : options}
            selectedCustomer={target?.customerId ?? customer}
            targetDebt={target ? { id: target.debtId, owed: target.outstandingCents } : null}
          />
        )}
      </section>
    </div>
  );
}
