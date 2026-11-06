import Link from "next/link";
import { Pill } from "@/components/ui/pill";
import { METHOD_LABELS, TYPE_LABELS, type TransactionRow } from "@/lib/data/transactions";
import { formatManilaDateTime } from "@/lib/time";
import { Money } from "./money";

function StatusPill({ row }: { row: TransactionRow }) {
  if (row.status === "voided") return <Pill tone="negative">Voided</Pill>;
  if (row.voidRequested) return <Pill tone="warning">Void requested</Pill>;
  return <Pill tone="positive">Posted</Pill>;
}

const when = (iso: string) => formatManilaDateTime(new Date(iso));

/**
 * One list of transactions, two layouts: a compact table on wide screens and a readable list on phones.
 * "Cash" and "GCash" are what happened to the SHOP's drawer and wallet (+ in, − out).
 */
export function TransactionTable({ rows, showCustomer }: { rows: readonly TransactionRow[]; showCustomer: boolean }) {
  if (rows.length === 0) return null;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px] border-collapse text-[14px]">
          <thead>
            <tr className="text-left text-[12px] font-normal text-muted-foreground">
              <th className="h-9 px-3 font-normal">Date and time</th>
              <th className="px-3 font-normal">Reference</th>
              {showCustomer ? <th className="px-3 font-normal">Customer</th> : null}
              <th className="px-3 font-normal">Type</th>
              <th className="num px-3 text-right font-normal">Amount</th>
              <th className="num px-3 text-right font-normal">Fee</th>
              <th className="num px-3 text-right font-normal">Cash</th>
              <th className="num px-3 text-right font-normal">GCash</th>
              <th className="px-3 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="h-11 border-t border-rule hover:bg-[#fafafa]">
                <td className="num px-3 whitespace-nowrap">{when(r.occurredAt)}</td>
                <td className="px-3 whitespace-nowrap">
                  <Link href={`/transactions/${r.id}`} className="underline underline-offset-4">
                    {r.publicRef}
                  </Link>
                </td>
                {showCustomer ? (
                  <td className="px-3">
                    {r.customerId ? (
                      <Link href={`/customers/${r.customerId}`} className="hover:underline">
                        {r.customerName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </td>
                ) : null}
                <td className="px-3 whitespace-nowrap">
                  {TYPE_LABELS[r.type]}
                  {r.paymentMethod && (r.type === "cash_in" || r.type === "mobile_load") && r.paymentMethod !== "cash" ? (
                    <span className="text-muted-foreground"> · {METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}</span>
                  ) : null}
                </td>
                <td className="num px-3 text-right"><Money cents={r.type === "mobile_load" && r.customerPriceCents !== null ? r.customerPriceCents : r.principalCents} /></td>
                <td className="num px-3 text-right">{r.feeCents ? <Money cents={r.feeCents} /> : <span className="text-muted-foreground">–</span>}</td>
                <td className="num px-3 text-right">{r.shopCashCents ? <Money cents={r.shopCashCents} signed /> : <span className="text-muted-foreground">–</span>}</td>
                <td className="num px-3 text-right">{r.shopGcashCents ? <Money cents={r.shopGcashCents} signed /> : <span className="text-muted-foreground">–</span>}</td>
                <td className="px-3"><StatusPill row={r} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col divide-y divide-rule md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="py-3">
            <Link href={`/transactions/${r.id}`} className="flex flex-col gap-1">
              <span className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-medium">{TYPE_LABELS[r.type]}</span>
                <Money cents={r.type === "mobile_load" && r.customerPriceCents !== null ? r.customerPriceCents : r.principalCents} className="text-[14px]" />
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                <span className="num">{when(r.occurredAt)}</span>
                <span>{r.publicRef}</span>
                {showCustomer && r.customerName ? <span>{r.customerName}</span> : null}
              </span>
              <span className="flex flex-wrap items-center gap-2 text-[12px]">
                <StatusPill row={r} />
                {r.feeCents ? <span className="num text-muted-foreground">Fee {`₱${(r.feeCents / 100).toFixed(2)}`}</span> : null}
                {r.creditCents ? <span className="num text-muted-foreground">Unpaid {`₱${(r.creditCents / 100).toFixed(2)}`}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
