import "server-only";
import { friendlyDbError } from "@/lib/errors";
import { offsetFor, PAGE_SIZE, type HistoryFilters } from "@/lib/filters";
import { createClient } from "@/lib/supabase/server";
import {
  parseCustomerDetail, parseCustomerList, parseCustomerOverview, parseDebtEvents, parseSimilarCustomers,
  parseTransactionDetail, parseTransactionList,
} from "@/lib/data/transactions";

/** Server-side reads. Every one calls a permission-checked database function or an RLS-protected table. */

export async function fetchTransactions(filters: HistoryFilters, options: { customerId?: string | null; all?: boolean } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_transactions", {
    p_customer_id: options.customerId ?? null,
    p_from: filters.from,
    p_to: filters.to,
    p_types: filters.types.length ? filters.types : null,
    p_status: filters.status,
    p_search: filters.search,
    p_newest_first: filters.newestFirst,
    p_limit: options.all ? 5000 : PAGE_SIZE,
    p_offset: options.all ? 0 : offsetFor(filters.page),
  });
  if (error) throw new Error(friendlyDbError(error));
  return parseTransactionList(data);
}

export async function fetchCustomers(options: { query: string | null; status: "active" | "archived" | "all"; onlyWithDebt: boolean; page: number }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_customers", {
    p_query: options.query,
    p_status: options.status,
    p_only_with_debt: options.onlyWithDebt,
    p_limit: PAGE_SIZE,
    p_offset: offsetFor(options.page),
  });
  if (error) throw new Error(friendlyDbError(error));
  return parseCustomerList(data);
}

export async function fetchCustomer(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, customer_no, display_name, contact_number, notes, status, archive_reason, archived_at, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(friendlyDbError(error));
  return parseCustomerDetail(data);
}

export async function fetchCustomerOverview(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_overview", { p_customer_id: id });
  if (error) throw new Error(friendlyDbError(error));
  return parseCustomerOverview(data);
}

export async function fetchDebtEvents(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_debt_events", { p_customer_id: id });
  if (error) throw new Error(friendlyDbError(error));
  return parseDebtEvents(data);
}

export async function fetchTransactionDetail(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transaction_detail", { p_id: id });
  if (error) throw new Error(friendlyDbError(error));
  return parseTransactionDetail(data);
}

export async function fetchSimilarCustomers(name: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_similar_customers", { p_name: name });
  if (error) throw new Error(friendlyDbError(error));
  return parseSimilarCustomers(data);
}

// ---- debts (Phase 5)
import { parseAging, parseDebtList, parseDebtSummary } from "@/lib/data/debts";

export async function fetchDebts(options: { query: string | null; status: string; overdueOnly: boolean; page: number }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_debts", {
    p_query: options.query,
    p_status: options.status,
    p_overdue_only: options.overdueOnly,
    p_limit: PAGE_SIZE,
    p_offset: offsetFor(options.page),
  });
  if (error) throw new Error(friendlyDbError(error));
  return parseDebtList(data);
}

export async function fetchDebtSummary() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("debt_summary");
  if (error) throw new Error(friendlyDbError(error));
  return parseDebtSummary(data);
}

export async function fetchDebtAging() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("debt_aging");
  if (error) throw new Error(friendlyDbError(error));
  return parseAging(data);
}

/** One debt by id, from the same query as the list, so the numbers are identical everywhere. */
export async function fetchOneDebt(debtId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("debt_detail", { p_debt_id: debtId });
  if (error) throw new Error(friendlyDbError(error));
  return parseDebtList(data).rows[0] ?? null;
}

export async function fetchCustomersOwing() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_customers", { p_query: null, p_status: "active", p_only_with_debt: true, p_limit: 200, p_offset: 0 });
  if (error) throw new Error(friendlyDbError(error));
  return parseCustomerList(data).rows;
}

export async function fetchActiveCustomers() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_customers", { p_query: null, p_status: "active", p_only_with_debt: false, p_limit: 200, p_offset: 0 });
  if (error) throw new Error(friendlyDbError(error));
  return parseCustomerList(data).rows;
}

// ---- entry forms and settings (Phase 6)
import { parseCategories, parseFeeRules, parseLoadProducts, parseSettings, parseThresholds } from "@/lib/data/settings";

export async function fetchSettings() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_settings").select("key, value");
  if (error) throw new Error(friendlyDbError(error));
  return parseSettings(data);
}

export async function fetchFeeRules(options: { activeOnly: boolean }) {
  const supabase = await createClient();
  let query = supabase
    .from("fee_rules")
    .select("id, service_type, name, fee_mode, min_amount_cents, max_amount_cents, flat_fee_cents, percent_bps, effective_from, effective_to, is_active")
    .order("service_type")
    .order("min_amount_cents");
  if (options.activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(friendlyDbError(error));
  return parseFeeRules(data);
}

export async function fetchLoadProducts(options: { activeOnly: boolean }) {
  const supabase = await createClient();
  let query = supabase.from("load_products").select("id, network, label, default_source, cost_bps_of_face, is_active").order("network").order("label");
  if (options.activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(friendlyDbError(error));
  return parseLoadProducts(data);
}

export async function fetchCategories(options: { activeOnly: boolean }) {
  const supabase = await createClient();
  let query = supabase.from("expense_categories").select("id, name, is_active").order("name");
  if (options.activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(friendlyDbError(error));
  return parseCategories(data);
}

export async function fetchThresholds() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("accounts").select("code, name, low_threshold_cents").eq("is_float", true).order("sort_order");
  if (error) throw new Error(friendlyDbError(error));
  return parseThresholds(data);
}

// ---- dashboard and accounts (Phase 7)
import { parseAccountLedger, parseAccountOverview, parseDailySeries, parseDailySummary, parseDashboardFacts } from "@/lib/data/dashboard";

export async function fetchAccountOverview() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("account_overview");
  if (error) throw new Error(friendlyDbError(error));
  return parseAccountOverview(data);
}

export async function fetchDailySummary(date: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("daily_summary", { p_date: date });
  if (error) throw new Error(friendlyDbError(error));
  return parseDailySummary(data);
}

export async function fetchDailySeries(from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("daily_series", { p_from: from, p_to: to });
  if (error) throw new Error(friendlyDbError(error));
  return parseDailySeries(data);
}

export async function fetchDashboardFacts() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_facts");
  if (error) throw new Error(friendlyDbError(error));
  return parseDashboardFacts(data);
}

export async function fetchAccountLedger(options: { code: string; from: string | null; to: string | null; page: number }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("account_ledger", {
    p_code: options.code, p_from: options.from, p_to: options.to, p_limit: PAGE_SIZE, p_offset: offsetFor(options.page),
  });
  if (error) throw new Error(friendlyDbError(error));
  return parseAccountLedger(data);
}

// ---- closing and reports (Phase 8)
import {
  parseClosingDetail, parseClosingList, parseDiscrepancies, parseFloatReport, parsePeriodReport, parseStaffReport,
} from "@/lib/data/closing";

export async function fetchClosingDetail(date: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("closing_detail", { p_date: date });
  if (error) throw new Error(friendlyDbError(error));
  return parseClosingDetail(data);
}

export async function fetchClosings(page: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_closings", { p_limit: PAGE_SIZE, p_offset: offsetFor(page) });
  if (error) throw new Error(friendlyDbError(error));
  return parseClosingList(data);
}

export async function fetchPeriodReport(from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_period", { p_from: from, p_to: to });
  if (error) throw new Error(friendlyDbError(error));
  return parsePeriodReport(data);
}

export async function fetchStaffReport(from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_by_staff", { p_from: from, p_to: to });
  if (error) throw new Error(friendlyDbError(error));
  return parseStaffReport(data);
}

export async function fetchFloatReport(from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_float_movement", { p_from: from, p_to: to });
  if (error) throw new Error(friendlyDbError(error));
  return parseFloatReport(data);
}

export async function fetchDiscrepancyReport(from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_discrepancies", { p_from: from, p_to: to });
  if (error) throw new Error(friendlyDbError(error));
  return parseDiscrepancies(data);
}
