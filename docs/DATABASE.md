# Database (PostgreSQL via Supabase)

Fourteen migrations in `supabase/migrations/`, applied in order: 18 tables, 3 views and 78 functions (54 callable by signed-in
users, 24 internal). **None has been executed by the author** (no PostgreSQL was available). Run them, then the 8 scripts in
`supabase/tests/`, before you trust any figure.

| # | File | Contents |
|---|---|---|
| 1 | `…000001_extensions_enums_helpers.sql` | `pg_trgm`, `btree_gist`; enum types; `set_updated_at`, `forbid_modification`, `business_date_of` |
| 2 | `…000002_people_and_reference.sql` | `profiles`, `customers`, `accounts` (+ 11 reference accounts), `app_settings` (+ default policies), `expense_categories`, `import_batches` |
| 3 | `…000003_operations.sql` | `fee_rules`, `load_products`, `transactions`, `transaction_counters` |
| 4 | `…000004_ledger.sql` | `journal_entries`, `ledger_lines`, balance and reversal triggers, `account_balances`, `customer_receivable_balances` |
| 5 | `…000005_debts.sql` | `debts`, `debt_allocations`, `debt_adjustments`, `debt_balances` |
| 6 | `…000006_closings_and_audit.sql` | `daily_closings`, `closing_balances`, `audit_log`, change-audit triggers |
| 7 | `…000007_security_baseline.sql` | RLS on every table; all privileges revoked from `anon` and `authenticated` |
| 8 | `…000008_auth_and_policies.sql` | `must_change_password`; `is_owner`, `is_active_member`, `has_permission`; last-owner guard; owner staff functions; SELECT policies and grants |
| 9 | `…000009_posting_engine.sql` | the `post_*` functions, voids, overdraft protection, idempotency, audit; rebuilds `debt_balances`; the reported starting capital note |
| 10 | `…000010_customers_and_history.sql` | customer create/update/archive/restore, duplicate search, `list_customers`, `list_transactions`, `transaction_detail`, `customer_overview`, `customer_debt_events` |
| 11 | `…000011_debts_module.sql` | the write-off account; `import_opening_debts`, `debt_adjust`, `debt_set_due_date`, `list_debts`, `debt_detail`, `debt_summary`, `debt_aging` |
| 12 | `…000012_settings_functions.sql` | `save_fee_rule`, `save_load_product`, `save_expense_category`, `save_app_setting`, `set_account_threshold` |
| 13 | `…000013_dashboard_and_accounts.sql` | `account_overview`, `daily_summary`, `daily_series`, `dashboard_facts`, `account_ledger` |
| 14 | `…000014_closing_and_reports.sql` | `closing_start/save/finalize/amend/detail`, `list_closings`, `report_period`, `report_by_staff`, `report_float_movement`, `report_discrepancies` |

## What the database enforces already (Phase 1)

- Every journal entry has at least two lines and sums to zero (checked at commit).
- A receivables line must name a customer; no other account may carry one.
- A reversal must exactly negate the entry it reverses, and an entry can be reversed once.
- Ledger lines, journal entries, audit rows, allocations and adjustments are append-only (no update, delete or truncate).
- A transaction is immutable except for its void fields; a void cannot be undone; transactions cannot be deleted.
- A debt's customer, amount and origin cannot be edited. A finalized closing and its balances cannot change.
- Account code, kind and rules cannot change. Two active fee rules cannot overlap.
- `business_date` is derived from `occurred_at` in Philippine time.
- Customer contact numbers and notes are not copied into the audit log.
- Deny by default: RLS is enabled on all 18 tables. Migration 8 then grants **SELECT only**, filtered by permission (see `SECURITY.md`); there are no write privileges for the API roles.
- The last active owner cannot be deactivated, demoted or deleted.

## Enforced by functions (since Phase 3)

Overdraft checks, permission checks, voids, repayments, closings and idempotency live in the `post_*`, `void_*` and `closing_*` functions.
Fee calculation is done in the app (`src/lib/fees.ts`) as a suggestion; the person can change it, and the transaction stores what was used.

## What is NOT enforced

- Nothing stops the database owner (or the service-role key) from changing data directly: keep those credentials out of reach.

## Opening balances

No opening cash, GCash, load or debt amount exists in any migration. The ledger is empty until you enter counted
balances and import the opening debts. Your reported ₱1,400.00 starting capital is stored only as a note in
`app_settings` (`reported.starting_capital`, `posted: false`); it is not a balance.

## Notes

- `auth.users` and the `anon` / `authenticated` roles come from Supabase, so these migrations target Supabase (or local Supabase via the CLI), not a bare PostgreSQL.
- Postgres cannot make `business_date` a generated column (time-zone conversion is not immutable), so a trigger sets it.
- Backup and restore: see `README.md` (full guide arrives with deployment in Phase 10).

## Access (Phase 2)

| Data | Who can read it |
|---|---|
| Own profile | the person themself |
| All profiles, audit log, import batches | owner only |
| Customers | `customers.view`, `customers.manage`, `transactions.record` or `repayments.record` |
| Transactions | `reports.view` or `customers.view` see all; recorders see only their own |
| Ledger lines and journal entries | `accounts.view` or `reports.view` |
| Debts, allocations, adjustments | `debts.view`, `customers.view` or `repayments.record` |
| Closings | `closing.perform` or `reports.view` |
| Accounts, settings, fee rules, load products, expense categories | any active person |
| `transaction_counters` | nobody (internal) |

Owners have every permission; deactivated people have none.
