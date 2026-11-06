"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCustomerAction, type CustomerFormState } from "../actions";

const initial: CustomerFormState = { status: "idle", message: null, matches: [] };

export function NewCustomerForm({ isOwner }: { isOwner: boolean }) {
  const [state, formAction, pending] = useActionState(createCustomerAction, initial);
  const hasExact = state.matches.some((m) => m.kind === "exact");

  return (
    <form action={formAction} className="flex max-w-[520px] flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="displayName" className="text-[13px] font-medium">Name</label>
        <Input id="displayName" name="displayName" required maxLength={120} autoComplete="off" autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="contactNumber" className="text-[13px] font-medium">Contact number (optional)</label>
        <Input id="contactNumber" name="contactNumber" type="tel" maxLength={30} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-[13px] font-medium">Notes (optional)</label>
        <textarea id="notes" name="notes" rows={3} maxLength={2000} className="rounded-control border border-input bg-surface px-3 py-2 text-[14px]" />
      </div>

      {state.message ? (
        <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-[13px] text-negative" : "text-[13px]"}>
          {state.message}
        </p>
      ) : null}

      {state.matches.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-control bg-[var(--pill-warning-bg)] p-3 text-[14px]">
          {state.matches.map((m) => (
            <li key={m.id}>
              <Link href={`/customers/${m.id}`} className="underline underline-offset-4">{m.displayName}</Link>
              <span className="text-muted-foreground"> · {m.kind === "exact" ? "same name" : "similar name"}{m.status === "archived" ? " · archived" : ""}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {state.matches.length > 0 && !hasExact ? (
          <Button type="submit" name="confirmSimilar" value="1" disabled={pending}>
            They are different people: add anyway
          </Button>
        ) : (
          <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add customer"}</Button>
        )}
        {hasExact && isOwner ? (
          <Button type="submit" name="forceDuplicate" value="1" variant="outline" disabled={pending}>
            Add a second customer with this name
          </Button>
        ) : null}
        <Link href="/customers" className="text-[13px] underline underline-offset-4">Cancel</Link>
      </div>
    </form>
  );
}
