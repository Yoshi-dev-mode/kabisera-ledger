import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  balanceChanges,
  buildPostingLines,
  mergeLines,
  PostingError,
  profitEffectCents,
  reverseLines,
  sumLines,
  type LedgerLine,
  type PostingInput,
} from "@/lib/ledger/postings";

it.each(["cash", "gcash"] as const)("posts only the tip as income on a %s repayment", (method) => {
  const lines = buildPostingLines({ type: "debt_repayment", customerId: "C1", amountCents: 100500, tipCents: 2000, method });
  expect(balanceChanges(lines)).toEqual({
    [method === "cash" ? "CASH_DRAWER" : "GCASH_WALLET"]: 102500,
    CUSTOMER_RECEIVABLES: -100500,
    TIP_INCOME: 2000,
  });
  expect(profitEffectCents(lines)).toBe(2000);
  expect(profitEffectCents(lines.map((line) => ({ ...line, amountCents: -line.amountCents })))).toBe(-2000);
  expect(() => buildPostingLines({ type: "debt_repayment", customerId: "C1", amountCents: 100500, tipCents: -1, method })).toThrow("Tip cannot be negative");
});

type Fixture = {
  cases: {
    name: string;
    input: PostingInput;
    lines: { account: LedgerLine["account"]; customer: string | null; amountCents: number }[];
    profitCents: number;
  }[];
};

const fixture: Fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/posting-cases.json", import.meta.url)), "utf8"),
);

const normalise = (lines: readonly { account: string; customer?: string | null; customerId?: string | null; amountCents: number }[]) =>
  lines
    .map((l) => `${l.account}|${l.customer ?? l.customerId ?? ""}|${l.amountCents}`)
    .sort();

describe("posting rules against the hand-derived cases", () => {
  it("has the expected number of cases", () => {
    expect(fixture.cases).toHaveLength(20);
  });

  for (const c of fixture.cases) {
    it(`posts: ${c.name}`, () => {
      const lines = buildPostingLines(c.input);
      expect(normalise(lines)).toEqual(normalise(c.lines));
      expect(sumLines(lines)).toBe(0);
      expect(profitEffectCents(lines)).toBe(c.profitCents);
      // a void is the exact mirror image and also nets to nothing
      const reversed = reverseLines(lines);
      expect(sumLines(reversed)).toBe(0);
      expect(sumLines([...lines, ...reversed])).toBe(0);
      expect(mergeLines([...lines, ...reversed])).toEqual([]);
    });
  }
});

describe("the principles from the brief", () => {
  it("never counts the principal of a cash-in or cash-out as profit", () => {
    const cashIn = buildPostingLines({ type: "cash_in", principalCents: 5_000_000, feeCents: 5000, feeMode: "on_top" });
    const cashOut = buildPostingLines({ type: "cash_out", principalCents: 5_000_000, feeCents: 5000, feeMode: "deducted" });
    expect(profitEffectCents(cashIn)).toBe(5000);
    expect(profitEffectCents(cashOut)).toBe(5000);
  });

  it("does not count a repayment as revenue", () => {
    const repayment = buildPostingLines({ type: "debt_repayment", customerId: "C1", amountCents: 99_999, method: "cash" });
    expect(profitEffectCents(repayment)).toBe(0);
  });

  it("keeps customer debt out of cash and GCash", () => {
    const sale = buildPostingLines({ type: "cash_in", principalCents: 100000, feeCents: 2000, feeMode: "on_top", creditCents: 102000, customerId: "C1" });
    const change = balanceChanges(sale);
    expect(change.CASH_DRAWER).toBeUndefined(); // nothing was paid in cash
    expect(change.CUSTOMER_RECEIVABLES).toBe(102000);
    expect(change.GCASH_WALLET).toBe(-100000);
  });

  it("treats owner capital and opening balances as neither revenue nor expense", () => {
    expect(profitEffectCents(buildPostingLines({ type: "owner_capital", kind: "capital_contribution", amountCents: 140000, account: "CASH_DRAWER" }))).toBe(0);
    expect(profitEffectCents(buildPostingLines({ type: "opening_balance", cashCents: 140000, gcashCents: 0, loadCents: 0 }))).toBe(0);
  });

  it("treats a debt write-off as a cost that lowers profit, and moves no cash", () => {
    const off = buildPostingLines({ type: "debt_adjustment", customerId: "C1", amountCents: -2500 });
    expect(profitEffectCents(off)).toBe(-2500);
    const change = balanceChanges(off);
    expect(change.CASH_DRAWER).toBeUndefined();
    expect(change.GCASH_WALLET).toBeUndefined();
    expect(change.CUSTOMER_RECEIVABLES).toBe(-2500);
  });

  it("keeps the three float accounts separate", () => {
    const change = balanceChanges(buildPostingLines({ type: "opening_balance", cashCents: 1, gcashCents: 2, loadCents: 3 }));
    expect([change.CASH_DRAWER, change.GCASH_WALLET, change.LOAD_BALANCE]).toEqual([1, 2, 3]);
  });
});

describe("invalid requests are rejected", () => {
  const reject = (input: PostingInput, message: string) =>
    expect(() => buildPostingLines(input)).toThrow(message);

  it("rejects zero, negative and fractional amounts", () => {
    reject({ type: "cash_in", principalCents: 0, feeCents: 0, feeMode: "on_top" }, "greater than zero");
    reject({ type: "cash_out", principalCents: -5, feeCents: 0, feeMode: "on_top" }, "greater than zero");
    reject({ type: "expense", amountCents: 10.5, method: "cash" }, "whole number");
    reject({ type: "cash_in", principalCents: 1000, feeCents: -1, feeMode: "on_top" }, "cannot be negative");
  });

  it("rejects a deducted fee that is as large as the amount", () => {
    reject({ type: "cash_in", principalCents: 1000, feeCents: 1000, feeMode: "deducted" }, "less than the amount");
    reject({ type: "cash_out", principalCents: 1000, feeCents: 2000, feeMode: "deducted" }, "less than the amount");
  });

  it("requires a customer for anything left unpaid, and not more than is owed", () => {
    reject({ type: "cash_in", principalCents: 1000, feeCents: 0, feeMode: "on_top", creditCents: 500 }, "Choose a customer");
    reject({ type: "cash_in", principalCents: 1000, feeCents: 0, feeMode: "on_top", creditCents: 2000, customerId: "C1" }, "more than the customer owes");
    reject({ type: "mobile_load", faceCents: 1000, costCents: 900, priceCents: 1000, source: "prepaid_wallet", payment: "cash", creditCents: 2000, customerId: "C1" }, "more than the selling price");
  });

  it("requires a cost and price for mobile load", () => {
    reject({ type: "mobile_load", faceCents: 1000, costCents: 0, priceCents: 1000, source: "prepaid_wallet", payment: "cash" }, "Cost of the load");
    reject({ type: "mobile_load", faceCents: 1000, costCents: 900, priceCents: 0, source: "prepaid_wallet", payment: "cash" }, "Selling price");
  });

  it("rejects a zero debt adjustment", () => {
    reject({ type: "debt_adjustment", customerId: "C1", amountCents: 0 }, "must not be zero");
  });

  it("requires at least one opening balance", () => {
    reject({ type: "opening_balance", cashCents: 0, gcashCents: 0, loadCents: 0 }, "at least one");
  });

  it("throws PostingError", () => {
    expect(() => buildPostingLines({ type: "expense", amountCents: 0, method: "cash" })).toThrow(PostingError);
  });
});

describe("mergeLines", () => {
  it("combines the same account and customer, drops zeros and sorts", () => {
    const merged = mergeLines([
      { account: "GCASH_WALLET", customerId: null, amountCents: -100 },
      { account: "GCASH_WALLET", customerId: null, amountCents: -50 },
      { account: "CASH_DRAWER", customerId: null, amountCents: 150 },
      { account: "FEE_INCOME", customerId: null, amountCents: 0 },
    ]);
    expect(merged).toEqual([
      { account: "CASH_DRAWER", customerId: null, amountCents: 150 },
      { account: "GCASH_WALLET", customerId: null, amountCents: -150 },
    ]);
  });
});
