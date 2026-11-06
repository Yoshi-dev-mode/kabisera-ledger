/**
 * The accounting rules: how each kind of event moves the books.
 *
 * Sign convention (matches the database): amount > 0 is a DEBIT, < 0 is a CREDIT.
 * Assets and expenses grow with debits; income and equity grow with credits.
 *
 * "principal" is always the HEADLINE amount the customer asked for ("cash-in ₱1,000").
 * The service fee is either charged ON TOP, or DEDUCTED from what the customer receives.
 *
 * The database posting functions (migration 9) implement exactly these rules; both are tested against the
 * same cases in tests/fixtures/posting-cases.json. This module is also used for live previews in forms.
 */
import { assertCentavos, type Centavos } from "@/lib/money";

export const ACCOUNT_CODES = [
  "CASH_DRAWER", "GCASH_WALLET", "LOAD_BALANCE", "CUSTOMER_RECEIVABLES", "OWNER_EQUITY",
  "OPENING_BALANCE_EQUITY", "FEE_INCOME", "LOAD_MARGIN", "PROVIDER_COST", "BUSINESS_EXPENSES", "RECON_VARIANCE",
  "DEBT_ADJUSTMENTS",
] as const;
export type AccountCode = (typeof ACCOUNT_CODES)[number];

export const FLOAT_ACCOUNTS = ["CASH_DRAWER", "GCASH_WALLET", "LOAD_BALANCE"] as const;
export type FloatAccount = (typeof FLOAT_ACCOUNTS)[number];

export type LedgerLine = { account: AccountCode; customerId: string | null; amountCents: Centavos };

export class PostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostingError";
  }
}

export type FeeMode = "on_top" | "deducted";
export type Method = "cash" | "gcash";

export type PostingInput =
  | { type: "cash_in"; principalCents: number; feeCents: number; feeMode: FeeMode; creditCents?: number; providerCostCents?: number; customerId?: string | null }
  | { type: "cash_out"; principalCents: number; feeCents: number; feeMode: FeeMode; providerCostCents?: number; customerId?: string | null }
  | { type: "mobile_load"; faceCents: number; costCents: number; priceCents: number; source: "gcash_direct" | "prepaid_wallet"; payment: Method; creditCents?: number; customerId?: string | null }
  | { type: "debt_creation"; customerId: string; amountCents: number; source: Method }
  | { type: "debt_repayment"; customerId: string; amountCents: number; method: Method }
  /** Positive increases what the customer owes (a correction); negative reduces it (a discount or write-off). */
  | { type: "debt_adjustment"; customerId: string; amountCents: number }
  | { type: "expense"; amountCents: number; method: Method }
  | { type: "float_adjustment"; kind: "transfer_cash_to_gcash" | "transfer_gcash_to_cash"; amountCents: number }
  | { type: "float_adjustment"; kind: "load_topup"; amountCents: number; fromAccount: "CASH_DRAWER" | "GCASH_WALLET" }
  | { type: "owner_capital"; kind: "capital_contribution" | "capital_withdrawal"; amountCents: number; account: FloatAccount }
  | { type: "opening_balance"; cashCents: number; gcashCents: number; loadCents: number };

function need(condition: boolean, message: string): asserts condition {
  if (!condition) throw new PostingError(message);
}

function positive(value: number, label: string): number {
  assertCentavos(value, label);
  need(value > 0, `${label} must be greater than zero`);
  return value;
}

function nonNegative(value: number | undefined, label: string): number {
  const v = value ?? 0;
  assertCentavos(v, label);
  need(v >= 0, `${label} cannot be negative`);
  return v;
}

const line = (account: AccountCode, amountCents: number, customerId: string | null = null): LedgerLine => ({
  account, customerId, amountCents,
});

const methodAccount = (m: Method): AccountCode => (m === "cash" ? "CASH_DRAWER" : "GCASH_WALLET");

/** Combines lines that share an account and customer, drops zero lines, and sorts them predictably. */
export function mergeLines(lines: readonly LedgerLine[]): LedgerLine[] {
  const merged = new Map<string, LedgerLine>();
  for (const l of lines) {
    const key = `${l.account}|${l.customerId ?? ""}`;
    const existing = merged.get(key);
    if (existing) existing.amountCents += l.amountCents;
    else merged.set(key, { ...l });
  }
  return [...merged.values()]
    .filter((l) => l.amountCents !== 0)
    .sort((a, b) => (a.account === b.account ? (a.customerId ?? "").localeCompare(b.customerId ?? "") : a.account < b.account ? -1 : 1));
}

export function sumLines(lines: readonly LedgerLine[]): number {
  return lines.reduce((total, l) => total + l.amountCents, 0);
}

function finish(lines: LedgerLine[]): LedgerLine[] {
  const merged = mergeLines(lines);
  need(merged.length >= 2, "This would not change any balance");
  need(sumLines(merged) === 0, "Internal error: the entry does not balance");
  return merged;
}

export function buildPostingLines(input: PostingInput): LedgerLine[] {
  switch (input.type) {
    case "cash_in": {
      const principal = positive(input.principalCents, "Amount");
      const fee = nonNegative(input.feeCents, "Fee");
      const credit = nonNegative(input.creditCents, "Unpaid amount");
      const cost = nonNegative(input.providerCostCents, "Provider cost");
      const customer = input.customerId ?? null;
      need(credit === 0 || customer !== null, "Choose a customer to leave an amount unpaid");
      let cashTotal: number;
      let gcashOut: number;
      if (input.feeMode === "on_top") {
        cashTotal = principal + fee;
        gcashOut = principal;
      } else {
        need(fee < principal, "The fee must be less than the amount");
        cashTotal = principal;
        gcashOut = principal - fee;
      }
      need(credit <= cashTotal, "The unpaid amount is more than the customer owes you");
      return finish([
        line("CASH_DRAWER", cashTotal - credit),
        line("GCASH_WALLET", -(gcashOut + cost)),
        line("CUSTOMER_RECEIVABLES", credit, customer),
        line("FEE_INCOME", -fee),
        line("PROVIDER_COST", cost),
      ]);
    }

    case "cash_out": {
      const principal = positive(input.principalCents, "Amount");
      const fee = nonNegative(input.feeCents, "Fee");
      const cost = nonNegative(input.providerCostCents, "Provider cost");
      let gcashIn: number;
      let cashOut: number;
      if (input.feeMode === "on_top") {
        gcashIn = principal + fee;
        cashOut = principal;
      } else {
        need(fee < principal, "The fee must be less than the amount");
        gcashIn = principal;
        cashOut = principal - fee;
      }
      return finish([
        line("CASH_DRAWER", -cashOut),
        line("GCASH_WALLET", gcashIn - cost),
        line("FEE_INCOME", -fee),
        line("PROVIDER_COST", cost),
      ]);
    }

    case "mobile_load": {
      positive(input.faceCents, "Load amount");
      const cost = positive(input.costCents, "Cost of the load");
      const price = positive(input.priceCents, "Selling price");
      const credit = nonNegative(input.creditCents, "Unpaid amount");
      const customer = input.customerId ?? null;
      need(credit === 0 || customer !== null, "Choose a customer to leave an amount unpaid");
      need(credit <= price, "The unpaid amount is more than the selling price");
      return finish([
        line(methodAccount(input.payment), price - credit),
        line("CUSTOMER_RECEIVABLES", credit, customer),
        line(input.source === "prepaid_wallet" ? "LOAD_BALANCE" : "GCASH_WALLET", -cost),
        line("LOAD_MARGIN", -(price - cost)),
      ]);
    }

    case "debt_creation": {
      const amount = positive(input.amountCents, "Amount");
      return finish([line(methodAccount(input.source), -amount), line("CUSTOMER_RECEIVABLES", amount, input.customerId)]);
    }

    case "debt_repayment": {
      const amount = positive(input.amountCents, "Amount");
      return finish([line(methodAccount(input.method), amount), line("CUSTOMER_RECEIVABLES", -amount, input.customerId)]);
    }

    case "debt_adjustment": {
      assertCentavos(input.amountCents, "Amount");
      need(input.amountCents !== 0, "The adjustment must not be zero");
      return finish([
        line("CUSTOMER_RECEIVABLES", input.amountCents, input.customerId),
        line("DEBT_ADJUSTMENTS", -input.amountCents),
      ]);
    }

    case "expense": {
      const amount = positive(input.amountCents, "Amount");
      return finish([line("BUSINESS_EXPENSES", amount), line(methodAccount(input.method), -amount)]);
    }

    case "float_adjustment": {
      const amount = positive(input.amountCents, "Amount");
      switch (input.kind) {
        case "transfer_cash_to_gcash":
          return finish([line("CASH_DRAWER", -amount), line("GCASH_WALLET", amount)]);
        case "transfer_gcash_to_cash":
          return finish([line("GCASH_WALLET", -amount), line("CASH_DRAWER", amount)]);
        case "load_topup":
          return finish([line(input.fromAccount, -amount), line("LOAD_BALANCE", amount)]);
      }
    }

    case "owner_capital": {
      const amount = positive(input.amountCents, "Amount");
      const sign = input.kind === "capital_contribution" ? 1 : -1;
      return finish([line(input.account, sign * amount), line("OWNER_EQUITY", -sign * amount)]);
    }

    case "opening_balance": {
      const cash = nonNegative(input.cashCents, "Cash");
      const gcash = nonNegative(input.gcashCents, "GCash");
      const load = nonNegative(input.loadCents, "Load");
      need(cash + gcash + load > 0, "Enter at least one opening balance above zero");
      return finish([
        line("CASH_DRAWER", cash),
        line("GCASH_WALLET", gcash),
        line("LOAD_BALANCE", load),
        line("OPENING_BALANCE_EQUITY", -(cash + gcash + load)),
      ]);
    }
  }
}

/** The mirror image of an entry, used by voids. */
export function reverseLines(lines: readonly LedgerLine[]): LedgerLine[] {
  return lines.map((l) => ({ ...l, amountCents: -l.amountCents }));
}

/** Change to each account's own-sign balance (assets and expenses: debit-positive; income and equity: credit-positive). */
export function balanceChanges(lines: readonly LedgerLine[]): Partial<Record<AccountCode, number>> {
  const out: Partial<Record<AccountCode, number>> = {};
  for (const l of lines) {
    const creditNormal = ["OWNER_EQUITY", "OPENING_BALANCE_EQUITY", "FEE_INCOME", "LOAD_MARGIN"].includes(l.account);
    out[l.account] = (out[l.account] ?? 0) + (creditNormal ? -l.amountCents : l.amountCents);
  }
  return out;
}

/**
 * Profit effect of an entry: fees and load margin earned, minus provider cost, operating expenses and debt write-offs.
 * Principal, repayments, capital and opening balances never count. Reconciliation variance is reported separately.
 */
export function profitEffectCents(lines: readonly LedgerLine[]): number {
  let profit = 0;
  for (const l of lines) {
    if (l.account === "FEE_INCOME" || l.account === "LOAD_MARGIN") profit -= l.amountCents;
    if (l.account === "PROVIDER_COST" || l.account === "BUSINESS_EXPENSES" || l.account === "DEBT_ADJUSTMENTS") profit -= l.amountCents;
  }
  return profit;
}
