-- Kabisera Ledger · migration 8 (Phase 2: authentication and authorization)
-- Role helpers, row-level security policies, narrow SELECT grants, owner-only staff functions,
-- and protection against removing the last owner.
--
-- Rules this migration follows:
--   * Migration 7 made every table deny-by-default. Here we add READ access only.
--   * NOTHING is granted for INSERT, UPDATE or DELETE to the browser roles. All writes happen
--     through the SECURITY DEFINER functions below (staff) or the posting functions of later phases.
--   * Owners implicitly hold every permission. An inactive profile holds none.

-- ---------------------------------------------------------------------------
-- profiles: force a new staff member to choose their own password at first sign-in
-- ---------------------------------------------------------------------------
alter table public.profiles add column must_change_password boolean not null default false;

-- ---------------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER so they can read profiles despite its own RLS;
-- they only ever answer about the CURRENT signed-in user (auth.uid()).
-- ---------------------------------------------------------------------------
create function public.is_owner()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role = 'owner')
$$;

create function public.is_active_member()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active)
$$;

create function public.has_permission(perm text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
      and (p.role = 'owner' or perm = any (p.permissions)))
$$;

-- ---------------------------------------------------------------------------
-- The last active owner can never be demoted, deactivated or deleted (no lock-out).
-- ---------------------------------------------------------------------------
create function public.guard_last_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.role = 'owner' and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'owner' or not new.is_active) then
    if not exists (
      select 1 from public.profiles p
      where p.id <> old.id and p.role = 'owner' and p.is_active) then
      raise exception 'the last active owner cannot be removed, demoted or deactivated'
        using errcode = 'restrict_violation';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
create trigger profiles_guard_last_owner before update or delete on public.profiles
  for each row execute function public.guard_last_owner();

-- ---------------------------------------------------------------------------
-- Staff management functions. Only an owner may call them, and only for STAFF rows
-- (owners are managed by SQL, see supabase/bootstrap). Running as the owner's session means the
-- audit trigger records the owner as the actor.
-- ---------------------------------------------------------------------------
create function public.owner_create_staff_profile(
  p_user_id uuid, p_display_name text, p_permissions text[])
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_owner() then
    raise exception 'only an owner can create staff' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'no such user' using errcode = 'no_data_found';
  end if;
  insert into public.profiles (id, display_name, role, permissions, must_change_password)
  values (p_user_id, btrim(p_display_name), 'staff', coalesce(p_permissions, '{}'), true);
end;
$$;

create function public.owner_update_staff(
  p_user_id uuid, p_display_name text, p_permissions text[], p_is_active boolean)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_owner() then
    raise exception 'only an owner can change staff' using errcode = 'insufficient_privilege';
  end if;
  update public.profiles
     set display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
         permissions  = coalesce(p_permissions, permissions),
         is_active    = coalesce(p_is_active, is_active)
   where id = p_user_id and role = 'staff';
  if not found then
    raise exception 'staff member not found' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Called by a person after they have chosen their own new password.
create function public.clear_my_must_change_password()
returns void
language sql security definer
set search_path = public, pg_temp
as $$
  update public.profiles set must_change_password = false
   where id = auth.uid() and must_change_password;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security policies (SELECT only). (select ...) lets Postgres evaluate each check once per query.
-- ---------------------------------------------------------------------------
create policy profiles_select_self on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_select_owner on public.profiles
  for select to authenticated using ((select public.is_owner()));

create policy customers_select on public.customers
  for select to authenticated using (
    (select public.has_permission('customers.view'))
    or (select public.has_permission('customers.manage'))
    or (select public.has_permission('transactions.record'))
    or (select public.has_permission('repayments.record')));

-- Reference and configuration data that anyone active needs to record work.
create policy accounts_select on public.accounts
  for select to authenticated using ((select public.is_active_member()));
create policy app_settings_select on public.app_settings
  for select to authenticated using ((select public.is_active_member()));
create policy expense_categories_select on public.expense_categories
  for select to authenticated using ((select public.is_active_member()));
create policy load_products_select on public.load_products
  for select to authenticated using ((select public.is_active_member()));
create policy fee_rules_select on public.fee_rules
  for select to authenticated using ((select public.is_active_member()));

-- Owner only.
create policy import_batches_select on public.import_batches
  for select to authenticated using ((select public.is_owner()));
create policy audit_log_select on public.audit_log
  for select to authenticated using ((select public.is_owner()));

-- Transactions: wide readers see everything; people who only record see their own entries.
create policy transactions_select on public.transactions
  for select to authenticated using (
    (select public.has_permission('reports.view'))
    or (select public.has_permission('customers.view'))
    or ((select public.has_permission('transactions.record')) and recorded_by = auth.uid())
    or ((select public.has_permission('repayments.record')) and recorded_by = auth.uid()));

-- The ledger itself: balances are sensitive.
create policy journal_entries_select on public.journal_entries
  for select to authenticated using (
    (select public.has_permission('accounts.view')) or (select public.has_permission('reports.view')));
create policy ledger_lines_select on public.ledger_lines
  for select to authenticated using (
    (select public.has_permission('accounts.view')) or (select public.has_permission('reports.view')));

-- Debts show on a customer's profile, so customers.view includes them.
create policy debts_select on public.debts
  for select to authenticated using (
    (select public.has_permission('debts.view'))
    or (select public.has_permission('customers.view'))
    or (select public.has_permission('repayments.record')));
create policy debt_allocations_select on public.debt_allocations
  for select to authenticated using (
    (select public.has_permission('debts.view'))
    or (select public.has_permission('customers.view'))
    or (select public.has_permission('repayments.record')));
create policy debt_adjustments_select on public.debt_adjustments
  for select to authenticated using (
    (select public.has_permission('debts.view')) or (select public.has_permission('customers.view')));

create policy daily_closings_select on public.daily_closings
  for select to authenticated using (
    (select public.has_permission('closing.perform')) or (select public.has_permission('reports.view')));
create policy closing_balances_select on public.closing_balances
  for select to authenticated using (
    (select public.has_permission('closing.perform')) or (select public.has_permission('reports.view')));

-- transaction_counters has RLS on and NO policy and NO grant: it is internal to the posting functions.

-- ---------------------------------------------------------------------------
-- Grants: SELECT only (the policies above decide which rows). No write privileges at all.
-- ---------------------------------------------------------------------------
grant select on
  public.profiles, public.customers, public.accounts, public.app_settings,
  public.expense_categories, public.load_products, public.fee_rules, public.import_batches,
  public.transactions, public.journal_entries, public.ledger_lines,
  public.debts, public.debt_allocations, public.debt_adjustments,
  public.daily_closings, public.closing_balances, public.audit_log
  to authenticated;

grant select on public.account_balances, public.customer_receivable_balances, public.debt_balances
  to authenticated;

grant execute on function
  public.is_owner(), public.is_active_member(), public.has_permission(text),
  public.business_date_of(timestamptz),
  public.owner_create_staff_profile(uuid, text, text[]),
  public.owner_update_staff(uuid, text, text[], boolean),
  public.clear_my_must_change_password()
  to authenticated;

comment on schema public is
  'Kabisera Ledger. RLS on every table. Browser roles can only SELECT what their permissions allow; all writes go through functions.';
