"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { failure, type ActionState } from "@/lib/action-state";
import { getActionSession } from "@/lib/auth/session";
import { parsePostResult } from "@/lib/data/debts";
import { fetchLoadProducts, fetchSettings } from "@/lib/data/queries";
import { friendlyDbError } from "@/lib/errors";
import { calculateLoadSale, suggestLoadCost } from "@/lib/entry";
import { formDate, formMethod, formMoney, formText, optionalMoney } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { isBusinessDateString } from "@/lib/time";
import { isUuid } from "@/lib/uuid";

const short = (value: string, max: number) => (value.length > max ? null : value);
const orNull = (value: string) => (value === "" ? null : value);

/** The common ending: call the posting function, then open the new transaction. */
async function post(fn: string, args: Record<string, unknown>, revalidate: string[]): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (fn === "post_mobile_load" && error?.code === "PGRST202") {
    return failure("Mobile load could not be saved. Ask the owner to apply the latest database update, then try again.");
  }
  if (fn === "post_mobile_load" && error?.code === "23514" && /^not enough in mobile-load balance:/i.test(error.message)) {
    return failure("Your recorded prepaid load balance cannot cover this sale. Record a prepaid load top-up if you bought one, or select GCash if you bought this load directly from GCash.");
  }
  if (error) return failure(friendlyDbError(error, "The transaction could not be recorded."));
  const result = parsePostResult(data);
  for (const path of revalidate) revalidatePath(path);
  redirect(`/transactions/${result.txId}`);
}

function common(formData: FormData) {
  return {
    key: formText(formData, "key"),
    customerId: formText(formData, "customerId"),
    reference: short(formText(formData, "gcashReference"), 64),
    notes: short(formText(formData, "notes"), 500),
    override: short(formText(formData, "override"), 300),
  };
}

export async function postServiceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActionSession();
  if (!session) return failure("You are not signed in.");
  const type = formText(formData, "type");
  const c = common(formData);
  const feeMode = formText(formData, "feeMode");
  const amount = formMoney(formData, "amount", "the amount");
  const fee = optionalMoney(formData, "fee", "the fee");
  const unpaid = optionalMoney(formData, "unpaid", "the unpaid amount");
  const cost = optionalMoney(formData, "providerCost", "the provider cost");

  if (type !== "cash_in" && type !== "cash_out") return failure("Unknown transaction type.");
  if (!isUuid(c.key)) return failure("This form expired. Reload the page and try again.");
  if (c.customerId !== "" && !isUuid(c.customerId)) return failure("That customer was not found.");
  if (!amount.ok) return failure(amount.message);
  if (!fee.ok) return failure(fee.message);
  if (!unpaid.ok) return failure(unpaid.message);
  if (!cost.ok) return failure(cost.message);
  if (feeMode !== "on_top" && feeMode !== "deducted") return failure("Choose how the fee is charged.");
  if (c.reference === null || c.notes === null || c.override === null) return failure("The reference, notes or override reason are too long.");

  const base = {
    p_idempotency_key: c.key,
    p_customer_id: orNull(c.customerId),
    p_principal_cents: amount.cents,
    p_fee_cents: fee.cents,
    p_fee_mode: feeMode,
    p_provider_cost_cents: cost.cents,
    p_gcash_reference: orNull(c.reference),
    p_notes: orNull(c.notes),
    p_override_reason: orNull(c.override),
  };
  const revalidate = ["/transactions", "/customers"];
  if (type === "cash_in") return post("post_cash_in", { ...base, p_credit_cents: unpaid.cents }, revalidate);
  if (unpaid.cents > 0) return failure("A cash-out cannot be left unpaid.");
  return post("post_cash_out", base, revalidate);
}

export async function postLoadAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActionSession();
  if (!session) return failure("You are not signed in.");
  const c = common(formData);
  const productId = formText(formData, "productId");
  const source = formText(formData, "source");
  const payment = formMethod(formData, "payment");
  const face = formMoney(formData, "face", "the load amount");
  const fee = optionalMoney(formData, "serviceFee", "the service fee");
  const payLater = formText(formData, "payLater") === "on";
  const unpaid = payLater ? { ok: true, cents: 0 } as const : optionalMoney(formData, "unpaid", "the unpaid amount");

  if (!isUuid(c.key)) return failure("This form expired. Reload the page and try again.");
  if (c.customerId !== "" && !isUuid(c.customerId)) return failure("That customer was not found.");
  if (productId !== "" && !isUuid(productId)) return failure("That load product was not found.");
  if (source !== "gcash_direct" && source !== "prepaid_wallet") return failure("Choose where the load came from.");
  if (!face.ok) return failure(face.message);
  if (!fee.ok) return failure(fee.message);
  if (!unpaid.ok) return failure(unpaid.message);
  if (!payment) return failure("Choose cash or GCash for the part paid now.");
  if (c.reference === null || c.notes === null || c.override === null) return failure("The reference, notes or override reason are too long.");

  let configuredCost: number | null = null;
  if (productId !== "") {
    const product = (await fetchLoadProducts({ activeOnly: true })).find((p) => p.id === productId);
    if (!product) return failure("That load product is no longer available. Choose another product.");
    if (product.costBpsOfFace !== null) {
      const settings = await fetchSettings();
      configuredCost = suggestLoadCost(formText(formData, "face"), product.costBpsOfFace, settings.rounding);
    }
  }
  const sale = calculateLoadSale(face.cents, fee.cents, configuredCost);
  if (!sale.ok) return failure(sale.message);

  return post("post_mobile_load", {
    p_idempotency_key: c.key,
    p_customer_id: orNull(c.customerId),
    p_load_product_id: orNull(productId),
    p_load_source: source,
    p_face_cents: face.cents,
    p_cost_cents: sale.costCents,
    p_price_cents: sale.priceCents,
    ...(fee.cents > 0 ? { p_fee_cents: fee.cents } : {}),
    p_payment_method: payment,
    p_credit_cents: payLater ? sale.priceCents : unpaid.cents,
    p_gcash_reference: orNull(c.reference),
    p_notes: orNull(c.notes),
    p_override_reason: orNull(c.override),
  }, ["/transactions", "/customers"]);
}

export async function postExpenseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActionSession();
  if (!session) return failure("You are not signed in.");
  const c = common(formData);
  const category = formText(formData, "categoryId");
  const method = formMethod(formData, "method");
  const amount = formMoney(formData, "amount", "the amount");
  if (!isUuid(c.key)) return failure("This form expired. Reload the page and try again.");
  if (category !== "" && !isUuid(category)) return failure("That category was not found.");
  if (!amount.ok) return failure(amount.message);
  if (!method) return failure("Choose cash or GCash.");
  if (c.notes === null || c.override === null) return failure("The notes or override reason are too long.");
  return post("post_expense", {
    p_idempotency_key: c.key, p_category_id: orNull(category), p_amount_cents: amount.cents, p_method: method,
    p_notes: orNull(c.notes), p_override_reason: orNull(c.override),
  }, ["/transactions"]);
}

const KINDS = ["transfer_cash_to_gcash", "transfer_gcash_to_cash", "load_topup", "capital_contribution", "capital_withdrawal"];
const ACCOUNTS = ["CASH_DRAWER", "GCASH_WALLET", "LOAD_BALANCE"];

export async function postAdjustmentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActionSession();
  if (!session) return failure("You are not signed in.");
  const c = common(formData);
  const kind = formText(formData, "kind");
  const account = formText(formData, "account");
  const amount = formMoney(formData, "amount", "the amount");
  if (!isUuid(c.key)) return failure("This form expired. Reload the page and try again.");
  if (!KINDS.includes(kind)) return failure("Choose what kind of adjustment this is.");
  if (!amount.ok) return failure(amount.message);
  if (account !== "" && !ACCOUNTS.includes(account)) return failure("Choose a valid account.");
  if (c.notes === null || c.override === null) return failure("The notes or override reason are too long.");
  return post("post_float_adjustment", {
    p_idempotency_key: c.key, p_kind: kind, p_amount_cents: amount.cents, p_account: orNull(account),
    p_notes: orNull(c.notes), p_override_reason: orNull(c.override),
  }, ["/transactions"]);
}

export async function postOpeningAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getActionSession();
  if (!session) return failure("You are not signed in.");
  const c = common(formData);
  const cash = optionalMoney(formData, "cash", "the cash drawer amount");
  const gcash = optionalMoney(formData, "gcash", "the GCash wallet amount");
  const load = optionalMoney(formData, "load", "the load balance");
  const rawDate = formText(formData, "asOf");
  const asOf = formDate(formData, "asOf", isBusinessDateString);
  if (!isUuid(c.key)) return failure("This form expired. Reload the page and try again.");
  if (!cash.ok) return failure(cash.message);
  if (!gcash.ok) return failure(gcash.message);
  if (!load.ok) return failure(load.message);
  if (rawDate !== "" && asOf === null) return failure("The date is not a real date.");
  if (c.notes === null) return failure("The notes are too long.");
  return post("post_opening_balances", {
    p_idempotency_key: c.key, p_cash_cents: cash.cents, p_gcash_cents: gcash.cents, p_load_cents: load.cents,
    p_as_of: asOf, p_notes: orNull(c.notes),
  }, ["/transactions", "/dashboard"]);
}
