-- Kabisera Ledger · migration 2 of 7
-- Staff profiles, customers, chart of accounts, settings, expense categories, import batches.

-- ---------------------------------------------------------------------------
-- profiles: one row per signed-in person (owner or staff)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  role         public.app_role not null default 'staff',
  is_active    boolean not null default true,
  -- Staff permissions are configurable. Owners implicitly have all of them.
  permissions  text[] not null default '{}'
    check (permissions <@ array[
      'transactions.record', 'transactions.request_void', 'repayments.record',
      'customers.view', 'customers.manage', 'debts.view',
      'accounts.view', 'closing.perform', 'reports.view'
    ]::text[]),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
create table public.customers (
  id                      uuid primary key default gen_random_uuid(),
  customer_no             bigint generated always as identity unique,   -- human-friendly number
  display_name            text not null check (char_length(btrim(display_name)) between 1 and 120),
  display_name_normalized text generated always as
    (lower(regexp_replace(btrim(display_name), '\s+', ' ', 'g'))) stored,
  contact_number          text check (contact_number is null or char_length(btrim(contact_number)) between 3 and 30),
  notes                   text check (notes is null or char_length(notes) <= 2000),
  status                  public.customer_status not null default 'active',
  archived_at             timestamptz,
  archived_by             uuid references public.profiles (id),
  archive_reason          text,
  seed_key                text unique,                                  -- set only for imported rows
  created_by              uuid references public.profiles (id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint customers_archive_consistency check ((status = 'archived') = (archived_at is not null))
);
-- Names are deliberately NOT unique: the app warns about look-alikes and the owner resolves them.
create index customers_name_normalized_idx on public.customers (display_name_normalized);
create index customers_name_trgm_idx on public.customers
  using gin (display_name_normalized extensions.gin_trgm_ops);
create index customers_contact_idx on public.customers (contact_number) where contact_number is not null;
create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- accounts: a small fixed chart. Balances are NEVER stored here; they are sums of ledger_lines.
-- ---------------------------------------------------------------------------
create table public.accounts (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique check (code ~ '^[A-Z_]+$'),
  name                text not null,
  kind                public.account_kind not null,
  is_float            boolean not null default false,   -- cash drawer, GCash wallet, load balance
  requires_customer   boolean not null default false,   -- receivables lines must name a customer
  allow_negative      boolean not null default true,
  low_threshold_cents bigint check (low_threshold_cents is null or low_threshold_cents >= 0),  -- null = not set yet
  sort_order          int not null default 0,
  created_at          timestamptz not null default now(),
  constraint accounts_float_is_asset check (not is_float or kind = 'asset')
);

-- Code, kind and customer rules are structural and must never change.
create function public.guard_account_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.code is distinct from old.code
     or new.kind is distinct from old.kind
     or new.is_float is distinct from old.is_float
     or new.requires_customer is distinct from old.requires_customer then
    raise exception 'account code, kind, float and customer rules are fixed (account %)', old.code
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;
create trigger accounts_guard_update before update on public.accounts
  for each row execute function public.guard_account_update();
create trigger accounts_no_delete before delete on public.accounts
  for each row execute function public.forbid_modification();

-- Reference data only. No amounts, no balances.
insert into public.accounts (code, name, kind, is_float, requires_customer, allow_negative, sort_order) values
  ('CASH_DRAWER',            'Cash drawer',             'asset',   true,  false, false,  10),
  ('GCASH_WALLET',           'GCash wallet',            'asset',   true,  false, false,  20),
  ('LOAD_BALANCE',           'Mobile-load balance',     'asset',   true,  false, false,  30),
  ('CUSTOMER_RECEIVABLES',   'Owed by customers',       'asset',   false, true,  false,  40),
  ('OWNER_EQUITY',           'Owner capital',           'equity',  false, false, true,   50),
  ('OPENING_BALANCE_EQUITY', 'Opening balances',        'equity',  false, false, true,   55),
  ('FEE_INCOME',             'Service fees earned',     'income',  false, false, true,   60),
  ('LOAD_MARGIN',            'Mobile-load margin',      'income',  false, false, true,   70),
  ('PROVIDER_COST',          'Provider costs',          'expense', false, false, true,   80),
  ('BUSINESS_EXPENSES',      'Operating expenses',      'expense', false, false, true,   90),
  ('RECON_VARIANCE',         'Reconciliation variance', 'expense', false, false, true,  100);

-- ---------------------------------------------------------------------------
-- app_settings: adjustable business rules (fee modes, policies). Defaults are assumptions to review.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key         text primary key check (key ~ '^[a-z0-9_.]+$'),
  value       jsonb not null,
  description text,
  updated_by  uuid references public.profiles (id),
  updated_at  timestamptz not null default now()
);
create trigger app_settings_set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

insert into public.app_settings (key, value, description) values
  ('business.time_zone',            '"Asia/Manila"'::jsonb,   'Business time zone. Do not change after go-live.'),
  ('fees.cash_in.default_mode',     '"on_top"'::jsonb,        'Default for cash-in: customer pays principal + fee. Assumption; adjust to your practice. Each transaction records the mode it used.'),
  ('fees.cash_out.default_mode',    '"deducted"'::jsonb,      'Default for cash-out: fee is taken out of the cash paid out. Assumption; adjust to your practice.'),
  ('fees.percent_rounding',         '"half_up"'::jsonb,       'Rounding for percentage fees: half_up, down or up.'),
  ('policy.allow_negative_floats',  'false'::jsonb,           'If false, cash, GCash and load balances cannot go below zero unless the owner overrides with a reason.'),
  ('policy.backdating',             '"open_days_only"'::jsonb,'Transactions can be dated only on days that are not yet closed.'),
  ('policy.debt_overpayment',       '"reject"'::jsonb,        'A repayment larger than the outstanding debt is rejected (no customer credit).'),
  ('policy.void_requires_owner',    'true'::jsonb,            'Voids need owner approval; staff can only request a void.'),
  ('policy.require_gcash_reference','false'::jsonb,           'If true, cash-in and cash-out need a GCash reference number.');

-- ---------------------------------------------------------------------------
-- expense_categories (empty on purpose; the owner defines them)
-- ---------------------------------------------------------------------------
create table public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index expense_categories_name_idx on public.expense_categories (lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- import_batches: provenance for imported data such as the opening debts
-- ---------------------------------------------------------------------------
create table public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  source_note text not null,
  reported_on date,                                   -- null = the original date is unknown
  date_known  boolean not null default false,
  checksum    text not null,
  row_count   int not null check (row_count >= 0),
  total_cents bigint not null,
  imported_by uuid not null references public.profiles (id),
  imported_at timestamptz not null default now(),
  constraint import_batches_date_consistency check (date_known = (reported_on is not null)),
  constraint import_batches_once unique (kind, checksum)  -- re-running the same import cannot duplicate it
);
create trigger import_batches_no_change before update or delete on public.import_batches
  for each row execute function public.forbid_modification();
