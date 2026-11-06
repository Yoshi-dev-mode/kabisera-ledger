import { describe, expect, it } from "vitest";
import { isAcceptablePassword, passwordProblems } from "@/lib/auth/password";

describe("passwordProblems", () => {
  it("accepts a long, unpredictable password", () => {
    expect(passwordProblems("blue-mango-river-42-train")).toEqual([]);
    expect(isAcceptablePassword("correct horse battery staple")).toBe(true);
  });

  it("requires at least 12 characters", () => {
    expect(passwordProblems("short1")).toHaveLength(1);
    expect(isAcceptablePassword("elevenchars")).toBe(false);
    expect(isAcceptablePassword("twelvechars!")).toBe(true);
  });

  it("limits length to 72 bytes", () => {
    expect(isAcceptablePassword("a1".repeat(36))).toBe(true);
    expect(isAcceptablePassword("a1".repeat(37))).toBe(false);
    expect(isAcceptablePassword("ñ".repeat(40))).toBe(false); // 80 bytes
  });

  it("rejects repeats, sequences and common choices", () => {
    expect(isAcceptablePassword("aaaaaaaaaaaa")).toBe(false);
    expect(isAcceptablePassword("123456789012")).toBe(false);
    expect(isAcceptablePassword("abcdefghijkl")).toBe(false);
    expect(isAcceptablePassword("Password1234")).toBe(false);
    expect(isAcceptablePassword("KabiseraLedger")).toBe(false);
  });

  it("rejects passwords built from the person's email", () => {
    const ctx = { email: "maria.santos@example.com" };
    expect(isAcceptablePassword("maria.santos-2026-ok", ctx)).toBe(false);
    expect(isAcceptablePassword("maria.santos@example.com", ctx)).toBe(false);
    expect(isAcceptablePassword("purple-lantern-seven", ctx)).toBe(true);
  });
});
