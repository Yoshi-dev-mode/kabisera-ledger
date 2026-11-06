"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idleState, type ActionState } from "@/lib/action-state";
import type { AccountThreshold, AppSettings, ExpenseCategory, LoadProduct } from "@/lib/data/settings";
import { centsToInput } from "@/lib/entry";
import type { FeeRule } from "@/lib/fees";
import { bpsToPercentText } from "@/lib/forms";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

function Msg({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-[13px] text-negative" : "text-[13px] text-positive"}>{state.message}</p>;
}

function F({ id, label, help, children }: { id: string; label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">{label}</label>
      {children}
      {help ? <p className="text-[12px] text-muted-foreground">{help}</p> : null}
    </div>
  );
}

const selectClass = "h-9 rounded-control border border-input bg-surface px-2 text-[14px]";
const check = "size-4 accent-[var(--primary)]";

export function RulesForm({ action, settings }: { action: Action; settings: AppSettings }) {
  const [state, formAction, pending] = useActionState(action, idleState);
  return (
    <form action={formAction} className="flex max-w-[560px] flex-col gap-4" noValidate>
      <F id="cashInMode" label="Cash-in fee, unless a fee rule says otherwise">
        <select id="cashInMode" name="cashInMode" defaultValue={settings.cashInMode} className={selectClass}>
          <option value="on_top">On top: the customer pays the amount plus the fee</option>
          <option value="deducted">Deducted: the customer receives the amount minus the fee</option>
        </select>
      </F>
      <F id="cashOutMode" label="Cash-out fee, unless a fee rule says otherwise">
        <select id="cashOutMode" name="cashOutMode" defaultValue={settings.cashOutMode} className={selectClass}>
          <option value="on_top">On top: the customer sends the amount plus the fee</option>
          <option value="deducted">Deducted: the customer receives the amount minus the fee</option>
        </select>
      </F>
      <F id="rounding" label="Rounding of percentage fees" help="Applies when a percentage gives a fraction of a centavo.">
        <select id="rounding" name="rounding" defaultValue={settings.rounding} className={selectClass}>
          <option value="half_up">Half up (normal rounding)</option>
          <option value="down">Always down</option>
          <option value="up">Always up</option>
        </select>
      </F>
      <label className="flex items-start gap-2.5 text-[14px]"><input type="checkbox" name="allowNegative" defaultChecked={settings.allowNegativeFloats} className={`${check} mt-[3px]`} />
        <span>Allow cash, GCash and load balances to go below zero<span className="block text-[12px] text-muted-foreground">Leave this off. With it off, the owner can still override a single transaction with a reason.</span></span></label>
      <label className="flex items-start gap-2.5 text-[14px]"><input type="checkbox" name="requireReference" defaultChecked={settings.requireGcashReference} className={`${check} mt-[3px]`} />
        <span>Require a GCash reference number on every cash-in and cash-out</span></label>
      <Msg state={state} />
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save rules"}</Button></div>
    </form>
  );
}

export function FeeRuleForm({ action, rule, today }: { action: Action; rule?: FeeRule; today: string }) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const k = rule?.id ?? "new";
  return (
    <form action={formAction} className="flex max-w-[560px] flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={rule?.id ?? ""} />
      <F id={`name-${k}`} label="Name"><Input id={`name-${k}`} name="name" defaultValue={rule?.name ?? ""} maxLength={80} required autoComplete="off" /></F>
      <div className="grid gap-4 sm:grid-cols-2">
        <F id={`service-${k}`} label="For">
          <select id={`service-${k}`} name="service" defaultValue={rule?.serviceType ?? "cash_in"} className={selectClass}>
            <option value="cash_in">Cash-in</option><option value="cash_out">Cash-out</option>
          </select>
        </F>
        <F id={`mode-${k}`} label="Fee is">
          <select id={`mode-${k}`} name="mode" defaultValue={rule?.feeMode ?? "on_top"} className={selectClass}>
            <option value="on_top">Charged on top</option><option value="deducted">Deducted from the amount</option>
          </select>
        </F>
        <F id={`min-${k}`} label="Amounts from (₱)"><Input id={`min-${k}`} name="min" inputMode="decimal" defaultValue={rule ? centsToInput(rule.minAmountCents) : "0.00"} autoComplete="off" /></F>
        <F id={`max-${k}`} label="Up to, not including (₱)" help="Leave empty for no upper limit."><Input id={`max-${k}`} name="max" inputMode="decimal" defaultValue={rule?.maxAmountCents != null ? centsToInput(rule.maxAmountCents) : ""} autoComplete="off" /></F>
        <F id={`flat-${k}`} label="Flat fee (₱)"><Input id={`flat-${k}`} name="flat" inputMode="decimal" defaultValue={rule ? centsToInput(rule.flatFeeCents) : ""} placeholder="0.00" autoComplete="off" /></F>
        <F id={`percent-${k}`} label="Plus a percentage of the amount (%)" help="For example 2 or 1.5. A rule can have a flat fee, a percentage, or both."><Input id={`percent-${k}`} name="percent" inputMode="decimal" defaultValue={rule && rule.percentBps ? bpsToPercentText(rule.percentBps) : ""} placeholder="0" autoComplete="off" /></F>
        <F id={`from-${k}`} label="Starts on"><Input id={`from-${k}`} name="from" type="date" defaultValue={rule?.effectiveFrom ?? today} required /></F>
        <F id={`to-${k}`} label="Ends before (optional)"><Input id={`to-${k}`} name="to" type="date" defaultValue={rule?.effectiveTo ?? ""} /></F>
      </div>
      <label className="flex items-center gap-2.5 text-[14px]"><input type="checkbox" name="active" defaultChecked={rule?.isActive ?? true} className={check} /> Active</label>
      <Msg state={state} />
      <div><Button type="submit" variant={rule ? "outline" : "default"} disabled={pending}>{pending ? "Saving…" : rule ? "Save changes" : "Add rule"}</Button></div>
    </form>
  );
}

export function LoadProductForm({ action, product }: { action: Action; product?: LoadProduct }) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const k = product?.id ?? "new";
  return (
    <form action={formAction} className="flex max-w-[560px] flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <F id={`net-${k}`} label="Network"><Input id={`net-${k}`} name="network" defaultValue={product?.network ?? ""} maxLength={40} required autoComplete="off" /></F>
        <F id={`label-${k}`} label="Product"><Input id={`label-${k}`} name="label" defaultValue={product?.label ?? ""} maxLength={80} required autoComplete="off" /></F>
        <F id={`source-${k}`} label="Usually comes from">
          <select id={`source-${k}`} name="source" defaultValue={product?.defaultSource ?? "prepaid_wallet"} className={selectClass}>
            <option value="prepaid_wallet">My load balance</option><option value="gcash_direct">Bought from GCash per sale</option>
          </select>
        </F>
        <F id={`cost-${k}`} label="You pay (% of the load amount)" help="For example 97 if 100 of load costs you 97. Leave empty to type the cost on every sale."><Input id={`cost-${k}`} name="cost" inputMode="decimal" defaultValue={product?.costBpsOfFace ? bpsToPercentText(product.costBpsOfFace) : ""} autoComplete="off" /></F>
      </div>
      <label className="flex items-center gap-2.5 text-[14px]"><input type="checkbox" name="active" defaultChecked={product?.isActive ?? true} className={check} /> Active</label>
      <Msg state={state} />
      <div><Button type="submit" variant={product ? "outline" : "default"} disabled={pending}>{pending ? "Saving…" : product ? "Save changes" : "Add product"}</Button></div>
    </form>
  );
}

export function CategoryForm({ action, category }: { action: Action; category?: ExpenseCategory }) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const k = category?.id ?? "new";
  return (
    <form action={formAction} className="flex max-w-[460px] flex-wrap items-end gap-3" noValidate>
      <input type="hidden" name="id" value={category?.id ?? ""} />
      <F id={`cat-${k}`} label={category ? "Name" : "New category"}><Input id={`cat-${k}`} name="name" defaultValue={category?.name ?? ""} maxLength={80} required autoComplete="off" /></F>
      {category ? <label className="flex h-9 items-center gap-2 text-[14px]"><input type="checkbox" name="active" defaultChecked={category.isActive} className={check} /> Active</label> : null}
      <Button type="submit" variant={category ? "outline" : "default"} size="sm" disabled={pending}>{pending ? "Saving…" : category ? "Save" : "Add"}</Button>
      <div className="basis-full"><Msg state={state} /></div>
    </form>
  );
}

export function ThresholdsForm({ action, thresholds }: { action: Action; thresholds: AccountThreshold[] }) {
  const [state, formAction, pending] = useActionState(action, idleState);
  return (
    <form action={formAction} className="flex max-w-[460px] flex-col gap-4" noValidate>
      {thresholds.map((t) => (
        <F key={t.code} id={`t-${t.code}`} label={`${t.name}: warn me when it is below (₱)`}>
          <Input id={`t-${t.code}`} name={`t_${t.code}`} inputMode="decimal" defaultValue={t.thresholdCents === null ? "" : centsToInput(t.thresholdCents)} placeholder="No warning" autoComplete="off" />
        </F>
      ))}
      <p className="text-[12px] text-muted-foreground">Leave a box empty for no warning. These are your own levels; nothing is assumed.</p>
      <Msg state={state} />
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save warning levels"}</Button></div>
    </form>
  );
}
