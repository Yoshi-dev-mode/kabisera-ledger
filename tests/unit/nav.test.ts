import { describe, expect, it } from "vitest";
import type { Profile } from "@/lib/auth/permissions";
import { NAV_ITEMS, splitForMobile, visibleNavItems } from "@/lib/nav";

const base = { id: "x", displayName: "N", isActive: true, mustChangePassword: false };
const owner: Profile = { ...base, role: "owner", permissions: [] };
const staff = (permissions: Profile["permissions"]): Profile => ({ ...base, role: "staff", permissions });
const hrefs = (p: Profile | null) => visibleNavItems(p).map((i) => i.href);

describe("visibleNavItems", () => {
  it("shows the owner everything", () => {
    expect(hrefs(owner)).toHaveLength(NAV_ITEMS.length);
  });

  it("shows staff with no permissions only the dashboard", () => {
    expect(hrefs(staff([]))).toEqual(["/dashboard"]);
  });

  it("follows the granted permissions", () => {
    const h = hrefs(staff(["transactions.record", "customers.view", "debts.view"]));
    expect(h).toEqual(["/dashboard", "/transactions/new", "/transactions", "/customers", "/debts"]);
  });

  it("never shows owner-only screens to staff", () => {
    const everything = staff([
      "transactions.record", "transactions.request_void", "repayments.record", "customers.view", "customers.manage",
      "debts.view", "accounts.view", "closing.perform", "reports.view",
    ]);
    expect(hrefs(everything).includes("/staff")).toBe(false);
    expect(hrefs(everything).includes("/settings")).toBe(false);
  });

  it("shows nothing to an inactive person or no profile", () => {
    expect(hrefs({ ...owner, isActive: false })).toEqual([]);
    expect(hrefs(null)).toEqual([]);
  });
});

describe("navigation catalogue", () => {
  it("only marks the built screens as available", () => {
    const available = NAV_ITEMS.filter((i) => i.available).map((i) => i.href).sort();
    expect(available).toEqual(["/accounts", "/closing", "/customers", "/dashboard", "/debts", "/reports", "/settings", "/staff", "/transactions", "/transactions/new"]);
    expect(available).toHaveLength(NAV_ITEMS.length); // every screen in the navigation is now built
  });

  it("has unique links", () => {
    const links = NAV_ITEMS.map((i) => i.href);
    expect(new Set(links).size).toBe(links.length);
  });
});

describe("splitForMobile", () => {
  it("puts at most four primary items in the bottom bar and the rest in More", () => {
    const { bar, more } = splitForMobile(visibleNavItems(owner));
    expect(bar.map((i) => i.href)).toEqual(["/dashboard", "/transactions/new", "/transactions", "/customers"]);
    expect(bar.length + more.length).toBe(NAV_ITEMS.length);
    expect(more.map((i) => i.href).includes("/staff")).toBe(true);
  });

  it("copes with a person who sees only one item", () => {
    const { bar, more } = splitForMobile(visibleNavItems(staff([])));
    expect(bar.map((i) => i.href)).toEqual(["/dashboard"]);
    expect(more).toEqual([]);
  });
});
