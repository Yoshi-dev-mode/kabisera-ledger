import { asRow, asRows, bool, int, str, strOrNull } from "@/lib/data/parse";

export type DebtStatus = "outstanding" | "partially_paid" | "paid" | "voided";
const STATUSES: readonly string[] = ["outstanding", "partially_paid", "paid", "voided"];

export const DEBT_STATUS_LABELS: Record<DebtStatus, string> = {
  outstanding: "Unpaid",
  partially_paid: "Part paid",
  paid: "Paid",
  voided: "Voided",
};

export type DebtRow = {
  debtId: string;
  customerId: string;
  customerName: string;
  origin: "opening" | "transaction" | "manual";
  originalCents: number;
  repaidCents: number;
  adjustedCents: number;
  outstandingCents: number;
  status: DebtStatus;
  isOverdue: boolean;
  dueDate: string | null;
  debtAt: string;
  dateKnown: boolean;
  reference: string | null;
  notes: string | null;
};

function origin(value: string): DebtRow["origin"] {
  if (value !== "opening" && value !== "transaction" && value !== "manual") throw new Error(`unknown debt origin: ${value}`);
  return value;
}

export function parseDebtList(value: unknown): { rows: DebtRow[]; total: number } {
  const raw = asRows(value, "debts");
  const rows = raw.map((r): DebtRow => {
    const status = str(r, "debt_status");
    if (!STATUSES.includes(status)) throw new Error(`unknown debt status: ${status}`);
    return {
      debtId: str(r, "debt_id"),
      customerId: str(r, "customer_id"),
      customerName: str(r, "customer_name"),
      origin: origin(str(r, "origin")),
      originalCents: int(r, "original_cents"),
      repaidCents: int(r, "repaid_cents"),
      adjustedCents: int(r, "adjusted_cents"),
      outstandingCents: int(r, "outstanding_cents"),
      status: status as DebtStatus,
      isOverdue: bool(r, "is_overdue"),
      dueDate: strOrNull(r, "due_date"),
      debtAt: str(r, "debt_at"),
      dateKnown: bool(r, "date_known"),
      reference: strOrNull(r, "reference"),
      notes: strOrNull(r, "notes"),
    };
  });
  const first = raw[0];
  return { rows, total: first ? int(first, "total_count") : 0 };
}

export type DebtSummary = {
  totalOutstandingCents: number;
  customersOwing: number;
  openDebts: number;
  overdueCents: number;
  overdueCount: number;
  unknownDateCents: number;
};

export function parseDebtSummary(value: unknown): DebtSummary {
  const r = asRow(Array.isArray(value) ? value[0] : value, "debt summary");
  return {
    totalOutstandingCents: int(r, "total_outstanding_cents"),
    customersOwing: int(r, "customers_owing"),
    openDebts: int(r, "open_debts"),
    overdueCents: int(r, "overdue_cents"),
    overdueCount: int(r, "overdue_count"),
    unknownDateCents: int(r, "unknown_date_cents"),
  };
}

export type AgingBucket = { bucket: string; sortOrder: number; debts: number; outstandingCents: number };

export function parseAging(value: unknown): AgingBucket[] {
  return asRows(value, "aging").map((r) => ({
    bucket: str(r, "bucket"),
    sortOrder: int(r, "sort_order"),
    debts: int(r, "debts"),
    outstandingCents: int(r, "outstanding_cents"),
  }));
}

export type ImportResult = {
  batchId: string;
  txId: string | null;
  customersCreated: number;
  debtsCreated: number;
  totalCents: number;
  wasDuplicate: boolean;
};

export function parseImportResult(value: unknown): ImportResult {
  const r = asRow(Array.isArray(value) ? value[0] : value, "import result");
  return {
    batchId: str(r, "batch_id"),
    txId: strOrNull(r, "tx_id"),
    customersCreated: int(r, "customers_created"),
    debtsCreated: int(r, "debts_created"),
    totalCents: int(r, "total_cents"),
    wasDuplicate: bool(r, "was_duplicate"),
  };
}

export type PostResult = { txId: string; txRef: string; wasDuplicate: boolean };

/** Result of any post_* function: one row with the new (or original) transaction. */
export function parsePostResult(value: unknown): PostResult {
  const r = asRow(Array.isArray(value) ? value[0] : value, "post result");
  return { txId: str(r, "tx_id"), txRef: str(r, "tx_ref"), wasDuplicate: bool(r, "was_duplicate") };
}
