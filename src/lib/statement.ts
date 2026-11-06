/**
 * Customer statement: what the customer owed, what was added, what was paid, and what they owe now.
 *
 * Rules:
 *  - Only DEBT movements count. Ordinary transaction volume is shown separately and never mixed in.
 *  - Voided events are listed for transparency but excluded from every total.
 *  - The opening balance is NEVER invented: if the statement starts before the customer's records begin, the
 *    opening balance is "not determinable" (null) and the reason is given.
 *  - Opening debts have an unknown date. They are recorded from the day they were imported, and say so.
 */
import type { DebtEvent } from "@/lib/data/transactions";
import { businessDateOf } from "@/lib/time";

export type StatementLine = DebtEvent & { businessDate: string };

export type Statement = {
  from: string;
  to: string;
  recordsStart: string | null;
  openingCents: number | null;
  openingNote: string | null;
  lines: StatementLine[];
  voidedLines: StatementLine[];
  debtsIncurredCents: number;
  repaymentsCents: number;
  adjustmentsCents: number;
  closingCents: number | null;
  closingNote: string | null;
};

const dateOf = (event: DebtEvent) => businessDateOf(new Date(event.at));

export function buildStatement(events: readonly DebtEvent[], from: string, to: string): Statement {
  const dated: StatementLine[] = events
    .map((e) => ({ ...e, businessDate: dateOf(e) }))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const live = dated.filter((e) => !e.isVoided);
  const voidedAll = dated.filter((e) => e.isVoided);

  const recordsStart = live.length === 0 ? null : (live.map((e) => e.businessDate).sort()[0] ?? null);

  let openingCents: number | null;
  let openingNote: string | null = null;
  if (recordsStart === null) {
    openingCents = 0;
  } else if (from < recordsStart) {
    openingCents = null;
    openingNote = `Records for this customer start on ${recordsStart}, so the balance before then is not known.`;
  } else {
    openingCents = live.filter((e) => e.businessDate < from).reduce((s, e) => s + e.amountCents, 0);
  }

  const inPeriod = live.filter((e) => e.businessDate >= from && e.businessDate <= to);
  const sum = (kind: StatementLine["kind"]) => inPeriod.filter((e) => e.kind === kind).reduce((s, e) => s + e.amountCents, 0);
  const debtsIncurredCents = sum("debt");
  const repaymentsCents = -sum("repayment");
  const adjustmentsCents = sum("adjustment");

  let closingCents: number | null;
  let closingNote: string | null = null;
  if (recordsStart === null) {
    closingCents = 0;
  } else if (to < recordsStart) {
    closingCents = null;
    closingNote = `Records for this customer start on ${recordsStart}.`;
  } else {
    closingCents = live.filter((e) => e.businessDate <= to).reduce((s, e) => s + e.amountCents, 0);
  }

  return {
    from,
    to,
    recordsStart,
    openingCents,
    openingNote,
    lines: inPeriod,
    voidedLines: voidedAll.filter((e) => e.businessDate >= from && e.businessDate <= to),
    debtsIncurredCents,
    repaymentsCents,
    adjustmentsCents,
    closingCents,
    closingNote,
  };
}

export type LedgerEvent = DebtEvent & { balanceAfterCents: number | null };

/**
 * The debt events in time order, each with the balance owed right after it. Voided events show no balance
 * and do not move it. The running balance starts at zero at the first recorded event.
 */
export function withRunningBalance(events: readonly DebtEvent[]): LedgerEvent[] {
  const sorted = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  let balance = 0;
  return sorted.map((e) => {
    if (e.isVoided) return { ...e, balanceAfterCents: null };
    balance += e.amountCents;
    return { ...e, balanceAfterCents: balance };
  });
}
