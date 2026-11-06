import { MoneyError, parsePesos } from "@/lib/money";

/** Small helpers for reading submitted forms safely. */
export const formText = (formData: FormData, name: string): string => {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
};

export type MoneyField = { ok: true; cents: number } | { ok: false; message: string };

/** Reads an amount typed as pesos ("1,250.50"). Rejects blanks, negatives (unless allowed) and bad formats. */
export function formMoney(formData: FormData, name: string, label: string, options: { allowNegative?: boolean; allowZero?: boolean } = {}): MoneyField {
  const raw = formText(formData, name);
  if (raw === "") return { ok: false, message: `Enter ${label}.` };
  try {
    const cents = parsePesos(raw, { allowNegative: options.allowNegative });
    if (cents === 0 && !options.allowZero) return { ok: false, message: `${label.charAt(0).toUpperCase()}${label.slice(1)} must be more than zero.` };
    return { ok: true, cents };
  } catch (error) {
    if (error instanceof MoneyError) return { ok: false, message: `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}.` };
    throw error;
  }
}

/** A "cash" or "gcash" radio/select value, or null. */
export function formMethod(formData: FormData, name: string): "cash" | "gcash" | null {
  const v = formText(formData, name);
  return v === "cash" || v === "gcash" ? v : null;
}

/** An optional date field, or null when blank or not a real date. */
export function formDate(formData: FormData, name: string, isValid: (s: string) => boolean): string | null {
  const v = formText(formData, name);
  return v !== "" && isValid(v) ? v : null;
}

/** An optional amount: blank means zero; anything typed must be a valid, non-negative amount. */
export function optionalMoney(formData: FormData, name: string, label: string): MoneyField {
  if (formText(formData, name) === "") return { ok: true, cents: 0 };
  return formMoney(formData, name, label, { allowZero: true });
}

export type PercentField = { ok: true; bps: number } | { ok: false; message: string };

/** "2" -> 200 basis points, "1.5" -> 150, "0.25" -> 25. Whole numbers or up to two decimals, 0 to 100. */
export function parsePercentToBps(text: string, label: string): PercentField {
  const t = text.trim().replace(/%$/, "").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return { ok: false, message: `${label} must be a percentage like 2 or 1.5 (up to two decimals).` };
  const [whole = "0", frac = ""] = t.split(".");
  const bps = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (bps > 10_000) return { ok: false, message: `${label} cannot be more than 100%.` };
  return { ok: true, bps };
}

/** 200 -> "2", 150 -> "1.5", 25 -> "0.25". */
export function bpsToPercentText(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = String(bps % 100).padStart(2, "0").replace(/0+$/, ""); // taste-skill-ignore: centavo digits, not a numbered label
  return frac === "" ? String(whole) : `${whole}.${frac}`;
}
