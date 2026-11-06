import { canAny, isOwner, type Permission, type Profile } from "@/lib/auth/permissions";

export type NavIcon =
  | "dashboard" | "plus" | "list" | "users" | "debt" | "wallet" | "check" | "chart" | "staff" | "settings";

export type NavGroupId = "work" | "money" | "admin";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  group: NavGroupId;
  /** false = the screen is not built yet; it is shown disabled with the phase that delivers it. */
  available: boolean;
  phase: number;
  access: "any" | "owner" | { anyOf: readonly Permission[] };
  /** Shown in the phone bottom bar (at most four items fit). */
  primaryOnMobile?: boolean;
};

export const NAV_GROUPS: readonly { id: NavGroupId; label: string }[] = [
  { id: "work", label: "Work" },
  { id: "money", label: "Money" },
  { id: "admin", label: "Admin" },
];

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", group: "work", available: true, phase: 2, access: "any", primaryOnMobile: true },
  { href: "/transactions/new", label: "New Transaction", icon: "plus", group: "work", available: true, phase: 6, access: { anyOf: ["transactions.record"] }, primaryOnMobile: true },
  { href: "/transactions", label: "Transactions", icon: "list", group: "work", available: true, phase: 4, access: { anyOf: ["reports.view", "customers.view", "transactions.record"] }, primaryOnMobile: true },
  { href: "/customers", label: "Customers", icon: "users", group: "work", available: true, phase: 4, access: { anyOf: ["customers.view"] }, primaryOnMobile: true },
  { href: "/debts", label: "Debts", icon: "debt", group: "work", available: true, phase: 5, access: { anyOf: ["debts.view", "repayments.record"] } },
  { href: "/accounts", label: "Cash and GCash Balances", icon: "wallet", group: "money", available: true, phase: 7, access: { anyOf: ["accounts.view"] } },
  { href: "/closing", label: "Daily Closing", icon: "check", group: "money", available: true, phase: 8, access: { anyOf: ["closing.perform", "reports.view"] } },
  { href: "/reports", label: "Reports", icon: "chart", group: "money", available: true, phase: 8, access: { anyOf: ["reports.view"] } },
  { href: "/staff", label: "Staff Management", icon: "staff", group: "admin", available: true, phase: 2, access: "owner" },
  { href: "/settings", label: "Settings", icon: "settings", group: "admin", available: true, phase: 6, access: "owner" },
];

function allowed(item: NavItem, profile: Profile | null): boolean {
  if (!profile || !profile.isActive) return false;
  if (item.access === "any") return true;
  if (item.access === "owner") return isOwner(profile);
  return canAny(profile, item.access.anyOf);
}

/** Only the items this person may use. (The server still checks every page and action itself.) */
export function visibleNavItems(profile: Profile | null): NavItem[] {
  return NAV_ITEMS.filter((item) => allowed(item, profile));
}

/** Splits items into the phone bottom bar (max 4) and the "More" sheet. */
export function splitForMobile(items: readonly NavItem[]): { bar: NavItem[]; more: NavItem[] } {
  const bar = items.filter((i) => i.primaryOnMobile).slice(0, 4);
  const more = items.filter((i) => !bar.includes(i));
  return { bar, more };
}
