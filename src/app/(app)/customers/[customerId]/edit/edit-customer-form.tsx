"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idleState } from "@/lib/action-state";
import { updateCustomerAction } from "../../actions";

export function EditCustomerForm(props: { id: string; displayName: string; contactNumber: string | null; notes: string | null }) {
  const [state, formAction, pending] = useActionState(updateCustomerAction, idleState);
  return (
    <form action={formAction} className="flex max-w-[520px] flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={props.id} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="displayName" className="text-[13px] font-medium">Name</label>
        <Input id="displayName" name="displayName" defaultValue={props.displayName} required maxLength={120} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="contactNumber" className="text-[13px] font-medium">Contact number (optional)</label>
        <Input id="contactNumber" name="contactNumber" type="tel" defaultValue={props.contactNumber ?? ""} maxLength={30} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-[13px] font-medium">Notes (optional)</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={props.notes ?? ""} maxLength={2000} className="rounded-control border border-input bg-surface px-3 py-2 text-[14px]" />
      </div>
      {state.message ? (
        <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-[13px] text-negative" : "text-[13px] text-positive"}>{state.message}</p>
      ) : null}
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button></div>
    </form>
  );
}
