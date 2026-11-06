"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { failure, success, type ActionState } from "@/lib/action-state";
import { getActionSession } from "@/lib/auth/session";
import { fetchSimilarCustomers } from "@/lib/data/queries";
import type { SimilarCustomer } from "@/lib/data/transactions";
import { friendlyDbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

export type CustomerFormState = ActionState & { matches: SimilarCustomer[] };

const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value.trim() : "");
const clean = (value: string) => (value === "" ? null : value);

/**
 * Adds a customer. Look-alike names are shown first so the same person is not added twice:
 * an exact match is blocked (only the owner can force it), a similar name needs a second confirmation.
 */
export async function createCustomerAction(_previous: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const session = await getActionSession();
  if (!session) return { ...failure("You are not signed in."), matches: [] };

  const name = text(formData.get("displayName"));
  const contact = text(formData.get("contactNumber"));
  const notes = text(formData.get("notes"));
  if (name === "" || name.length > 120) return { ...failure("Enter a name of up to 120 characters."), matches: [] };
  if (contact.length > 30) return { ...failure("The contact number is too long."), matches: [] };
  if (notes.length > 2000) return { ...failure("The notes are too long."), matches: [] };

  const confirmSimilar = formData.get("confirmSimilar") === "1";
  const forceDuplicate = formData.get("forceDuplicate") === "1" && session.profile.role === "owner";

  const matches = await fetchSimilarCustomers(name);
  const exact = matches.filter((m) => m.kind === "exact");
  if (exact.length > 0 && !forceDuplicate) {
    return { ...failure("A customer with this name already exists."), matches: exact };
  }
  const similar = matches.filter((m) => m.kind === "similar");
  if (similar.length > 0 && !confirmSimilar && exact.length === 0) {
    return { status: "idle", message: "Is this the same person as one of these?", matches: similar };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_create", {
    p_name: name,
    p_contact: clean(contact),
    p_notes: clean(notes),
    p_allow_duplicate: forceDuplicate,
  });
  if (error || typeof data !== "string" || !isUuid(data)) {
    return { ...failure(friendlyDbError(error, "The customer could not be added.")), matches: [] };
  }
  revalidatePath("/customers");
  redirect(`/customers/${data}`);
}

export async function updateCustomerAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActionSession();
  if (!session) return failure("You are not signed in.");
  const id = text(formData.get("id"));
  const name = text(formData.get("displayName"));
  const contact = text(formData.get("contactNumber"));
  const notes = text(formData.get("notes"));
  if (!isUuid(id)) return failure("That customer was not found.");
  if (name === "" || name.length > 120) return failure("Enter a name of up to 120 characters.");
  if (contact.length > 30 || notes.length > 2000) return failure("The contact number or notes are too long.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("customer_update", { p_id: id, p_name: name, p_contact: clean(contact), p_notes: clean(notes) });
  if (error) return failure(friendlyDbError(error, "The changes could not be saved."));
  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
  return success("Saved.");
}

export async function archiveCustomerAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActionSession();
  if (!session) return failure("You are not signed in.");
  const id = text(formData.get("id"));
  const reason = text(formData.get("reason"));
  if (!isUuid(id)) return failure("That customer was not found.");
  if (reason.length < 3) return failure("Give a reason.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("customer_archive", { p_id: id, p_reason: reason });
  if (error) return failure(friendlyDbError(error, "The customer could not be archived."));
  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
  return success("Archived. Their history is kept.");
}

export async function restoreCustomerAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActionSession();
  if (!session) return failure("You are not signed in.");
  const id = text(formData.get("id"));
  if (!isUuid(id)) return failure("That customer was not found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("customer_restore", { p_id: id });
  if (error) return failure(friendlyDbError(error, "The customer could not be restored."));
  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
  return success("Restored.");
}
