/**
 * Business time is Philippine time (Asia/Manila, UTC+8, no daylight saving).
 * The database stores instants as timestamptz; the business DATE is the Manila calendar date.
 */
export const BUSINESS_TIME_ZONE = "Asia/Manila";

type PartKey = "year" | "month" | "day" | "hour" | "minute" | "second";
const PART_KEYS: readonly PartKey[] = ["year", "month", "day", "hour", "minute", "second"];

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function isPartKey(type: string): type is PartKey {
  return (PART_KEYS as readonly string[]).includes(type);
}

function manilaParts(date: Date): Record<PartKey, string> {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid date");
  }
  const found: Partial<Record<PartKey, string>> = {};
  for (const part of formatter.formatToParts(date)) {
    if (isPartKey(part.type)) found[part.type] = part.value;
  }
  const { year, month, day, hour, minute, second } = found;
  if (!year || !month || !day || !hour || !minute || !second) {
    throw new Error("Could not read Manila date parts");
  }
  return { year, month, day, hour, minute, second };
}

/** The Manila calendar date of an instant, as YYYY-MM-DD. */
export function businessDateOf(date: Date): string {
  const p = manilaParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function todayBusinessDate(now: Date = new Date()): string {
  return businessDateOf(now);
}

export function formatManilaDate(date: Date): string {
  return businessDateOf(date);
}

export function formatManilaTime(date: Date): string {
  const p = manilaParts(date);
  return `${p.hour}:${p.minute}`;
}

export function formatManilaDateTime(date: Date): string {
  const p = manilaParts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isBusinessDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
  );
}
