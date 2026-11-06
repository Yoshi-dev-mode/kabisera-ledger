import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  it("allows normal in-app paths and keeps the query", () => {
    expect(safeNextPath("/staff")).toBe("/staff");
    expect(safeNextPath("/customers?search=ken")).toBe("/customers?search=ken");
    expect(safeNextPath("  /reports  ")).toBe("/reports");
  });

  it("falls back for missing or non-string values", () => {
    expect(safeNextPath(undefined)).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath(42)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
  });

  it("blocks every way of leaving the site", () => {
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("///evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath("/..//evil.example")).toBe("/dashboard");
    expect(safeNextPath("javascript:alert(1)")).toBe("/dashboard");
    expect(safeNextPath("customers")).toBe("/dashboard");
    expect(safeNextPath("/ok\nSet-Cookie: x=1")).toBe("/dashboard");
  });

  it("never loops back to sign-in or sign-out routes", () => {
    expect(safeNextPath("/login")).toBe("/dashboard");
    expect(safeNextPath("/login?next=/staff")).toBe("/dashboard");
    expect(safeNextPath("/auth/blocked")).toBe("/dashboard");
  });

  it("uses a custom fallback when given", () => {
    expect(safeNextPath("//x", "/home")).toBe("/home");
  });
});
