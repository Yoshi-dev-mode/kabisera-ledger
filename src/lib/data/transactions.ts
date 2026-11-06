import { asRow, asRows, bool, int, intOrNull, str, strOrNull } from "@/lib/data/parse";

export const TRANSACTION_TYPES = [
  "cash_in", "cash_out", "mobile_load", "debt_creation", "debt_repayment", "debt_adjustment",
  "float_adjustment", "expense", "owner_capital", "opening_balance",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TYPE_LABELS: Record<TransactionType, string> = {
  cash_in: "Cash-in",
  cash_out: "Cash-out",
  mobile_load: "Mobile load",
  debt_creation: "Cash advance",
  debt_repayment: "Repayment",
  debt_adjustment: "Debt adjustment",
  float_adjustment: "Balance adjustment",
  expense: "Expense",
  owner_capital: "Owner capital",
  opening_balance: "Opening balances",
};

export const METHOD_LABELS: Record<string, string> = { cash: "Cash", gcash: "GCash", credit: "On credit", mixed: "Part on credit" };

export function isTransactionType(value: unknown): value is TransactionType {
  return typeof value === "string" && (TRANSACTION_TYPES as readonly string[]).includes(value);
}

export type TransactionRow = {
  id: string;
  publicRef: string;
  occurredAt: string;
  businessDate: string;
  type: TransactionType;
  customerId: string | null;
  customerName: string | null;
  principalCents: number;
  feeCents: number;
  customerPriceCents: number | null;
  creditCents: number;
  paymentMethod: string | null;
  gcashReference: string | null;
  status: "posted" | "voided";
  recordedByName: string | null;
  notes: string | null;
  shopCashCents: number;
  shopGcashCents: number;
  voidRequested: boolean;
};

export function parseTransactionList(value: unknown): { rows: TransactionRow[]; total: number } {
  const raw = asRows(value, "transactions");
  const rows = raw.map((r): TransactionRow => {
    const type = str(r, "type");
    if (!isTransactionType(type)) throw new Error(`unknown transaction type: ${type}`);
    const status = str(r, "status");
    if (status !== "posted" && status !== "voided") throw new Error(`unknown status: ${status}`);
    return {
      id: str(r, "id"),
      publicRef: str(r, "public_ref"),
      occurredAt: str(r, "occurred_at"),
      businessDate: str(r, "business_date"),
      type,
      customerId: strOrNull(r, "customer_id"),
      customerName: strOrNull(r, "customer_name"),
      principalCents: int(r, "principal_cents"),
      feeCents: int(r, "fee_cents"),
      customerPriceCents: intOrNull(r, "customer_price_cents"),
      creditCents: int(r, "credit_cents"),
      paymentMethod: strOrNull(r, "payment_method"),
      gcashReference: strOrNull(r, "gcash_reference"),
      status,
      recordedByName: strOrNull(r, "recorded_by_name"),
      notes: strOrNull(r, "notes"),
      shopCashCents: int(r, "shop_cash_cents"),
      shopGcashCents: int(r, "shop_gcash_cents"),
      voidRequested: bool(r, "void_requested"),
    };
  });
  const first = raw[0];
  return { rows, total: first ? int(first, "total_count") : 0 };
}

export type CustomerRow = {
  id: string;
  customerNo: number;
  displayName: string;
  contactNumber: string | null;
  status: "active" | "archived";
  createdAt: string;
  outstandingCents: number | null;
  lastActivityAt: string | null;
};

export function parseCustomerList(value: unknown): { rows: CustomerRow[]; total: number } {
  const raw = asRows(value, "customers");
  const rows = raw.map((r): CustomerRow => {
    const status = str(r, "status");
    if (status !== "active" && status !== "archived") throw new Error(`unknown customer status: ${status}`);
    return {
      id: str(r, "id"),
      customerNo: int(r, "customer_no"),
      displayName: str(r, "display_name"),
      contactNumber: strOrNull(r, "contact_number"),
      status,
      createdAt: str(r, "created_at"),
      outstandingCents: intOrNull(r, "outstanding_cents"),
      lastActivityAt: strOrNull(r, "last_activity_at"),
    };
  });
  const first = raw[0];
  return { rows, total: first ? int(first, "total_count") : 0 };
}

export type CustomerOverview = {
  outstandingCents: number;
  cashInCents: number;
  cashOutCents: number;
  loadCents: number;
  feeCents: number;
  repaymentCents: number;
  transactionCount: number;
  voidedCount: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
};

export function parseCustomerOverview(value: unknown): CustomerOverview {
  const r = asRow(Array.isArray(value) ? value[0] : value, "overview");
  return {
    outstandingCents: int(r, "outstanding_cents"),
    cashInCents: int(r, "cash_in_cents"),
    cashOutCents: int(r, "cash_out_cents"),
    loadCents: int(r, "load_cents"),
    feeCents: int(r, "fee_cents"),
    repaymentCents: int(r, "repayment_cents"),
    transactionCount: int(r, "transaction_count"),
    voidedCount: int(r, "voided_count"),
    firstActivityAt: strOrNull(r, "first_activity_at"),
    lastActivityAt: strOrNull(r, "last_activity_at"),
  };
}

export type DebtEvent = {
  kind: "debt" | "repayment" | "adjustment";
  at: string;
  dateKnown: boolean;
  amountCents: number; // + increases what is owed, - reduces it
  reference: string | null;
  method: string | null;
  gcashReference: string | null;
  recordedByName: string | null;
  note: string | null;
  isVoided: boolean;
  debtId: string | null;
  transactionId: string | null;
};

export function parseDebtEvents(value: unknown): DebtEvent[] {
  return asRows(value, "debt events").map((r): DebtEvent => {
    const kind = str(r, "event_kind");
    if (kind !== "debt" && kind !== "repayment" && kind !== "adjustment") throw new Error(`unknown event: ${kind}`);
    return {
      kind,
      at: str(r, "event_at"),
      dateKnown: bool(r, "date_known"),
      amountCents: int(r, "amount_cents"),
      reference: strOrNull(r, "reference"),
      method: strOrNull(r, "method"),
      gcashReference: strOrNull(r, "gcash_reference"),
      recordedByName: strOrNull(r, "recorded_by_name"),
      note: strOrNull(r, "note"),
      isVoided: bool(r, "is_voided"),
      debtId: strOrNull(r, "debt_id"),
      transactionId: strOrNull(r, "transaction_id"),
    };
  });
}

export type DetailLine = {
  entryKind: string;
  entryDate: string;
  account: string;
  accountCode: string;
  customerId: string | null;
  amountCents: number;
};

export type TransactionDetail = {
  id: string;
  publicRef: string;
  type: TransactionType;
  status: "posted" | "voided";
  customerId: string | null;
  customerName: string | null;
  occurredAt: string;
  businessDate: string;
  principalCents: number;
  feeCents: number;
  feeMode: string | null;
  providerCostCents: number;
  creditCents: number;
  paymentMethod: string | null;
  gcashReference: string | null;
  loadSource: string | null;
  loadCostCents: number | null;
  customerPriceCents: number | null;
  adjustmentKind: string | null;
  notes: string | null;
  recordedByName: string | null;
  createdAt: string;
  voidRequestedAt: string | null;
  voidRequestedByName: string | null;
  voidRequestReason: string | null;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  lines: DetailLine[];
  allocations: { debtId: string; amountCents: number }[];
  debts: { debtId: string; originalCents: number; origin: string }[];
};

/** Reads the jsonb returned by transaction_detail. Null means "not found or not visible to you". */
export function parseTransactionDetail(value: unknown): TransactionDetail | null {
  if (value === null || value === undefined) return null;
  const root = asRow(value, "transaction detail");
  const t = asRow(root.transaction, "transaction");
  const type = str(t, "type");
  if (!isTransactionType(type)) throw new Error(`unknown transaction type: ${type}`);
  const status = str(t, "status");
  if (status !== "posted" && status !== "voided") throw new Error(`unknown status: ${status}`);
  return {
    id: str(t, "id"),
    publicRef: str(t, "public_ref"),
    type,
    status,
    customerId: strOrNull(t, "customer_id"),
    customerName: strOrNull(root, "customer_name"),
    occurredAt: str(t, "occurred_at"),
    businessDate: str(t, "business_date"),
    principalCents: int(t, "principal_cents"),
    feeCents: int(t, "fee_cents"),
    feeMode: strOrNull(t, "fee_mode"),
    providerCostCents: int(t, "provider_cost_cents"),
    creditCents: int(t, "credit_cents"),
    paymentMethod: strOrNull(t, "payment_method"),
    gcashReference: strOrNull(t, "gcash_reference"),
    loadSource: strOrNull(t, "load_source"),
    loadCostCents: intOrNull(t, "load_cost_cents"),
    customerPriceCents: intOrNull(t, "customer_price_cents"),
    adjustmentKind: strOrNull(t, "adjustment_kind"),
    notes: strOrNull(t, "notes"),
    recordedByName: strOrNull(root, "recorded_by_name"),
    createdAt: str(t, "created_at"),
    voidRequestedAt: strOrNull(t, "void_requested_at"),
    voidRequestedByName: strOrNull(root, "void_requested_by_name"),
    voidRequestReason: strOrNull(t, "void_request_reason"),
    voidedAt: strOrNull(t, "voided_at"),
    voidedByName: strOrNull(root, "voided_by_name"),
    voidReason: strOrNull(t, "void_reason"),
    lines: asRows(root.lines, "lines").map((l): DetailLine => ({
      entryKind: str(l, "entry_kind"),
      entryDate: str(l, "entry_date"),
      account: str(l, "account"),
      accountCode: str(l, "account_code"),
      customerId: strOrNull(l, "customer_id"),
      amountCents: int(l, "amount_cents"),
    })),
    allocations: asRows(root.allocations, "allocations").map((a) => ({ debtId: str(a, "debt_id"), amountCents: int(a, "amount_cents") })),
    debts: asRows(root.debts, "debts").map((d) => ({ debtId: str(d, "debt_id"), originalCents: int(d, "original_cents"), origin: str(d, "origin") })),
  };
}

export type CustomerDetail = {
  id: string;
  customerNo: number;
  displayName: string;
  contactNumber: string | null;
  notes: string | null;
  status: "active" | "archived";
  archiveReason: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function parseCustomerDetail(value: unknown): CustomerDetail | null {
  if (value === null || value === undefined) return null;
  const r = asRow(value, "customer");
  const status = str(r, "status");
  if (status !== "active" && status !== "archived") throw new Error(`unknown customer status: ${status}`);
  return {
    id: str(r, "id"),
    customerNo: int(r, "customer_no"),
    displayName: str(r, "display_name"),
    contactNumber: strOrNull(r, "contact_number"),
    notes: strOrNull(r, "notes"),
    status,
    archiveReason: strOrNull(r, "archive_reason"),
    archivedAt: strOrNull(r, "archived_at"),
    createdAt: str(r, "created_at"),
    updatedAt: str(r, "updated_at"),
  };
}

export type SimilarCustomer = { id: string; displayName: string; status: "active" | "archived"; kind: "exact" | "similar" };

export function parseSimilarCustomers(value: unknown): SimilarCustomer[] {
  return asRows(value, "similar customers").map((r) => {
    const kind = str(r, "match_kind");
    const status = str(r, "status");
    if ((kind !== "exact" && kind !== "similar") || (status !== "active" && status !== "archived")) throw new Error("unexpected match row");
    return { id: str(r, "id"), displayName: str(r, "display_name"), status, kind };
  });
}
