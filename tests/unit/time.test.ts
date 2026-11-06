import { describe, expect, it } from "vitest";
import {
  BUSINESS_TIME_ZONE,
  businessDateOf,
  formatManilaDateTime,
  formatManilaTime,
  isBusinessDateString,
  todayBusinessDate,
} from "@/lib/time";

describe("Philippine business time", () => {
  it("uses Asia/Manila", () => {
    expect(BUSINESS_TIME_ZONE).toBe("Asia/Manila");
  });

  it("rolls the business date over at midnight Manila time (16:00 UTC)", () => {
    expect(businessDateOf(new Date("2026-10-23T15:59:59Z"))).toBe("2026-10-23");
    expect(businessDateOf(new Date("2026-10-23T16:00:00Z"))).toBe("2026-10-24");
    expect(businessDateOf(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
  });

  it("formats times in 24-hour Manila time", () => {
    expect(formatManilaDateTime(new Date("2026-10-23T00:30:00Z"))).toBe("2026-10-23 08:30");
    expect(formatManilaDateTime(new Date("2026-10-23T16:05:00Z"))).toBe("2026-10-24 00:05");
    expect(formatManilaTime(new Date("2026-10-23T09:45:00Z"))).toBe("17:45");
  });

  it("reads today's business date from a supplied clock", () => {
    expect(todayBusinessDate(new Date("2026-10-23T20:00:00Z"))).toBe("2026-10-24");
  });

  it("rejects invalid dates", () => {
    expect(() => businessDateOf(new Date("not a date"))).toThrow(RangeError);
  });

  it("validates YYYY-MM-DD strings", () => {
    expect(isBusinessDateString("2026-10-23")).toBe(true);
    expect(isBusinessDateString("2028-02-29")).toBe(true);
    expect(isBusinessDateString("2026-02-29")).toBe(false);
    expect(isBusinessDateString("2026-02-30")).toBe(false);
    expect(isBusinessDateString("2026-13-01")).toBe(false);
    expect(isBusinessDateString("23-10-2026")).toBe(false);
  });
});
