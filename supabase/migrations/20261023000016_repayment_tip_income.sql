-- Tips are separate income ledger lines. Principal and allocations still track debt only.
-- Old transactions have no tip line and read as zero. Reversals mirror the original tip line.
insert into public.accounts (code, name, kind, sort_order)
values ('TIP_INCOME', 'Tip income', 'income', 75);

drop function public.post_repayment(uuid, uuid, bigint, public.payment_method, uuid, text, text, timestamptz);
create function public.post_repayment(
  p_idempotency_key uuid, p_customer_id uuid, p_amount_cents bigint, p_method public.payment_method,
  p_debt_id uuid default null, p_gcash_reference text default null, p_notes text default null,
  p_occurred_at timestamptz default null, p_tip_cents bigint default 0)
returns table (tx_id uuid, tx_ref text, was_duplicate boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_lines jsonb;
  v_res record;
  v_owed bigint;
  v_remaining bigint;
  v_take bigint;
  d record;
begin
  if not public.has_permission('repayments.record') then
    raise exception 'you are not allowed to record repayments' using errcode = 'insufficient_privilege';
  end if;
  if p_customer_id is null then
    raise exception 'choose a customer' using errcode = 'check_violation';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'enter an amount greater than zero' using errcode = 'check_violation';
  end if;
  if p_tip_cents is null or p_tip_cents < 0 then
    raise exception 'enter a tip of zero or more' using errcode = 'check_violation';
  end if;
  if p_tip_cents > 0 and p_tip_cents > 100000000000 - p_amount_cents then
    raise exception 'the total received is too large' using errcode = 'check_violation';
  end if;
  if p_method is null or p_method not in ('cash', 'gcash') then
    raise exception 'choose cash or GCash' using errcode = 'check_violation';
  end if;
  perform public._require_active_customer(p_customer_id);

  -- Lock order everywhere: accounts first, then debts.
  perform public._lock_accounts(array['CASH_DRAWER', 'GCASH_WALLET', 'CUSTOMER_RECEIVABLES', 'TIP_INCOME']);
  perform 1 from public.debts where customer_id = p_customer_id order by created_at, id for update;

  if p_debt_id is null then
    select coalesce(sum(b.outstanding_cents), 0) into v_owed
      from public.debt_balances b where b.customer_id = p_customer_id and b.outstanding_cents > 0;
  else
    select b.outstanding_cents into v_owed
      from public.debt_balances b where b.debt_id = p_debt_id and b.customer_id = p_customer_id;
    if v_owed is null then
      raise exception 'that debt does not belong to this customer' using errcode = 'check_violation';
    end if;
  end if;
  if p_amount_cents > coalesce(v_owed, 0)
     and not exists (select 1 from public.transactions where idempotency_key = p_idempotency_key) then
    raise exception 'the debt payment exceeds the outstanding balance (%)', public._peso(coalesce(v_owed, 0))
      using errcode = 'check_violation';
  end if;

  v_lines := public._merge_lines(array[
    public._line(case when p_method = 'cash' then 'CASH_DRAWER' else 'GCASH_WALLET' end, p_amount_cents + p_tip_cents),
    public._line('CUSTOMER_RECEIVABLES', -p_amount_cents, p_customer_id),
    public._line('TIP_INCOME', -p_tip_cents)]);
  select t.tx_id, t.tx_ref, t.was_duplicate into v_res from public._post_transaction(
    p_idempotency_key, 'debt_repayment', p_customer_id, p_occurred_at, p_amount_cents, 0, null, 0, 0,
    p_method, case when p_method = 'gcash' then p_gcash_reference end, null, null, null, null, null, null, p_notes, v_lines, null, 'posting') t;

  if not v_res.was_duplicate then
    v_remaining := p_amount_cents;
    for d in
      select b.debt_id, b.outstanding_cents
        from public.debt_balances b
        join public.debts x on x.id = b.debt_id
       where b.customer_id = p_customer_id and b.outstanding_cents > 0
         and (p_debt_id is null or b.debt_id = p_debt_id)
       order by x.created_at, x.id
    loop
      exit when v_remaining = 0;
      v_take := least(v_remaining, d.outstanding_cents);
      insert into public.debt_allocations (debt_id, transaction_id, amount_cents)
        values (d.debt_id, v_res.tx_id, v_take);
      v_remaining := v_remaining - v_take;
    end loop;
    if v_remaining <> 0 then
      raise exception 'could not allocate the full repayment to the customer''s debts' using errcode = 'check_violation';
    end if;
  end if;
  return query select v_res.tx_id, v_res.tx_ref, v_res.was_duplicate;
end;
$$;

drop function public.list_transactions(uuid, date, date, public.transaction_type[], text, text, boolean, int, int);
create function public.list_transactions(
  p_customer_id uuid default null, p_from date default null, p_to date default null,
  p_types public.transaction_type[] default null, p_status text default null, p_search text default null,
  p_newest_first boolean default true, p_limit int default 25, p_offset int default 0)
returns table (
  id uuid, public_ref text, occurred_at timestamptz, business_date date, type public.transaction_type,
  customer_id uuid, customer_name text, principal_cents bigint, fee_cents bigint, customer_price_cents bigint,
  credit_cents bigint, payment_method public.payment_method, gcash_reference text,
  status public.transaction_status, recorded_by_name text, notes text,
  shop_cash_cents bigint, shop_gcash_cents bigint, void_requested boolean, total_count bigint,
  tip_cents bigint, load_cost_cents bigint)
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
           count(*) over ()::bigint, m.tip, t.load_cost_cents
      from public.transactions t
      left join public.customers c on c.id = t.customer_id
      left join public.profiles pr on pr.id = t.recorded_by
      left join lateral (
        select coalesce(sum(l.amount_cents) filter (where a.code = 'CASH_DRAWER'), 0)::bigint as cash,
               coalesce(sum(l.amount_cents) filter (where a.code = 'GCASH_WALLET'), 0)::bigint as gcash,
               coalesce(-sum(l.amount_cents) filter (where a.code = 'TIP_INCOME'), 0)::bigint as tip
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

drop function public.daily_summary(date);
create function public.daily_summary(p_date date)
returns table (
  transaction_count bigint, voided_count bigint, cash_in_volume_cents bigint, cash_out_volume_cents bigint,
  load_sales_cents bigint, fees_cents bigint, load_margin_cents bigint, provider_cost_cents bigint,
  expenses_cents bigint, write_offs_cents bigint, variance_cents bigint, net_profit_cents bigint, tip_income_cents bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_fees bigint; v_margin bigint; v_prov bigint; v_exp bigint; v_wo bigint; v_var bigint; v_tip bigint;
begin
  if not (public.is_owner() or public.has_permission('reports.view')) then
    raise exception 'you are not allowed to see profit figures' using errcode = 'insufficient_privilege';
  end if;
  select coalesce(-sum(l.amount_cents) filter (where a.code = 'FEE_INCOME'), 0),
         coalesce(-sum(l.amount_cents) filter (where a.code = 'LOAD_MARGIN'), 0),
         coalesce(sum(l.amount_cents) filter (where a.code = 'PROVIDER_COST'), 0),
         coalesce(sum(l.amount_cents) filter (where a.code = 'BUSINESS_EXPENSES'), 0),
         coalesce(sum(l.amount_cents) filter (where a.code = 'DEBT_ADJUSTMENTS'), 0),
         coalesce(sum(l.amount_cents) filter (where a.code = 'RECON_VARIANCE'), 0),
         coalesce(-sum(l.amount_cents) filter (where a.code = 'TIP_INCOME'), 0)
    into v_fees, v_margin, v_prov, v_exp, v_wo, v_var, v_tip
    from public.ledger_lines l
    join public.journal_entries je on je.id = l.entry_id
    join public.accounts a on a.id = l.account_id
   where je.business_date = p_date;
  return query
    select count(*) filter (where t.status = 'posted' and t.type in ('cash_in', 'cash_out', 'mobile_load', 'debt_repayment', 'debt_creation', 'expense')),
           count(*) filter (where t.status = 'voided'),
           coalesce(sum(t.principal_cents) filter (where t.status = 'posted' and t.type = 'cash_in'), 0)::bigint,
           coalesce(sum(t.principal_cents) filter (where t.status = 'posted' and t.type = 'cash_out'), 0)::bigint,
           coalesce(sum(t.customer_price_cents) filter (where t.status = 'posted' and t.type = 'mobile_load'), 0)::bigint,
           v_fees, v_margin, v_prov, v_exp, v_wo, v_var,
           v_fees + v_margin + v_tip - v_prov - v_exp - v_wo, v_tip
      from public.transactions t
     where t.business_date = p_date;
end;
$$;

drop function public.daily_series(date, date);
create function public.daily_series(p_from date, p_to date)
returns table (business_date date, fees_cents bigint, load_margin_cents bigint, costs_cents bigint, net_profit_cents bigint, transaction_count bigint, tip_income_cents bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not (public.is_owner() or public.has_permission('reports.view')) then
    raise exception 'you are not allowed to see profit figures' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'choose a date range of up to one year' using errcode = 'check_violation';
  end if;
  return query
    with days as (select d::date as d from generate_series(p_from, p_to, interval '1 day') d),
    money as (
      select je.business_date as d,
             coalesce(-sum(l.amount_cents) filter (where a.code = 'FEE_INCOME'), 0) as fees,
             coalesce(-sum(l.amount_cents) filter (where a.code = 'LOAD_MARGIN'), 0) as margin,
             coalesce(-sum(l.amount_cents) filter (where a.code = 'TIP_INCOME'), 0) as tip,
             coalesce(sum(l.amount_cents) filter (where a.code in ('PROVIDER_COST', 'BUSINESS_EXPENSES', 'DEBT_ADJUSTMENTS')), 0) as costs
        from public.ledger_lines l
        join public.journal_entries je on je.id = l.entry_id
        join public.accounts a on a.id = l.account_id
       where je.business_date between p_from and p_to
       group by je.business_date),
    counts as (
      select t.business_date as d, count(*) as n from public.transactions t
       where t.business_date between p_from and p_to and t.status = 'posted'
         and t.type in ('cash_in', 'cash_out', 'mobile_load', 'debt_repayment', 'debt_creation', 'expense')
       group by t.business_date)
    select days.d, coalesce(m.fees, 0)::bigint, coalesce(m.margin, 0)::bigint, coalesce(m.costs, 0)::bigint,
           (coalesce(m.fees, 0) + coalesce(m.margin, 0) + coalesce(m.tip, 0) - coalesce(m.costs, 0))::bigint, coalesce(c.n, 0)::bigint,
           coalesce(m.tip, 0)::bigint
      from days left join money m on m.d = days.d left join counts c on c.d = days.d
     order by days.d;
end;
$$;

drop function public.report_period(date, date);
create function public.report_period(p_from date, p_to date)
returns table (
  transaction_count bigint, voided_count bigint, cash_in_count bigint, cash_in_volume_cents bigint,
  cash_out_count bigint, cash_out_volume_cents bigint, load_count bigint, load_sales_cents bigint,
  repayments_cents bigint, new_debt_cents bigint, fees_cents bigint, load_margin_cents bigint,
  provider_cost_cents bigint, expenses_cents bigint, write_offs_cents bigint, variance_cents bigint, net_profit_cents bigint, tip_income_cents bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_fees bigint; v_margin bigint; v_prov bigint; v_exp bigint; v_wo bigint; v_var bigint; v_tip bigint;
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
         coalesce(sum(l.amount_cents) filter (where a.code = 'RECON_VARIANCE'), 0),
         coalesce(-sum(l.amount_cents) filter (where a.code = 'TIP_INCOME'), 0)
    into v_fees, v_margin, v_prov, v_exp, v_wo, v_var, v_tip
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
           v_fees, v_margin, v_prov, v_exp, v_wo, v_var, v_fees + v_margin + v_tip - v_prov - v_exp - v_wo, v_tip
      from public.transactions t
     where t.business_date between p_from and p_to;
end;
$$;

revoke execute on function
  public.post_repayment(uuid, uuid, bigint, public.payment_method, uuid, text, text, timestamptz, bigint),
  public.list_transactions(uuid, date, date, public.transaction_type[], text, text, boolean, int, int),
  public.daily_summary(date),
  public.daily_series(date, date),
  public.report_period(date, date)
from public, anon, authenticated;

grant execute on function
  public.post_repayment(uuid, uuid, bigint, public.payment_method, uuid, text, text, timestamptz, bigint),
  public.list_transactions(uuid, date, date, public.transaction_type[], text, text, boolean, int, int),
  public.daily_summary(date),
  public.daily_series(date, date),
  public.report_period(date, date)
to authenticated;
