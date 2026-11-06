-- Kabisera Ledger · migration 4 of 7
-- Double-entry ledger. Sign convention: amount_cents > 0 is a DEBIT, < 0 is a CREDIT.
--   Assets and expenses increase with debits; income and equity increase with credits.
-- Every journal entry must sum to zero. Journal rows are append-only; a void adds a
-- mirror-image reversal entry and never edits or deletes the original.

create table public.journal_entries (
  id                uuid primary key default gen_random_uuid(),
  transaction_id    uuid not null references public.transactions (id),
  kind              public.journal_entry_kind not null,
  reverses_entry_id uuid references public.journal_entries (id),
  business_date     date not null,
  memo              text,
  created_by        uuid not null references public.profiles (id),
  created_at        timestamptz not null default now(),
  constraint je_reversal_link check ((kind = 'reversal') = (reverses_entry_id is not null)),
  constraint je_no_self_reversal check (reverses_entry_id is null or reverses_entry_id <> id)
);
create index journal_entries_transaction_idx on public.journal_entries (transaction_id);
create index journal_entries_business_date_idx on public.journal_entries (business_date);
-- An entry can be reversed only once.
create unique index journal_entries_reversed_once on public.journal_entries (reverses_entry_id)
  where reverses_entry_id is not null;

create table public.ledger_lines (
  id           bigint generated always as identity primary key,
  entry_id     uuid not null references public.journal_entries (id),
  account_id   uuid not null references public.accounts (id),
  customer_id  uuid references public.customers (id),
  amount_cents bigint not null check (amount_cents <> 0)
);
create index ledger_lines_entry_idx on public.ledger_lines (entry_id);
create index ledger_lines_account_idx on public.ledger_lines (account_id);
create index ledger_lines_customer_idx on public.ledger_lines (customer_id, account_id) where customer_id is not null;

-- A receivables line must name a customer; no other account may.
create function public.validate_ledger_line()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  needs_customer boolean;
begin
  select requires_customer into needs_customer from public.accounts where id = new.account_id;
  if needs_customer and new.customer_id is null then
    raise exception 'this account requires a customer on every line' using errcode = 'check_violation';
  end if;
  if not needs_customer and new.customer_id is not null then
    raise exception 'this account must not carry a customer' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger ledger_lines_validate before insert on public.ledger_lines
  for each row execute function public.validate_ledger_line();

-- Deferred to commit: the lines of an entry are inserted one by one, then checked together.
create function public.check_entry_balanced()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  total numeric;
begin
  select coalesce(sum(amount_cents), 0) into total from public.ledger_lines where entry_id = new.entry_id;
  if total <> 0 then
    raise exception 'journal entry % does not balance (debits minus credits = % centavos)', new.entry_id, total
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
create constraint trigger ledger_lines_balanced after insert on public.ledger_lines
  deferrable initially deferred
  for each row execute function public.check_entry_balanced();

-- Deferred to commit: every entry has at least two lines, and a reversal mirrors its original exactly.
create function public.check_entry_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.ledger_lines where entry_id = new.id) < 2 then
    raise exception 'journal entry % needs at least two lines', new.id using errcode = 'check_violation';
  end if;
  if new.kind = 'reversal' then
    if exists (
      (select account_id, customer_id, sum(amount_cents) as amt
         from public.ledger_lines where entry_id = new.id group by account_id, customer_id
       except
       select account_id, customer_id, -sum(amount_cents)
         from public.ledger_lines where entry_id = new.reverses_entry_id group by account_id, customer_id)
      union all
      (select account_id, customer_id, -sum(amount_cents)
         from public.ledger_lines where entry_id = new.reverses_entry_id group by account_id, customer_id
       except
       select account_id, customer_id, sum(amount_cents)
         from public.ledger_lines where entry_id = new.id group by account_id, customer_id)
    ) then
      raise exception 'reversal % must exactly negate entry %', new.id, new.reverses_entry_id
        using errcode = 'check_violation';
    end if;
  end if;
  return null;
end;
$$;
create constraint trigger journal_entries_integrity after insert on public.journal_entries
  deferrable initially deferred
  for each row execute function public.check_entry_integrity();

-- Append-only: no edits, deletes or truncation.
create trigger journal_entries_append_only before update or delete on public.journal_entries
  for each row execute function public.forbid_modification();
create trigger journal_entries_no_truncate before truncate on public.journal_entries
  for each statement execute function public.forbid_modification();
create trigger ledger_lines_append_only before update or delete on public.ledger_lines
  for each row execute function public.forbid_modification();
create trigger ledger_lines_no_truncate before truncate on public.ledger_lines
  for each statement execute function public.forbid_modification();

-- ---------------------------------------------------------------------------
-- Balances are DERIVED, never stored. security_invoker makes row-level security apply.
-- ---------------------------------------------------------------------------
create view public.account_balances with (security_invoker = true) as
select
  a.id   as account_id,
  a.code,
  a.name,
  a.kind,
  coalesce(sum(l.amount_cents), 0)::bigint as net_debit_cents,
  (case when a.kind in ('asset', 'expense')
        then coalesce(sum(l.amount_cents), 0)
        else -coalesce(sum(l.amount_cents), 0) end)::bigint as balance_cents
from public.accounts a
left join public.ledger_lines l on l.account_id = a.id
group by a.id;

create view public.customer_receivable_balances with (security_invoker = true) as
select
  l.customer_id,
  sum(l.amount_cents)::bigint as outstanding_cents
from public.ledger_lines l
join public.accounts a on a.id = l.account_id and a.code = 'CUSTOMER_RECEIVABLES'
group by l.customer_id;
