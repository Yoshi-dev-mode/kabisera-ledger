"use server";

import { revalidatePath } from "next/cache";
import { failure, success, type ActionState } from "@/lib/action-state";
import { getOwnerActionSession } from "@/lib/auth/session";
import { friendlyDbError } from "@/lib/errors";
import { formDate, formMoney, formText, optionalMoney, parsePercentToBps } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { isBusinessDateString } from "@/lib/time";
import { isUuid } from "@/lib/uuid";

const NOT_OWNER = failure("Only the owner can change settings.");

export async function saveRulesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await getOwnerActionSession())) return NOT_OWNER;
  const pick = (name: string, allowed: string[]) => {
    const v = formText(formData, name);
    return allowed.includes(v) ? v : null;
  };
  const cashIn = pick("cashInMode", ["on_top", "deducted"]);
  const cashOut = pick("cashOutMode", ["on_top", "deducted"]);
  const rounding = pick("rounding", ["half_up", "down", "up"]);
  if (!cashIn || !cashOut || !rounding) return failure("Choose a value for each setting.");
  const settings: [string, unknown][] = [
    ["fees.cash_in.default_mode", cashIn],
    ["fees.cash_out.default_mode", cashOut],
    ["fees.percent_rounding", rounding],
    ["policy.allow_negative_floats", formData.get("allowNegative") === "on"],
    ["policy.require_gcash_reference", formData.get("requireReference") === "on"],
  ];
  const supabase = await createClient();
  for (const [key, value] of settings) {
    const { error } = await supabase.rpc("save_app_setting", { p_key: key, p_value: value });
    if (error) return failure(friendlyDbError(error, "The settings could not be saved."));
  }
  revalidatePath("/settings");
  return success("Saved. New transactions use these rules; past transactions are not changed.");
}

export async function saveFeeRuleAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await getOwnerActionSession())) return NOT_OWNER;
  const id = formText(formData, "id");
  const service = formText(formData, "service");
  const mode = formText(formData, "mode");
  const name = formText(formData, "name");
  const min = optionalMoney(formData, "min", "the lowest amount");
  const maxText = formText(formData, "max");
  const max = maxText === "" ? ({ ok: true, cents: null } as const) : formMoney(formData, "max", "the highest amount");
  const flat = optionalMoney(formData, "flat", "the flat fee");
  const percentText = formText(formData, "percent");
  const percent = percentText === "" ? ({ ok: true, bps: 0 } as const) : parsePercentToBps(percentText, "The percentage");
  const from = formDate(formData, "from", isBusinessDateString);
  const toText = formText(formData, "to");
  const to = formDate(formData, "to", isBusinessDateString);

  if (id !== "" && !isUuid(id)) return failure("That rule was not found.");
  if (service !== "cash_in" && service !== "cash_out") return failure("Choose cash-in or cash-out.");
  if (mode !== "on_top" && mode !== "deducted") return failure("Choose how the fee is charged.");
  if (name === "" || name.length > 80) return failure("Give the rule a short name.");
  if (!min.ok) return failure(min.message);
  if (!max.ok) return failure(max.message);
  if (!flat.ok) return failure(flat.message);
  if (!percent.ok) return failure(percent.message);
  if (from === null) return failure("Enter the date the rule starts.");
  if (toText !== "" && to === null) return failure("The end date is not a real date.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_fee_rule", {
    p_id: id === "" ? null : id,
    p_service_type: service,
    p_name: name,
    p_fee_mode: mode,
    p_min_cents: min.cents,
    p_max_cents: max.cents,
    p_flat_cents: flat.cents,
    p_percent_bps: percent.bps,
    p_from: from,
    p_to: to,
    p_active: formData.get("active") === "on",
    p_notes: null,
  });
  if (error) return failure(friendlyDbError(error, "The fee rule could not be saved."));
  revalidatePath("/settings");
  return success("Saved. It applies to new transactions only.");
}

export async function saveLoadProductAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await getOwnerActionSession())) return NOT_OWNER;
  const id = formText(formData, "id");
  const network = formText(formData, "network");
  const label = formText(formData, "label");
  const source = formText(formData, "source");
  const costText = formText(formData, "cost");
  const cost = costText === "" ? ({ ok: true, bps: null } as const) : parsePercentToBps(costText, "The cost share");
  if (id !== "" && !isUuid(id)) return failure("That product was not found.");
  if (network === "" || network.length > 40 || label === "" || label.length > 80) return failure("Give the network and a label.");
  if (source !== "gcash_direct" && source !== "prepaid_wallet") return failure("Choose where this load usually comes from.");
  if (!cost.ok) return failure(cost.message);
  if (cost.bps === 0) return failure("The cost share must be above 0%.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_load_product", {
    p_id: id === "" ? null : id, p_network: network, p_label: label, p_default_source: source,
    p_cost_bps: cost.bps, p_active: formData.get("active") === "on",
  });
  if (error) return failure(friendlyDbError(error, "The product could not be saved."));
  revalidatePath("/settings");
  return success("Saved.");
}

export async function saveCategoryAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await getOwnerActionSession())) return NOT_OWNER;
  const id = formText(formData, "id");
  const name = formText(formData, "name");
  if (id !== "" && !isUuid(id)) return failure("That category was not found.");
  if (name === "" || name.length > 80) return failure("Give the category a short name.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_expense_category", { p_id: id === "" ? null : id, p_name: name, p_active: formData.get("active") === "on" || id === "" });
  if (error) return failure(friendlyDbError(error, "The category could not be saved."));
  revalidatePath("/settings");
  return success("Saved.");
}

const FLOATS = ["CASH_DRAWER", "GCASH_WALLET", "LOAD_BALANCE"] as const;

export async function saveThresholdsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await getOwnerActionSession())) return NOT_OWNER;
  const values: [string, number | null][] = [];
  for (const code of FLOATS) {
    const text = formText(formData, `t_${code}`);
    if (text === "") {
      values.push([code, null]);
      continue;
    }
    const money = formMoney(formData, `t_${code}`, "the warning level", { allowZero: true });
    if (!money.ok) return failure(money.message);
    values.push([code, money.cents]);
  }
  const supabase = await createClient();
  for (const [code, cents] of values) {
    const { error } = await supabase.rpc("set_account_threshold", { p_code: code, p_cents: cents });
    if (error) return failure(friendlyDbError(error, "The warning levels could not be saved."));
  }
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return success("Saved.");
}

