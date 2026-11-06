import { describe, expect, it } from "vitest";
import { friendlyDbError } from "@/lib/errors";

describe("friendlyDbError", () => {
  it("shows our own plain-language messages, tidied", () => {
    expect(friendlyDbError({ code: "23514", message: "not enough in Cash drawer: this would leave -₱5.00" })).toBe(
      "Not enough in Cash drawer: this would leave -₱5.00.",
    );
    expect(friendlyDbError({ code: "42501", message: "you are not allowed to record transactions" })).toBe(
      "You are not allowed to record transactions.",
    );
  });

  it("hides anything else behind a generic message", () => {
    expect(friendlyDbError({ code: "XX000", message: 'relation "ledger_lines" is broken at line 4' })).toBe("Something went wrong. Please try again.");
    expect(friendlyDbError({ message: "no code at all" })).toBe("Something went wrong. Please try again.");
    expect(friendlyDbError(null)).toBe("Something went wrong. Please try again.");
    expect(friendlyDbError(undefined, "custom")).toBe("custom");
  });
});
