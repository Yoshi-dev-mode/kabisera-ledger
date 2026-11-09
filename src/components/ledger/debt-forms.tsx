"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idleState, type ActionState } from "@/lib/action-state";
import { optionalCents } from "@/lib/entry";
import { formatPesos, MAX_CENTAVOS } from "@/lib/money";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type CustomerOption = { id: string; name: string; owed?: number | null };

function Message({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-[13px] text-negative" : "text-[13px] text-positive"}>
      {state.message}
    </p>
  );
}

function MethodChoice({ legend, name = "method" }: { legend: string; name?: string }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="pb-1 text-[13px] font-medium">{legend}</legend>
      <div className="flex gap-5 text-[14px]">
        <label className="flex items-center gap-2"><input type="radio" name={name} value="cash" defaultChecked className="size-4 accent-[var(--primary)]" /> Cash</label>
        <label className="flex items-center gap-2"><input type="radio" name={name} value="gcash" className="size-4 accent-[var(--primary)]" /> GCash</label>
      </div>
    </fieldset>
  );
}

/** Records money received against what a customer owes. `idempotencyKey` is created when the page loads, so a double click posts once. */
export function RepaymentForm({ action, idempotencyKey, customers, selectedCustomer, targetDebt }: {
  action: Action; idempotencyKey: string; customers: CustomerOption[]; selectedCustomer: string | null;
  targetDebt: { id: string; owed: number } | null;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const [customerId, setCustomerId] = useState(customers.some((c) => c.id === selectedCustomer) ? selectedCustomer ?? "" : "");
  const [amount, setAmount] = useState("");
  const [tip, setTip] = useState("");
  const [method, setMethod] = useState<"cash" | "gcash">("cash");
  const paymentCents = optionalCents(amount);
  const tipCents = optionalCents(tip);
  const totalReceived = paymentCents === null || tipCents === null ? null : paymentCents + tipCents;
  const totalTooLarge = totalReceived !== null && totalReceived > MAX_CENTAVOS;
  const customerOwed = customers.find((c) => c.id === customerId)?.owed ?? null;
  const paymentLimit = targetDebt?.owed ?? customerOwed;
  const remainingBase = customerOwed ?? targetDebt?.owed ?? null;
  const overpayment = paymentCents !== null && paymentLimit !== null && paymentCents > paymentLimit;
  const validPayment = paymentCents !== null && paymentCents > 0 && !overpayment;
  return (
    <form action={formAction} className="flex max-w-[520px] flex-col gap-4" noValidate>
      <input type="hidden" name="key" value={idempotencyKey} />
      {targetDebt ? <input type="hidden" name="debtId" value={targetDebt.id} /> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="customerId" className="text-[13px] font-medium">Customer</label>
        <select id="customerId" name="customerId" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required className="h-9 rounded-control border border-input bg-surface px-2 text-[14px]">
          <option value="" disabled>Choose who is paying</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="amount" className="text-[13px] font-medium">Debt payment (₱)</label>
        <Input id="amount" name="amount" inputMode="decimal" autoComplete="off" required placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby="repayment-amount-help" />
        <p id="repayment-amount-help" className="text-[12px] text-muted-foreground">{targetDebt ? `Applied to the selected debt (up to ${formatPesos(targetDebt.owed)}).` : "Applied to the oldest unpaid debt first."}</p>
        {overpayment && <p role="alert" className="text-negative">Enter {formatPesos(paymentLimit)} or less as the debt payment. If the customer gave extra voluntarily, enter it in Tip.</p>}
        {amount.trim() && !validPayment && !overpayment ? <p role="alert" className="text-negative">Enter a valid debt payment greater than zero.</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tip" className="text-[13px] font-medium">Tip (₱, optional)</label>
        <Input id="tip" name="tip" inputMode="decimal" autoComplete="off" placeholder="0.00" value={tip} onChange={(e) => setTip(e.target.value)} />
        {tipCents === null && <p role="alert" className="text-negative">Enter a valid tip of zero or more.</p>}
        {totalTooLarge && <p role="alert" className="text-negative">The total received is too large.</p>}
      </div>
      <dl aria-live="polite" className="grid grid-cols-[1fr_auto] gap-2 rounded-control border border-border bg-secondary/50 p-3">
        <dt>Debt payment</dt><dd>{paymentCents === null ? "—" : formatPesos(paymentCents)}</dd>
        <dt>Tip</dt><dd>{tipCents === null ? "—" : formatPesos(tipCents)}</dd>
        <dt className="font-semibold">Total received</dt><dd className="font-semibold">{totalReceived === null || totalTooLarge ? "—" : formatPesos(totalReceived)}</dd>
        <dt>{customerOwed === null && targetDebt ? "Remaining on selected debt" : "Remaining customer debt"}</dt>
        <dd>{remainingBase === null || paymentCents === null || overpayment ? "—" : formatPesos(remainingBase - paymentCents)}</dd>
      </dl>
      <fieldset className="flex gap-5">
        <legend className="pb-1 text-[13px] font-medium">Paid by</legend>
        <label className="flex items-center gap-2"><input type="radio" name="method" value="cash" checked={method === "cash"} onChange={() => setMethod("cash")} className="size-4 accent-primary" /> Cash</label>
        <label className="flex items-center gap-2"><input type="radio" name="method" value="gcash" checked={method === "gcash"} onChange={() => setMethod("gcash")} className="size-4 accent-primary" /> GCash</label>
      </fieldset>
      {method === "gcash" && <div className="flex flex-col gap-1.5">
        <label htmlFor="gcashReference" className="text-[13px] font-medium">GCash reference (optional)</label>
        <Input id="gcashReference" name="gcashReference" maxLength={64} autoComplete="off" />
      </div>}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-[13px] font-medium">Notes (optional)</label>
        <Input id="notes" name="notes" maxLength={500} autoComplete="off" />
      </div>
      <Message state={state} />
      <div><Button type="submit" disabled={pending || !customerId || !validPayment || tipCents === null || totalTooLarge}>{pending ? "Recording…" : "Record repayment"}</Button></div>
    </form>
  );
}

export function NewDebtForm({ action, idempotencyKey, customers, selectedCustomer }: {
  action: Action; idempotencyKey: string; customers: CustomerOption[]; selectedCustomer: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  return (
    <form action={formAction} className="flex max-w-[520px] flex-col gap-4" noValidate>
      <input type="hidden" name="key" value={idempotencyKey} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="customerId" className="text-[13px] font-medium">Customer</label>
        <select id="customerId" name="customerId" defaultValue={selectedCustomer ?? ""} required className="h-9 rounded-control border border-input bg-surface px-2 text-[14px]">
          <option value="" disabled>Choose the customer</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="amount" className="text-[13px] font-medium">Amount lent (₱)</label>
        <Input id="amount" name="amount" inputMode="decimal" autoComplete="off" required placeholder="0.00" />
      </div>
      <MethodChoice legend="Money came from" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="dueDate" className="text-[13px] font-medium">Due date (optional)</label>
        <Input id="dueDate" name="dueDate" type="date" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-[13px] font-medium">Notes (optional)</label>
        <Input id="notes" name="notes" maxLength={500} autoComplete="off" />
      </div>
      <Message state={state} />
      <div><Button type="submit" disabled={pending}>{pending ? "Recording…" : "Record cash advance"}</Button></div>
    </form>
  );
}

export function AdjustDebtForm({ action, idempotencyKey, debtId }: { action: Action; idempotencyKey: string; debtId: string }) {
  const [state, formAction, pending] = useActionState(action, idleState);
  return (
    <form action={formAction} className="flex max-w-[520px] flex-col gap-4" noValidate>
      <input type="hidden" name="key" value={idempotencyKey} />
      <input type="hidden" name="debtId" value={debtId} />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="pb-1 text-[13px] font-medium">What to do</legend>
        <div className="flex flex-col gap-1.5 text-[14px]">
          <label className="flex items-center gap-2"><input type="radio" name="direction" value="reduce" defaultChecked className="size-4 accent-[var(--primary)]" /> Reduce the debt (discount or write-off; counts as a cost)</label>
          <label className="flex items-center gap-2"><input type="radio" name="direction" value="increase" className="size-4 accent-[var(--primary)]" /> Increase the debt (correct an amount that was left out)</label>
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="adj-amount" className="text-[13px] font-medium">Amount (₱)</label>
        <Input id="adj-amount" name="amount" inputMode="decimal" autoComplete="off" required placeholder="0.00" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="adj-reason" className="text-[13px] font-medium">Reason (required)</label>
        <Input id="adj-reason" name="reason" required minLength={3} maxLength={300} autoComplete="off" />
      </div>
      <Message state={state} />
      <div><Button type="submit" variant="outline" disabled={pending}>{pending ? "Saving…" : "Record adjustment"}</Button></div>
    </form>
  );
}

export function DueDateForm({ action, debtId, dueDate, notes }: { action: Action; debtId: string; dueDate: string | null; notes: string | null }) {
  const [state, formAction, pending] = useActionState(action, idleState);
  return (
    <form action={formAction} className="flex max-w-[520px] flex-col gap-4" noValidate>
      <input type="hidden" name="debtId" value={debtId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="dueDate" className="text-[13px] font-medium">Due date (leave empty for none)</label>
        <Input id="dueDate" name="dueDate" type="date" defaultValue={dueDate ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="due-notes" className="text-[13px] font-medium">Notes</label>
        <Input id="due-notes" name="notes" defaultValue={notes ?? ""} maxLength={500} autoComplete="off" />
      </div>
      <Message state={state} />
      <div><Button type="submit" variant="outline" disabled={pending}>{pending ? "Saving…" : "Save"}</Button></div>
    </form>
  );
}

export function ImportDebtsForm({ action, disabled }: { action: Action; disabled: boolean }) {
  const [state, formAction, pending] = useActionState(action, idleState);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Message state={state} />
      <div><Button type="submit" disabled={pending || disabled}>{pending ? "Importing…" : "Import the opening debts"}</Button></div>
    </form>
  );
}
