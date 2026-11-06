"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idleState, type ActionState } from "@/lib/action-state";

type Props = {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  label: string;
  buttonLabel: string;
  danger?: boolean;
  /** Optional second field (for example the owner's overdraft override reason). */
  extra?: { name: string; label: string; help: string };
  minLength?: number;
};

/** A small "give a reason, then confirm" form used for archiving, requesting a void and voiding. */
export function ReasonForm({ action, hidden, label, buttonLabel, danger = false, extra, minLength = 3 }: Props) {
  const [state, formAction, pending] = useActionState(action, idleState);
  return (
    <form action={formAction} className="flex max-w-[480px] flex-col gap-3" noValidate>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`reason-${buttonLabel}`} className="text-[13px] font-medium">{label}</label>
        <Input id={`reason-${buttonLabel}`} name="reason" required minLength={minLength} maxLength={300} autoComplete="off" />
      </div>
      {extra ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`extra-${extra.name}`} className="text-[13px] font-medium">{extra.label}</label>
          <Input id={`extra-${extra.name}`} name={extra.name} maxLength={300} autoComplete="off" aria-describedby={`extra-${extra.name}-help`} />
          <p id={`extra-${extra.name}-help`} className="text-[12px] text-muted-foreground">{extra.help}</p>
        </div>
      ) : null}
      {state.message ? (
        <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-[13px] text-negative" : "text-[13px] text-positive"}>
          {state.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant={danger ? "destructive" : "outline"} size="sm" disabled={pending}>
          {pending ? "Working…" : buttonLabel}
        </Button>
      </div>
    </form>
  );
}
