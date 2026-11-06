import { describe, expect, it } from "vitest";
import { computeFee, findFeeRule, type FeeRule } from "@/lib/fees";

const rule = (over: Partial<FeeRule>): FeeRule => ({
  id: "r", serviceType: "cash_in", name: "r", feeMode: "on_top", minAmountCents: 0, maxAmountCents: null,
  flatFeeCents: 0, percentBps: 0, effectiveFrom: "2026-01-01", effectiveTo: null, isActive: true, ...over,
});

const tiers: FeeRule[] = [
  rule({ id: "small", maxAmountCents: 50001, flatFeeCents: 1000 }),
  rule({ id: "large", minAmountCents: 50001, percentBps: 200 }),
  rule({ id: "out", serviceType: "cash_out", flatFeeCents: 2000, feeMode: "deducted" }),
];
const find = (principalCents: number, serviceType: "cash_in" | "cash_out" = "cash_in", businessDate = "2026-10-24") =>
  findFeeRule(tiers, { serviceType, principalCents, businessDate })?.id ?? null;

describe("findFeeRule", () => {
  it("picks the tier that covers the amount, with the lower bound included and the upper excluded", () => {
    expect(find(1)).toBe("small");
    expect(find(50000)).toBe("small");
    expect(find(50001)).toBe("large");
    expect(find(10_000_000)).toBe("large");
  });

  it("is specific to the service", () => {
    expect(find(100000, "cash_out")).toBe("out");
  });

  it("respects effective dates and the active flag", () => {
    expect(find(100, "cash_in", "2025-12-31")).toBeNull();
    const dated = [rule({ id: "d", effectiveFrom: "2026-03-01", effectiveTo: "2026-04-01" })];
    const at = (d: string) => findFeeRule(dated, { serviceType: "cash_in", principalCents: 100, businessDate: d })?.id ?? null;
    expect(at("2026-02-28")).toBeNull();
    expect(at("2026-03-01")).toBe("d");
    expect(at("2026-03-31")).toBe("d");
    expect(at("2026-04-01")).toBeNull();
    expect(findFeeRule([rule({ isActive: false })], { serviceType: "cash_in", principalCents: 100, businessDate: "2026-10-24" })).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(findFeeRule([], { serviceType: "cash_in", principalCents: 100, businessDate: "2026-10-24" })).toBeNull();
  });
});

describe("computeFee", () => {
  it("adds a flat fee and a percentage, rounded as configured", () => {
    expect(computeFee({ flatFeeCents: 1000, percentBps: 0 }, 40000)).toBe(1000);
    expect(computeFee({ flatFeeCents: 0, percentBps: 200 }, 100000)).toBe(2000);
    expect(computeFee({ flatFeeCents: 500, percentBps: 150 }, 100000)).toBe(2000);
    expect(computeFee({ flatFeeCents: 0, percentBps: 25 }, 1000, "half_up")).toBe(3);
    expect(computeFee({ flatFeeCents: 0, percentBps: 25 }, 1000, "down")).toBe(2);
  });
});
