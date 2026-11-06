/**
 * Roles and permissions. Owners implicitly have every permission; staff have only what the owner grants.
 * The keys here MUST match the CHECK constraint on profiles.permissions in the database
 * (tests/unit/permissions.test.ts compares them with the migration file).
 *
 * This is for deciding what to SHOW and which server code may run. The database enforces the same
 * rules independently with row-level security, so hiding a button is never the only protection.
 */
export const PERMISSIONS = [
  { key: "transactions.record", label: "Record transactions", description: "Record cash-in, cash-out and mobile-load transactions." },
  { key: "transactions.request_void", label: "Request a void", description: "Ask the owner to void a transaction. Only the owner can approve." },
  { key: "repayments.record", label: "Record customer repayments", description: "Record payments against customer debts." },
  { key: "customers.view", label: "View customers and history", description: "See customer profiles, transaction history and statements." },
  { key: "customers.manage", label: "Add and edit customers", description: "Create customers and edit their details." },
  { key: "debts.view", label: "View customer debts", description: "See outstanding debts and repayment history." },
  { key: "accounts.view", label: "View cash, GCash and load balances", description: "See the three balances and the ledger behind them." },
  { key: "closing.perform", label: "Perform daily closing", description: "Count balances and close the day." },
  { key: "reports.view", label: "View reports", description: "See financial reports. Sensitive: includes profit." },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
export const PERMISSION_KEYS: readonly Permission[] = PERMISSIONS.map((p) => p.key);

export type Role = "owner" | "staff";

export type Profile = {
  id: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  permissions: readonly Permission[];
  mustChangePassword: boolean;
};

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSION_KEYS as readonly string[]).includes(value);
}

/** Keeps only known permission keys, once each. Unknown keys are dropped (deny by default). */
export function parsePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return [];
  const found = new Set<Permission>();
  for (const item of value) {
    if (isPermission(item)) found.add(item);
  }
  return [...found];
}

/** Turns a database row into a Profile, or null if the row is not shaped as expected. */
export function parseProfileRow(row: unknown): Profile | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id === "") return null;
  if (typeof r.display_name !== "string") return null;
  if (r.role !== "owner" && r.role !== "staff") return null;
  if (typeof r.is_active !== "boolean") return null;
  if (typeof r.must_change_password !== "boolean") return null;
  return {
    id: r.id,
    displayName: r.display_name,
    role: r.role,
    isActive: r.is_active,
    permissions: parsePermissions(r.permissions),
    mustChangePassword: r.must_change_password,
  };
}

export function isOwner(profile: Profile | null | undefined): boolean {
  return Boolean(profile && profile.isActive && profile.role === "owner");
}

export function can(profile: Profile | null | undefined, permission: Permission): boolean {
  if (!profile || !profile.isActive) return false;
  if (profile.role === "owner") return true;
  return profile.permissions.includes(permission);
}

export function canAny(profile: Profile | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(profile, p));
}
