-- Kabisera Ledger · migration 1 of 7
-- Extensions, enum types and small shared helper functions.
-- Requires Supabase (or a Postgres with the `auth` schema, `anon` and `authenticated` roles).

create schema if not exists extensions;
create extension if not exists pg_trgm    with schema extensions;  -- duplicate-customer name similarity
create extension if not exists btree_gist with schema extensions;  -- fee-rule overlap protection

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
create type public.app_role           as enum ('owner', 'staff');
create type public.customer_status    as enum ('active', 'archived');
create type public.account_kind       as enum ('asset', 'equity', 'income', 'expense');
create type public.transaction_type   as enum (
  'cash_in', 'cash_out', 'mobile_load',
  'debt_creation', 'debt_repayment', 'debt_adjustment',
  'float_adjustment', 'expense', 'owner_capital', 'opening_balance'
);
create type public.transaction_status as enum ('posted', 'voided');
create type public.payment_method     as enum ('cash', 'gcash', 'credit', 'mixed');
-- How the service fee is collected. on_top: customer pays principal + fee.
-- deducted: fee is taken out of what the customer receives.
create type public.fee_mode           as enum ('on_top', 'deducted');
create type public.load_source        as enum ('gcash_direct', 'prepaid_wallet');
create type public.adjustment_kind    as enum (
  'transfer_cash_to_gcash', 'transfer_gcash_to_cash', 'load_topup',
  'capital_contribution', 'capital_withdrawal', 'variance_correction', 'other'
);
create type public.journal_entry_kind as enum ('posting', 'reversal', 'adjustment', 'opening');
create type public.debt_origin        as enum ('opening', 'transaction', 'manual');
create type public.closing_status     as enum ('draft', 'final');

-- ---------------------------------------------------------------------------
-- Shared helper functions
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Used by append-only tables. Raises on UPDATE, DELETE and TRUNCATE.
create function public.forbid_modification()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception '% on % is not allowed: this table is append-only', tg_op, tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

-- The business date is the Philippine calendar date of an instant.
create function public.business_date_of(ts timestamptz)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (ts at time zone 'Asia/Manila')::date
$$;
