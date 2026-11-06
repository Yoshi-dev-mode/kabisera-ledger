"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { createStaffAction, updateStaffAction, type StaffActionState } from "./actions";

const initialState: StaffActionState = { status: "idle", message: null };

function PermissionBoxes({ granted, idPrefix }: { granted: readonly Permission[]; idPrefix: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-1 text-[13px] font-medium">What this person may do</legend>
      {PERMISSIONS.map((p) => (
        <label key={p.key} htmlFor={`${idPrefix}-${p.key}`} className="flex items-start gap-2.5 text-[14px]">
          <input
            id={`${idPrefix}-${p.key}`}
            type="checkbox"
            name="permissions"
            value={p.key}
            defaultChecked={granted.includes(p.key)}
            className="mt-[3px] size-4 shrink-0 accent-[var(--primary)]"
          />
          <span>
            {p.label}
            <span className="block text-[12px] text-muted-foreground">{p.description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function Message({ state }: { state: StaffActionState }) {
  if (!state.message) return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-[13px] text-negative" : "text-[13px] text-positive"}>
      {state.message}
    </p>
  );
}

export function CreateStaffForm({ disabled }: { disabled: boolean }) {
  const [state, formAction, pending] = useActionState(createStaffAction, initialState);

  return (
    <form action={formAction} className="flex max-w-[520px] flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-name" className="text-[13px] font-medium">Name</label>
        <Input id="new-name" name="displayName" required autoComplete="off" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-email" className="text-[13px] font-medium">Email (used to sign in)</label>
        <Input id="new-email" name="email" type="email" required autoComplete="off" disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-password" className="text-[13px] font-medium">Temporary password</label>
        <Input id="new-password" name="password" type="password" required autoComplete="new-password" disabled={disabled} aria-describedby="new-password-help" />
        <p id="new-password-help" className="text-[12px] text-muted-foreground">
          At least 12 characters. Tell them in person. They must choose their own at first sign-in.
        </p>
      </div>
      <PermissionBoxes granted={[]} idPrefix="new" />
      <Message state={state} />
      <div>
        <Button type="submit" disabled={pending || disabled}>
          {pending ? "Adding…" : "Add staff member"}
        </Button>
      </div>
    </form>
  );
}

export function EditStaffForm(props: {
  userId: string;
  displayName: string;
  isActive: boolean;
  permissions: readonly Permission[];
}) {
  const [state, formAction, pending] = useActionState(updateStaffAction, initialState);

  return (
    <form action={formAction} className="flex max-w-[520px] flex-col gap-4" noValidate>
      <input type="hidden" name="userId" value={props.userId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`name-${props.userId}`} className="text-[13px] font-medium">Name</label>
        <Input id={`name-${props.userId}`} name="displayName" defaultValue={props.displayName} required />
      </div>
      <label htmlFor={`active-${props.userId}`} className="flex items-center gap-2.5 text-[14px]">
        <input
          id={`active-${props.userId}`}
          type="checkbox"
          name="isActive"
          defaultChecked={props.isActive}
          className="size-4 accent-[var(--primary)]"
        />
        Active (untick to stop them signing in and seeing any data)
      </label>
      <PermissionBoxes granted={props.permissions} idPrefix={props.userId} />
      <Message state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
