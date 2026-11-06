"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { idleState } from "@/lib/action-state";
import { restoreCustomerAction } from "../actions";

export function RestoreForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(restoreCustomerAction, idleState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <div><Button type="submit" variant="outline" size="sm" disabled={pending}>{pending ? "Restoring…" : "Restore this customer"}</Button></div>
      {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-[13px] text-negative" : "text-[13px] text-positive"}>{state.message}</p> : null}
    </form>
  );
}
