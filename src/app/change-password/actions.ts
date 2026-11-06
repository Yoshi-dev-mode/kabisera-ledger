"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { makeChangePasswordSchema } from "@/lib/validation/auth";

export type ChangePasswordState = { error: string | null };

export async function changePasswordAction(
  _previous: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await getSession();
  if (!session?.profile || !session.profile.isActive) redirect("/login");
  if (!session.profile.mustChangePassword) redirect("/dashboard");

  const parsed = makeChangePasswordSchema(session.email ?? undefined).safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the new password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: "The password could not be changed. Try a different one." };
  }

  const { error: flagError } = await supabase.rpc("clear_my_must_change_password");
  if (flagError) {
    return { error: "Your password was changed, but setup did not finish. Submit the form once more." };
  }
  redirect("/dashboard");
}
