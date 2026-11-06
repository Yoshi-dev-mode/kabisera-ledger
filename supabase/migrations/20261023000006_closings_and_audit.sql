-- Kabisera Ledger · migration 6 of 7
-- Daily closings (reconciliation) and the append-only audit log.

-- ---------------------------------------------------------------------------
-- daily_closings: variance = actual - expected, per account. A FINAL closing is immutable.
-- Corrections create a new revision that points at the one it amends, with a reason.
-- ---------------------------------------------------------------------------
create table public.daily_closings (
  id                uuid primary key default gen_random_uuid(),
  business_date     date not null,
  revision          int  not null default 1 check (revision >= 1),
  status            public.closing_status not null default 'draft',
  note              text check (note is null or char_length(note) <= 2000),
  amends_closing_id uuid references public.daily_closings (id),
  amendment_reason  text,
  created_by        uuid not null references public.profiles (id),
  created_at        timestamptz not null default now(),
  finalized_by      uuid references public.profiles (id),
  finalized_at      timestamptz,
  unique (business_date, revision),
  constraint closings_final_consistency check (
    (status = 'final') = (finalized_at is not null and finalized_by is not null)),
  constraint closings_amendment_needs_reason check (
    revision = 1 or (amends_closing_id is not null and amendment_reason is not null
                     and char_length(btrim(amendment_reason)) >= 3))
);

create table public.closing_balances (
  closing_id          uuid not null references public.daily_closings (id),
  account_id          uuid not null references public.accounts (id),
  expected_cents      bigint not null,
  actual_cents        bigint,                                   -- null until counted or confirmed
  variance_cents      bigint generated always as (actual_cents - expected_cents) stored,
  variance_reason     text,
  adjustment_entry_id uuid references public.journal_entries (id),  -- the reasoned entry that books the variance
  primary key (closing_id, account_id),
  constraint closing_variance_needs_reason check (
    variance_cents is null or variance_cents = 0
    or (variance_reason is not null and char_length(btrim(variance_reason)) >= 3))
);

create function public.guard_closing_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'final' then
    raise exception 'a finalized closing is immutable; amend it with a new revision'
      using errcode = 'restrict_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
create trigger daily_closings_guard before update or delete on public.daily_closings
  for each row execute function public.guard_closing_change();

create function public.guard_closing_balance_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  parent_id uuid := case when tg_op = 'DELETE' then old.closing_id else new.closing_id end;
  parent_status public.closing_status;
begin
  select status into parent_status from public.daily_closings where id = parent_id;
  if parent_status = 'final' then
    raise exception 'balances of a finalized closing cannot change' using errcode = 'restrict_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
create trigger closing_balances_guard before insert or update or delete on public.closing_balances
  for each row execute function public.guard_closing_balance_change();

-- ---------------------------------------------------------------------------
-- audit_log: who did what, when, why. Append-only for everyone.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid references public.profiles (id),
  action      text not null,
  entity_type text not null,
  entity_id   text,
  reason      text,
  before_data jsonb,
  after_data  jsonb,
  request_id  text
);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, at desc);
create index audit_log_at_idx on public.audit_log (at desc);
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.forbid_modification();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.forbid_modification();

-- Generic change logger for configuration-type tables (customers, profiles, settings, fee rules...).
-- Financial events are audited explicitly by the posting functions in Phase 3.
-- Customer contact numbers and notes are NOT copied into the log, to keep personal data out of it.
create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid;
  old_json jsonb;
  new_json jsonb;
  row_json jsonb;
begin
  begin
    actor := auth.uid();
  exception when others then
    actor := null;
  end;

  old_json := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_json := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  if tg_table_name = 'customers' then
    old_json := old_json - 'contact_number' - 'notes';
    new_json := new_json - 'contact_number' - 'notes';
  end if;
  row_json := coalesce(new_json, old_json);

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    actor,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(row_json ->> 'id', row_json ->> 'key'),
    old_json,
    new_json
  );
  return null;
end;
$$;

create trigger customers_audit after insert or update or delete on public.customers
  for each row execute function public.audit_row_change();
create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change();
create trigger app_settings_audit after insert or update or delete on public.app_settings
  for each row execute function public.audit_row_change();
create trigger accounts_audit after update on public.accounts
  for each row execute function public.audit_row_change();
create trigger fee_rules_audit after insert or update or delete on public.fee_rules
  for each row execute function public.audit_row_change();
create trigger load_products_audit after insert or update or delete on public.load_products
  for each row execute function public.audit_row_change();
create trigger expense_categories_audit after insert or update or delete on public.expense_categories
  for each row execute function public.audit_row_change();
