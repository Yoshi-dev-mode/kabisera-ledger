import { csvCell, toCsv, type CsvColumn } from "@/lib/csv";
import { TYPE_LABELS, METHOD_LABELS, type TransactionRow } from "@/lib/data/transactions";
import { toDecimalPesos } from "@/lib/money";
import { formatManilaDateTime } from "@/lib/time";
import type { Statement } from "@/lib/statement";

const when = (iso: string) => formatManilaDateTime(new Date(iso));

/**
 * Transaction history CSV. Contact numbers are deliberately NOT included. Amounts are plain decimals in pesos;
 * "shop cash/GCash" is what happened to the shop's drawer and wallet (+ in, - out).
 */
export function transactionsCsv(rows: readonly TransactionRow[], generatedAt: Date): string {
  const columns: CsvColumn<TransactionRow>[] = [
    { header: "Date and time (Philippine time)", value: (r) => when(r.occurredAt) },
    { header: "Transaction ID", value: (r) => r.publicRef },
    { header: "Customer", value: (r) => r.customerName },
    { header: "Type", value: (r) => TYPE_LABELS[r.type] },
    { header: "Amount", value: (r) => toDecimalPesos(r.principalCents), kind: "number" },
    { header: "Service fee", value: (r) => toDecimalPesos(r.feeCents), kind: "number" },
    { header: "Selling price (load)", value: (r) => (r.customerPriceCents === null ? "" : toDecimalPesos(r.customerPriceCents)), kind: "number" },
    { header: "Left unpaid", value: (r) => toDecimalPesos(r.creditCents), kind: "number" },
    { header: "Shop cash movement", value: (r) => toDecimalPesos(r.shopCashCents), kind: "number" },
    { header: "Shop GCash movement", value: (r) => toDecimalPesos(r.shopGcashCents), kind: "number" },
    { header: "Payment", value: (r) => (r.paymentMethod ? (METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod) : "") },
    { header: "GCash reference", value: (r) => r.gcashReference },
    { header: "Status", value: (r) => (r.status === "voided" ? "Voided" : "Posted") },
    { header: "Recorded by", value: (r) => r.recordedByName },
    { header: "Notes", value: (r) => r.notes },
    { header: "Business cost (load)", value: (r) => r.loadCostCents === null ? "" : toDecimalPesos(r.loadCostCents), kind: "number" },
    { header: "Load margin", value: (r) => r.customerPriceCents === null || r.loadCostCents === null ? "" : toDecimalPesos(r.customerPriceCents - r.loadCostCents - r.feeCents), kind: "number" },
    { header: "Tip income", value: (r) => r.type === "debt_repayment" ? toDecimalPesos(r.tipCents) : "", kind: "number" },
    { header: "Total received (repayment)", value: (r) => r.type === "debt_repayment" ? toDecimalPesos(r.principalCents + r.tipCents) : "", kind: "number" },
  ];
  const body = toCsv(rows, columns, { bom: true });
  return `${body}${csvCell(`Generated ${formatManilaDateTime(generatedAt)} Philippine time`)}\r\n`;
}

export function statementCsv(customerName: string, s: Statement, generatedAt: Date): string {
  const rows: { section: string; date: string; reference: string; description: string; amount: string }[] = [];
  rows.push({
    section: "Opening balance",
    date: s.from,
    reference: "",
    description: s.openingCents === null ? (s.openingNote ?? "Not determinable") : "",
    amount: s.openingCents === null ? "" : toDecimalPesos(s.openingCents),
  });
  for (const line of s.lines) {
    const label = line.kind === "debt" ? "Debt incurred" : line.kind === "repayment" ? "Repayment" : "Adjustment";
    rows.push({
      section: label,
      date: line.dateKnown ? line.businessDate : `${line.businessDate} (recorded; original date unknown)`,
      reference: line.reference ?? "",
      description: [line.method ? (METHOD_LABELS[line.method] ?? line.method) : "", line.note ?? ""].filter(Boolean).join(" · "),
      amount: toDecimalPesos(line.amountCents),
    });
  }
  rows.push({
    section: "Closing balance",
    date: s.to,
    reference: "",
    description: s.closingCents === null ? (s.closingNote ?? "Not determinable") : "",
    amount: s.closingCents === null ? "" : toDecimalPesos(s.closingCents),
  });
  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: "Section", value: (r) => r.section },
    { header: "Date", value: (r) => r.date },
    { header: "Reference", value: (r) => r.reference },
    { header: "Details", value: (r) => r.description },
    { header: "Amount (positive = owed, negative = paid)", value: (r) => r.amount, kind: "number" },
  ];
  const head = `${customerName} statement ${s.from} to ${s.to}`;
  return `\uFEFF${csvCell(head)}\r\n${toCsv(rows, columns)}${csvCell(`Generated ${formatManilaDateTime(generatedAt)} Philippine time`)}\r\n`;
}

/** A safe file-name piece from a customer's name: lowercase letters and digits, joined by dashes. */
export function fileSlug(name: string): string {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "customer";
}

// ---------------------------------------------------------------- report exports (Phase 8)
import type { DiscrepancyRow, FloatReportRow, PeriodReport, StaffReportRow } from "@/lib/data/closing";
import type { GroupedPoint } from "@/lib/closing";

const money = (c: number) => toDecimalPesos(c);
const stamp = (d: Date) => csvCell(`Generated ${formatManilaDateTime(d)} Philippine time`);

type Line = { measure: string; amount: string; note: string };

/** The period summary, with income, volume, costs and profit kept in clearly separate groups. */
export function periodCsv(r: PeriodReport, from: string, to: string, generatedAt: Date): string {
  const rows: Line[] = [
    { measure: "TRANSACTIONS", amount: "", note: "" },
    { measure: "Transactions recorded", amount: String(r.transactionCount), note: "excludes voided" },
    { measure: "Voided", amount: String(r.voidedCount), note: "" },
    { measure: "TRANSACTION VOLUME (not income)", amount: "", note: "money that passed through" },
    { measure: `Cash-in volume (${r.cashInCount})`, amount: money(r.cashInVolumeCents), note: "" },
    { measure: `Cash-out volume (${r.cashOutCount})`, amount: money(r.cashOutVolumeCents), note: "" },
    { measure: `Mobile load sold (${r.loadCount})`, amount: money(r.loadSalesCents), note: "" },
    { measure: "Debt payments", amount: money(r.repaymentsCents), note: "excludes tips" },
    { measure: "New debt created", amount: money(r.newDebtCents), note: "not cash" },
    { measure: "EARNED", amount: "", note: "" },
    { measure: "Service fees", amount: money(r.feesCents), note: "" },
    { measure: "Mobile-load margin", amount: money(r.loadMarginCents), note: "" },
    { measure: "Tip income", amount: money(r.tipIncomeCents), note: "" },
    { measure: "COSTS", amount: "", note: "" },
    { measure: "Provider costs", amount: money(-r.providerCostCents), note: "" },
    { measure: "Operating expenses", amount: money(-r.expensesCents), note: "" },
    { measure: "Debt write-offs and corrections", amount: money(-r.writeOffsCents), note: "" },
    { measure: "NET PROFIT", amount: money(r.netProfitCents), note: "fees + load margin + tips - costs" },
    { measure: "Counting differences", amount: money(-r.varianceCents), note: "reported separately, not in profit" },
  ];
  const cols: CsvColumn<Line>[] = [
    { header: `Summary ${from} to ${to}`, value: (l) => l.measure },
    { header: "Amount (pesos)", value: (l) => l.amount, kind: "number" },
    { header: "Note", value: (l) => l.note },
  ];
  return `${toCsv(rows, cols, { bom: true })}${stamp(generatedAt)}\r\n`;
}

export function seriesCsv(points: readonly GroupedPoint[], generatedAt: Date): string {
  const cols: CsvColumn<GroupedPoint>[] = [
    { header: "Period", value: (p) => p.label },
    { header: "Transactions", value: (p) => String(p.transactionCount), kind: "number" },
    { header: "Service fees", value: (p) => money(p.feesCents), kind: "number" },
    { header: "Load margin", value: (p) => money(p.loadMarginCents), kind: "number" },
    { header: "Tip income", value: (p) => money(p.tipIncomeCents), kind: "number" },
    { header: "Costs", value: (p) => money(-p.costsCents), kind: "number" },
    { header: "Net profit", value: (p) => money(p.netProfitCents), kind: "number" },
  ];
  return `${toCsv(points, cols, { bom: true })}${stamp(generatedAt)}\r\n`;
}

export function floatCsv(rows: readonly FloatReportRow[], from: string, to: string, generatedAt: Date): string {
  const cols: CsvColumn<FloatReportRow>[] = [
    { header: `Account (${from} to ${to})`, value: (r) => r.name },
    { header: "At the start", value: (r) => money(r.openingCents), kind: "number" },
    { header: "Money in", value: (r) => money(r.inflowCents), kind: "number" },
    { header: "Money out", value: (r) => money(r.outflowCents), kind: "number" },
    { header: "At the end", value: (r) => money(r.closingCents), kind: "number" },
  ];
  return `${toCsv(rows, cols, { bom: true })}${stamp(generatedAt)}\r\n`;
}

export function staffCsv(rows: readonly StaffReportRow[], generatedAt: Date): string {
  const cols: CsvColumn<StaffReportRow>[] = [
    { header: "Staff member", value: (r) => r.staffName },
    { header: "Transactions", value: (r) => String(r.transactionCount), kind: "number" },
    { header: "Amount handled", value: (r) => money(r.volumeCents), kind: "number" },
    { header: "Service fees", value: (r) => money(r.feesCents), kind: "number" },
  ];
  return `${toCsv(rows, cols, { bom: true })}${stamp(generatedAt)}\r\n`;
}

export function discrepanciesCsv(rows: readonly DiscrepancyRow[], generatedAt: Date): string {
  const cols: CsvColumn<DiscrepancyRow>[] = [
    { header: "Day", value: (r) => r.businessDate },
    { header: "Revision", value: (r) => String(r.revision), kind: "number" },
    { header: "Account", value: (r) => r.accountName },
    { header: "Expected", value: (r) => money(r.expectedCents), kind: "number" },
    { header: "Counted", value: (r) => money(r.actualCents), kind: "number" },
    { header: "Difference (counted - expected)", value: (r) => money(r.varianceCents), kind: "number" },
    { header: "Reason", value: (r) => r.reason },
  ];
  return `${toCsv(rows, cols, { bom: true })}${stamp(generatedAt)}\r\n`;
}
