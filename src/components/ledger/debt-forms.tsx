"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idleState, type ActionState } from "@/lib/action-state";

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
export function RepaymentForm({ action, idempotencyKey, customers, selectedCustomer, debtId }: {
  action: Action; idempotencyKey: string; customers: CustomerOption[]; selectedCustomer: string | null; debtId: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  return (
    <form action={formAction} className="flex max-w-[520px] flex-col gap-4" noValidate>
      <input type="hidden" name="key" value={idempotencyKey} />
      {debtId ? <input type="hidden" name="debtId" value={debtId} /> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="customerId" className="text-[13px] font-medium">Customer</label>
        <select id="customerId" name="customerId" defaultValue={selectedCustomer ?? ""} required className="h-9 rounded-control border border-input bg-surface px-2 text-[14px]">
          <option value="" disabled>Choose who is paying</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="amount" className="text-[13px] font-medium">Amount received (₱)</label>
        <Input id="amount" name="amount" inputMode="decimal" autoComplete="off" required placeholder="0.00" />
        <p className="text-[12px] text-muted-foreground">Applied to the oldest unpaid debt first. A repayment is not income.</p>
      </div>
      <MethodChoice legend="Paid by" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="gcashReference" className="text-[13px] font-medium">GCash reference (if paid by GCash)</label>
        <Input id="gcashReference" name="gcashReference" maxLength={64} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-[13px] font-medium">Notes (optional)</label>
        <Input id="notes" name="notes" maxLength={500} autoComplete="off" />
      </div>
      <Message state={state} />
      <div><Button type="submit" disabled={pending}>{pending ? "Recording…" : "Record repayment"}</Button></div>
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
