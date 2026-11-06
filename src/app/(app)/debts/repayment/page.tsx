import type { Metadata } from "next";
import Link from "next/link";
import { RepaymentForm } from "@/components/ledger/debt-forms";
import { requirePermission } from "@/lib/auth/session";
import { fetchCustomersOwing } from "@/lib/data/queries";
import { formatPesos } from "@/lib/money";
import { isUuid } from "@/lib/uuid";
import { recordRepaymentAction } from "../actions";

export const metadata: Metadata = { title: "Record repayment" };

export default async function RepaymentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("repayments.record");
  const sp = await searchParams;
  const customer = typeof sp.customer === "string" && isUuid(sp.customer) ? sp.customer : null;
  const debt = typeof sp.debt === "string" && isUuid(sp.debt) ? sp.debt : null;
  const owing = await fetchCustomersOwing();
  const options = owing.map((c) => ({ id: c.id, name: `${c.displayName} (owes ${formatPesos(c.outstandingCents ?? 0)})` }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[24px] leading-8 font-medium">Record repayment</h1>
        <Link href="/debts" className="text-[13px] underline underline-offset-4">Back to debts</Link>
      </header>
      <section className="rounded-card bg-surface p-5">
        {options.length === 0 ? (
          <p className="text-[14px] text-muted-foreground">Nobody currently owes you anything, so there is nothing to repay.</p>
        ) : (
          <RepaymentForm action={recordRepaymentAction} idempotencyKey={crypto.randomUUID()} customers={options} selectedCustomer={customer} debtId={debt} />
        )}
      </section>
    </div>
  );
}
