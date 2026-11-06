-- Kabisera Ledger · migration 10 (Phase 4: customers and transaction history)
-- Customer management functions, and the read functions behind the customer profile, the Transactions page,
-- the transaction detail page, customer statements and CSV exports. They are SECURITY DEFINER so they can show
-- staff NAMES (recorded by) that the profiles table hides, but each one checks the caller's permission itself.
-- The customer profile and the Transactions page both call list_transactions: one source, no inconsistent copies.

-- ---------------------------------------------------------------------------
-- Duplicate protection (warn on look-alikes, block exact matches)
-- ---------------------------------------------------------------------------
create function public.find_similar_customers(p_name text)
returns table (id uuid, display_name text, status public.customer_status, match_kind text, similarity real)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_norm text := lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
begin
  if not (public.is_owner() or public.has_permission('customers.view') or public.has_permission('customers.manage')
          or public.has_permission('transactions.record') or public.has_permission('repayments.record')) then
    raise exception 'you are not allowed to search customers' using errcode = 'insufficient_privilege';
  end if;
  if v_norm = '' then
    return;
  end if;
  return query
    select c.id, c.display_name, c.status,
           case when c.display_name_normalized = v_norm then 'exact' else 'similar' end,
           extensions.similarity(c.display_name_normalized, v_norm)::real
      from public.customers c
     where c.display_name_normalized = v_norm
        or extensions.similarity(c.display_name_normalized, v_norm) >= 0.4
     order by (c.display_name_normalized = v_norm) desc,
              extensions.similarity(c.display_name_normalized, v_norm) desc, c.display_name
     limit 8;
end;
$$;

create function public.customer_create(
  p_name text, p_contact text default null, p_notes text default null, p_allow_duplicate boolean default false)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_norm text := lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
begin
  if not public.has_permission('customers.manage') then
    raise exception 'you are not allowed to add customers' using errcode = 'insufficient_privilege';
  end if;
  if v_norm = '' or char_length(btrim(p_name)) > 120 then
    raise exception 'enter a name of up to 120 characters' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.customers where display_name_normalized = v_norm)
     and not (coalesce(p_allow_duplicate, false) and public.is_owner()) then
    raise exception 'a customer with this name already exists (only the owner can add a second one)'
      using errcode = 'check_violation';
  end if;
  insert into public.customers (display_name, contact_number, notes, created_by)
    values (btrim(p_name), nullif(btrim(p_contact), ''), nullif(btrim(p_notes), ''), auth.uid())
    returning id into v_id;
  return v_id;
end;
$$;

create function public.customer_update(p_id uuid, p_name text, p_contact text default null, p_notes text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_norm text := lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
begin
  if not public.has_permission('customers.manage') then
    raise exception 'you are not allowed to edit customers' using errcode = 'insufficient_privilege';
  end if;
  if v_norm = '' or char_length(btrim(p_name)) > 120 then
    raise exception 'enter a name of up to 120 characters' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.customers where display_name_normalized = v_norm and id <> p_id) then
    raise exception 'another customer already has this name' using errcode = 'check_violation';
  end if;
  update public.customers
     set display_name = btrim(p_name), contact_number = nullif(btrim(p_contact), ''), notes = nullif(btrim(p_notes), '')
   where id = p_id;
  if not found then
    raise exception 'customer not found' using errcode = 'no_data_found';
  end if;
end;
$$;

-- Archive keeps every record. A customer who still owes money can be archived only by the owner.
create function public.customer_archive(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_owed bigint;
begin
  if not public.has_permission('customers.manage') then
    raise exception 'you are not allowed to archive customers' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'give a reason' using errcode = 'check_violation';
  end if;
  select coalesce(sum(outstanding_cents), 0) into v_owed from public.debt_balances where customer_id = p_id;
  if v_owed > 0 and not public.is_owner() then
    raise exception 'this customer still owes %; only the owner can archive them', public._peso(v_owed)
      using errcode = 'check_violation';
  end if;
  update public.customers
     set status = 'archived', archived_at = now(), archived_by = auth.uid(), archive_reason = btrim(p_reason)
   where id = p_id and status = 'active';
  if not found then
    raise exception 'customer not found or already archived' using errcode = 'check_violation';
  end if;
end;
$$;

create function public.customer_restore(p_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.has_permission('customers.manage') then
    raise exception 'you are not allowed to restore customers' using errcode = 'insufficient_privilege';
  end if;
  update public.customers
     set status = 'active', archived_at = null, archived_by = null, archive_reason = null
   where id = p_id and status = 'archived';
  if not found then
    raise exception 'customer not found or not archived' using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Customer list: search by name or contact number, filter, page
-- ---------------------------------------------------------------------------
create function public.list_customers(
  p_query text default null, p_status text default 'active', p_only_with_debt boolean default false,
  p_limit int default 25, p_offset int default 0)
returns table (
  id uuid, customer_no bigint, display_name text, contact_number text, status public.customer_status,
  created_at timestamptz, outstanding_cents bigint, last_activity_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_see_debt boolean := public.is_owner() or public.has_permission('debts.view')
                        or public.has_permission('customers.view') or public.has_permission('repayments.record');
  v_search text;
begin
  if not (public.is_owner() or public.has_permission('customers.view') or public.has_permission('customers.manage')
          or public.has_permission('transactions.record') or public.has_permission('repayments.record')) then
    raise exception 'you are not allowed to see customers' using errcode = 'insufficient_privilege';
  end if;
  if p_only_with_debt and not v_see_debt then
    raise exception 'you are not allowed to see debts' using errcode = 'insufficient_privilege';
  end if;
  v_search := case when nullif(btrim(coalesce(p_query, '')), '') is null then null
                    else '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  return query
    select c.id, c.customer_no, c.display_name, c.contact_number, c.status, c.created_at,
           case when v_see_debt then coalesce(d.owed, 0)::bigint else null end,
           a.last_at,
           count(*) over ()::bigint
      from public.customers c
      left join lateral (select sum(b.outstanding_cents) as owed from public.debt_balances b where b.customer_id = c.id) d on true
      left join lateral (select max(t.occurred_at) as last_at from public.transactions t
                          where t.customer_id = c.id and t.status = 'posted') a on true
     where (p_status is null or p_status = 'all' or c.status::text = p_status)
       and (v_search is null or c.display_name ilike v_search or c.contact_number ilike v_search)
       and (not p_only_with_debt or coalesce(d.owed, 0) > 0)
     order by lower(c.display_name), c.customer_no
     limit least(greatest(coalesce(p_limit, 25), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Transactions list: used by the customer profile (p_customer_id set) AND the general Transactions page.
-- "shop_cash_cents" / "shop_gcash_cents" are what happened to the SHOP's cash drawer and GCash wallet
-- (+ money in, - money out), taken from the original posting, so a voided row still shows what it was.
-- ---------------------------------------------------------------------------
create function public.list_transactions(
  p_customer_id uuid default null, p_from date default null, p_to date default null,
  p_types public.transaction_type[] default null, p_status text default null, p_search text default null,
  p_newest_first boolean default true, p_limit int default 25, p_offset int default 0)
returns table (
  id uuid, public_ref text, occurred_at timestamptz, business_date date, type public.transaction_type,
  customer_id uuid, customer_name text, principal_cents bigint, fee_cents bigint, customer_price_cents bigint,
  credit_cents bigint, payment_method public.payment_method, gcash_reference text,
  status public.transaction_status, recorded_by_name text, notes text,
  shop_cash_cents bigint, shop_gcash_cents bigint, void_requested boolean, total_count bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_actor uuid := auth.uid();
  v_wide boolean := public.is_owner() or public.has_permission('reports.view') or public.has_permission('customers.view');
  v_search text;
begin
  if not (v_wide or public.has_permission('transactions.record') or public.has_permission('repayments.record')) then
    raise exception 'you are not allowed to see transactions' using errcode = 'insufficient_privilege';
  end if;
  v_search := case when nullif(btrim(coalesce(p_search, '')), '') is null then null
                    else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  return query
    select t.id, t.public_ref, t.occurred_at, t.business_date, t.type, t.customer_id, c.display_name,
           t.principal_cents, t.fee_cents, t.customer_price_cents, t.credit_cents, t.payment_method,
           t.gcash_reference, t.status, pr.display_name, t.notes, m.cash, m.gcash,
           (t.void_requested_at is not null and t.status = 'posted'),
           count(*) over ()::bigint
      from public.transactions t
      left join public.customers c on c.id = t.customer_id
      left join public.profiles pr on pr.id = t.recorded_by
      left join lateral (
        select coalesce(sum(l.amount_cents) filter (where a.code = 'CASH_DRAWER'), 0)::bigint as cash,
               coalesce(sum(l.amount_cents) filter (where a.code = 'GCASH_WALLET'), 0)::bigint as gcash
          from public.journal_entries je
          join public.ledger_lines l on l.entry_id = je.id
          join public.accounts a on a.id = l.account_id
         where je.transaction_id = t.id and je.kind <> 'reversal') m on true
     where (v_wide or t.recorded_by = v_actor)
       and (p_customer_id is null or t.customer_id = p_customer_id)
       and (p_from is null or t.business_date >= p_from)
       and (p_to is null or t.business_date <= p_to)
       and (p_types is null or t.type = any (p_types))
       and (p_status is null or t.status::text = p_status)
       and (v_search is null or t.public_ref ilike v_search or t.gcash_reference ilike v_search
            or t.notes ilike v_search or c.display_name ilike v_search)
     order by case when p_newest_first then t.occurred_at end desc,
              case when not p_newest_first then t.occurred_at end asc, t.id
     limit least(greatest(coalesce(p_limit, 25), 1), 5000) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- One transaction with everything about it. Returns null when it does not exist or is not visible to the caller.
create function public.transaction_detail(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_wide boolean := public.is_owner() or public.has_permission('reports.view') or public.has_permission('customers.view');
  v_result jsonb;
begin
  if not (v_wide or public.has_permission('transactions.record') or public.has_permission('repayments.record')) then
    raise exception 'you are not allowed to see transactions' using errcode = 'insufficient_privilege';
  end if;
  select jsonb_build_object(
      'transaction', to_jsonb(t) - 'idempotency_key',
      'customer_name', c.display_name,
      'recorded_by_name', pr.display_name,
      'voided_by_name', pv.display_name,
      'void_requested_by_name', pq.display_name,
      'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'entry_kind', je.kind, 'entry_date', je.business_date, 'account', a.name,
                 'account_code', a.code, 'customer_id', l.customer_id, 'amount_cents', l.amount_cents)
               order by je.created_at, a.code)
          from public.journal_entries je
          join public.ledger_lines l on l.entry_id = je.id
          join public.accounts a on a.id = l.account_id
         where je.transaction_id = t.id), '[]'::jsonb),
      'allocations', coalesce((
        select jsonb_agg(jsonb_build_object('debt_id', al.debt_id, 'amount_cents', al.amount_cents))
          from public.debt_allocations al where al.transaction_id = t.id), '[]'::jsonb),
      'debts', coalesce((
        select jsonb_agg(jsonb_build_object('debt_id', d.id, 'original_cents', d.original_cents, 'origin', d.origin))
          from public.debts d where d.source_transaction_id = t.id), '[]'::jsonb))
    into v_result
    from public.transactions t
    left join public.customers c on c.id = t.customer_id
    left join public.profiles pr on pr.id = t.recorded_by
    left join public.profiles pv on pv.id = t.voided_by
    left join public.profiles pq on pq.id = t.void_requested_by
   where t.id = p_id and (v_wide or t.recorded_by = auth.uid());
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Customer overview totals. These are HISTORICAL ACTIVITY, not what is owed (outstanding is separate).
-- ---------------------------------------------------------------------------
create function public.customer_overview(p_customer_id uuid)
returns table (
  outstanding_cents bigint, cash_in_cents bigint, cash_out_cents bigint, load_cents bigint, fee_cents bigint,
  repayment_cents bigint, transaction_count bigint, voided_count bigint,
  first_activity_at timestamptz, last_activity_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not (public.is_owner() or public.has_permission('customers.view')) then
    raise exception 'you are not allowed to see customer history' using errcode = 'insufficient_privilege';
  end if;
  return query
    select (select coalesce(sum(b.outstanding_cents), 0) from public.debt_balances b where b.customer_id = p_customer_id)::bigint,
           coalesce(sum(t.principal_cents) filter (where t.type = 'cash_in' and t.status = 'posted'), 0)::bigint,
           coalesce(sum(t.principal_cents) filter (where t.type = 'cash_out' and t.status = 'posted'), 0)::bigint,
           coalesce(sum(t.customer_price_cents) filter (where t.type = 'mobile_load' and t.status = 'posted'), 0)::bigint,
           coalesce(sum(t.fee_cents) filter (where t.type in ('cash_in', 'cash_out') and t.status = 'posted'), 0)::bigint,
           coalesce(sum(t.principal_cents) filter (where t.type = 'debt_repayment' and t.status = 'posted'), 0)::bigint,
           count(*) filter (where t.status = 'posted'),
           count(*) filter (where t.status = 'voided'),
           min(t.occurred_at) filter (where t.status = 'posted'),
           max(t.occurred_at) filter (where t.status = 'posted')
      from public.transactions t
     where t.customer_id = p_customer_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The customer's debt events in time order: debts incurred, repayments and authorised adjustments.
-- Opening debts have an unknown date: date_known = false, and event_at is the import time, never an invented date.
-- ---------------------------------------------------------------------------
create function public.customer_debt_events(p_customer_id uuid)
returns table (
  event_kind text, event_at timestamptz, date_known boolean, amount_cents bigint, reference text, method text,
  gcash_reference text, recorded_by_name text, note text, is_voided boolean, debt_id uuid, transaction_id uuid)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not (public.is_owner() or public.has_permission('customers.view') or public.has_permission('debts.view')) then
    raise exception 'you are not allowed to see debts' using errcode = 'insufficient_privilege';
  end if;
  return query
    select * from (
      select 'debt'::text,
             coalesce(src.occurred_at, ib.imported_at, d.created_at),
             case when d.origin = 'opening' then coalesce(ib.date_known, false) else true end,
             d.original_cents,
             coalesce(src.public_ref, case when d.origin = 'opening' then 'Opening balance' else null end),
             src.payment_method::text, src.gcash_reference, pr.display_name, d.notes,
             coalesce(src.status = 'voided', false), d.id, d.source_transaction_id
        from public.debts d
        left join public.transactions src on src.id = d.source_transaction_id
        left join public.import_batches ib on ib.id = d.import_batch_id
        left join public.profiles pr on pr.id = d.created_by
       where d.customer_id = p_customer_id
      union all
      select 'repayment', t.occurred_at, true, -al.amount_cents, t.public_ref, t.payment_method::text,
             t.gcash_reference, pr.display_name, t.notes, (t.status = 'voided'), al.debt_id, t.id
        from public.debt_allocations al
        join public.debts d on d.id = al.debt_id and d.customer_id = p_customer_id
        join public.transactions t on t.id = al.transaction_id
        left join public.profiles pr on pr.id = t.recorded_by
      union all
      select 'adjustment', t.occurred_at, true, j.amount_cents, t.public_ref, null, null,
             pa.display_name, j.reason, (t.status = 'voided'), j.debt_id, t.id
        from public.debt_adjustments j
        join public.debts d on d.id = j.debt_id and d.customer_id = p_customer_id
        join public.transactions t on t.id = j.transaction_id
        left join public.profiles pa on pa.id = j.approved_by
    ) e
    order by 2, 1;
end;
$$;

grant execute on function
  public.find_similar_customers(text),
  public.customer_create(text, text, text, boolean),
  public.customer_update(uuid, text, text, text),
  public.customer_archive(uuid, text),
  public.customer_restore(uuid),
  public.list_customers(text, text, boolean, int, int),
  public.list_transactions(uuid, date, date, public.transaction_type[], text, text, boolean, int, int),
  public.transaction_detail(uuid),
  public.customer_overview(uuid),
  public.customer_debt_events(uuid)
  to authenticated;
