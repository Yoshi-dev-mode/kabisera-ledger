import { describe, expect, it } from "vitest";
import {
  addCentavos,
  formatPesos,
  MoneyError,
  parsePesos,
  percentOfBps,
  subtractCentavos,
  sumCentavos,
  toDecimalPesos,
} from "@/lib/money";

describe("parsePesos", () => {
  it("parses common ways of typing pesos", () => {
    expect(parsePesos("1250.50")).toBe(125050);
    expect(parsePesos("1,250.50")).toBe(125050);
    expect(parsePesos("₱300")).toBe(30000);
    expect(parsePesos("PHP 20.5")).toBe(2050);
    expect(parsePesos("0.05")).toBe(5);
    expect(parsePesos("  11,349.00 ")).toBe(1134900);
    expect(parsePesos("0")).toBe(0);
  });

  it("is exact where floating point is not", () => {
    // 0.1 + 0.2 style drift must never appear: 10.10 + 20.20 is exactly 3030 centavos
    expect(addCentavos(parsePesos("10.10"), parsePesos("20.20"))).toBe(3030);
    expect(parsePesos("19.99") + parsePesos("0.01")).toBe(2000);
  });

  it("rejects malformed input", () => {
    expect(() => parsePesos("")).toThrow(MoneyError);
    expect(() => parsePesos("abc")).toThrow(MoneyError);
    expect(() => parsePesos("12.345")).toThrow("two decimal");
    expect(() => parsePesos("1,2345")).toThrow(MoneyError);
    expect(() => parsePesos("12,34")).toThrow(MoneyError);
    expect(() => parsePesos("5.")).toThrow(MoneyError);
    expect(() => parsePesos(".5")).toThrow(MoneyError);
    expect(() => parsePesos("99999999999999999999")).toThrow(MoneyError);
  });

  it("rejects negatives unless allowed", () => {
    expect(() => parsePesos("-5")).toThrow("negative");
    expect(parsePesos("-5.00", { allowNegative: true })).toBe(-500);
    expect(parsePesos("\u22125.00", { allowNegative: true })).toBe(-500);
    expect(parsePesos("-0", { allowNegative: true })).toBe(0);
  });
});

describe("formatPesos", () => {
  it("formats with the peso sign, separators and two decimals", () => {
    expect(formatPesos(0)).toBe("₱0.00");
    expect(formatPesos(5)).toBe("₱0.05");
    expect(formatPesos(100000)).toBe("₱1,000.00");
    expect(formatPesos(1134900)).toBe("₱11,349.00");
    expect(formatPesos(123456789)).toBe("₱1,234,567.89");
  });

  it("uses a true minus for negatives and an optional plus sign", () => {
    expect(formatPesos(-5000)).toBe("\u2212₱50.00");
    expect(formatPesos(2000, { signed: true })).toBe("+₱20.00");
    expect(formatPesos(0, { signed: true })).toBe("₱0.00");
    expect(formatPesos(150000, { symbol: false })).toBe("1,500.00");
  });

  it("rejects non-integer centavos", () => {
    expect(() => formatPesos(10.5)).toThrow(MoneyError);
    expect(() => formatPesos(Number.NaN)).toThrow(MoneyError);
  });
});

describe("toDecimalPesos", () => {
  it("writes plain decimals for exports", () => {
    expect(toDecimalPesos(125050)).toBe("1250.50");
    expect(toDecimalPesos(-5)).toBe("-0.05");
    expect(toDecimalPesos(0)).toBe("0.00");
  });
});

describe("centavo arithmetic", () => {
  it("adds, subtracts and sums exactly", () => {
    expect(addCentavos(100, 250, 5)).toBe(355);
    expect(subtractCentavos(1000, 1250)).toBe(-250);
    expect(sumCentavos([])).toBe(0);
    expect(sumCentavos([30500, 202400, 21000, 204500, 20500, 100000, 239000, 200000, 88500, 6500, 22000])).toBe(1134900);
  });

  it("refuses fractional or out-of-range values", () => {
    expect(() => addCentavos(1.5, 2)).toThrow(MoneyError);
    expect(() => addCentavos(100_000_000_001)).toThrow(MoneyError);
  });
});

describe("percentOfBps", () => {
  it("computes exact percentages", () => {
    expect(percentOfBps(100000, 200)).toBe(2000); // 2% of ₱1,000.00
    expect(percentOfBps(100100, 200)).toBe(2002);
    expect(percentOfBps(5000, 0)).toBe(0);
    expect(percentOfBps(5000, 10000)).toBe(5000);
  });

  it("applies the chosen rounding to fractions of a centavo", () => {
    // 1,050 centavos at 150 bps = 15.75 centavos
    expect(percentOfBps(1050, 150, "half_up")).toBe(16);
    expect(percentOfBps(1050, 150, "down")).toBe(15);
    expect(percentOfBps(1050, 150, "up")).toBe(16);
    // 1,000 centavos at 25 bps = 2.5 centavos
    expect(percentOfBps(1000, 25, "half_up")).toBe(3);
    expect(percentOfBps(1000, 25, "down")).toBe(2);
    // 1,000 centavos at 24 bps = 2.4 centavos
    expect(percentOfBps(1000, 24, "half_up")).toBe(2);
    expect(percentOfBps(1000, 24, "up")).toBe(3);
  });

  it("rejects invalid inputs", () => {
    expect(() => percentOfBps(-1, 100)).toThrow(MoneyError);
    expect(() => percentOfBps(1000, 10001)).toThrow(MoneyError);
    expect(() => percentOfBps(1000, 1.5)).toThrow(MoneyError);
  });
});
