"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changePasswordAction, type ChangePasswordState } from "./actions";

const initialState: ChangePasswordState = { error: null };

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-[13px] font-medium">
          New password
        </label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required autoFocus aria-describedby="password-help" />
        <p id="password-help" className="text-[12px] text-muted-foreground">
          At least 12 characters. A few random words works well. Do not reuse a password from elsewhere.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className="text-[13px] font-medium">
          Type it again
        </label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      {state.error ? (
        <p role="alert" className="text-[13px] text-negative">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save password and continue"}
      </Button>
    </form>
  );
}
