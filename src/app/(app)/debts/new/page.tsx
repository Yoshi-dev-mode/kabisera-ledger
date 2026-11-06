import type { Metadata } from "next";
import Link from "next/link";
import { NewDebtForm } from "@/components/ledger/debt-forms";
import { requirePermission } from "@/lib/auth/session";
import { fetchActiveCustomers } from "@/lib/data/queries";
import { isUuid } from "@/lib/uuid";
import { createDebtAction } from "../actions";

export const metadata: Metadata = { title: "New cash advance" };

export default async function NewDebtPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("transactions.record");
  const sp = await searchParams;
  const customer = typeof sp.customer === "string" && isUuid(sp.customer) ? sp.customer : null;
  const customers = (await fetchActiveCustomers()).map((c) => ({ id: c.id, name: c.displayName }));
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[24px] leading-8 font-medium">New cash advance</h1>
        <p className="max-w-[60ch] text-[14px] text-muted-foreground">Money you hand over that the customer will pay back. It leaves your drawer or wallet and becomes a debt.</p>
        <Link href="/debts" className="text-[13px] underline underline-offset-4">Back to debts</Link>
      </header>
      <section className="rounded-card bg-surface p-5">
        {customers.length === 0 ? (
          <p className="text-[14px] text-muted-foreground">There are no customers yet. Add a customer first.</p>
        ) : (
          <NewDebtForm action={createDebtAction} idempotencyKey={crypto.randomUUID()} customers={customers} selectedCustomer={customer} />
        )}
      </section>
    </div>
  );
}
