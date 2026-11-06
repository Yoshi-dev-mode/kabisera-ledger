-- Kabisera Ledger · migration 11 (Phase 5: debt management)
-- A write-off / correction account, the idempotent opening-debts import, owner-only debt adjustments, due dates,
-- and the debt list, summary and aging functions.

insert into public.accounts (code, name, kind, is_float, requires_customer, allow_negative, sort_order)
values ('DEBT_ADJUSTMENTS', 'Debt write-offs and corrections', 'expense', false, false, true, 95);

-- ---------------------------------------------------------------------------
-- Opening debts import (owner only). Safe to run twice: the same list (same keys and amounts) is recognised by
-- its checksum and nothing is created a second time. The debts are OPENING BALANCES: no date, fee, reference
-- or staff member is invented, and they are offset against "Opening balances" equity, never counted as income.
-- Payload: [{"seed_key": "...", "display_name": "...", "amount_cents": 12345}, ...]
-- ---------------------------------------------------------------------------
create function public.import_opening_debts(p_source_note text, p_expected_total_cents bigint, p_debts jsonb)
returns table (batch_id uuid, tx_id uuid, customers_created int, debts_created int, total_cents bigint, was_duplicate boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  e jsonb;
  v_total bigint;
  v_checksum text;
  v_batch uuid;
  v_tx uuid;
  v_ref text;
  v_cust uuid;
  v_matches int;
  v_created int := 0;
  v_lines jsonb := '[]'::jsonb;
  v_customers uuid[] := '{}';
  v_i int := 0;
  v_actor uuid := auth.uid();
begin
  if not public.is_owner() then
    raise exception 'only the owner can import opening debts' using errcode = 'insufficient_privilege';
  end if;
  if p_debts is null or jsonb_typeof(p_debts) <> 'array' or jsonb_array_length(p_debts) = 0 or jsonb_array_length(p_debts) > 500 then
    raise exception 'the debt list must contain between 1 and 500 entries' using errcode = 'check_violation';
  end if;
  if p_source_note is null or char_length(btrim(p_source_note)) < 3 then
    raise exception 'say where these debts came from' using errcode = 'check_violation';
  end if;
  for e in select value from jsonb_array_elements(p_debts) loop
    if coalesce(btrim(e ->> 'seed_key'), '') = '' or char_length(e ->> 'seed_key') > 80
       or coalesce(btrim(e ->> 'display_name'), '') = '' or char_length(e ->> 'display_name') > 120
       or (e ->> 'amount_cents') is null or (e ->> 'amount_cents') !~ '^[0-9]+$' or (e ->> 'amount_cents')::bigint <= 0 then
      raise exception 'every debt needs a key, a name and an amount above zero' using errcode = 'check_violation';
    end if;
  end loop;
  if (select count(distinct e ->> 'seed_key') from jsonb_array_elements(p_debts) e) <> jsonb_array_length(p_debts) then
    raise exception 'the debt keys must be unique' using errcode = 'check_violation';
  end if;
  select sum((e ->> 'amount_cents')::bigint) into v_total from jsonb_array_elements(p_debts) e;
  if v_total is distinct from p_expected_total_cents then
    raise exception 'the debts add up to % but % was expected', public._peso(v_total), public._peso(coalesce(p_expected_total_cents, 0))
      using errcode = 'check_violation';
  end if;

  select encode(sha256(convert_to(string_agg((x ->> 'seed_key') || ':' || (x ->> 'amount_cents'), ',' order by x ->> 'seed_key'), 'UTF8')), 'hex')
    into v_checksum from jsonb_array_elements(p_debts) x;

  select ib.id into v_batch from public.import_batches ib where ib.kind = 'opening_debts' and ib.checksum = v_checksum;
  if found then
    return query select v_batch, (select d.source_transaction_id from public.debts d where d.import_batch_id = v_batch limit 1),
                        0, 0, v_total, true;
    return;
  end if;

  -- customers: by key, or adopt the one existing customer with exactly this name, or create
  for e in select value from jsonb_array_elements(p_debts) loop
    select c.id into v_cust from public.customers c where c.seed_key = e ->> 'seed_key';
    if v_cust is null then
      select count(*) into v_matches from public.customers c
       where c.seed_key is null
         and c.display_name_normalized = lower(regexp_replace(btrim(e ->> 'display_name'), '\s+', ' ', 'g'));
      if v_matches = 1 then
        update public.customers c set seed_key = e ->> 'seed_key'
         where c.seed_key is null
           and c.display_name_normalized = lower(regexp_replace(btrim(e ->> 'display_name'), '\s+', ' ', 'g'))
        returning c.id into v_cust;
      else
        insert into public.customers (display_name, seed_key, created_by)
          values (btrim(e ->> 'display_name'), e ->> 'seed_key', v_actor) returning id into v_cust;
        v_created := v_created + 1;
      end if;
    end if;
    v_customers := v_customers || v_cust;
    v_lines := v_lines || jsonb_build_array(public._line('CUSTOMER_RECEIVABLES', (e ->> 'amount_cents')::bigint, v_cust));
  end loop;
  v_lines := v_lines || jsonb_build_array(public._line('OPENING_BALANCE_EQUITY', -v_total));

  select t.tx_id, t.tx_ref into v_tx, v_ref from public._post_transaction(
    gen_random_uuid(), 'opening_balance', null, null, v_total, 0, null, 0, 0, null, null, null, null, null, null,
    null, null, p_source_note, v_lines, null, 'opening') t;

  insert into public.import_batches (kind, source_note, reported_on, date_known, checksum, row_count, total_cents, imported_by)
    values ('opening_debts', btrim(p_source_note), null, false, v_checksum, jsonb_array_length(p_debts), v_total, v_actor)
    returning id into v_batch;

  for e in select value from jsonb_array_elements(p_debts) loop
    v_i := v_i + 1;
    insert into public.debts (customer_id, origin, source_transaction_id, import_batch_id, original_cents, seed_key, created_by)
      values (v_customers[v_i], 'opening', v_tx, v_batch, (e ->> 'amount_cents')::bigint, e ->> 'seed_key', v_actor);
  end loop;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, reason, after_data)
    values (v_actor, 'opening_debts.import', 'import_batches', v_batch::text, btrim(p_source_note),
            jsonb_build_object('total_cents', v_total, 'rows', jsonb_array_length(p_debts), 'checksum', v_checksum));

  return query select v_batch, v_tx, v_created, jsonb_array_length(p_debts), v_total, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner-approved debt adjustment. Negative reduces the debt (a discount or write-off, booked as a cost);
-- positive increases it (a correction). A reason is mandatory. Nothing is edited or deleted.
-- ---------------------------------------------------------------------------
create function public.debt_adjust(p_idempotency_key uuid, p_debt_id uuid, p_amount_cents bigint, p_reason text)
returns table (tx_id uuid, tx_ref text, was_duplicate boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_debt record;
  v_out bigint;
  v_lines jsonb;
  v_res record;
begin
  if not public.is_owner() then
    raise exception 'only the owner can adjust a debt' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'a reason is required' using errcode = 'check_violation';
  end if;
  if p_amount_cents is null or p_amount_cents = 0 then
    raise exception 'the adjustment must not be zero' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.transactions where idempotency_key = p_idempotency_key) then
    return query select t.id, t.public_ref, true from public.transactions t where t.idempotency_key = p_idempotency_key;
    return;
  end if;

  perform public._lock_accounts(array['CUSTOMER_RECEIVABLES', 'DEBT_ADJUSTMENTS']);
  select d.id, d.customer_id into v_debt from public.debts d where d.id = p_debt_id for update;
  if not found then
    raise exception 'debt not found' using errcode = 'no_data_found';
  end if;
  select b.outstanding_cents into v_out from public.debt_balances b where b.debt_id = p_debt_id;
  if v_out + p_amount_cents < 0 then
    raise exception 'this would reduce the debt below zero (it is %)', public._peso(v_out) using errcode = 'check_violation';
  end if;

  v_lines := public._merge_lines(array[
    public._line('CUSTOMER_RECEIVABLES', p_amount_cents, v_debt.customer_id),
    public._line('DEBT_ADJUSTMENTS', -p_amount_cents)]);
  select t.tx_id, t.tx_ref, t.was_duplicate into v_res from public._post_transaction(
    p_idempotency_key, 'debt_adjustment', v_debt.customer_id, null, abs(p_amount_cents), 0, null, 0, 0, null, null,
    null, null, null, null, null, null, btrim(p_reason), v_lines, null, 'adjustment') t;
  if not v_res.was_duplicate then
    insert into public.debt_adjustments (debt_id, transaction_id, amount_cents, reason, approved_by)
      values (p_debt_id, v_res.tx_id, p_amount_cents, btrim(p_reason), auth.uid());
  end if;
  return query select v_res.tx_id, v_res.tx_ref, v_res.was_duplicate;
end;
$$;

create function public.debt_set_due_date(p_debt_id uuid, p_due_date date, p_notes text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not (public.is_owner() or public.has_permission('customers.manage')) then
    raise exception 'you are not allowed to change due dates' using errcode = 'insufficient_privilege';
  end if;
  update public.debts set due_date = p_due_date, notes = nullif(btrim(p_notes), '') where id = p_debt_id;
  if not found then
    raise exception 'debt not found' using errcode = 'no_data_found';
  end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, after_data)
    values (auth.uid(), 'debt.due_date', 'debts', p_debt_id::text, jsonb_build_object('due_date', p_due_date));
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------
create function public.list_debts(
  p_query text default null, p_status text default 'unpaid', p_overdue_only boolean default false,
  p_limit int default 25, p_offset int default 0)
returns table (
  debt_id uuid, customer_id uuid, customer_name text, origin public.debt_origin, original_cents bigint,
  repaid_cents bigint, adjusted_cents bigint, outstanding_cents bigint, debt_status text, is_overdue boolean,
  due_date date, debt_at timestamptz, date_known boolean, reference text, notes text, total_count bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_search text;
begin
  if not (public.is_owner() or public.has_permission('debts.view') or public.has_permission('repayments.record')) then
    raise exception 'you are not allowed to see debts' using errcode = 'insufficient_privilege';
  end if;
  v_search := case when nullif(btrim(coalesce(p_query, '')), '') is null then null
                    else '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;
  return query
    select b.debt_id, b.customer_id, c.display_name, b.origin, b.original_cents, b.repaid_cents, b.adjusted_cents,
           b.outstanding_cents, b.debt_status, b.is_overdue, b.due_date,
           coalesce(src.occurred_at, ib.imported_at, d.created_at),
           case when b.origin = 'opening' then coalesce(ib.date_known, false) else true end,
           coalesce(src.public_ref, case when b.origin = 'opening' then 'Opening balance' else null end),
           d.notes,
           count(*) over ()::bigint
      from public.debt_balances b
      join public.debts d on d.id = b.debt_id
      join public.customers c on c.id = b.customer_id
      left join public.transactions src on src.id = d.source_transaction_id
      left join public.import_batches ib on ib.id = d.import_batch_id
     where (v_search is null or c.display_name ilike v_search)
       and (p_status = 'all'
            or (p_status = 'unpaid' and b.debt_status in ('outstanding', 'partially_paid'))
            or b.debt_status = p_status)
       and (not p_overdue_only or b.is_overdue)
     order by lower(c.display_name), coalesce(src.occurred_at, ib.imported_at, d.created_at), d.id
     limit least(greatest(coalesce(p_limit, 25), 1), 500) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- One debt, with the same columns and the same numbers as list_debts.
create function public.debt_detail(p_debt_id uuid)
returns table (
  debt_id uuid, customer_id uuid, customer_name text, origin public.debt_origin, original_cents bigint,
  repaid_cents bigint, adjusted_cents bigint, outstanding_cents bigint, debt_status text, is_overdue boolean,
  due_date date, debt_at timestamptz, date_known boolean, reference text, notes text, total_count bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not (public.is_owner() or public.has_permission('debts.view') or public.has_permission('repayments.record')) then
    raise exception 'you are not allowed to see debts' using errcode = 'insufficient_privilege';
  end if;
  return query
    select b.debt_id, b.customer_id, c.display_name, b.origin, b.original_cents, b.repaid_cents, b.adjusted_cents,
           b.outstanding_cents, b.debt_status, b.is_overdue, b.due_date,
           coalesce(src.occurred_at, ib.imported_at, d.created_at),
           case when b.origin = 'opening' then coalesce(ib.date_known, false) else true end,
           coalesce(src.public_ref, case when b.origin = 'opening' then 'Opening balance' else null end),
           d.notes, 1::bigint
      from public.debt_balances b
      join public.debts d on d.id = b.debt_id
      join public.customers c on c.id = b.customer_id
      left join public.transactions src on src.id = d.source_transaction_id
      left join public.import_batches ib on ib.id = d.import_batch_id
     where b.debt_id = p_debt_id;
end;
$$;

create function public.debt_summary()
returns table (total_outstanding_cents bigint, customers_owing bigint, open_debts bigint,
               overdue_cents bigint, overdue_count bigint, unknown_date_cents bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not (public.is_owner() or public.has_permission('debts.view')) then
    raise exception 'you are not allowed to see debts' using errcode = 'insufficient_privilege';
  end if;
  return query
    select coalesce(sum(b.outstanding_cents), 0)::bigint,
           count(distinct b.customer_id),
           count(*),
           coalesce(sum(b.outstanding_cents) filter (where b.is_overdue), 0)::bigint,
           count(*) filter (where b.is_overdue),
           coalesce(sum(b.outstanding_cents) filter (where b.origin = 'opening' and not coalesce(ib.date_known, false)), 0)::bigint
      from public.debt_balances b
      join public.debts d on d.id = b.debt_id
      left join public.import_batches ib on ib.id = d.import_batch_id
     where b.outstanding_cents > 0;
end;
$$;

-- Aging by how long ago the debt was created. Debts with no known date (opening debts) get their own row
-- rather than a guessed age.
create function public.debt_aging()
returns table (bucket text, sort_order int, debts bigint, outstanding_cents bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not (public.is_owner() or public.has_permission('debts.view')) then
    raise exception 'you are not allowed to see debts' using errcode = 'insufficient_privilege';
  end if;
  return query
    with open_debts as (
      select b.outstanding_cents,
             case when b.origin = 'opening' and not coalesce(ib.date_known, false) then null
                  else public.business_date_of(now()) - public.business_date_of(coalesce(src.occurred_at, ib.imported_at, d.created_at))
             end as age_days
        from public.debt_balances b
        join public.debts d on d.id = b.debt_id
        left join public.transactions src on src.id = d.source_transaction_id
        left join public.import_batches ib on ib.id = d.import_batch_id
       where b.outstanding_cents > 0
    )
    select case when age_days is null then 'Date unknown'
                when age_days <= 7 then '0 to 7 days'
                when age_days <= 30 then '8 to 30 days'
                when age_days <= 60 then '31 to 60 days'
                when age_days <= 90 then '61 to 90 days'
                else 'Over 90 days' end,
           case when age_days is null then 6 when age_days <= 7 then 1 when age_days <= 30 then 2
                when age_days <= 60 then 3 when age_days <= 90 then 4 else 5 end,
           count(*)::bigint,
           sum(outstanding_cents)::bigint
      from open_debts
     group by 1, 2
     order by 2;
end;
$$;

grant execute on function
  public.import_opening_debts(text, bigint, jsonb),
  public.debt_adjust(uuid, uuid, bigint, text),
  public.debt_set_due_date(uuid, date, text),
  public.list_debts(text, text, boolean, int, int),
  public.debt_detail(uuid),
  public.debt_summary(),
  public.debt_aging()
  to authenticated;
