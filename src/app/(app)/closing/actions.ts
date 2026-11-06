"use server";

import { revalidatePath } from "next/cache";
import { failure, success, type ActionState } from "@/lib/action-state";
import { getActionSession } from "@/lib/auth/session";
import { friendlyDbError } from "@/lib/errors";
import { formMoney, formText } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { isBusinessDateString, todayBusinessDate } from "@/lib/time";
import { isUuid } from "@/lib/uuid";

const FLOATS = ["CASH_DRAWER", "GCASH_WALLET", "LOAD_BALANCE"] as const;

/**
 * Saves the counted amounts (and optionally closes the day). Starting the closing is part of saving, so there is
 * no separate "start" step. Closing books every difference as a reasoned entry and locks the day.
 */
export async function saveClosingAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActionSession();
  if (!session) return failure("You are not signed in.");
  const date = formText(formData, "date");
  const intent = formText(formData, "intent");
  const note = formText(formData, "note");
  if (!isBusinessDateString(date) || date > todayBusinessDate()) return failure("Choose a day that has already started.");
  if (intent !== "save" && intent !== "close") return failure("Choose Save counts or Close the day.");
  if (note.length > 2000) return failure("The note is too long.");

  const actuals: { code: string; actual_cents: number | null; reason: string | null }[] = [];
  for (const code of FLOATS) {
    const text = formText(formData, `count_${code}`);
    const reason = formText(formData, `reason_${code}`);
    if (reason.length > 300) return failure("A reason is too long.");
    if (text === "") {
      actuals.push({ code, actual_cents: null, reason: reason === "" ? null : reason });
      continue;
    }
    const money = formMoney(formData, `count_${code}`, "the counted amount", { allowZero: true });
    if (!money.ok) return failure(money.message);
    actuals.push({ code, actual_cents: money.cents, reason: reason === "" ? null : reason });
  }
  if (intent === "close" && actuals.some((a) => a.actual_cents === null)) {
    return failure("Enter what you counted for the cash drawer, the GCash wallet and the load balance before closing the day.");
  }

  const supabase = await createClient();
  const started = await supabase.rpc("closing_start", { p_date: date });
  if (started.error || typeof started.data !== "string" || !isUuid(started.data)) {
    return failure(friendlyDbError(started.error, "The closing could not be started."));
  }
  const saved = await supabase.rpc("closing_save", { p_closing_id: started.data, p_note: note === "" ? null : note, p_actuals: actuals });
  if (saved.error) return failure(friendlyDbError(saved.error, "The counts could not be saved."));
  if (intent === "close") {
    const closed = await supabase.rpc("closing_finalize", { p_closing_id: started.data });
    if (closed.error) return failure(friendlyDbError(closed.error, "The day could not be closed. Your counts were saved."));
  }
  revalidatePath("/closing");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  return success(intent === "close" ? "The day is closed." : "Counts saved. The day is not closed yet.");
}

export async function amendClosingAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActionSession();
  if (!session) return failure("You are not signed in.");
  const date = formText(formData, "date");
  const reason = formText(formData, "reason");
  if (!isBusinessDateString(date)) return failure("That day was not found.");
  if (reason.length < 3) return failure("Give a reason.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("closing_amend", { p_date: date, p_reason: reason });
  if (error) return failure(friendlyDbError(error, "The closing could not be amended."));
  revalidatePath("/closing");
  return success("The day is open for correction. Fix what is wrong, then count and close it again.");
}
