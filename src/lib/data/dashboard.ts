import { asRow, asRows, bool, int, intOrNull, str, strOrNull } from "@/lib/data/parse";
import { isTransactionType, type TransactionType } from "@/lib/data/transactions";

export type AccountOverview = {
  code: string;
  name: string;
  balanceCents: number;
  lowThresholdCents: number | null;
  isLow: boolean;
  lastReconciledOn: string | null;
  lastVarianceCents: number | null;
};

export function parseAccountOverview(value: unknown): AccountOverview[] {
  return asRows(value, "accounts").map((r) => ({
    code: str(r, "code"),
    name: str(r, "name"),
    balanceCents: int(r, "balance_cents"),
    lowThresholdCents: intOrNull(r, "low_threshold_cents"),
    isLow: bool(r, "is_low"),
    lastReconciledOn: strOrNull(r, "last_reconciled_on"),
    lastVarianceCents: intOrNull(r, "last_variance_cents"),
  }));
}

export type DailySummary = {
  transactionCount: number;
  voidedCount: number;
  cashInVolumeCents: number;
  cashOutVolumeCents: number;
  loadSalesCents: number;
  feesCents: number;
  loadMarginCents: number;
  tipIncomeCents: number;
  providerCostCents: number;
  expensesCents: number;
  writeOffsCents: number;
  varianceCents: number;
  netProfitCents: number;
};

export function parseDailySummary(value: unknown): DailySummary {
  const r = asRow(Array.isArray(value) ? value[0] : value, "daily summary");
  return {
    transactionCount: int(r, "transaction_count"),
    voidedCount: int(r, "voided_count"),
    cashInVolumeCents: int(r, "cash_in_volume_cents"),
    cashOutVolumeCents: int(r, "cash_out_volume_cents"),
    loadSalesCents: int(r, "load_sales_cents"),
    feesCents: int(r, "fees_cents"),
    loadMarginCents: int(r, "load_margin_cents"),
    tipIncomeCents: intOrNull(r, "tip_income_cents") ?? 0,
    providerCostCents: int(r, "provider_cost_cents"),
    expensesCents: int(r, "expenses_cents"),
    writeOffsCents: int(r, "write_offs_cents"),
    varianceCents: int(r, "variance_cents"),
    netProfitCents: int(r, "net_profit_cents"),
  };
}

export type DayPoint = { businessDate: string; feesCents: number; loadMarginCents: number; tipIncomeCents: number; costsCents: number; netProfitCents: number; transactionCount: number };

export function parseDailySeries(value: unknown): DayPoint[] {
  return asRows(value, "daily series").map((r) => ({
    businessDate: str(r, "business_date"),
    feesCents: int(r, "fees_cents"),
    loadMarginCents: int(r, "load_margin_cents"),
    tipIncomeCents: intOrNull(r, "tip_income_cents") ?? 0,
    costsCents: int(r, "costs_cents"),
    netProfitCents: int(r, "net_profit_cents"),
    transactionCount: int(r, "transaction_count"),
  }));
}

export type DashboardFacts = {
  lowAccounts: { code: string; name: string; balanceCents: number; thresholdCents: number }[] | null;
  overdue: { count: number; cents: number } | null;
  unreconciledDates: string[] | null;
  discrepancies: { businessDate: string; account: string; varianceCents: number }[] | null;
};

/** `null` for a section means the person may not see it; an empty list means "nothing to report". */
export function parseDashboardFacts(value: unknown): DashboardFacts {
  const r = asRow(value, "dashboard facts");
  const list = (key: string) => (r[key] === null || r[key] === undefined ? null : asRows(r[key], key));
  const low = list("low_accounts");
  const disc = list("discrepancies");
  const unrec = r.unreconciled_dates;
  let overdue: DashboardFacts["overdue"] = null;
  if (r.overdue !== null && r.overdue !== undefined) {
    const o = asRow(r.overdue, "overdue");
    overdue = { count: int(o, "count"), cents: int(o, "cents") };
  }
  if (unrec !== null && unrec !== undefined && (!Array.isArray(unrec) || unrec.some((d) => typeof d !== "string"))) {
    throw new Error("unreconciled_dates: expected a list of dates");
  }
  return {
    lowAccounts: low && low.map((a) => ({ code: str(a, "code"), name: str(a, "name"), balanceCents: int(a, "balance_cents"), thresholdCents: int(a, "threshold_cents") })),
    overdue,
    unreconciledDates: (unrec as string[] | null | undefined) ?? null,
    discrepancies: disc && disc.map((d) => ({ businessDate: str(d, "business_date"), account: str(d, "account"), varianceCents: int(d, "variance_cents") })),
  };
}

export type LedgerRow = {
  lineId: number;
  entryDate: string;
  createdAt: string;
  transactionId: string;
  publicRef: string;
  txType: TransactionType;
  customerName: string | null;
  entryKind: string;
  changeCents: number;
  balanceAfterCents: number;
  memo: string | null;
};

export function parseAccountLedger(value: unknown): { rows: LedgerRow[]; total: number } {
  const raw = asRows(value, "account ledger");
  const rows = raw.map((r): LedgerRow => {
    const type = str(r, "tx_type");
    if (!isTransactionType(type)) throw new Error(`unknown transaction type: ${type}`);
    return {
      lineId: int(r, "line_id"),
      entryDate: str(r, "entry_date"),
      createdAt: str(r, "created_at"),
      transactionId: str(r, "transaction_id"),
      publicRef: str(r, "public_ref"),
      txType: type,
      customerName: strOrNull(r, "customer_name"),
      entryKind: str(r, "entry_kind"),
      changeCents: int(r, "change_cents"),
      balanceAfterCents: int(r, "balance_after_cents"),
      memo: strOrNull(r, "memo"),
    };
  });
  const first = raw[0];
  return { rows, total: first ? int(first, "total_count") : 0 };
}
