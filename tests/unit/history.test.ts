import { describe, expect, it } from "vitest";
import {
  parseCustomerList, parseCustomerOverview, parseDebtEvents, parseTransactionList,
} from "@/lib/data/transactions";
import { offsetFor, pageInfo, parseHistoryFilters, toQueryString } from "@/lib/filters";

const txRow = {
  id: "t1", public_ref: "KL-20261024-0001", occurred_at: "2026-10-24T01:30:00+00:00", business_date: "2026-10-24",
  type: "cash_in", customer_id: "c1", customer_name: "Ken", principal_cents: 100000, fee_cents: 2000,
  customer_price_cents: null, credit_cents: 0, payment_method: "cash", gcash_reference: null, status: "posted",
  recorded_by_name: "Maria", notes: null, shop_cash_cents: 102000, shop_gcash_cents: -100000, void_requested: false,
  total_count: 37,
};

describe("parseTransactionList", () => {
  it("reads rows and the total", () => {
    const { rows, total } = parseTransactionList([txRow, { ...txRow, id: "t2", status: "voided", type: "mobile_load", customer_price_cents: 10000 }]);
    expect(total).toBe(37);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.publicRef).toBe("KL-20261024-0001");
    expect(rows[0]?.shopGcashCents).toBe(-100000);
    expect(rows[1]?.status).toBe("voided");
    expect(rows[1]?.customerPriceCents).toBe(10000);
  });

  it("handles an empty result", () => {
    expect(parseTransactionList([])).toEqual({ rows: [], total: 0 });
    expect(parseTransactionList(null)).toEqual({ rows: [], total: 0 });
  });

  it("rejects malformed rows instead of guessing", () => {
    expect(() => parseTransactionList([{ ...txRow, type: "gift" }])).toThrow("unknown transaction type");
    expect(() => parseTransactionList([{ ...txRow, status: "pending" }])).toThrow("unknown status");
    expect(() => parseTransactionList([{ ...txRow, principal_cents: "1000" }])).toThrow("whole number");
    expect(() => parseTransactionList([{ ...txRow, principal_cents: 10.5 }])).toThrow("whole number");
    expect(() => parseTransactionList("nope")).toThrow("expected a list");
  });
});

describe("parseCustomerList / parseCustomerOverview / parseDebtEvents", () => {
  it("reads customers, allowing a hidden debt figure", () => {
    const { rows, total } = parseCustomerList([
      { id: "c1", customer_no: 3, display_name: "Cee jay", contact_number: null, status: "active", created_at: "2026-10-24T00:00:00Z", outstanding_cents: null, last_activity_at: null, total_count: 11 },
    ]);
    expect(total).toBe(11);
    expect(rows[0]?.outstandingCents).toBeNull();
    expect(rows[0]?.displayName).toBe("Cee jay");
  });

  it("reads the overview from a one-row list", () => {
    const o = parseCustomerOverview([{ outstanding_cents: 76000, cash_in_cents: 1, cash_out_cents: 2, load_cents: 3, fee_cents: 4, repayment_cents: 5, transaction_count: 6, voided_count: 0, first_activity_at: null, last_activity_at: "2026-10-24T00:00:00Z" }]);
    expect(o.outstandingCents).toBe(76000);
    expect(o.lastActivityAt).toBe("2026-10-24T00:00:00Z");
  });

  it("reads debt events", () => {
    const [e] = parseDebtEvents([{ event_kind: "debt", event_at: "2026-10-24T00:00:00Z", date_known: false, amount_cents: 30500, reference: "Opening balance", method: null, gcash_reference: null, recorded_by_name: "Owner", note: null, is_voided: false, debt_id: "d1", transaction_id: null }]);
    expect(e?.dateKnown).toBe(false);
    expect(e?.amountCents).toBe(30500);
    expect(() => parseDebtEvents([{ event_kind: "gift" }])).toThrow();
  });
});

describe("parseHistoryFilters", () => {
  it("reads valid filters", () => {
    const f = parseHistoryFilters({ from: "2026-10-01", to: "2026-10-31", type: ["cash_in", "expense"], status: "voided", q: " ken ", order: "oldest", page: "3" });
    expect(f).toEqual({ from: "2026-10-01", to: "2026-10-31", types: ["cash_in", "expense"], status: "voided", search: "ken", newestFirst: false, page: 3 });
  });

  it("falls back to safe defaults for junk", () => {
    const f = parseHistoryFilters({ from: "2026-02-30", to: "tomorrow", type: ["gift", "cash_out"], status: "x", page: "-4", order: "sideways" });
    expect(f).toEqual({ from: null, to: null, types: ["cash_out"], status: null, search: null, newestFirst: true, page: 1 });
    expect(parseHistoryFilters({ page: "1.5" }).page).toBe(1);
    expect(parseHistoryFilters({ page: "99999999" }).page).toBe(1);
  });

  it("swaps a reversed date range", () => {
    const f = parseHistoryFilters({ from: "2026-10-31", to: "2026-10-01" });
    expect([f.from, f.to]).toEqual(["2026-10-01", "2026-10-31"]);
  });

  it("accepts a single type and trims long searches", () => {
    expect(parseHistoryFilters({ type: "cash_in" }).types).toEqual(["cash_in"]);
    expect(parseHistoryFilters({ q: "x".repeat(200) }).search).toHaveLength(80);
  });
});

describe("pagination and links", () => {
  it("computes offsets and page ranges", () => {
    expect(offsetFor(1)).toBe(0);
    expect(offsetFor(3)).toBe(50);
    expect(pageInfo(0, 1)).toEqual({ pages: 1, current: 1, firstShown: 0, lastShown: 0, hasPrev: false, hasNext: false });
    expect(pageInfo(37, 2)).toEqual({ pages: 2, current: 2, firstShown: 26, lastShown: 37, hasPrev: true, hasNext: false });
    expect(pageInfo(37, 9).current).toBe(2);
  });

  it("builds links that keep the filters", () => {
    const f = parseHistoryFilters({ from: "2026-10-01", type: ["cash_in"], q: "ken", order: "oldest", page: "2" });
    expect(toQueryString(f, { page: 3 })).toBe("?from=2026-10-01&type=cash_in&q=ken&order=oldest&page=3");
    expect(toQueryString(f, { page: 1 })).toBe("?from=2026-10-01&type=cash_in&q=ken&order=oldest");
    expect(toQueryString(parseHistoryFilters({}))).toBe("");
  });
});

import { parseCustomerDetail, parseSimilarCustomers, parseTransactionDetail } from "@/lib/data/transactions";

describe("parseTransactionDetail", () => {
  const detail = {
    transaction: {
      id: "t1", public_ref: "KL-20261024-0002", type: "cash_in", status: "voided", customer_id: "c1",
      occurred_at: "2026-10-24T01:30:00+00:00", business_date: "2026-10-24", principal_cents: 100000, fee_cents: 2000,
      fee_mode: "on_top", provider_cost_cents: 0, credit_cents: 52000, payment_method: "mixed", gcash_reference: null,
      load_source: null, load_cost_cents: null, customer_price_cents: null, adjustment_kind: null, notes: "n",
      created_at: "2026-10-24T01:30:01+00:00", void_requested_at: null, void_request_reason: null,
      voided_at: "2026-10-25T01:00:00+00:00", void_reason: "cancelled",
    },
    customer_name: "Ken", recorded_by_name: "Maria", voided_by_name: "Owner", void_requested_by_name: null,
    lines: [{ entry_kind: "posting", entry_date: "2026-10-24", account: "Cash drawer", account_code: "CASH_DRAWER", customer_id: null, amount_cents: 50000 }],
    allocations: [{ debt_id: "d1", amount_cents: 100 }],
    debts: [{ debt_id: "d1", original_cents: 52000, origin: "transaction" }],
  };

  it("reads the whole record", () => {
    const d = parseTransactionDetail(detail);
    expect(d?.publicRef).toBe("KL-20261024-0002");
    expect(d?.status).toBe("voided");
    expect(d?.voidedByName).toBe("Owner");
    expect(d?.lines[0]?.amountCents).toBe(50000);
    expect(d?.debts[0]?.originalCents).toBe(52000);
  });

  it("returns null when the record is missing or hidden", () => {
    expect(parseTransactionDetail(null)).toBeNull();
    expect(parseTransactionDetail(undefined)).toBeNull();
  });

  it("rejects a malformed record", () => {
    expect(() => parseTransactionDetail({ ...detail, transaction: { ...detail.transaction, type: "gift" } })).toThrow("unknown transaction type");
    expect(() => parseTransactionDetail({ ...detail, lines: [{ account: 1 }] })).toThrow();
  });
});

describe("parseCustomerDetail / parseSimilarCustomers", () => {
  it("reads a customer and rejects an unknown status", () => {
    const row = { id: "c1", customer_no: 4, display_name: "Gab", contact_number: null, notes: null, status: "archived", archive_reason: "moved", archived_at: "2026-10-01T00:00:00Z", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" };
    expect(parseCustomerDetail(row)?.status).toBe("archived");
    expect(parseCustomerDetail(null)).toBeNull();
    expect(() => parseCustomerDetail({ ...row, status: "gone" })).toThrow("unknown customer status");
  });

  it("reads look-alike matches", () => {
    const m = parseSimilarCustomers([{ id: "c1", display_name: "Cee jay", status: "active", match_kind: "exact", similarity: 1 }]);
    expect(m).toEqual([{ id: "c1", displayName: "Cee jay", status: "active", kind: "exact" }]);
    expect(() => parseSimilarCustomers([{ id: "c1", display_name: "x", status: "active", match_kind: "maybe" }])).toThrow();
  });
});

import { customerQueryString, parseCustomerQuery } from "@/lib/filters";
import { isUuid } from "@/lib/uuid";

describe("customer list query", () => {
  it("reads and defaults", () => {
    expect(parseCustomerQuery({})).toEqual({ query: null, status: "active", onlyWithDebt: false, page: 1 });
    expect(parseCustomerQuery({ q: " cee ", status: "all", debt: "1", page: "2" })).toEqual({ query: "cee", status: "all", onlyWithDebt: true, page: 2 });
    expect(parseCustomerQuery({ status: "hacked", page: "0", debt: "yes" })).toEqual({ query: null, status: "active", onlyWithDebt: false, page: 1 });
  });
  it("builds links that keep the filters", () => {
    const q = parseCustomerQuery({ q: "cee", status: "archived", debt: "1", page: "3" });
    expect(customerQueryString(q, { page: 4 })).toBe("?q=cee&status=archived&debt=1&page=4");
    expect(customerQueryString(parseCustomerQuery({}))).toBe("");
  });
});

describe("isUuid", () => {
  it("accepts real UUIDs only", () => {
    expect(isUuid("3f2b8c1e-5d4a-4b6f-9c1d-7e8a9b0c1d2e")).toBe(true);
    expect(isUuid("3F2B8C1E-5D4A-4B6F-9C1D-7E8A9B0C1D2E")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("3f2b8c1e-5d4a-4b6f-9c1d-7e8a9b0c1d2e'; drop table x;--")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});

import { searchParamsToObject } from "@/lib/filters";
import { fileSlug } from "@/lib/exports";

describe("searchParamsToObject and fileSlug", () => {
  it("keeps repeated keys as lists", () => {
    const o = searchParamsToObject(new URLSearchParams("type=cash_in&type=expense&from=2026-10-01"));
    expect(o).toEqual({ type: ["cash_in", "expense"], from: "2026-10-01" });
    expect(parseHistoryFilters(o).types).toEqual(["cash_in", "expense"]);
  });
  it("makes safe file names", () => {
    expect(fileSlug("Cee jay")).toBe("cee-jay");
    expect(fileSlug("../../etc/passwd")).toBe("etc-passwd");
    expect(fileSlug("Ñandú \"quote\"")).toBe("nandu-quote");
    expect(fileSlug("???")).toBe("customer");
  });
});
