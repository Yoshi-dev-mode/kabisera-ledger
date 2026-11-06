import { isTransactionType, type TransactionType } from "@/lib/data/transactions";
import { isBusinessDateString } from "@/lib/time";

export const PAGE_SIZE = 25;

export type HistoryFilters = {
  from: string | null;
  to: string | null;
  types: TransactionType[];
  status: "posted" | "voided" | null;
  search: string | null;
  newestFirst: boolean;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Reads filters from a page's query string. Anything invalid is ignored (never trusted, never an error). */
export function parseHistoryFilters(params: Params): HistoryFilters {
  const rawFrom = first(params.from)?.trim();
  const rawTo = first(params.to)?.trim();
  let from = rawFrom && isBusinessDateString(rawFrom) ? rawFrom : null;
  let to = rawTo && isBusinessDateString(rawTo) ? rawTo : null;
  if (from && to && from > to) [from, to] = [to, from];

  const rawTypes = params.type === undefined ? [] : Array.isArray(params.type) ? params.type : [params.type];
  const types = [...new Set(rawTypes.filter(isTransactionType))];

  const rawStatus = first(params.status);
  const status = rawStatus === "posted" || rawStatus === "voided" ? rawStatus : null;

  const search = first(params.q)?.trim().slice(0, 80) || null;
  const newestFirst = first(params.order) !== "oldest";

  const pageNumber = Number(first(params.page));
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= 100_000 ? pageNumber : 1;

  return { from, to, types, status, search, newestFirst, page };
}

export function offsetFor(page: number, pageSize = PAGE_SIZE): number {
  return (Math.max(1, page) - 1) * pageSize;
}

export function pageInfo(total: number, page: number, pageSize = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const firstShown = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const lastShown = Math.min(total, current * pageSize);
  return { pages, current, firstShown, lastShown, hasPrev: current > 1, hasNext: current < pages };
}

/** Builds a query string for links, keeping the current filters and applying overrides (page, order...). */
export function toQueryString(filters: HistoryFilters, overrides: Partial<HistoryFilters> = {}): string {
  const f = { ...filters, ...overrides };
  const q = new URLSearchParams();
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  for (const t of f.types) q.append("type", t);
  if (f.status) q.set("status", f.status);
  if (f.search) q.set("q", f.search);
  if (!f.newestFirst) q.set("order", "oldest");
  if (f.page > 1) q.set("page", String(f.page));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export type CustomerQuery = {
  query: string | null;
  status: "active" | "archived" | "all";
  onlyWithDebt: boolean;
  page: number;
};

export function parseCustomerQuery(params: Params): CustomerQuery {
  const rawStatus = first(params.status);
  const status = rawStatus === "archived" || rawStatus === "all" ? rawStatus : "active";
  const pageNumber = Number(first(params.page));
  return {
    query: first(params.q)?.trim().slice(0, 80) || null,
    status,
    onlyWithDebt: first(params.debt) === "1",
    page: Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= 100_000 ? pageNumber : 1,
  };
}

export function customerQueryString(q: CustomerQuery, overrides: Partial<CustomerQuery> = {}): string {
  const f = { ...q, ...overrides };
  const out = new URLSearchParams();
  if (f.query) out.set("q", f.query);
  if (f.status !== "active") out.set("status", f.status);
  if (f.onlyWithDebt) out.set("debt", "1");
  if (f.page > 1) out.set("page", String(f.page));
  const s = out.toString();
  return s ? `?${s}` : "";
}

/** Turns a URL's query string into the plain object parseHistoryFilters expects (repeated keys become arrays). */
export function searchParamsToObject(sp: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    out[key] = all.length > 1 ? all : (all[0] ?? "");
  }
  return out;
}
