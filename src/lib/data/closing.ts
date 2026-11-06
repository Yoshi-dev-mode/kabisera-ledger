import { asRow, asRows, int, intOrNull, str, strOrNull } from "@/lib/data/parse";

export type ClosingAccount = {
  code: string;
  name: string;
  openingCents: number;
  inflowCents: number;
  outflowCents: number;
  expectedCents: number;
  actualCents: number | null;
  varianceCents: number | null;
  reason: string | null;
};

export type ClosingDetail = {
  businessDate: string;
  status: "none" | "draft" | "final";
  closingId: string | null;
  revision: number | null;
  note: string | null;
  amendmentReason: string | null;
  finalizedAt: string | null;
  finalizedByName: string | null;
  transactionCount: number;
  accounts: ClosingAccount[];
};

export function parseClosingDetail(value: unknown): ClosingDetail {
  const r = asRow(value, "closing");
  const status = str(r, "status");
  if (status !== "none" && status !== "draft" && status !== "final") throw new Error(`unknown closing status: ${status}`);
  return {
    businessDate: str(r, "business_date"),
    status,
    closingId: strOrNull(r, "closing_id"),
    revision: intOrNull(r, "revision"),
    note: strOrNull(r, "note"),
    amendmentReason: strOrNull(r, "amendment_reason"),
    finalizedAt: strOrNull(r, "finalized_at"),
    finalizedByName: strOrNull(r, "finalized_by_name"),
    transactionCount: int(r, "transaction_count"),
    accounts: asRows(r.accounts, "closing accounts").map((a): ClosingAccount => ({
      code: str(a, "code"),
      name: str(a, "name"),
      openingCents: int(a, "opening_cents"),
      inflowCents: int(a, "inflow_cents"),
      outflowCents: int(a, "outflow_cents"),
      expectedCents: int(a, "expected_cents"),
      actualCents: intOrNull(a, "actual_cents"),
      varianceCents: intOrNull(a, "variance_cents"),
      reason: strOrNull(a, "reason"),
    })),
  };
}

export type ClosingListRow = {
  businessDate: string;
  revision: number;
  finalizedByName: string | null;
  finalizedAt: string | null;
  totalVarianceCents: number;
  note: string | null;
};

export function parseClosingList(value: unknown): { rows: ClosingListRow[]; total: number } {
  const raw = asRows(value, "closings");
  const rows = raw.map((r): ClosingListRow => ({
    businessDate: str(r, "business_date"),
    revision: int(r, "revision"),
    finalizedByName: strOrNull(r, "finalized_by_name"),
    finalizedAt: strOrNull(r, "finalized_at"),
    totalVarianceCents: int(r, "total_variance_cents"),
    note: strOrNull(r, "note"),
  }));
  const first = raw[0];
  return { rows, total: first ? int(first, "total_count") : 0 };
}

export type PeriodReport = {
  transactionCount: number; voidedCount: number;
  cashInCount: number; cashInVolumeCents: number; cashOutCount: number; cashOutVolumeCents: number;
  loadCount: number; loadSalesCents: number; repaymentsCents: number; newDebtCents: number;
  feesCents: number; loadMarginCents: number; providerCostCents: number; expensesCents: number;
  writeOffsCents: number; varianceCents: number; netProfitCents: number;
};

export function parsePeriodReport(value: unknown): PeriodReport {
  const r = asRow(Array.isArray(value) ? value[0] : value, "period report");
  return {
    transactionCount: int(r, "transaction_count"), voidedCount: int(r, "voided_count"),
    cashInCount: int(r, "cash_in_count"), cashInVolumeCents: int(r, "cash_in_volume_cents"),
    cashOutCount: int(r, "cash_out_count"), cashOutVolumeCents: int(r, "cash_out_volume_cents"),
    loadCount: int(r, "load_count"), loadSalesCents: int(r, "load_sales_cents"),
    repaymentsCents: int(r, "repayments_cents"), newDebtCents: int(r, "new_debt_cents"),
    feesCents: int(r, "fees_cents"), loadMarginCents: int(r, "load_margin_cents"),
    providerCostCents: int(r, "provider_cost_cents"), expensesCents: int(r, "expenses_cents"),
    writeOffsCents: int(r, "write_offs_cents"), varianceCents: int(r, "variance_cents"), netProfitCents: int(r, "net_profit_cents"),
  };
}

export type StaffReportRow = { staffName: string; transactionCount: number; volumeCents: number; feesCents: number };
export function parseStaffReport(value: unknown): StaffReportRow[] {
  return asRows(value, "staff report").map((r) => ({
    staffName: str(r, "staff_name"), transactionCount: int(r, "transaction_count"), volumeCents: int(r, "volume_cents"), feesCents: int(r, "fees_cents"),
  }));
}

export type FloatReportRow = { code: string; name: string; openingCents: number; inflowCents: number; outflowCents: number; closingCents: number };
export function parseFloatReport(value: unknown): FloatReportRow[] {
  return asRows(value, "float report").map((r) => ({
    code: str(r, "code"), name: str(r, "name"), openingCents: int(r, "opening_cents"), inflowCents: int(r, "inflow_cents"),
    outflowCents: int(r, "outflow_cents"), closingCents: int(r, "closing_cents"),
  }));
}

export type DiscrepancyRow = { businessDate: string; revision: number; accountName: string; expectedCents: number; actualCents: number; varianceCents: number; reason: string | null };
export function parseDiscrepancies(value: unknown): DiscrepancyRow[] {
  return asRows(value, "discrepancies").map((r) => ({
    businessDate: str(r, "business_date"), revision: int(r, "revision"), accountName: str(r, "account_name"),
    expectedCents: int(r, "expected_cents"), actualCents: int(r, "actual_cents"), varianceCents: int(r, "variance_cents"), reason: strOrNull(r, "reason"),
  }));
}

