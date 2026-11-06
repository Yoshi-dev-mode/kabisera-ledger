import type { FeeRule } from "@/lib/fees";
import type { Rounding } from "@/lib/money";
import { asRows, bool, int, intOrNull, str, strOrNull } from "@/lib/data/parse";

export type FeeMode = "on_top" | "deducted";

export type AppSettings = {
  cashInMode: FeeMode;
  cashOutMode: FeeMode;
  rounding: Rounding;
  allowNegativeFloats: boolean;
  requireGcashReference: boolean;
};

/** Safe defaults used only if a setting row is missing or malformed (never silently more permissive). */
export const DEFAULT_SETTINGS: AppSettings = {
  cashInMode: "on_top",
  cashOutMode: "deducted",
  rounding: "half_up",
  allowNegativeFloats: false,
  requireGcashReference: false,
};

/** Reads rows of app_settings ({key, value}) into typed settings. Unknown or invalid values fall back to the safe default. */
export function parseSettings(value: unknown): AppSettings {
  const map = new Map<string, unknown>();
  for (const row of asRows(value, "settings")) map.set(str(row, "key"), row.value);
  const mode = (key: string, fallback: FeeMode): FeeMode => {
    const v = map.get(key);
    return v === "on_top" || v === "deducted" ? v : fallback;
  };
  const rounding = map.get("fees.percent_rounding");
  const flag = (key: string, fallback: boolean) => (typeof map.get(key) === "boolean" ? (map.get(key) as boolean) : fallback);
  return {
    cashInMode: mode("fees.cash_in.default_mode", DEFAULT_SETTINGS.cashInMode),
    cashOutMode: mode("fees.cash_out.default_mode", DEFAULT_SETTINGS.cashOutMode),
    rounding: rounding === "half_up" || rounding === "down" || rounding === "up" ? rounding : DEFAULT_SETTINGS.rounding,
    allowNegativeFloats: flag("policy.allow_negative_floats", DEFAULT_SETTINGS.allowNegativeFloats),
    requireGcashReference: flag("policy.require_gcash_reference", DEFAULT_SETTINGS.requireGcashReference),
  };
}

export function parseFeeRules(value: unknown): FeeRule[] {
  return asRows(value, "fee rules").map((r): FeeRule => {
    const service = str(r, "service_type");
    const mode = str(r, "fee_mode");
    if (service !== "cash_in" && service !== "cash_out") throw new Error(`unknown service: ${service}`);
    if (mode !== "on_top" && mode !== "deducted") throw new Error(`unknown fee mode: ${mode}`);
    return {
      id: str(r, "id"),
      serviceType: service,
      name: str(r, "name"),
      feeMode: mode,
      minAmountCents: int(r, "min_amount_cents"),
      maxAmountCents: intOrNull(r, "max_amount_cents"),
      flatFeeCents: int(r, "flat_fee_cents"),
      percentBps: int(r, "percent_bps"),
      effectiveFrom: str(r, "effective_from"),
      effectiveTo: strOrNull(r, "effective_to"),
      isActive: bool(r, "is_active"),
    };
  });
}

export type LoadProduct = {
  id: string;
  network: string;
  label: string;
  defaultSource: "gcash_direct" | "prepaid_wallet";
  costBpsOfFace: number | null;
  isActive: boolean;
};

export function parseLoadProducts(value: unknown): LoadProduct[] {
  return asRows(value, "load products").map((r) => {
    const source = str(r, "default_source");
    if (source !== "gcash_direct" && source !== "prepaid_wallet") throw new Error(`unknown load source: ${source}`);
    return {
      id: str(r, "id"),
      network: str(r, "network"),
      label: str(r, "label"),
      defaultSource: source,
      costBpsOfFace: intOrNull(r, "cost_bps_of_face"),
      isActive: bool(r, "is_active"),
    };
  });
}

export type ExpenseCategory = { id: string; name: string; isActive: boolean };

export function parseCategories(value: unknown): ExpenseCategory[] {
  return asRows(value, "expense categories").map((r) => ({ id: str(r, "id"), name: str(r, "name"), isActive: bool(r, "is_active") }));
}

export type AccountThreshold = { code: string; name: string; thresholdCents: number | null };

export function parseThresholds(value: unknown): AccountThreshold[] {
  return asRows(value, "accounts").map((r) => ({ code: str(r, "code"), name: str(r, "name"), thresholdCents: intOrNull(r, "low_threshold_cents") }));
}
