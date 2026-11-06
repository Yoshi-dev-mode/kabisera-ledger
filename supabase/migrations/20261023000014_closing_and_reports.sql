-- Kabisera Ledger · migration 14 (Phase 8: daily closing and reports)
--
-- Daily closing: the person counts the real cash, GCash and load, and the app compares them with what the ledger
-- says SHOULD be there:  variance = actual - expected.
--   * Counting never overwrites a balance. A difference becomes an explicit adjusting entry with a mandatory reason.
--   * "Expected" for a day = every ledger entry dated on or before that day.
--   * A finalized closing is immutable (database triggers). A mistake is fixed by an AMENDMENT: a new revision,
--     owner only, with a reason, which re-opens that one day for corrections.
-- Reports read the ledger; exports are built from the same functions.

create function public._closing_expected(p_date date)
returns table (account_id uuid, code text, name text, opening_cents bigint, inflow_cents bigint, outflow_cents bigint, expected_cents bigint)
language sql stable security definer set search_path = public, pg_temp
as $$
  select a.id, a.code, a.name,
         coalesce(sum(l.amount_cents) filter (where je.business_date < p_date), 0)::bigint,
         coalesce(sum(l.amount_cents) filter (where je.business_date = p_date and l.amount_cents > 0), 0)::bigint,
         coalesce(sum(l.amount_cents) filter (where je.business_date = p_date and l.amount_cents < 0), 0)::bigint,
         coalesce(sum(l.amount_cents) filter (where je.business_date <= p_date), 0)::bigint
    from public.accounts a
    left join public.ledger_lines l on l.account_id = a.id
    left join public.journal_entries je on je.id = l.entry_id
   where a.is_float
   group by a.id
   order by a.sort_order
$$;

create function public._can_close()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select public.is_owner() or public.has_permission('closing.perform') $$;

-- Starts (or resumes) the draft closing for a day.
create function public.closing_start(p_date date)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_latest record;
  v_id uuid;
begin
  if not public._can_close() then
    raise exception 'you are not allowed to close the day' using errcode = 'insufficient_privilege';
  end if;
  if p_date is null or p_date > public.business_date_of(now()) or p_date < date '2020-01-01' then
    raise exception 'choose a date that has already started' using errcode = 'check_violation';
  end if;
  select c.id, c.status, c.revision into v_latest from public.daily_closings c
   where c.business_date = p_date order by c.revision desc limit 1;
  if found and v_latest.status = 'final' then
    raise exception 'this day is already closed; only the owner can amend it' using errcode = 'check_violation';
  end if;
  if found then
    v_id := v_latest.id;
  else
    begin
      insert into public.daily_closings (business_date, created_by) values (p_date, auth.uid()) returning id into v_id;
    exception when unique_violation then
      select c.id into v_id from public.daily_closings c where c.business_date = p_date order by c.revision desc limit 1;
    end;
  end if;
  -- Only create rows that are missing. Saved counts are never touched here; the page shows live expected balances
  -- and closing_save refreshes the stored figures together with the counts.
  insert into public.closing_balances (closing_id, account_id, expected_cents)
    select v_id, e.account_id, e.expected_cents from public._closing_expected(p_date) e
  on conflict (closing_id, account_id) do nothing;
  return v_id;
end;
$$;

-- Saves the counted amounts, the reasons for any difference, and the closing note. Not final until closing_finalize.
-- p_actuals: [{"code": "CASH_DRAWER", "actual_cents": 123456 | null, "reason": "..."}]
create function public.closing_save(p_closing_id uuid, p_note text, p_actuals jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_closing public.daily_closings%rowtype;
  e jsonb;
  v_code text;
  v_actual bigint;
  v_reason text;
begin
  if not public._can_close() then
    raise exception 'you are not allowed to close the day' using errcode = 'insufficient_privilege';
  end if;
  select * into v_closing from public.daily_closings where id = p_closing_id for update;
  if not found then
    raise exception 'closing not found' using errcode = 'no_data_found';
  end if;
  if v_closing.status = 'final' then
    raise exception 'this closing is final and cannot be changed' using errcode = 'check_violation';
  end if;
  if p_actuals is null or jsonb_typeof(p_actuals) <> 'array' then
    raise exception 'the counted amounts are missing' using errcode = 'check_violation';
  end if;
  if p_note is not null and char_length(p_note) > 2000 then
    raise exception 'the note is too long' using errcode = 'check_violation';
  end if;

  -- Refresh what is expected and clear old counts in one step (so a stale count can never meet new expectations),
  -- then apply the counts that were submitted.
  update public.closing_balances cb set expected_cents = x.expected_cents, actual_cents = null, variance_reason = null
    from public._closing_expected(v_closing.business_date) x
   where cb.closing_id = p_closing_id and cb.account_id = x.account_id;

  for e in select value from jsonb_array_elements(p_actuals) loop
    v_code := e ->> 'code';
    v_reason := nullif(btrim(coalesce(e ->> 'reason', '')), '');
    if (e ->> 'actual_cents') is null then
      v_actual := null;
    elsif (e ->> 'actual_cents') ~ '^[0-9]+$' then
      v_actual := (e ->> 'actual_cents')::bigint;
    else
      raise exception 'a counted amount must be zero or more' using errcode = 'check_violation';
    end if;
    begin
      update public.closing_balances cb set actual_cents = v_actual, variance_reason = v_reason
       where cb.closing_id = p_closing_id
         and cb.account_id = (select a.id from public.accounts a where a.code = v_code and a.is_float);
    exception when check_violation then
      raise exception 'give a reason for each difference between what you counted and what was expected' using errcode = 'check_violation';
    end;
  end loop;
  update public.daily_closings set note = nullif(btrim(p_note), '') where id = p_closing_id;
end;
$$;

-- Final step: books each difference as an explicit, reasoned entry dated on the closing day, then locks the closing.
create function public.closing_finalize(p_closing_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_closing public.daily_closings%rowtype;
  r record;
  x record;
  v_when timestamptz;
  v_tx uuid;
  v_lines jsonb;
  v_entry uuid;
  v_actor uuid := auth.uid();
begin
  if not public._can_close() then
    raise exception 'you are not allowed to close the day' using errcode = 'insufficient_privilege';
  end if;
  select * into v_closing from public.daily_closings where id = p_closing_id for update;
  if not found then
    raise exception 'closing not found' using errcode = 'no_data_found';
  end if;
  if v_closing.status = 'final' then
    raise exception 'this closing is already final' using errcode = 'check_violation';
  end if;
  perform public._lock_accounts(array['CASH_DRAWER', 'GCASH_WALLET', 'LOAD_BALANCE', 'RECON_VARIANCE']);

  if exists (select 1 from public.closing_balances cb join public.accounts a on a.id = cb.account_id
              where cb.closing_id = p_closing_id and cb.actual_cents is null) then
    raise exception 'enter what you counted for the cash drawer, the GCash wallet and the load balance' using errcode = 'check_violation';
  end if;
  -- The books must not have moved since the amounts were saved.
  for x in select e.account_id, e.expected_cents from public._closing_expected(v_closing.business_date) e loop
    if exists (select 1 from public.closing_balances cb where cb.closing_id = p_closing_id and cb.account_id = x.account_id
                  and cb.expected_cents <> x.expected_cents) then
      raise exception 'the balances changed while you were counting; reload the page and save your counts again' using errcode = 'check_violation';
    end if;
  end loop;

  v_when := least(now(), ((v_closing.business_date + 1)::timestamp at time zone 'Asia/Manila') - interval '1 second');
  perform set_config('kabisera.closing', 'on', true);
  for r in
    select cb.account_id, a.code, a.name, cb.variance_cents, cb.variance_reason
      from public.closing_balances cb join public.accounts a on a.id = cb.account_id
     where cb.closing_id = p_closing_id and cb.variance_cents <> 0
  loop
    v_lines := public._merge_lines(array[public._line(r.code, r.variance_cents), public._line('RECON_VARIANCE', -r.variance_cents)]);
    select t.tx_id into v_tx from public._post_transaction(
      gen_random_uuid(), 'float_adjustment', null, v_when, abs(r.variance_cents), 0, null, 0, 0, null, null,
      null, null, null, null, 'variance_correction', null,
      'Closing ' || v_closing.business_date || ': ' || r.name || ' - ' || r.variance_reason,
      v_lines, null, 'adjustment') t;
    select je.id into v_entry from public.journal_entries je where je.transaction_id = v_tx limit 1;
    update public.closing_balances set adjustment_entry_id = v_entry where closing_id = p_closing_id and account_id = r.account_id;
  end loop;
  perform set_config('kabisera.closing', 'off', true);

  update public.daily_closings set status = 'final', finalized_by = v_actor, finalized_at = now() where id = p_closing_id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, reason, after_data)
    values (v_actor, 'closing.finalize', 'daily_closings', p_closing_id::text, v_closing.note,
            jsonb_build_object('business_date', v_closing.business_date, 'revision', v_closing.revision,
              'variances', (select coalesce(jsonb_agg(jsonb_build_object('account', a.code, 'expected_cents', cb.expected_cents,
                                    'actual_cents', cb.actual_cents, 'variance_cents', cb.variance_cents)), '[]'::jsonb)
                              from public.closing_balances cb join public.accounts a on a.id = cb.account_id where cb.closing_id = p_closing_id)));
end;
$$;

-- Owner only: re-open a closed day as a NEW revision, with a reason. The old closing stays exactly as it was.
create function public.closing_amend(p_date date, p_reason text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_latest record;
  v_id uuid;
begin
  if not public.is_owner() then
    raise exception 'only the owner can amend a closed day' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'a reason is required' using errcode = 'check_violation';
  end if;
  select c.id, c.status, c.revision into v_latest from public.daily_closings c
   where c.business_date = p_date order by c.revision desc limit 1;
  if not found or v_latest.status <> 'final' then
    raise exception 'only a closed day can be amended' using errcode = 'check_violation';
  end if;
  insert into public.daily_closings (business_date, revision, amends_closing_id, amendment_reason, created_by)
    values (p_date, v_latest.revision + 1, v_latest.id, btrim(p_reason), auth.uid()) returning id into v_id;
  insert into public.closing_balances (closing_id, account_id, expected_cents)
    select v_id, e.account_id, e.expected_cents from public._closing_expected(p_date) e;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, reason)
    values (auth.uid(), 'closing.amend', 'daily_closings', v_id::text, btrim(p_reason));
  return v_id;
end;
$$;

-- Everything the closing page needs for one day. For a day with no closing yet it shows the live expected balances.
create function public.closing_detail(p_date date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_c record;
  v_accounts jsonb;
  v_count bigint;
begin
  if not (public._can_close() or public.has_permission('reports.view')) then
    raise exception 'you are not allowed to see closings' using errcode = 'insufficient_privilege';
  end if;
  select c.id, c.status, c.revision, c.note, c.amendment_reason, c.finalized_at, pf.display_name as finalized_by
    into v_c
    from public.daily_closings c left join public.profiles pf on pf.id = c.finalized_by
   where c.business_date = p_date order by c.revision desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'code', e.code, 'name', e.name, 'opening_cents', e.opening_cents, 'inflow_cents', e.inflow_cents,
           'outflow_cents', e.outflow_cents,
           'expected_cents', case when v_c.status = 'final' then cb.expected_cents else e.expected_cents end,
           'actual_cents', cb.actual_cents,
           'variance_cents', case when v_c.status = 'final' then cb.variance_cents
                                  when cb.actual_cents is null then null else cb.actual_cents - e.expected_cents end,
           'reason', cb.variance_reason) order by a.sort_order), '[]'::jsonb)
    into v_accounts
    from public._closing_expected(p_date) e
    join public.accounts a on a.id = e.account_id
    left join public.closing_balances cb on cb.account_id = e.account_id and cb.closing_id = v_c.id;

  select count(*) into v_count from public.transactions t
   where t.business_date = p_date and t.status = 'posted'
     and t.type in ('cash_in', 'cash_out', 'mobile_load', 'debt_repayment', 'debt_creation', 'expense');

  return jsonb_build_object(
    'business_date', p_date,
    'status', coalesce(v_c.status::text, 'none'),
    'closing_id', v_c.id,
    'revision', v_c.revision,
    'note', v_c.note,
    'amendment_reason', v_c.amendment_reason,
    'finalized_at', v_c.finalized_at,
    'finalized_by_name', v_c.finalized_by,
    'transaction_count', v_count,
    'accounts', v_accounts);
end;
$$;

create function public.list_closings(p_limit int default 20, p_offset int default 0)
returns table (business_date date, revision int, status public.closing_status, finalized_by_name text,
               finalized_at timestamptz, total_variance_cents bigint, note text, total_count bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not (public._can_close() or public.has_permission('reports.view')) then
    raise exception 'you are not allowed to see closings' using errcode = 'insufficient_privilege';
  end if;
  return query
    select c.business_date, c.revision, c.status, pf.display_name, c.finalized_at,
           coalesce((select sum(abs(cb.variance_cents)) from public.closing_balances cb where cb.closing_id = c.id), 0)::bigint,
           c.note, count(*) over ()::bigint
      from public.daily_closings c left join public.profiles pf on pf.id = c.finalized_by
     where c.status = 'final'
     order by c.business_date desc, c.revision desc
     limit least(greatest(coalesce(p_limit, 20), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports (owner or reports.view). All figures come from the ledger by the date of the journal entry,
-- except counts and volumes, which are by the transaction's business date.
-- ---------------------------------------------------------------------------
create function public.report_period(p_from date, p_to date)
returns table (
  transaction_count bigint, voided_count bigint, cash_in_count bigint, cash_in_volume_cents bigint,
  cash_out_count bigint, cash_out_volume_cents bigint, load_count bigint, load_sales_cents bigint,
  repayments_cents bigint, new_debt_cents bigint, fees_cents bigint, load_margin_cents bigint,
  provider_cost_cents bigint, expenses_cents bigint, write_offs_cents bigint, variance_cents bigint, net_profit_cents bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_fees bigint; v_margin bigint; v_prov bigint; v_exp bigint; v_wo bigint; v_var bigint;
begin
  if not (public.is_owner() or public.has_permission('reports.view')) then
    raise exception 'you are not allowed to see reports' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 732 then
    raise exception 'choose a date range of up to two years' using errcode = 'check_violation';
  end if;
  select coalesce(-sum(l.amount_cents) filter (where a.code = 'FEE_INCOME'), 0),
         coalesce(-sum(l.amount_cents) filter (where a.code = 'LOAD_MARGIN'), 0),
         coalesce(sum(l.amount_cents) filter (where a.code = 'PROVIDER_COST'), 0),
         coalesce(sum(l.amount_cents) filter (where a.code = 'BUSINESS_EXPENSES'), 0),
         coalesce(sum(l.amount_cents) filter (where a.code = 'DEBT_ADJUSTMENTS'), 0),
         coalesce(sum(l.amount_cents) filter (where a.code = 'RECON_VARIANCE'), 0)
    into v_fees, v_margin, v_prov, v_exp, v_wo, v_var
    from public.ledger_lines l
    join public.journal_entries je on je.id = l.entry_id
    join public.accounts a on a.id = l.account_id
   where je.business_date between p_from and p_to;
  return query
    select count(*) filter (where t.status = 'posted' and t.type in ('cash_in', 'cash_out', 'mobile_load', 'debt_repayment', 'debt_creation', 'expense')),
           count(*) filter (where t.status = 'voided'),
           count(*) filter (where t.status = 'posted' and t.type = 'cash_in'),
           coalesce(sum(t.principal_cents) filter (where t.status = 'posted' and t.type = 'cash_in'), 0)::bigint,
           count(*) filter (where t.status = 'posted' and t.type = 'cash_out'),
           coalesce(sum(t.principal_cents) filter (where t.status = 'posted' and t.type = 'cash_out'), 0)::bigint,
           count(*) filter (where t.status = 'posted' and t.type = 'mobile_load'),
           coalesce(sum(t.customer_price_cents) filter (where t.status = 'posted' and t.type = 'mobile_load'), 0)::bigint,
           coalesce(sum(t.principal_cents) filter (where t.status = 'posted' and t.type = 'debt_repayment'), 0)::bigint,
           coalesce(sum(t.credit_cents) filter (where t.status = 'posted' and t.type in ('cash_in', 'mobile_load', 'debt_creation')), 0)::bigint,
           v_fees, v_margin, v_prov, v_exp, v_wo, v_var, v_fees + v_margin - v_prov - v_exp - v_wo
      from public.transactions t
     where t.business_date between p_from and p_to;
end;
$$;

create function public.report_by_staff(p_from date, p_to date)
returns table (staff_name text, transaction_count bigint, volume_cents bigint, fees_cents bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not (public.is_owner() or public.has_permission('reports.view')) then
    raise exception 'you are not allowed to see reports' using errcode = 'insufficient_privilege';
  end if;
  return query
    select pf.display_name, count(*), coalesce(sum(t.principal_cents), 0)::bigint, coalesce(sum(t.fee_cents), 0)::bigint
      from public.transactions t join public.profiles pf on pf.id = t.recorded_by
     where t.business_date between p_from and p_to and t.status = 'posted'
       and t.type in ('cash_in', 'cash_out', 'mobile_load', 'debt_repayment', 'debt_creation', 'expense')
     group by pf.display_name order by 2 desc, 1;
end;
$$;

-- Cash, GCash and load: where each stood at the start of the period, what came in and went out, and where it ended.
create function public.report_float_movement(p_from date, p_to date)
returns table (code text, name text, opening_cents bigint, inflow_cents bigint, outflow_cents bigint, closing_cents bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not (public.is_owner() or public.has_permission('reports.view')) then
    raise exception 'you are not allowed to see reports' using errcode = 'insufficient_privilege';
  end if;
  return query
    select a.code, a.name,
           coalesce(sum(l.amount_cents) filter (where je.business_date < p_from), 0)::bigint,
           coalesce(sum(l.amount_cents) filter (where je.business_date between p_from and p_to and l.amount_cents > 0), 0)::bigint,
           coalesce(sum(l.amount_cents) filter (where je.business_date between p_from and p_to and l.amount_cents < 0), 0)::bigint,
           coalesce(sum(l.amount_cents) filter (where je.business_date <= p_to), 0)::bigint
      from public.accounts a
      left join public.ledger_lines l on l.account_id = a.id
      left join public.journal_entries je on je.id = l.entry_id
     where a.is_float group by a.id order by a.sort_order;
end;
$$;

create function public.report_discrepancies(p_from date, p_to date)
returns table (business_date date, revision int, account_name text, expected_cents bigint, actual_cents bigint, variance_cents bigint, reason text)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not (public.is_owner() or public.has_permission('reports.view')) then
    raise exception 'you are not allowed to see reports' using errcode = 'insufficient_privilege';
  end if;
  return query
    select c.business_date, c.revision, a.name, cb.expected_cents, cb.actual_cents, cb.variance_cents, cb.variance_reason
      from public.closing_balances cb
      join public.daily_closings c on c.id = cb.closing_id and c.status = 'final'
      join public.accounts a on a.id = cb.account_id
     where c.business_date between p_from and p_to and cb.variance_cents <> 0
     order by c.business_date desc, c.revision desc, a.sort_order;
end;
$$;

grant execute on function
  public.closing_start(date),
  public.closing_save(uuid, text, jsonb),
  public.closing_finalize(uuid),
  public.closing_amend(date, text),
  public.closing_detail(date),
  public.list_closings(int, int),
  public.report_period(date, date),
  public.report_by_staff(date, date),
  public.report_float_movement(date, date),
  public.report_discrepancies(date, date)
  to authenticated;
