import { describe, expect, it } from "vitest";
import { EnvError, parsePublicEnv, parseServerEnv } from "@/lib/env";

const goodPublic = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
};

describe("environment validation", () => {
  it("accepts a complete public configuration", () => {
    expect(parsePublicEnv(goodPublic).NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
  });

  it("names missing variables", () => {
    let message = "";
    try {
      parsePublicEnv({});
    } catch (error) {
      expect(error instanceof EnvError).toBe(true);
      message = (error as Error).message;
    }
    expect(message).toMatch("NEXT_PUBLIC_SUPABASE_URL");
    expect(message).toMatch("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("never echoes a bad secret value in the error", () => {
    let message = "";
    try {
      parsePublicEnv({ ...goodPublic, NEXT_PUBLIC_SUPABASE_URL: "not-a-url-SECRET123" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch("NEXT_PUBLIC_SUPABASE_URL");
    expect(message.includes("SECRET123")).toBe(false);
  });

  it("treats blank optional server variables as absent", () => {
    const parsed = parseServerEnv({ SUPABASE_SERVICE_ROLE_KEY: "", DATABASE_URL: "" });
    expect(parsed.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(parsed.DATABASE_URL).toBeUndefined();
  });
});
