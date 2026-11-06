/**
 * What the transaction forms show and compute before anything is saved.
 * The preview runs the SAME accounting code as the tests (buildPostingLines), so what you see is what will be posted.
 */
import type { FeeRule } from "@/lib/fees";
import { computeFee, findFeeRule } from "@/lib/fees";
import { buildPostingLines, balanceChanges, PostingError, profitEffectCents, type FeeMode, type LedgerLine, type PostingInput } from "@/lib/ledger/postings";
import { MoneyError, parsePesos, percentOfBps, type Rounding } from "@/lib/money";

export type Effects = {
  cash: number;
  gcash: number;
  load: number;
  owed: number;
  profit: number;
};

/** The effect of an entry on each balance, in plain terms (+ means the balance goes up). */
export function effectsOf(lines: readonly LedgerLine[]): Effects {
  const change = balanceChanges(lines);
  return {
    cash: change.CASH_DRAWER ?? 0,
    gcash: change.GCASH_WALLET ?? 0,
    load: change.LOAD_BALANCE ?? 0,
    owed: change.CUSTOMER_RECEIVABLES ?? 0,
    profit: profitEffectCents(lines),
  };
}

export type Preview = { ok: true; effects: Effects; lines: LedgerLine[] } | { ok: false; message: string };

const blank = (s: string | undefined) => (s ?? "").trim() === "";

/** An optional amount typed by a person: blank means zero. Returns null when it is not a valid amount. */
export function optionalCents(text: string | undefined): number | null {
  if (blank(text)) return 0;
  try {
    return parsePesos(text as string);
  } catch (error) {
    if (error instanceof MoneyError) return null;
    throw error;
  }
}

/** A required amount. Returns null when blank or invalid. */
export function requiredCents(text: string | undefined): number | null {
  if (blank(text)) return null;
  return optionalCents(text);
}

function tryBuild(input: PostingInput): Preview {
  try {
    const lines = buildPostingLines(input);
    return { ok: true, effects: effectsOf(lines), lines };
  } catch (error) {
    if (error instanceof PostingError) return { ok: false, message: error.message };
    throw error;
  }
}

export type ServiceFields = {
  type: "cash_in" | "cash_out";
  amount: string;
  fee: string;
  feeMode: FeeMode;
  unpaid: string;
  providerCost: string;
  customerId: string;
};

export function previewService(f: ServiceFields): Preview {
  const principal = requiredCents(f.amount);
  if (principal === null) return { ok: false, message: "Enter the amount to see what will happen." };
  const fee = optionalCents(f.fee);
  const unpaid = optionalCents(f.unpaid);
  const cost = optionalCents(f.providerCost);
  if (fee === null || unpaid === null || cost === null) return { ok: false, message: "One of the amounts is not valid." };
  const customerId = f.customerId === "" ? null : f.customerId;
  if (f.type === "cash_in") {
    return tryBuild({ type: "cash_in", principalCents: principal, feeCents: fee, feeMode: f.feeMode, creditCents: unpaid, providerCostCents: cost, customerId });
  }
  if (unpaid > 0) return { ok: false, message: "A cash-out cannot be left unpaid." };
  return tryBuild({ type: "cash_out", principalCents: principal, feeCents: fee, feeMode: f.feeMode, providerCostCents: cost, customerId });
}

export type LoadFields = {
  face: string;
  cost: string;
  price: string;
  source: "gcash_direct" | "prepaid_wallet";
  payment: "cash" | "gcash";
  unpaid: string;
  customerId: string;
};

export function previewLoad(f: LoadFields): Preview {
  const face = requiredCents(f.face);
  const cost = requiredCents(f.cost);
  const price = requiredCents(f.price);
  if (face === null || cost === null || price === null) return { ok: false, message: "Enter the load amount, what it cost you and the selling price." };
  const unpaid = optionalCents(f.unpaid);
  if (unpaid === null) return { ok: false, message: "The unpaid amount is not valid." };
  return tryBuild({
    type: "mobile_load", faceCents: face, costCents: cost, priceCents: price, source: f.source, payment: f.payment,
    creditCents: unpaid, customerId: f.customerId === "" ? null : f.customerId,
  });
}

/** What a load costs you when the product states its cost as a share of face value (basis points). */
export function suggestLoadCost(faceText: string, costBps: number | null, rounding: Rounding = "half_up"): number | null {
  if (costBps === null) return null;
  const face = requiredCents(faceText);
  if (face === null || face <= 0) return null;
  return percentOfBps(face, costBps, rounding);
}

export type FeeSuggestion = { feeCents: number; feeMode: FeeMode; ruleName: string };

/** The fee your rules suggest for this amount today, or null. The person can always change it. */
export function suggestFee(
  rules: readonly FeeRule[], serviceType: "cash_in" | "cash_out", amountText: string, businessDate: string, rounding: Rounding,
): FeeSuggestion | null {
  const principal = requiredCents(amountText);
  if (principal === null || principal <= 0) return null;
  const rule = findFeeRule(rules, { serviceType, principalCents: principal, businessDate });
  if (!rule) return null;
  return { feeCents: computeFee(rule, principal, rounding), feeMode: rule.feeMode, ruleName: rule.name };
}

/** Pesos as plain text for filling an input, for example 2000 -> "20.00". */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const a = Math.abs(cents);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`; // taste-skill-ignore: centavo digits, not a numbered label
}

export type AdjustmentKind = "transfer_cash_to_gcash" | "transfer_gcash_to_cash" | "load_topup" | "capital_contribution" | "capital_withdrawal";
export type FloatName = "CASH_DRAWER" | "GCASH_WALLET" | "LOAD_BALANCE";

export function previewAdjustment(f: { kind: AdjustmentKind; amount: string; account: FloatName }): Preview {
  const amount = requiredCents(f.amount);
  if (amount === null) return { ok: false, message: "Enter the amount to see what will happen." };
  switch (f.kind) {
    case "transfer_cash_to_gcash":
    case "transfer_gcash_to_cash":
      return tryBuild({ type: "float_adjustment", kind: f.kind, amountCents: amount });
    case "load_topup":
      if (f.account === "LOAD_BALANCE") return { ok: false, message: "Choose cash or the GCash wallet as what you paid with." };
      return tryBuild({ type: "float_adjustment", kind: "load_topup", amountCents: amount, fromAccount: f.account });
    default:
      return tryBuild({ type: "owner_capital", kind: f.kind, amountCents: amount, account: f.account });
  }
}

export function previewOpening(f: { cash: string; gcash: string; load: string }): Preview {
  const cash = optionalCents(f.cash);
  const gcash = optionalCents(f.gcash);
  const load = optionalCents(f.load);
  if (cash === null || gcash === null || load === null) return { ok: false, message: "One of the amounts is not valid." };
  return tryBuild({ type: "opening_balance", cashCents: cash, gcashCents: gcash, loadCents: load });
}

export function previewExpense(f: { amount: string; method: "cash" | "gcash" }): Preview {
  const amount = requiredCents(f.amount);
  if (amount === null) return { ok: false, message: "Enter the amount to see what will happen." };
  return tryBuild({ type: "expense", amountCents: amount, method: f.method });
}

/**
 * The customers to show in a picker while someone types a filter. The currently chosen customer is always
 * included, so narrowing the list can never silently change who a transaction is for.
 */
export function visibleCustomerOptions<T extends { id: string; name: string }>(customers: readonly T[], filter: string, selectedId: string): T[] {
  const f = filter.trim().toLowerCase();
  const matches = f === "" ? [...customers] : customers.filter((c) => c.name.toLowerCase().includes(f));
  const chosen = selectedId === "" ? undefined : customers.find((c) => c.id === selectedId);
  return chosen && !matches.some((c) => c.id === chosen.id) ? [chosen, ...matches] : matches;
}
