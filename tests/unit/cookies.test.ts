import { describe, expect, it } from "vitest";
import { hardenCookieOptions } from "@/lib/supabase/cookies";

describe("hardenCookieOptions", () => {
  it("forces httpOnly, SameSite=Lax and a site-wide path", () => {
    const out = hardenCookieOptions({ httpOnly: false, sameSite: "none", path: "/x", maxAge: 60 }, false);
    expect(out.httpOnly).toBe(true);
    expect(out.sameSite).toBe("lax");
    expect(out.path).toBe("/x");
    expect(out.maxAge).toBe(60);
  });

  it("is Secure in production only", () => {
    expect(hardenCookieOptions({}, true).secure).toBe(true);
    expect(hardenCookieOptions({}, false).secure).toBe(false);
    expect(hardenCookieOptions({ secure: false }, true).secure).toBe(true);
  });

  it("handles missing options", () => {
    const out = hardenCookieOptions(undefined, true);
    expect(out.path).toBe("/");
    expect(out.httpOnly).toBe(true);
  });
});
