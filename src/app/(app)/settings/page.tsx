import type { Metadata } from "next";
import { Money } from "@/components/ledger/money";
import { PageHeading } from "@/components/shell/page-heading";
import { Pill } from "@/components/ui/pill";
import { CategoryForm, FeeRuleForm, LoadProductForm, RulesForm, ThresholdsForm } from "@/components/settings/settings-forms";
import { requireOwner } from "@/lib/auth/session";
import { fetchCategories, fetchFeeRules, fetchLoadProducts, fetchSettings, fetchThresholds } from "@/lib/data/queries";
import { bpsToPercentText } from "@/lib/forms";
import { todayBusinessDate } from "@/lib/time";
import { saveCategoryAction, saveFeeRuleAction, saveLoadProductAction, saveRulesAction, saveThresholdsAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-card bg-surface p-5">
      <h2 id={id} className="text-[16px] leading-6 font-medium">{title}</h2>
      {intro ? <p className="mt-0.5 max-w-[65ch] text-[13px] text-muted-foreground">{intro}</p> : null}
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  await requireOwner();
  const today = todayBusinessDate();
  const [settings, rules, products, categories, thresholds] = await Promise.all([
    fetchSettings(), fetchFeeRules({ activeOnly: false }), fetchLoadProducts({ activeOnly: false }),
    fetchCategories({ activeOnly: false }), fetchThresholds(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <PageHeading icon="settings">Settings</PageHeading>
        <p className="max-w-[65ch] text-[14px] text-muted-foreground">
          Changes apply to new transactions only. Every transaction keeps the fee and fee mode it was recorded with, so changing a rule never rewrites history.
        </p>
      </header>

      <Section id="rules" title="Fee and balance rules">
        <RulesForm action={saveRulesAction} settings={settings} />
      </Section>

      <Section id="fees" title="Fee rules" intro="Suggested fees for cash-in and cash-out. A rule can be a flat fee, a percentage, or both, for a range of amounts and a range of dates. Two active rules cannot cover the same amount on the same day. The person recording can always change the suggested fee.">
        {rules.length === 0 ? <p className="text-[14px] text-muted-foreground">No fee rules yet, so fees are typed in by hand. Add one to have fees suggested.</p> : (
          <ul className="flex flex-col divide-y divide-border">
            {rules.map((r) => (
              <li key={r.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-[14px]">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-muted-foreground">{r.serviceType === "cash_in" ? "Cash-in" : "Cash-out"} · {r.feeMode === "on_top" ? "on top" : "deducted"} · from <Money cents={r.minAmountCents} />{r.maxAmountCents !== null ? <> to <Money cents={r.maxAmountCents} /></> : " and up"}</span>
                    <span className="num text-muted-foreground">{r.flatFeeCents ? <Money cents={r.flatFeeCents} /> : null}{r.flatFeeCents && r.percentBps ? " + " : ""}{r.percentBps ? `${bpsToPercentText(r.percentBps)}%` : ""}{!r.flatFeeCents && !r.percentBps ? "no fee" : ""}</span>
                    <span className="ml-auto">{r.isActive ? <Pill tone="positive">Active</Pill> : <Pill>Inactive</Pill>}</span>
                  </summary>
                  <div className="pt-4"><FeeRuleForm action={saveFeeRuleAction} rule={r} today={today} /></div>
                </details>
              </li>
            ))}
          </ul>
        )}
        <details className="rounded-control border border-border p-4">
          <summary className="cursor-pointer text-[14px] font-medium">Add a fee rule</summary>
          <div className="pt-4"><FeeRuleForm action={saveFeeRuleAction} today={today} /></div>
        </details>
      </Section>

      <Section id="load" title="Mobile load products" intro="The networks and products you sell. A configured cost percentage sets the business cost for that product. Without one, the load amount is used as the cost.">
        {products.length === 0 ? <p className="text-[14px] text-muted-foreground">No products yet. You can still record a load sale by typing its cost.</p> : (
          <ul className="flex flex-col divide-y divide-border">
            {products.map((p) => (
              <li key={p.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 text-[14px]">
                    <span className="font-medium">{p.network}: {p.label}</span>
                    <span className="text-muted-foreground">{p.costBpsOfFace ? `you pay ${bpsToPercentText(p.costBpsOfFace)}%` : "cost typed per sale"}</span>
                    <span className="ml-auto">{p.isActive ? <Pill tone="positive">Active</Pill> : <Pill>Inactive</Pill>}</span>
                  </summary>
                  <div className="pt-4"><LoadProductForm action={saveLoadProductAction} product={p} /></div>
                </details>
              </li>
            ))}
          </ul>
        )}
        <details className="rounded-control border border-border p-4">
          <summary className="cursor-pointer text-[14px] font-medium">Add a product</summary>
          <div className="pt-4"><LoadProductForm action={saveLoadProductAction} /></div>
        </details>
      </Section>

      <Section id="categories" title="Expense categories">
        {categories.length > 0 ? <ul className="flex flex-col gap-3">{categories.map((c) => <li key={c.id}><CategoryForm action={saveCategoryAction} category={c} /></li>)}</ul> : <p className="text-[14px] text-muted-foreground">No categories yet.</p>}
        <CategoryForm action={saveCategoryAction} />
      </Section>

      <Section id="levels" title="Low-balance warnings" intro="The dashboard warns you when a balance falls below the level you set.">
        <ThresholdsForm action={saveThresholdsAction} thresholds={thresholds} />
      </Section>
    </div>
  );
}
