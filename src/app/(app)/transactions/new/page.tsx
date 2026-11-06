import type { Metadata } from "next";
import Link from "next/link";
import {
  AdjustmentEntryForm, ExpenseEntryForm, LoadEntryForm, OpeningBalancesForm, ServiceEntryForm,
} from "@/components/entry/entry-forms";
import { requirePermission } from "@/lib/auth/session";
import {
  fetchActiveCustomers, fetchCategories, fetchFeeRules, fetchLoadProducts, fetchSettings,
} from "@/lib/data/queries";
import { todayBusinessDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { postAdjustmentAction, postExpenseAction, postLoadAction, postOpeningAction, postServiceAction } from "./actions";

export const metadata: Metadata = { title: "New transaction" };

type TabId = "cash_in" | "cash_out" | "mobile_load" | "expense" | "adjustment" | "opening";
const STAFF_TABS: { id: TabId; label: string }[] = [
  { id: "cash_in", label: "Cash-in" },
  { id: "cash_out", label: "Cash-out" },
  { id: "mobile_load", label: "Mobile load" },
];
const OWNER_TABS: { id: TabId; label: string }[] = [
  { id: "expense", label: "Expense" },
  { id: "adjustment", label: "Move or add money" },
  { id: "opening", label: "Opening balances" },
];

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile } = await requirePermission("transactions.record");
  const owner = profile.role === "owner";
  const tabs = owner ? [...STAFF_TABS, ...OWNER_TABS] : STAFF_TABS;
  const sp = await searchParams;
  const asked = typeof sp.type === "string" ? sp.type : "";
  const type: TabId = tabs.some((t) => t.id === asked) ? (asked as TabId) : "cash_in";
  const key = crypto.randomUUID();

  const needsCustomers = type === "cash_in" || type === "cash_out" || type === "mobile_load";
  const [settings, customers, rules, products, categories] = await Promise.all([
    fetchSettings(),
    needsCustomers ? fetchActiveCustomers() : Promise.resolve([]),
    type === "cash_in" || type === "cash_out" ? fetchFeeRules({ activeOnly: true }) : Promise.resolve([]),
    type === "mobile_load" ? fetchLoadProducts({ activeOnly: true }) : Promise.resolve([]),
    type === "expense" ? fetchCategories({ activeOnly: true }) : Promise.resolve([]),
  ]);
  const options = customers.map((c) => ({ id: c.id, name: c.displayName }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-[24px] leading-8 font-medium">New transaction</h1>
        <nav aria-label="Transaction type" className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={`/transactions/new?type=${t.id}`}
              aria-current={t.id === type ? "page" : undefined}
              className={cn("inline-flex h-9 items-center rounded-control px-3 text-[14px]", t.id === type ? "bg-primary text-primary-foreground" : "bg-surface hover:bg-muted")}
            >
              {t.label}
            </Link>
          ))}
          <Link href="/debts/new" className="inline-flex h-9 items-center rounded-control bg-surface px-3 text-[14px] hover:bg-muted">Cash advance</Link>
        </nav>
      </header>

      <section aria-label="Transaction form" className="rounded-card bg-surface p-5">
        {type === "cash_in" || type === "cash_out" ? (
          <ServiceEntryForm key={type} type={type} action={postServiceAction} idempotencyKey={key} customers={options} rules={rules} settings={settings} businessDate={todayBusinessDate()} isOwner={owner} />
        ) : type === "mobile_load" ? (
          <LoadEntryForm action={postLoadAction} idempotencyKey={key} customers={options} products={products} settings={settings} isOwner={owner} />
        ) : type === "expense" ? (
          <ExpenseEntryForm action={postExpenseAction} idempotencyKey={key} categories={categories} />
        ) : type === "adjustment" ? (
          <AdjustmentEntryForm action={postAdjustmentAction} idempotencyKey={key} />
        ) : (
          <OpeningBalancesForm action={postOpeningAction} idempotencyKey={key} />
        )}
      </section>
    </div>
  );
}
