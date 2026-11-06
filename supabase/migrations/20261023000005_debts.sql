-- Kabisera Ledger · migration 5 of 7
-- Debts, repayment allocations and authorised adjustments.
-- A debt is never deleted when it is paid. Its outstanding balance is DERIVED:
--   original - posted repayments + posted adjustments.

create table public.debts (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid not null references public.customers (id),
  origin                public.debt_origin not null,
  source_transaction_id uuid references public.transactions (id),
  import_batch_id       uuid references public.import_batches (id),
  original_cents        bigint not null check (original_cents > 0),
  due_date              date,
  notes                 text check (notes is null or char_length(notes) <= 2000),
  seed_key              text unique,
  created_by            uuid not null references public.profiles (id),
  created_at            timestamptz not null default now(),
  constraint debts_origin_transaction check (origin <> 'transaction' or source_transaction_id is not null),
  constraint debts_origin_opening check (origin <> 'opening' or import_batch_id is not null)
);
create index debts_customer_idx on public.debts (customer_id);
create index debts_due_date_idx on public.debts (due_date) where due_date is not null;

-- Each repayment is allocated to one or more debts. Rows are never edited; voiding the
-- repayment transaction removes its effect from the balance view.
create table public.debt_allocations (
  id             uuid primary key default gen_random_uuid(),
  debt_id        uuid not null references public.debts (id),
  transaction_id uuid not null references public.transactions (id),
  amount_cents   bigint not null check (amount_cents > 0),
  created_at     timestamptz not null default now(),
  unique (debt_id, transaction_id)
);
create index debt_allocations_debt_idx on public.debt_allocations (debt_id);

-- Owner-approved corrections (positive increases the debt, negative reduces it). A reason is mandatory.
create table public.debt_adjustments (
  id             uuid primary key default gen_random_uuid(),
  debt_id        uuid not null references public.debts (id),
  transaction_id uuid not null references public.transactions (id),
  amount_cents   bigint not null check (amount_cents <> 0),
  reason         text not null check (char_length(btrim(reason)) >= 3),
  approved_by    uuid not null references public.profiles (id),
  created_at     timestamptz not null default now()
);
create index debt_adjustments_debt_idx on public.debt_adjustments (debt_id);

create trigger debts_no_delete before delete on public.debts
  for each row execute function public.forbid_modification();
create trigger debt_allocations_append_only before update or delete on public.debt_allocations
  for each row execute function public.forbid_modification();
create trigger debt_adjustments_append_only before update or delete on public.debt_adjustments
  for each row execute function public.forbid_modification();

-- A debt's identity (customer, original amount, origin) never changes after creation;
-- only the due date and notes may be edited.
create function public.guard_debt_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  editable constant text[] := array['due_date', 'notes'];
begin
  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'a debt''s customer, amount and origin cannot be edited; use an adjustment'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;
create trigger debts_guard_update before update on public.debts
  for each row execute function public.guard_debt_update();

create view public.debt_balances with (security_invoker = true) as
with totals as (
  select
    d.id as debt_id,
    d.customer_id,
    d.origin,
    d.original_cents,
    d.due_date,
    coalesce((select sum(a.amount_cents)
                from public.debt_allocations a
                join public.transactions t on t.id = a.transaction_id and t.status = 'posted'
               where a.debt_id = d.id), 0)::bigint as repaid_cents,
    coalesce((select sum(j.amount_cents)
                from public.debt_adjustments j
                join public.transactions t on t.id = j.transaction_id and t.status = 'posted'
               where j.debt_id = d.id), 0)::bigint as adjusted_cents
  from public.debts d
)
select
  t.*,
  (t.original_cents - t.repaid_cents + t.adjusted_cents)::bigint as outstanding_cents,
  case
    when (t.original_cents - t.repaid_cents + t.adjusted_cents) = 0 then 'paid'
    when t.repaid_cents > 0 then 'partially_paid'
    else 'outstanding'
  end as debt_status,
  (t.due_date is not null
    and (t.original_cents - t.repaid_cents + t.adjusted_cents) > 0
    and t.due_date < public.business_date_of(now())) as is_overdue
from totals t;
