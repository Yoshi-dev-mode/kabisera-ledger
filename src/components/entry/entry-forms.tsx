"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idleState, type ActionState } from "@/lib/action-state";
import type { LoadProduct, AppSettings, ExpenseCategory } from "@/lib/data/settings";
import {
  centsToInput, previewAdjustment, previewExpense, previewLoad, previewOpening, previewService, suggestFee, suggestLoadCost, visibleCustomerOptions,
  type AdjustmentKind, type FloatName, type Preview,
} from "@/lib/entry";
import type { FeeRule } from "@/lib/fees";
import { formatPesos } from "@/lib/money";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
export type CustomerOption = { id: string; name: string };

/* ------------------------------------------------------------------ shared pieces */

function Message({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-[13px] text-negative" : "text-[13px] text-positive"}>
      {state.message}
    </p>
  );
}

function Field({ id, label, children, help }: { id: string; label: string; children: React.ReactNode; help?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">{label}</label>
      {children}
      {help ? <p className="text-[12px] text-muted-foreground">{help}</p> : null}
    </div>
  );
}

function Radio({ name, value, label, checked, onChange }: { name: string; value: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 text-[14px]">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="size-4 accent-[var(--primary)]" />
      {label}
    </label>
  );
}

/** A box that shows what the entry will do before it is saved. It runs the same rules the database applies. */
export function PreviewBox({ preview }: { preview: Preview }) {
  const rows: [string, number, boolean][] = [];
  if (preview.ok) {
    const e = preview.effects;
    if (e.cash) rows.push(["Cash drawer", e.cash, true]);
    if (e.gcash) rows.push(["GCash wallet", e.gcash, true]);
    if (e.load) rows.push(["Load balance", e.load, true]);
    if (e.owed) rows.push(["Owed to you by customers", e.owed, true]);
  }
  return (
    <section aria-label="What will happen" aria-live="polite" className="rounded-control bg-[#f6f7f9] p-4">
      <h3 className="text-[13px] font-medium">What will happen</h3>
      {preview.ok ? (
        <>
          <dl className="mt-2 flex flex-col gap-1 text-[14px]">
            {rows.map(([label, cents]) => (
              <div key={label} className="flex justify-between gap-4"><dt>{label}</dt><dd className="num">{formatPesos(cents, { signed: true })}</dd></div>
            ))}
            <div className="mt-1 flex justify-between gap-4 border-t border-border pt-2">
              <dt className="text-muted-foreground">Profit from this</dt>
              <dd className="num">{formatPesos(preview.effects.profit, { signed: true })}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[12px] text-muted-foreground">The money a customer still owes is not cash. Fees and load margin are profit; the amount itself is not.</p>
        </>
      ) : (
        <p className="mt-1 text-[13px] text-muted-foreground">{preview.message}</p>
      )}
    </section>
  );
}

/**
 * Lets you type part of a name to narrow a long list of customers.
 * The chosen customer is ALWAYS kept in the list, even when the filter no longer matches their name,
 * so typing in the filter can never silently change who a transaction is recorded for.
 */
function CustomerPicker({ customers, required, id = "customerId" }: { customers: CustomerOption[]; required?: boolean; id?: string }) {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState("");
  const shown = useMemo(() => visibleCustomerOptions(customers, filter, selected), [customers, filter, selected]);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-filter`} className="text-[13px] font-medium">Customer {required ? "" : "(optional)"}</label>
      <Input id={`${id}-filter`} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Type to find a customer" autoComplete="off" aria-controls={id} />
      <select id={id} name="customerId" value={selected} onChange={(e) => setSelected(e.target.value)} required={required} aria-label="Customer" className="h-9 rounded-control border border-input bg-surface px-2 text-[14px]">
        <option value="">{required ? "Choose a customer" : "Walk-in (no customer)"}</option>
        {shown.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {filter.trim() !== "" && shown.length === (selected ? 1 : 0) ? <p className="text-[12px] text-muted-foreground">No customer matches that name.</p> : null}
    </div>
  );
}

function OwnerOverride() {
  return (
    <details className="text-[14px]">
      <summary className="cursor-pointer text-[13px] text-muted-foreground">Owner override (only if a balance would go below zero)</summary>
      <div className="mt-2 flex max-w-[480px] flex-col gap-1.5">
        <label htmlFor="override" className="text-[13px] font-medium">Reason</label>
        <Input id="override" name="override" maxLength={300} autoComplete="off" />
        <p className="text-[12px] text-muted-foreground">Normally a balance cannot go below zero. The owner can allow it with a reason, which is kept in the audit log.</p>
      </div>
    </details>
  );
}

function Submit({ pending, label }: { pending: boolean; label: string }) {
  return <div><Button type="submit" disabled={pending}>{pending ? "Recording…" : label}</Button></div>;
}

/* ------------------------------------------------------------------ cash-in / cash-out */

export function ServiceEntryForm({ type, action, idempotencyKey, customers, rules, settings, businessDate, isOwner }: {
  type: "cash_in" | "cash_out"; action: Action; idempotencyKey: string; customers: CustomerOption[];
  rules: FeeRule[]; settings: AppSettings; businessDate: string; isOwner: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const defaultMode = type === "cash_in" ? settings.cashInMode : settings.cashOutMode;
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [feeMode, setFeeMode] = useState(defaultMode);
  const [feeTouched, setFeeTouched] = useState(false);
  const [modeTouched, setModeTouched] = useState(false);
  const [unpaid, setUnpaid] = useState("");
  const [cost, setCost] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [ruleNote, setRuleNote] = useState<string | null>(null);

  function onAmount(value: string) {
    setAmount(value);
    const s = suggestFee(rules, type, value, businessDate, settings.rounding);
    if (!feeTouched) {
      setFee(s ? centsToInput(s.feeCents) : "");
      setRuleNote(s ? `Suggested by your rule "${s.ruleName}".` : value.trim() === "" ? null : "No fee rule covers this amount. Enter the fee.");
    }
    if (s && !modeTouched) setFeeMode(s.feeMode);
  }

  const preview = previewService({ type, amount, fee, feeMode, unpaid, providerCost: cost, customerId });
  const isIn = type === "cash_in";

  return (
    <form action={formAction} className="flex max-w-[560px] flex-col gap-4" noValidate onChange={(e) => {
      const t = e.target as HTMLInputElement | HTMLSelectElement;
      if (t.name === "customerId") setCustomerId(t.value);
    }}>
      <input type="hidden" name="key" value={idempotencyKey} />
      <input type="hidden" name="type" value={type} />
      <CustomerPicker customers={customers} required={false} />
      <Field id="amount" label={isIn ? "Cash-in amount (₱)" : "Cash-out amount (₱)"} help={isIn ? "The amount the customer wants in their GCash wallet." : "The amount the customer wants in cash."}>
        <Input id="amount" name="amount" inputMode="decimal" autoComplete="off" required placeholder="0.00" value={amount} onChange={(e) => onAmount(e.target.value)} />
      </Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="pb-1 text-[13px] font-medium">How is the fee charged?</legend>
        <div className="flex flex-col gap-1.5">
          <Radio name="feeMode" value="on_top" label={isIn ? "On top: the customer pays the amount plus the fee" : "On top: the customer sends the amount plus the fee"} checked={feeMode === "on_top"} onChange={() => { setFeeMode("on_top"); setModeTouched(true); }} />
          <Radio name="feeMode" value="deducted" label={isIn ? "Deducted: the customer receives the amount minus the fee" : "Deducted: the customer receives the amount minus the fee"} checked={feeMode === "deducted"} onChange={() => { setFeeMode("deducted"); setModeTouched(true); }} />
        </div>
      </fieldset>
      <Field id="fee" label="Service fee (₱)" help={ruleNote ?? "Leave blank for no fee."}>
        <Input id="fee" name="fee" inputMode="decimal" autoComplete="off" placeholder="0.00" value={fee} onChange={(e) => { setFee(e.target.value); setFeeTouched(true); }} />
      </Field>
      {isIn ? (
        <Field id="unpaid" label="Left unpaid (₱, optional)" help="If the customer will pay later, enter how much. It becomes a debt (utang) and needs a customer.">
          <Input id="unpaid" name="unpaid" inputMode="decimal" autoComplete="off" placeholder="0.00" value={unpaid} onChange={(e) => setUnpaid(e.target.value)} />
        </Field>
      ) : null}
      <Field id="gcashReference" label={settings.requireGcashReference ? "GCash reference number (required)" : "GCash reference number (optional)"}>
        <Input id="gcashReference" name="gcashReference" maxLength={64} autoComplete="off" required={settings.requireGcashReference} />
      </Field>
      <details className="text-[14px]">
        <summary className="cursor-pointer text-[13px] text-muted-foreground">More: provider cost, notes</summary>
        <div className="mt-3 flex flex-col gap-4">
          <Field id="providerCost" label="Provider cost (₱, optional)" help="What GCash charged you for this, paid from your wallet.">
            <Input id="providerCost" name="providerCost" inputMode="decimal" autoComplete="off" placeholder="0.00" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <Field id="notes" label="Notes (optional)"><Input id="notes" name="notes" maxLength={500} autoComplete="off" /></Field>
        </div>
      </details>
      {isOwner ? <OwnerOverride /> : null}
      <PreviewBox preview={preview} />
      <Message state={state} />
      <Submit pending={pending} label={isIn ? "Record cash-in" : "Record cash-out"} />
    </form>
  );
}

/* ------------------------------------------------------------------ mobile load */

export function LoadEntryForm({ action, idempotencyKey, customers, products, settings, isOwner }: {
  action: Action; idempotencyKey: string; customers: CustomerOption[]; products: LoadProduct[]; settings: AppSettings; isOwner: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const [productId, setProductId] = useState("");
  const [source, setSource] = useState<"gcash_direct" | "prepaid_wallet">("prepaid_wallet");
  const [face, setFace] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [payment, setPayment] = useState<"cash" | "gcash">("cash");
  const [unpaid, setUnpaid] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [costTouched, setCostTouched] = useState(false);
  const product = products.find((p) => p.id === productId) ?? null;

  function onFace(value: string) {
    setFace(value);
    const s = suggestLoadCost(value, product?.costBpsOfFace ?? null, settings.rounding);
    if (!costTouched && s !== null) setCost(centsToInput(s));
  }
  function onProduct(id: string) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p) {
      setSource(p.defaultSource);
      const s = suggestLoadCost(face, p.costBpsOfFace, settings.rounding);
      if (!costTouched && s !== null) setCost(centsToInput(s));
    }
  }

  const preview = previewLoad({ face, cost, price, source, payment, unpaid, customerId });

  return (
    <form action={formAction} className="flex max-w-[560px] flex-col gap-4" noValidate onChange={(e) => {
      const t = e.target as HTMLInputElement | HTMLSelectElement;
      if (t.name === "customerId") setCustomerId(t.value);
    }}>
      <input type="hidden" name="key" value={idempotencyKey} />
      <CustomerPicker customers={customers} required={false} />
      <Field id="productId" label="Product (optional)">
        <select id="productId" name="productId" value={productId} onChange={(e) => onProduct(e.target.value)} className="h-9 rounded-control border border-input bg-surface px-2 text-[14px]">
          <option value="">Other</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.network}: {p.label}</option>)}
        </select>
      </Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="pb-1 text-[13px] font-medium">Where did the load come from?</legend>
        <div className="flex flex-col gap-1.5">
          <Radio name="source" value="prepaid_wallet" label="My load balance" checked={source === "prepaid_wallet"} onChange={() => setSource("prepaid_wallet")} />
          <Radio name="source" value="gcash_direct" label="Bought straight from GCash for this customer" checked={source === "gcash_direct"} onChange={() => setSource("gcash_direct")} />
        </div>
      </fieldset>
      <Field id="face" label="Load amount (₱)"><Input id="face" name="face" inputMode="decimal" autoComplete="off" required placeholder="0.00" value={face} onChange={(e) => onFace(e.target.value)} /></Field>
      <Field id="cost" label="What it cost you (₱)" help={product?.costBpsOfFace ? "Suggested from the product. Change it if the cost was different." : "Required: it is what leaves your balance and decides your margin."}>
        <Input id="cost" name="cost" inputMode="decimal" autoComplete="off" required placeholder="0.00" value={cost} onChange={(e) => { setCost(e.target.value); setCostTouched(true); }} />
      </Field>
      <Field id="price" label="Selling price (₱)"><Input id="price" name="price" inputMode="decimal" autoComplete="off" required placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="pb-1 text-[13px] font-medium">Paid now by</legend>
        <div className="flex gap-5">
          <Radio name="payment" value="cash" label="Cash" checked={payment === "cash"} onChange={() => setPayment("cash")} />
          <Radio name="payment" value="gcash" label="GCash" checked={payment === "gcash"} onChange={() => setPayment("gcash")} />
        </div>
      </fieldset>
      <Field id="unpaid" label="Left unpaid (₱, optional)" help="Becomes a debt and needs a customer.">
        <Input id="unpaid" name="unpaid" inputMode="decimal" autoComplete="off" placeholder="0.00" value={unpaid} onChange={(e) => setUnpaid(e.target.value)} />
      </Field>
      <Field id="gcashReference" label="GCash reference number (optional)"><Input id="gcashReference" name="gcashReference" maxLength={64} autoComplete="off" /></Field>
      <Field id="notes" label="Notes (optional)"><Input id="notes" name="notes" maxLength={500} autoComplete="off" /></Field>
      {isOwner ? <OwnerOverride /> : null}
      <PreviewBox preview={preview} />
      <Message state={state} />
      <Submit pending={pending} label="Record mobile load" />
    </form>
  );
}

/* ------------------------------------------------------------------ owner-only entries */

export function ExpenseEntryForm({ action, idempotencyKey, categories }: { action: Action; idempotencyKey: string; categories: ExpenseCategory[] }) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "gcash">("cash");
  const preview = previewExpense({ amount, method });
  return (
    <form action={formAction} className="flex max-w-[560px] flex-col gap-4" noValidate>
      <input type="hidden" name="key" value={idempotencyKey} />
      <Field id="categoryId" label="Category (optional)" help={categories.length === 0 ? "Add categories in Settings." : undefined}>
        <select id="categoryId" name="categoryId" defaultValue="" className="h-9 rounded-control border border-input bg-surface px-2 text-[14px]">
          <option value="">No category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field id="amount" label="Amount (₱)"><Input id="amount" name="amount" inputMode="decimal" autoComplete="off" required placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="pb-1 text-[13px] font-medium">Paid from</legend>
        <div className="flex gap-5">
          <Radio name="method" value="cash" label="Cash drawer" checked={method === "cash"} onChange={() => setMethod("cash")} />
          <Radio name="method" value="gcash" label="GCash wallet" checked={method === "gcash"} onChange={() => setMethod("gcash")} />
        </div>
      </fieldset>
      <Field id="notes" label="Notes (optional)"><Input id="notes" name="notes" maxLength={500} autoComplete="off" /></Field>
      <OwnerOverride />
      <PreviewBox preview={preview} />
      <Message state={state} />
      <Submit pending={pending} label="Record expense" />
    </form>
  );
}

const KIND_LABELS: Record<AdjustmentKind, string> = {
  transfer_cash_to_gcash: "Move cash from the drawer into the GCash wallet",
  transfer_gcash_to_cash: "Move money from the GCash wallet into the drawer",
  load_topup: "Buy load balance",
  capital_contribution: "Owner adds money to the business",
  capital_withdrawal: "Owner takes money out of the business",
};

export function AdjustmentEntryForm({ action, idempotencyKey }: { action: Action; idempotencyKey: string }) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const [kind, setKind] = useState<AdjustmentKind>("transfer_cash_to_gcash");
  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState<FloatName>("CASH_DRAWER");
  const needsAccount = kind === "load_topup" || kind === "capital_contribution" || kind === "capital_withdrawal";
  const accountOptions: [FloatName, string][] =
    kind === "load_topup" ? [["CASH_DRAWER", "Cash drawer"], ["GCASH_WALLET", "GCash wallet"]]
    : [["CASH_DRAWER", "Cash drawer"], ["GCASH_WALLET", "GCash wallet"], ["LOAD_BALANCE", "Load balance"]];
  const effective = accountOptions.some(([v]) => v === account) ? account : accountOptions[0]![0];
  const preview = previewAdjustment({ kind, amount, account: effective });
  return (
    <form action={formAction} className="flex max-w-[560px] flex-col gap-4" noValidate>
      <input type="hidden" name="key" value={idempotencyKey} />
      <Field id="kind" label="What happened">
        <select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as AdjustmentKind)} className="h-9 rounded-control border border-input bg-surface px-2 text-[14px]">
          {(Object.keys(KIND_LABELS) as AdjustmentKind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
        </select>
      </Field>
      {needsAccount ? (
        <Field id="account" label={kind === "load_topup" ? "Paid with" : kind === "capital_contribution" ? "Money went into" : "Money came out of"}>
          <select id="account" name="account" value={effective} onChange={(e) => setAccount(e.target.value as FloatName)} className="h-9 rounded-control border border-input bg-surface px-2 text-[14px]">
            {accountOptions.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </Field>
      ) : null}
      <Field id="amount" label="Amount (₱)"><Input id="amount" name="amount" inputMode="decimal" autoComplete="off" required placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field id="notes" label="Notes (optional)"><Input id="notes" name="notes" maxLength={500} autoComplete="off" /></Field>
      <OwnerOverride />
      <PreviewBox preview={preview} />
      <Message state={state} />
      <Submit pending={pending} label="Record adjustment" />
    </form>
  );
}

export function OpeningBalancesForm({ action, idempotencyKey }: { action: Action; idempotencyKey: string }) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const [cash, setCash] = useState("");
  const [gcash, setGcash] = useState("");
  const [load, setLoad] = useState("");
  const preview = previewOpening({ cash, gcash, load });
  return (
    <form action={formAction} className="flex max-w-[560px] flex-col gap-4" noValidate>
      <input type="hidden" name="key" value={idempotencyKey} />
      <p className="max-w-[60ch] text-[14px] text-muted-foreground">
        Count what you really have right now and enter it. Nothing is assumed: your reported starting capital is not used as a balance. This can be entered once; if you get it wrong, the owner can void it and enter it again.
      </p>
      <Field id="cash" label="Cash in the drawer (₱)"><Input id="cash" name="cash" inputMode="decimal" autoComplete="off" placeholder="0.00" value={cash} onChange={(e) => setCash(e.target.value)} /></Field>
      <Field id="gcash" label="GCash wallet balance (₱)"><Input id="gcash" name="gcash" inputMode="decimal" autoComplete="off" placeholder="0.00" value={gcash} onChange={(e) => setGcash(e.target.value)} /></Field>
      <Field id="load" label="Load balance (₱)"><Input id="load" name="load" inputMode="decimal" autoComplete="off" placeholder="0.00" value={load} onChange={(e) => setLoad(e.target.value)} /></Field>
      <Field id="asOf" label="Counted on (optional, defaults to now)"><Input id="asOf" name="asOf" type="date" /></Field>
      <Field id="notes" label="Notes (optional)"><Input id="notes" name="notes" maxLength={500} autoComplete="off" /></Field>
      <PreviewBox preview={preview} />
      <Message state={state} />
      <Submit pending={pending} label="Save opening balances" />
    </form>
  );
}
