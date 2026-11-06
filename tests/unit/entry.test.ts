import { describe, expect, it } from "vitest";
import { centsToInput, optionalCents, previewLoad, previewService, requiredCents, suggestFee, suggestLoadCost } from "@/lib/entry";
import type { FeeRule } from "@/lib/fees";
import { DEFAULT_SETTINGS, parseCategories, parseFeeRules, parseLoadProducts, parseSettings, parseThresholds } from "@/lib/data/settings";

const base = { type: "cash_in" as const, amount: "1000", fee: "20", feeMode: "on_top" as const, unpaid: "", providerCost: "", customerId: "" };

describe("optionalCents / requiredCents", () => {
  it("treats blank as zero only where allowed", () => {
    expect(optionalCents("")).toBe(0);
    expect(optionalCents("  ")).toBe(0);
    expect(optionalCents("12.50")).toBe(1250);
    expect(optionalCents("abc")).toBeNull();
    expect(optionalCents("-5")).toBeNull();
    expect(requiredCents("")).toBeNull();
    expect(requiredCents("1,000")).toBe(100000);
    expect(requiredCents("1.234")).toBeNull();
  });
});

describe("previewService", () => {
  it("shows the effect of a plain cash-in", () => {
    const p = previewService(base);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.effects).toEqual({ cash: 102000, gcash: -100000, load: 0, owed: 0, profit: 2000 });
  });

  it("shows part of a cash-in left unpaid as money owed, not cash", () => {
    const p = previewService({ ...base, unpaid: "520", customerId: "C1" });
    expect(p.ok && p.effects).toEqual({ cash: 50000, gcash: -100000, load: 0, owed: 52000, profit: 2000 });
  });

  it("shows a cash-out with the fee on top", () => {
    const p = previewService({ ...base, type: "cash_out", feeMode: "on_top" });
    expect(p.ok && p.effects).toEqual({ cash: -100000, gcash: 102000, load: 0, owed: 0, profit: 2000 });
  });

  it("explains problems instead of throwing", () => {
    expect(previewService({ ...base, amount: "" })).toEqual({ ok: false, message: "Enter the amount to see what will happen." });
    expect(previewService({ ...base, fee: "x" })).toEqual({ ok: false, message: "One of the amounts is not valid." });
    expect(previewService({ ...base, unpaid: "500" })).toEqual({ ok: false, message: "Choose a customer to leave an amount unpaid" });
    expect(previewService({ ...base, type: "cash_out", unpaid: "5", customerId: "C1" })).toEqual({ ok: false, message: "A cash-out cannot be left unpaid." });
    const p = previewService({ ...base, feeMode: "deducted", fee: "1000" });
    expect(p.ok).toBe(false);
  });

  it("includes the provider cost as a cost that lowers profit", () => {
    const p = previewService({ ...base, providerCost: "5" });
    expect(p.ok && p.effects.profit).toBe(1500);
    expect(p.ok && p.effects.gcash).toBe(-100500);
  });
});

describe("previewLoad", () => {
  const load = { face: "100", cost: "97", price: "100", source: "prepaid_wallet" as const, payment: "cash" as const, unpaid: "", customerId: "" };
  it("shows margin as profit and takes cost from the load balance", () => {
    const p = previewLoad(load);
    expect(p.ok && p.effects).toEqual({ cash: 10000, gcash: 0, load: -9700, owed: 0, profit: 300 });
  });
  it("takes the cost from GCash when bought straight from GCash", () => {
    const p = previewLoad({ ...load, source: "gcash_direct", payment: "gcash", price: "103" });
    expect(p.ok && p.effects).toEqual({ cash: 0, gcash: 600, load: 0, owed: 0, profit: 600 });
  });
  it("asks for the cost and price", () => {
    expect(previewLoad({ ...load, cost: "" }).ok).toBe(false);
    expect(previewLoad({ ...load, price: "" }).ok).toBe(false);
  });
  it("suggests the cost from a product's cost share", () => {
    expect(suggestLoadCost("100", 9700)).toBe(9700);
    expect(suggestLoadCost("150", 9650)).toBe(14475);
    expect(suggestLoadCost("100", null)).toBeNull();
    expect(suggestLoadCost("", 9700)).toBeNull();
  });
});

describe("suggestFee", () => {
  const rule = (o: Partial<FeeRule>): FeeRule => ({
    id: "r", serviceType: "cash_in", name: "Standard", feeMode: "on_top", minAmountCents: 0, maxAmountCents: null,
    flatFeeCents: 0, percentBps: 200, effectiveFrom: "2026-01-01", effectiveTo: null, isActive: true, ...o,
  });
  it("suggests the fee and mode from the matching rule", () => {
    expect(suggestFee([rule({})], "cash_in", "1000", "2026-10-24", "half_up")).toEqual({ feeCents: 2000, feeMode: "on_top", ruleName: "Standard" });
    expect(suggestFee([rule({ feeMode: "deducted", flatFeeCents: 500, percentBps: 0 })], "cash_in", "300", "2026-10-24", "half_up")?.feeMode).toBe("deducted");
  });
  it("suggests nothing without a rule or an amount", () => {
    expect(suggestFee([], "cash_in", "1000", "2026-10-24", "half_up")).toBeNull();
    expect(suggestFee([rule({})], "cash_out", "1000", "2026-10-24", "half_up")).toBeNull();
    expect(suggestFee([rule({})], "cash_in", "", "2026-10-24", "half_up")).toBeNull();
    expect(suggestFee([rule({})], "cash_in", "abc", "2026-10-24", "half_up")).toBeNull();
  });
  it("formats cents for an input", () => {
    expect(centsToInput(2000)).toBe("20.00");
    expect(centsToInput(5)).toBe("0.05");
    expect(centsToInput(-150)).toBe("-1.50");
  });
});

describe("settings parsers", () => {
  it("reads settings and falls back to safe defaults", () => {
    const s = parseSettings([
      { key: "fees.cash_in.default_mode", value: "deducted" },
      { key: "fees.cash_out.default_mode", value: "on_top" },
      { key: "fees.percent_rounding", value: "down" },
      { key: "policy.allow_negative_floats", value: true },
      { key: "policy.require_gcash_reference", value: "yes" },
    ]);
    expect(s).toEqual({ cashInMode: "deducted", cashOutMode: "on_top", rounding: "down", allowNegativeFloats: true, requireGcashReference: false });
    expect(parseSettings([])).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it("reads fee rules, products, categories and thresholds, rejecting nonsense", () => {
    const rules = parseFeeRules([{ id: "1", service_type: "cash_in", name: "A", fee_mode: "on_top", min_amount_cents: 0, max_amount_cents: null, flat_fee_cents: 1000, percent_bps: 0, effective_from: "2026-01-01", effective_to: null, is_active: true }]);
    expect(rules[0]?.flatFeeCents).toBe(1000);
    expect(() => parseFeeRules([{ id: "1", service_type: "load", name: "A", fee_mode: "on_top" }])).toThrow("unknown service");
    expect(parseLoadProducts([{ id: "p", network: "Globe", label: "Regular", default_source: "prepaid_wallet", cost_bps_of_face: 9700, is_active: true }])[0]?.costBpsOfFace).toBe(9700);
    expect(() => parseLoadProducts([{ id: "p", network: "G", label: "R", default_source: "magic", cost_bps_of_face: null, is_active: true }])).toThrow("unknown load source");
    expect(parseCategories([{ id: "c", name: "Rent", is_active: true }])[0]?.name).toBe("Rent");
    expect(parseThresholds([{ code: "CASH_DRAWER", name: "Cash drawer", low_threshold_cents: null }])[0]?.thresholdCents).toBeNull();
  });
});

import { previewAdjustment, previewExpense, previewOpening } from "@/lib/entry";
import { bpsToPercentText, optionalMoney, parsePercentToBps } from "@/lib/forms";

describe("other previews", () => {
  it("previews transfers, top-ups and capital", () => {
    const t = previewAdjustment({ kind: "transfer_cash_to_gcash", amount: "1000", account: "CASH_DRAWER" });
    expect(t.ok && t.effects).toEqual({ cash: -100000, gcash: 100000, load: 0, owed: 0, profit: 0 });
    const l = previewAdjustment({ kind: "load_topup", amount: "5000", account: "GCASH_WALLET" });
    expect(l.ok && l.effects).toEqual({ cash: 0, gcash: -500000, load: 500000, owed: 0, profit: 0 });
    expect(previewAdjustment({ kind: "load_topup", amount: "5000", account: "LOAD_BALANCE" }).ok).toBe(false);
    const c = previewAdjustment({ kind: "capital_withdrawal", amount: "100", account: "GCASH_WALLET" });
    expect(c.ok && c.effects.gcash).toBe(-10000);
    expect(c.ok && c.effects.profit).toBe(0);
  });
  it("previews opening balances and expenses", () => {
    const o = previewOpening({ cash: "1,400", gcash: "", load: "" });
    expect(o.ok && o.effects).toEqual({ cash: 140000, gcash: 0, load: 0, owed: 0, profit: 0 });
    expect(previewOpening({ cash: "", gcash: "", load: "" }).ok).toBe(false);
    const e = previewExpense({ amount: "50", method: "cash" });
    expect(e.ok && e.effects).toEqual({ cash: -5000, gcash: 0, load: 0, owed: 0, profit: -5000 });
  });
});

describe("percentages and optional money", () => {
  const form = (v: string) => { const f = new FormData(); f.set("a", v); return f; };
  it("converts percentages to basis points and back", () => {
    expect(parsePercentToBps("2", "x")).toEqual({ ok: true, bps: 200 });
    expect(parsePercentToBps("1.5%", "x")).toEqual({ ok: true, bps: 150 });
    expect(parsePercentToBps("0.25", "x")).toEqual({ ok: true, bps: 25 });
    expect(parsePercentToBps("100", "x")).toEqual({ ok: true, bps: 10000 });
    expect(parsePercentToBps("100.01", "x").ok).toBe(false);
    expect(parsePercentToBps("101", "x").ok).toBe(false);
    expect(parsePercentToBps("1.234", "x").ok).toBe(false);
    expect(parsePercentToBps("-1", "x").ok).toBe(false);
    expect(parsePercentToBps("", "x").ok).toBe(false);
    expect([200, 150, 25, 10000, 0, 5].map(bpsToPercentText)).toEqual(["2", "1.5", "0.25", "100", "0", "0.05"]);
  });
  it("treats a blank optional amount as zero", () => {
    expect(optionalMoney(form(""), "a", "the fee")).toEqual({ ok: true, cents: 0 });
    expect(optionalMoney(form("12.50"), "a", "the fee")).toEqual({ ok: true, cents: 1250 });
    expect(optionalMoney(form("-1"), "a", "the fee").ok).toBe(false);
    expect(optionalMoney(form("abc"), "a", "the fee").ok).toBe(false);
  });
});

import { visibleCustomerOptions } from "@/lib/entry";

describe("visibleCustomerOptions", () => {
  const people = [{ id: "1", name: "Ken" }, { id: "2", name: "Cee jay" }, { id: "3", name: "Cj" }, { id: "4", name: "Kenneth" }];
  it("filters by part of a name, ignoring case", () => {
    expect(visibleCustomerOptions(people, "ken", "").map((c) => c.id)).toEqual(["1", "4"]);
    expect(visibleCustomerOptions(people, "  CJ ", "").map((c) => c.id)).toEqual(["3"]);
    expect(visibleCustomerOptions(people, "", "")).toHaveLength(4);
    expect(visibleCustomerOptions(people, "zzz", "")).toEqual([]);
  });
  it("never drops the chosen customer, so typing cannot change who a transaction is for", () => {
    const out = visibleCustomerOptions(people, "cee", "1"); // Ken is chosen but does not match "cee"
    expect(out.map((c) => c.id)).toEqual(["1", "2"]);
    expect(visibleCustomerOptions(people, "zzz", "3").map((c) => c.id)).toEqual(["3"]);
    expect(visibleCustomerOptions(people, "ken", "1").map((c) => c.id)).toEqual(["1", "4"]); // no duplicate
  });
});
