import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TRANSACTION_TYPES, TYPE_LABELS } from "@/lib/data/transactions";
import type { HistoryFilters } from "@/lib/filters";

/**
 * A plain GET form: filters live in the address, so a filtered view can be bookmarked, shared and exported.
 * `allowedTypes` limits the type checkboxes (the customer page hides types that never involve a customer).
 */
export function FilterBar({
  basePath, filters, allowedTypes = TRANSACTION_TYPES,
}: { basePath: string; filters: HistoryFilters; allowedTypes?: readonly (typeof TRANSACTION_TYPES)[number][] }) {
  const active = Boolean(filters.from || filters.to || filters.types.length || filters.status || filters.search || !filters.newestFirst);
  return (
    <form method="get" action={basePath} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="q" className="text-[12px] text-muted-foreground">Search reference, GCash reference or notes</label>
          <Input id="q" name="q" defaultValue={filters.search ?? ""} maxLength={80} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="from" className="text-[12px] text-muted-foreground">From</label>
          <Input id="from" name="from" type="date" defaultValue={filters.from ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="to" className="text-[12px] text-muted-foreground">To</label>
          <Input id="to" name="to" type="date" defaultValue={filters.to ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className="text-[12px] text-muted-foreground">Status</label>
          <select id="status" name="status" defaultValue={filters.status ?? ""} className="h-9 rounded-control border border-input bg-surface px-2 text-[14px]">
            <option value="">All</option>
            <option value="posted">Posted</option>
            <option value="voided">Voided</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="order" className="text-[12px] text-muted-foreground">Order</label>
          <select id="order" name="order" defaultValue={filters.newestFirst ? "newest" : "oldest"} className="h-9 rounded-control border border-input bg-surface px-2 text-[14px]">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      </div>
      <details className="text-[14px]" open={filters.types.length > 0}>
        <summary className="cursor-pointer text-[13px] text-muted-foreground">Types{filters.types.length ? ` (${filters.types.length})` : ""}</summary>
        <fieldset className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          <legend className="sr-only">Transaction types</legend>
          {allowedTypes.map((t) => (
            <label key={t} className="flex items-center gap-2">
              <input type="checkbox" name="type" value={t} defaultChecked={filters.types.includes(t)} className="size-4 accent-[var(--primary)]" />
              {TYPE_LABELS[t]}
            </label>
          ))}
        </fieldset>
      </details>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm">Apply</Button>
        {active ? <Link href={basePath} className="text-[13px] underline underline-offset-4">Clear filters</Link> : null}
      </div>
    </form>
  );
}
