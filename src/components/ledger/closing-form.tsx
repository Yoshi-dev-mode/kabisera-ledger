"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idleState, type ActionState } from "@/lib/action-state";
import { describeVariance } from "@/lib/closing";
import type { ClosingAccount } from "@/lib/data/closing";
import { centsToInput, optionalCents } from "@/lib/entry";
import { formatPesos } from "@/lib/money";
import { cn } from "@/lib/utils";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Count the real cash, GCash and load. For each, the page shows what was expected and explains the difference
 * in words. A reason is required for any difference. Closing asks for a final confirmation first.
 */
export function ClosingForm({ action, date, accounts, note }: { action: Action; date: string; accounts: ClosingAccount[]; note: string | null }) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const [counts, setCounts] = useState<Record<string, string>>(() => Object.fromEntries(accounts.map((a) => [a.code, a.actualCents === null ? "" : centsToInput(a.actualCents)])));
  const dialog = useRef<HTMLDialogElement>(null);

  const rows = accounts.map((a) => {
    const text = counts[a.code] ?? "";
    const cents = text.trim() === "" ? null : optionalCents(text);
    return { a, text, cents, variance: cents === null ? null : describeVariance(cents, a.expectedCents), invalid: text.trim() !== "" && cents === null };
  });
  const allCounted = rows.every((r) => r.cents !== null);
  const differences = rows.filter((r) => r.variance && r.variance.kind !== "balanced");

  return (
    <form id="closing-form" action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="date" value={date} />
      <ul className="flex flex-col divide-y divide-border">
        {rows.map(({ a, variance, invalid }) => (
          <li key={a.code} className="flex flex-col gap-3 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[14px] font-medium">{a.name}</h3>
              <p className="num text-[13px] text-muted-foreground">
                Start {formatPesos(a.openingCents)} · in {formatPesos(a.inflowCents, { signed: true })} · out {formatPesos(a.outflowCents)} · <span className="font-medium text-foreground">expected {formatPesos(a.expectedCents)}</span>
              </p>
            </div>
            <div className="flex max-w-[520px] flex-col gap-1.5">
              <label htmlFor={`count_${a.code}`} className="text-[13px] font-medium">What you counted (₱)</label>
              <Input id={`count_${a.code}`} name={`count_${a.code}`} inputMode="decimal" autoComplete="off" placeholder="0.00"
                value={counts[a.code] ?? ""} onChange={(e) => setCounts((c) => ({ ...c, [a.code]: e.target.value }))} aria-describedby={`result_${a.code}`} />
              <p id={`result_${a.code}`} className={cn("text-[13px]", variance?.kind === "balanced" ? "text-positive" : variance ? "text-negative" : "text-muted-foreground")}>
                {invalid ? "That is not a valid amount." : variance ? variance.text : "Enter the amount to compare it with what was expected."}
              </p>
            </div>
            {variance && variance.kind !== "balanced" ? (
              <div className="flex max-w-[520px] flex-col gap-1.5">
                <label htmlFor={`reason_${a.code}`} className="text-[13px] font-medium">Why is it different? (required)</label>
                <Input id={`reason_${a.code}`} name={`reason_${a.code}`} defaultValue={a.reason ?? ""} maxLength={300} autoComplete="off" required />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex max-w-[520px] flex-col gap-1.5">
        <label htmlFor="note" className="text-[13px] font-medium">Closing note (optional)</label>
        <Input id="note" name="note" defaultValue={note ?? ""} maxLength={2000} autoComplete="off" />
      </div>
      {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-[13px] text-negative" : "text-[13px] text-positive"}>{state.message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="save" variant="outline" disabled={pending}>{pending ? "Saving…" : "Save counts"}</Button>
        <Button type="button" disabled={pending || !allCounted} onClick={() => dialog.current?.showModal()}>Close the day</Button>
      </div>
      {!allCounted ? <p className="text-[12px] text-muted-foreground">Count all three before you can close the day.</p> : null}

      <dialog ref={dialog} aria-labelledby="close-title" className="m-auto w-[min(92vw,460px)] rounded-card bg-surface p-5 text-foreground backdrop:bg-black/40">
        <h2 id="close-title" className="text-[16px] leading-6 font-medium">Close {date}?</h2>
        <p className="mt-2 text-[14px] text-muted-foreground">
          {differences.length === 0
            ? "Everything you counted matches what was expected."
            : `You counted ${differences.length === 1 ? "one difference" : `${differences.length} differences`}. Each will be recorded as a reasoned adjustment so the books match what you counted.`}
          {" "}A closed day cannot be edited. Only the owner can reopen it, with a reason.
        </p>
        <ul className="mt-3 flex flex-col gap-1 text-[14px]">
          {differences.map(({ a, variance }) => <li key={a.code}>{a.name}: {variance?.text}</li>)}
        </ul>
        <div className="mt-4 flex gap-2">
          <Button type="submit" name="intent" value="close" disabled={pending} onClick={() => dialog.current?.close()}>Yes, close the day</Button>
          <Button type="button" variant="outline" onClick={() => dialog.current?.close()}>Go back</Button>
        </div>
      </dialog>
    </form>
  );
}
