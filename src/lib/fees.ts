import { percentOfBps, type Centavos, type Rounding } from "@/lib/money";

/** A row of fee_rules. Amount ranges are [min, max) and dates are [from, to). */
export type FeeRule = {
  id: string;
  serviceType: "cash_in" | "cash_out";
  name: string;
  feeMode: "on_top" | "deducted";
  minAmountCents: number;
  maxAmountCents: number | null;
  flatFeeCents: number;
  percentBps: number;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null;
  isActive: boolean;
};

/** The single active rule that covers this amount on this business date, or null. (The database forbids overlaps.) */
export function findFeeRule(
  rules: readonly FeeRule[],
  query: { serviceType: "cash_in" | "cash_out"; principalCents: Centavos; businessDate: string },
): FeeRule | null {
  const matches = rules.filter(
    (r) =>
      r.isActive &&
      r.serviceType === query.serviceType &&
      query.principalCents >= r.minAmountCents &&
      (r.maxAmountCents === null || query.principalCents < r.maxAmountCents) &&
      query.businessDate >= r.effectiveFrom &&
      (r.effectiveTo === null || query.businessDate < r.effectiveTo),
  );
  return matches[0] ?? null;
}

/** flat + percentage, rounded as configured. Suggestions only: the person can always override the fee. */
export function computeFee(rule: Pick<FeeRule, "flatFeeCents" | "percentBps">, principalCents: Centavos, rounding: Rounding = "half_up"): Centavos {
  return rule.flatFeeCents + percentOfBps(principalCents, rule.percentBps, rounding);
}
