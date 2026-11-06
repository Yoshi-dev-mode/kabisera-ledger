import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  can,
  canAny,
  isOwner,
  parsePermissions,
  parseProfileRow,
  PERMISSION_KEYS,
  type Profile,
} from "@/lib/auth/permissions";

const owner: Profile = {
  id: "o1", displayName: "Owner", role: "owner", isActive: true, permissions: [], mustChangePassword: false,
};
const staff = (permissions: Profile["permissions"], isActive = true): Profile => ({
  id: "s1", displayName: "Staff", role: "staff", isActive, permissions, mustChangePassword: false,
});

describe("permission keys", () => {
  it("match the database CHECK constraint exactly", () => {
    const sql = readFileSync(
      fileURLToPath(new URL("../../supabase/migrations/20261023000002_people_and_reference.sql", import.meta.url)),
      "utf8",
    );
    const block = /permissions <@ array\[([\s\S]*?)\]::text\[\]/.exec(sql);
    expect(block === null).toBe(false);
    const inSql = [...(block?.[1] ?? "").matchAll(/'([a-z_.]+)'/g)].map((m) => m[1] ?? "").sort();
    expect(inSql).toEqual([...PERMISSION_KEYS].sort());
  });
});

describe("can", () => {
  it("gives an active owner every permission", () => {
    for (const key of PERMISSION_KEYS) expect(can(owner, key)).toBe(true);
    expect(isOwner(owner)).toBe(true);
  });

  it("gives staff only what they were granted", () => {
    const s = staff(["transactions.record", "customers.view"]);
    expect(can(s, "transactions.record")).toBe(true);
    expect(can(s, "customers.view")).toBe(true);
    expect(can(s, "reports.view")).toBe(false);
    expect(can(s, "accounts.view")).toBe(false);
    expect(isOwner(s)).toBe(false);
  });

  it("denies everything to an inactive person, owner included", () => {
    expect(can(staff(["transactions.record"], false), "transactions.record")).toBe(false);
    expect(can({ ...owner, isActive: false }, "reports.view")).toBe(false);
    expect(isOwner({ ...owner, isActive: false })).toBe(false);
  });

  it("denies when there is no profile", () => {
    expect(can(null, "reports.view")).toBe(false);
    expect(can(undefined, "reports.view")).toBe(false);
    expect(canAny(null, ["reports.view"])).toBe(false);
  });

  it("canAny needs at least one match", () => {
    const s = staff(["debts.view"]);
    expect(canAny(s, ["reports.view", "debts.view"])).toBe(true);
    expect(canAny(s, ["reports.view", "accounts.view"])).toBe(false);
    expect(canAny(s, [])).toBe(false);
  });
});

describe("parsePermissions", () => {
  it("keeps known keys once and drops everything else", () => {
    expect(parsePermissions(["reports.view", "reports.view", "made.up", 5, null])).toEqual(["reports.view"]);
    expect(parsePermissions("reports.view")).toEqual([]);
    expect(parsePermissions(undefined)).toEqual([]);
  });
});

describe("parseProfileRow", () => {
  const row = {
    id: "abc", display_name: "Maria", role: "staff", is_active: true,
    permissions: ["customers.view", "bogus"], must_change_password: true,
  };

  it("converts a valid row", () => {
    expect(parseProfileRow(row)).toEqual({
      id: "abc", displayName: "Maria", role: "staff", isActive: true,
      permissions: ["customers.view"], mustChangePassword: true,
    });
  });

  it("rejects malformed rows instead of guessing", () => {
    expect(parseProfileRow(null)).toBeNull();
    expect(parseProfileRow("x")).toBeNull();
    expect(parseProfileRow({ ...row, role: "admin" })).toBeNull();
    expect(parseProfileRow({ ...row, is_active: "yes" })).toBeNull();
    expect(parseProfileRow({ ...row, id: "" })).toBeNull();
    expect(parseProfileRow({ ...row, must_change_password: undefined })).toBeNull();
  });
});
