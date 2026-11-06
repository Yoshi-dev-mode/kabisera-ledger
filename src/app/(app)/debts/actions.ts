"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { failure, success, type ActionState } from "@/lib/action-state";
import { getActionSession, getOwnerActionSession } from "@/lib/auth/session";
import { parseImportResult, parsePostResult } from "@/lib/data/debts";
import { friendlyDbError } from "@/lib/errors";
import { formDate, formMethod, formMoney, formText } from "@/lib/forms";
import { parseOpeningDebtsSeed, SeedError } from "@/lib/opening-debts";
import { createClient } from "@/lib/supabase/server";
import { isBusinessDateString } from "@/lib/time";
import { isUuid } from "@/lib/uuid";

/** Someone typed a GCash reference or note: keep it short and plain. */
const limited = (value: string, max: number) => (value.length > max ? null : value);

export async function recordRepaymentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActionSession();
  if (!session) return failure("You are not signed in.");
  const key = formText(formData, "key");
  const customerId = formText(formData, "customerId");
  const debtId = formText(formData, "debtId");
  const method = formMethod(formData, "method");
  const amount = formMoney(formData, "amount", "the amount received");
  const reference = limited(formText(formData, "gcashReference"), 64);
  const notes = limited(formText(formData, "notes"), 500);
  if (!isUuid(key)) return failure("This form expired. Reload the page and try again.");
  if (!isUuid(customerId)) return failure("Choose a customer.");
  if (debtId !== "" && !isUuid(debtId)) return failure("That debt was not found.");
  if (!amount.ok) return failure(amount.message);
  if (!method) return failure("Choose cash or GCash.");
  if (reference === null || notes === null) return failure("The reference or notes are too long.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_repayment", {
    p_idempotency_key: key,
    p_customer_id: customerId,
    p_amount_cents: amount.cents,
    p_method: method,
    p_debt_id: debtId === "" ? null : debtId,
    p_gcash_reference: reference === "" ? null : reference,
    p_notes: notes === "" ? null : notes,
  });
  if (error) return failure(friendlyDbError(error, "The repayment could not be recorded."));
  const result = parsePostResult(data);
  revalidatePath("/debts");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/transactions/${result.txId}`);
}

export async function createDebtAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActionSession();
  if (!session) return failure("You are not signed in.");
  const key = formText(formData, "key");
  const customerId = formText(formData, "customerId");
  const method = formMethod(formData, "method");
  const amount = formMoney(formData, "amount", "the amount lent");
  const due = formDate(formData, "dueDate", isBusinessDateString);
  const notes = limited(formText(formData, "notes"), 500);
  if (!isUuid(key)) return failure("This form expired. Reload the page and try again.");
  if (!isUuid(customerId)) return failure("Choose a customer.");
  if (!amount.ok) return failure(amount.message);
  if (!method) return failure("Choose whether the money came from cash or GCash.");
  if (formText(formData, "dueDate") !== "" && due === null) return failure("The due date is not a real date.");
  if (notes === null) return failure("The notes are too long.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_debt_creation", {
    p_idempotency_key: key,
    p_customer_id: customerId,
    p_amount_cents: amount.cents,
    p_source_method: method,
    p_due_date: due,
    p_notes: notes === "" ? null : notes,
  });
  if (error) return failure(friendlyDbError(error, "The cash advance could not be recorded."));
  const result = parsePostResult(data);
  revalidatePath("/debts");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/transactions/${result.txId}`);
}

/** Owner only. Reads the opening debts file shipped with the app, re-checks it, and imports it once. */
export async function importOpeningDebtsAction(): Promise<ActionState> {
  const session = await getOwnerActionSession();
  if (!session) return failure("Only the owner can import opening debts.");

  let seed;
  try {
    const text = await readFile(path.join(process.cwd(), "supabase", "seed", "opening-debts.json"), "utf8");
    seed = parseOpeningDebtsSeed(JSON.parse(text));
  } catch (error) {
    if (error instanceof SeedError) return failure(error.message);
    return failure("The opening debts file could not be read. Make sure supabase/seed/opening-debts.json is deployed with the app.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_opening_debts", {
    p_source_note: seed.source,
    p_expected_total_cents: seed.expectedTotalCents,
    p_debts: seed.debts,
  });
  if (error) return failure(friendlyDbError(error, "The opening debts could not be imported."));
  const result = parseImportResult(data);
  revalidatePath("/debts");
  revalidatePath("/customers");
  return success(
    result.wasDuplicate
      ? "These opening debts were already imported. Nothing was added a second time."
      : `Imported ${result.debtsCreated} opening debts (${result.customersCreated} new customers).`,
  );
}

export async function adjustDebtAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getOwnerActionSession();
  if (!session) return failure("Only the owner can adjust a debt.");
  const key = formText(formData, "key");
  const debtId = formText(formData, "debtId");
  const direction = formText(formData, "direction");
  const amount = formMoney(formData, "amount", "the adjustment");
  const reason = formText(formData, "reason");
  if (!isUuid(key)) return failure("This form expired. Reload the page and try again.");
  if (!isUuid(debtId)) return failure("That debt was not found.");
  if (direction !== "reduce" && direction !== "increase") return failure("Choose whether to reduce or increase the debt.");
  if (!amount.ok) return failure(amount.message);
  if (reason.length < 3 || reason.length > 300) return failure("Give a reason of 3 to 300 characters.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("debt_adjust", {
    p_idempotency_key: key,
    p_debt_id: debtId,
    p_amount_cents: direction === "reduce" ? -amount.cents : amount.cents,
    p_reason: reason,
  });
  if (error) return failure(friendlyDbError(error, "The adjustment could not be saved."));
  revalidatePath(`/debts/${debtId}`);
  revalidatePath("/debts");
  return success("Adjustment recorded. It is shown on the customer's debt history.");
}

export async function setDueDateAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActionSession();
  if (!session) return failure("You are not signed in.");
  const debtId = formText(formData, "debtId");
  const raw = formText(formData, "dueDate");
  const due = formDate(formData, "dueDate", isBusinessDateString);
  const notes = limited(formText(formData, "notes"), 500);
  if (!isUuid(debtId)) return failure("That debt was not found.");
  if (raw !== "" && due === null) return failure("The due date is not a real date.");
  if (notes === null) return failure("The notes are too long.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("debt_set_due_date", { p_debt_id: debtId, p_due_date: due, p_notes: notes === "" ? null : notes });
  if (error) return failure(friendlyDbError(error, "The due date could not be saved."));
  revalidatePath(`/debts/${debtId}`);
  revalidatePath("/debts");
  return success("Saved.");
}
