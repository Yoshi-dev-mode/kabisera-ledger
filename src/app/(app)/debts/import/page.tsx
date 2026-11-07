import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/page-heading";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImportDebtsForm } from "@/components/ledger/debt-forms";
import { Money } from "@/components/ledger/money";
import { requireOwner } from "@/lib/auth/session";
import { parseOpeningDebtsSeed, SeedError } from "@/lib/opening-debts";
import { importOpeningDebtsAction } from "../actions";

export const metadata: Metadata = { title: "Opening debts" };

export default async function ImportDebtsPage() {
  await requireOwner();
  let seed: ReturnType<typeof parseOpeningDebtsSeed> | null = null;
  let problem: string | null = null;
  try {
    const text = await readFile(path.join(process.cwd(), "supabase", "seed", "opening-debts.json"), "utf8");
    seed = parseOpeningDebtsSeed(JSON.parse(text));
  } catch (error) {
    problem = error instanceof SeedError ? error.message : "The opening debts file could not be read.";
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <PageHeading icon="debt">Opening debts</PageHeading>
        <p className="max-w-[65ch] text-[14px] text-muted-foreground">
          The debts you reported before using this app. They are recorded as opening balances: no date, fee, reference or
          staff member is invented, and collecting them later is never counted as income. Importing is safe to repeat; the same list is never added twice.
        </p>
        <Link href="/debts" className="text-[13px] underline underline-offset-4">Back to debts</Link>
      </header>

      {problem ? (
        <p role="alert" className="max-w-[70ch] text-[14px] text-negative">{problem}</p>
      ) : seed ? (
        <section className="rounded-card bg-surface p-5">
          <h2 className="text-[16px] leading-6 font-medium">{seed.debts.length} customers · <Money cents={seed.expectedTotalCents} /></h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Source: {seed.source} Date: unknown.</p>
          <table className="mt-3 w-full max-w-[460px] border-collapse text-[14px]">
            <thead><tr className="text-left text-[12px] text-muted-foreground"><th className="h-9 px-3 font-normal">Customer</th><th className="px-3 text-right font-normal">Owes</th></tr></thead>
            <tbody>
              {seed.debts.map((d) => (
                <tr key={d.seed_key} className="h-10 border-t border-rule">
                  <td className="px-3">{d.display_name}</td>
                  <td className="num px-3 text-right"><Money cents={d.amount_cents} /></td>
                </tr>
              ))}
              <tr className="h-11 border-t border-rule font-medium"><td className="px-3">Total</td><td className="num px-3 text-right"><Money cents={seed.expectedTotalCents} /></td></tr>
            </tbody>
          </table>
          <div className="mt-4"><ImportDebtsForm action={importOpeningDebtsAction} disabled={false} /></div>
        </section>
      ) : null}
    </div>
  );
}
