"use server";

import { revalidatePath } from "next/cache";
import { failure, success, type ActionState } from "@/lib/action-state";
import { getActionSession } from "@/lib/auth/session";
import { friendlyDbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

/** A staff member (with the permission) asks the owner to void. Only the owner can approve. */
export async function requestVoidAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActionSession();
  if (!session) return failure("You are not signed in.");
  const id = text(formData.get("id"));
  const reason = text(formData.get("reason"));
  if (!isUuid(id)) return failure("That transaction was not found.");
  if (reason.length < 3) return failure("Give a reason.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_void", { p_transaction_id: id, p_reason: reason });
  if (error) return failure(friendlyDbError(error, "The request could not be sent."));
  revalidatePath(`/transactions/${id}`);
  return success("Sent to the owner for approval.");
}

/** Owner only (the database checks again). Adds mirror-image entries; nothing is edited or deleted. */
export async function voidTransactionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActionSession();
  if (!session) return failure("You are not signed in.");
  const id = text(formData.get("id"));
  const reason = text(formData.get("reason"));
  const override = text(formData.get("override"));
  if (!isUuid(id)) return failure("That transaction was not found.");
  if (reason.length < 3) return failure("Give a reason.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_transaction", {
    p_transaction_id: id,
    p_reason: reason,
    p_override_reason: override === "" ? null : override,
  });
  if (error) return failure(friendlyDbError(error, "The transaction could not be voided."));
  revalidatePath(`/transactions/${id}`);
  revalidatePath("/transactions");
  revalidatePath("/customers");
  return success("Voided. The original record is kept and a reversing entry was added.");
}
