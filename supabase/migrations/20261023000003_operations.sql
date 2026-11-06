-- Kabisera Ledger · migration 3 of 7
-- Adjustable fee rules, load products, and the transactions table.

-- ---------------------------------------------------------------------------
-- fee_rules: the owner's fee schedule. Flat and/or percentage, by amount range, with effective dates.
-- Changing a rule never rewrites history: each transaction stores the fee and mode it actually used.
-- ---------------------------------------------------------------------------
create table public.fee_rules (
  id               uuid primary key default gen_random_uuid(),
  service_type     public.transaction_type not null check (service_type in ('cash_in', 'cash_out')),
  name             text not null check (char_length(btrim(name)) between 1 and 80),
  fee_mode         public.fee_mode not null,
  min_amount_cents bigint not null default 0 check (min_amount_cents >= 0),
  max_amount_cents bigint,                                   -- null = no upper limit
  flat_fee_cents   bigint not null default 0 check (flat_fee_cents >= 0),
  percent_bps      int    not null default 0 check (percent_bps between 0 and 10000),  -- 100 bps = 1%
  effective_from   date   not null default public.business_date_of(now()),
  effective_to     date,                                     -- null = open-ended
  is_active        boolean not null default true,
  notes            text check (notes is null or char_length(notes) <= 500),
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  constraint fee_rules_amount_range check (max_amount_cents is null or max_amount_cents > min_amount_cents),
  constraint fee_rules_date_range   check (effective_to is null or effective_to > effective_from),
  -- Two active rules for the same service can not cover the same amount on the same day.
  constraint fee_rules_no_overlap exclude using gist (
    service_type with =,
    int8range(min_amount_cents, max_amount_cents, '[)') with &&,
    daterange(effective_from, effective_to, '[)') with &&
  ) where (is_active)
);

-- ---------------------------------------------------------------------------
-- load_products: networks / products for mobile load (empty on purpose; the owner defines them)
-- ---------------------------------------------------------------------------
create table public.load_products (
  id               uuid primary key default gen_random_uuid(),
  network          text not null check (char_length(btrim(network)) between 1 and 40),
  label            text not null check (char_length(btrim(label)) between 1 and 80),
  default_source   public.load_source not null default 'prepaid_wallet',
  -- Cost as a share of face value in basis points (9700 = you pay 97%). Null = enter the cost on every sale.
  cost_bps_of_face int check (cost_bps_of_face is null or cost_bps_of_face between 1 and 10000),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (network, label)
);

-- ---------------------------------------------------------------------------
-- transactions: ONE table for every kind of event, so a customer's history and the
-- general Transactions page always read the very same rows.
-- Money columns are integer centavos. How each type moves balances is defined by the
-- posting functions added in Phase 3 (see docs/ARCHITECTURE.md); this table only records the event.
-- ---------------------------------------------------------------------------
create table public.transactions (
  id                   uuid primary key default gen_random_uuid(),
  public_ref           text not null unique,                  -- e.g. KL-20261023-0007, assigned at posting
  type                 public.transaction_type not null,
  customer_id          uuid references public.customers (id),
  occurred_at          timestamptz not null default now(),
  business_date        date not null,                         -- set by trigger from occurred_at (Manila)
  principal_cents      bigint not null default 0 check (principal_cents >= 0),
  fee_cents            bigint not null default 0 check (fee_cents >= 0),
  fee_mode             public.fee_mode,                       -- the mode actually used for this transaction
  provider_cost_cents  bigint not null default 0 check (provider_cost_cents >= 0),
  credit_cents         bigint not null default 0 check (credit_cents >= 0),   -- part left unpaid (utang)
  payment_method       public.payment_method,
  gcash_reference      text check (gcash_reference is null or char_length(gcash_reference) <= 64),
  -- mobile load only
  load_product_id      uuid references public.load_products (id),
  load_source          public.load_source,
  load_cost_cents      bigint check (load_cost_cents is null or load_cost_cents >= 0),
  customer_price_cents bigint check (customer_price_cents is null or customer_price_cents >= 0),
  -- float adjustments, owner capital, expenses
  adjustment_kind      public.adjustment_kind,
  expense_category_id  uuid references public.expense_categories (id),
  notes                text check (notes is null or char_length(notes) <= 2000),
  status               public.transaction_status not null default 'posted',
  idempotency_key      uuid not null unique,                  -- stops accidental double-posting
  recorded_by          uuid not null references public.profiles (id),
  created_at           timestamptz not null default now(),
  -- void workflow: staff may request, the owner approves
  void_requested_by    uuid references public.profiles (id),
  void_requested_at    timestamptz,
  void_request_reason  text,
  voided_by            uuid references public.profiles (id),
  voided_at            timestamptz,
  void_reason          text,

  constraint tx_customer_required check (
    type not in ('debt_creation', 'debt_repayment', 'debt_adjustment') or customer_id is not null),
  constraint tx_credit_needs_customer check (credit_cents = 0 or customer_id is not null),
  constraint tx_fee_mode_scope check (
    (type in ('cash_in', 'cash_out')) = (fee_mode is not null)),
  constraint tx_adjustment_kind_scope check (
    (type in ('float_adjustment', 'owner_capital')) = (adjustment_kind is not null)),
  constraint tx_load_scope check (
    type = 'mobile_load' or (load_product_id is null and load_source is null
                             and load_cost_cents is null and customer_price_cents is null)),
  constraint tx_void_consistency check ((status = 'voided') = (voided_at is not null)),
  constraint tx_void_needs_reason check (
    status = 'posted' or (void_reason is not null and char_length(btrim(void_reason)) >= 3 and voided_by is not null)),
  constraint tx_void_request_pair check ((void_requested_at is null) = (void_requested_by is null))
);
create index transactions_customer_idx on public.transactions (customer_id, occurred_at desc) where customer_id is not null;
create index transactions_business_date_idx on public.transactions (business_date, type);
create index transactions_recorded_by_idx on public.transactions (recorded_by, occurred_at desc);
create index transactions_gcash_ref_idx on public.transactions (gcash_reference) where gcash_reference is not null;

-- business_date is the Manila calendar date of occurred_at.
-- (A generated column is not possible: time-zone conversion is not immutable.)
create function public.set_transaction_business_date()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.business_date := public.business_date_of(new.occurred_at);
  return new;
end;
$$;
create trigger transactions_set_business_date before insert on public.transactions
  for each row execute function public.set_transaction_business_date();

-- A posted transaction is a historical fact. Only the void workflow fields may change,
-- and a void can never be undone. Everything else is corrected by void + new transaction.
create function public.guard_transaction_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  mutable_fields constant text[] := array[
    'status', 'voided_at', 'voided_by', 'void_reason',
    'void_requested_by', 'void_requested_at', 'void_request_reason'];
begin
  if (to_jsonb(new) - mutable_fields) is distinct from (to_jsonb(old) - mutable_fields) then
    raise exception 'transaction % is immutable; only void fields can change', old.public_ref
      using errcode = 'restrict_violation';
  end if;
  if old.status = 'voided' and new.status is distinct from old.status then
    raise exception 'transaction % is already voided and cannot be restored', old.public_ref
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;
create trigger transactions_guard_update before update on public.transactions
  for each row execute function public.guard_transaction_update();
create trigger transactions_no_delete before delete on public.transactions
  for each row execute function public.forbid_modification();
create trigger transactions_no_truncate before truncate on public.transactions
  for each statement execute function public.forbid_modification();

-- Per-day counter used to build public_ref (used by posting functions in Phase 3).
create table public.transaction_counters (
  business_date date primary key,
  last_value    int not null default 0 check (last_value >= 0)
);
