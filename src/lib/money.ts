/**
 * Money is ALWAYS integer centavos (₱1.00 = 100). Floats never hold money.
 * Display amounts with formatPesos(); parse user input with parsePesos().
 */
export type Centavos = number;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Sanity ceiling for a single amount: ₱1,000,000,000.00. Keeps all arithmetic inside safe integers. */
export const MAX_CENTAVOS = 100_000_000_000;

const MINUS = "\u2212"; // true minus sign, matches the Taste Skill's signed-figure convention

export function assertCentavos(value: number, label = "amount"): Centavos {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a whole number of centavos`);
  }
  if (Math.abs(value) > MAX_CENTAVOS) {
    throw new MoneyError(`${label} is outside the supported range`);
  }
  return value;
}

export function addCentavos(...values: Centavos[]): Centavos {
  return sumCentavos(values);
}

export function subtractCentavos(a: Centavos, b: Centavos): Centavos {
  assertCentavos(a);
  assertCentavos(b);
  return assertCentavos(a - b, "difference");
}

export function sumCentavos(values: readonly Centavos[]): Centavos {
  let total = 0;
  for (const v of values) {
    total += assertCentavos(v);
  }
  return assertCentavos(total, "total");
}

// Optional minus, optional ₱ or PHP, then digits with optional thousands separators and up to 2 decimals.
const PESO_PATTERN = /^(-)?\s*(?:₱|PHP)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/i;

/**
 * Parse text typed by a person ("1,250.50", "₱300", "PHP 20.5") into centavos.
 * Rejects more than two decimals, malformed separators and (by default) negatives.
 */
export function parsePesos(input: string, options: { allowNegative?: boolean } = {}): Centavos {
  const text = input.trim().replace(/^\u2212/, "-");
  if (/\.\d{3,}/.test(text)) {
    throw new MoneyError("Use at most two decimal places");
  }
  const match = PESO_PATTERN.exec(text);
  if (!match) {
    throw new MoneyError("Enter an amount like 1,250.50");
  }
  const negative = match[1] === "-";
  const wholeText = match[2];
  const fractionText = match[3] ?? "";
  if (wholeText === undefined) {
    throw new MoneyError("Enter an amount like 1,250.50");
  }
  if (negative && !options.allowNegative) {
    throw new MoneyError("Amount cannot be negative");
  }
  const whole = Number(wholeText.replace(/,/g, ""));
  const fraction = Number(fractionText.padEnd(2, "0"));
  const centavos = assertCentavos(whole * 100 + fraction);
  return negative && centavos !== 0 ? -centavos : centavos;
}

export function formatPesos(
  value: Centavos,
  options: { signed?: boolean; symbol?: boolean } = {},
): string {
  assertCentavos(value);
  const { signed = false, symbol = true } = options;
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  const wholeText = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = `${symbol ? "₱" : ""}${wholeText}.${String(fraction).padStart(2, "0")}`; // taste-skill-ignore: centavo digits, not a numbered label
  if (value < 0) return `${MINUS}${body}`;
  return signed && value > 0 ? `+${body}` : body;
}

/** Plain decimal pesos with no symbol or separators, e.g. 1250 -> "12.50". For CSV and exports. */
export function toDecimalPesos(value: Centavos): string {
  assertCentavos(value);
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`; // taste-skill-ignore: centavo digits, not a numbered label
}

export type Rounding = "half_up" | "down" | "up";

/**
 * amount × (bps / 10,000) using integer arithmetic only.
 * 100 basis points = 1%. Used for configurable percentage fees.
 */
export function percentOfBps(amount: Centavos, bps: number, rounding: Rounding = "half_up"): Centavos {
  assertCentavos(amount);
  if (amount < 0) throw new MoneyError("Amount cannot be negative");
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new MoneyError("Basis points must be a whole number from 0 to 10,000");
  }
  const product = amount * bps;
  if (!Number.isSafeInteger(product)) {
    throw new MoneyError("Amount is too large for this calculation");
  }
  const quotient = Math.floor(product / 10_000);
  const remainder = product - quotient * 10_000;
  if (remainder === 0) return quotient;
  switch (rounding) {
    case "down":
      return quotient;
    case "up":
      return quotient + 1;
    case "half_up":
      return remainder >= 5_000 ? quotient + 1 : quotient;
  }
}
