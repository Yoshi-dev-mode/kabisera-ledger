"use server";

import { revalidatePath } from "next/cache";
import { getOwnerActionSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { staffCreateSchema, staffUpdateSchema } from "@/lib/validation/auth";

export type StaffActionState = { status: "idle" | "ok" | "error"; message: string | null };

const NOT_OWNER: StaffActionState = { status: "error", message: "Only the owner can manage staff." };

/**
 * Adds a staff member. Order matters: (1) confirm the caller is an owner, (2) create the sign-in account with the
 * admin API, (3) create the profile through a database function that itself re-checks the owner. If step 3
 * fails the new account is deleted again, so no half-created person is left behind.
 */
export async function createStaffAction(_previous: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const session = await getOwnerActionSession();
  if (!session) return NOT_OWNER;

  const parsed = staffCreateSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    permissions: formData.getAll("permissions"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const { displayName, email, password, permissions } = parsed.data;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { status: "error", message: "Adding staff needs SUPABASE_SERVICE_ROLE_KEY in .env.local. See README." };
  }

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    const exists = (created.error?.message ?? "").toLowerCase().includes("already");
    return {
      status: "error",
      message: exists ? "An account with that email already exists." : "The sign-in account could not be created.",
    };
  }
  const newUserId = created.data.user.id;

  const supabase = await createClient();
  const { error } = await supabase.rpc("owner_create_staff_profile", {
    p_user_id: newUserId,
    p_display_name: displayName,
    p_permissions: permissions,
  });
  if (error) {
    await admin.auth.admin.deleteUser(newUserId);
    return { status: "error", message: "The staff profile could not be created, so nothing was saved. Try again." };
  }

  revalidatePath("/staff");
  return {
    status: "ok",
    message: `${displayName} can sign in with the temporary password and will be asked to choose their own.`,
  };
}

/** Changes a staff member's name, permissions and whether they are active. Owners cannot be changed here. */
export async function updateStaffAction(_previous: StaffActionState, formData: FormData): Promise<StaffActionState> {
  const session = await getOwnerActionSession();
  if (!session) return NOT_OWNER;

  const parsed = staffUpdateSchema.safeParse({
    userId: formData.get("userId"),
    displayName: formData.get("displayName"),
    isActive: formData.get("isActive") === "on",
    permissions: formData.getAll("permissions"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const { userId, displayName, isActive, permissions } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("owner_update_staff", {
    p_user_id: userId,
    p_display_name: displayName,
    p_permissions: permissions,
    p_is_active: isActive,
  });
  if (error) {
    return { status: "error", message: "The change could not be saved. Staff members only; owners cannot be edited here." };
  }

  // Extra safeguard: also block the sign-in itself while deactivated. Database rules already hide all data
  // from a deactivated person, so a failure here does not weaken that.
  try {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(userId, { ban_duration: isActive ? "none" : "876000h" });
  } catch {
    // service key not configured: the database rules still apply
  }

  revalidatePath("/staff");
  return { status: "ok", message: "Saved." };
}
