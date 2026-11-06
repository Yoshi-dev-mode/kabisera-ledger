-- Kabisera Ledger · migration 13 (Phase 7: dashboard and accounts)
-- Read functions only. Every figure comes from the ledger (never from a stored balance), and each function
-- checks the caller's permission. Profit figures need reports.view; balances need accounts.view.
--
-- Definitions used on screen:
--   transaction volume = the amounts that moved (principal); it is NOT revenue and NOT profit.
--   fees earned        = service fees from cash-in and cash-out.
--   load margin        = selling price minus what the load cost.
--   costs              = provider costs, operating expenses and debt write-offs.
--   net profit         = fees + load margin - costs.   Reconciliation variance is reported separately.
-- Money figures are by the date of the journal ENTRY, so a void made today shows today as a reversal.

create function public.account_overview()
returns table (
  code text, name text, balance_cents bigint, low_threshold_cents bigint, is_low boolean,
  last_reconciled_on date, last_variance_cents bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not (public.is_owner() or public.has_permission('accounts.view')) then
    raise exception 'you are not allowed to see balances' using errcode = 'insufficient_privilege';
  end if;
  return query
    select a.code, a.name, b.bal::bigint, a.low_threshold_cents,
           (a.low_threshold_cents is not null and b.bal < a.low_threshold_cents),
           r.business_date, r.variance_cents
      from public.accounts a
      left join lateral (select coalesce(sum(l.amount_cents), 0) as bal from public.ledger_lines l where l.account_id = a.id) b on true
      left join lateral (
        select c.business_date, cb.variance_cents
          from public.closing_balances cb
          join public.daily_closings c on c.id = cb.closing_id and c.status = 'final'
         where cb.account_id = a.id
         order by c.business_date desc, c.revision desc limit 1) r on true
     where a.is_float
     order by a.sort_order;
end;
$$;

create function public.daily_summary(p_date date)
returns table (
  transaction_count bigint, voided_count bigint, cash_in_volume_cents bigint, cash_out_volume_cents bigint,
  load_sales_cents bigint, fees_cents bigint, load_margin_cents bigint, provider_cost_cents bigint,
  expenses_cents bigint, write_offs_cents bigint, variance_cents bigint, net_profit_cents bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_fees bigint; v_margin bigint; v_prov bigint; v_exp bigint; v_wo bigint; v_var bigint;
begin
  if not (public.is_owner() or public.has_permission('reports.view')) then
    raise exception 'you are not allowed to see profit figures' using errcode = 'insufficient_privilege';
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
   where je.business_date = p_date;
  return query
    select count(*) filter (where t.status = 'posted' and t.type in ('cash_in', 'cash_out', 'mobile_load', 'debt_repayment', 'debt_creation', 'expense')),
           count(*) filter (where t.status = 'voided'),
           coalesce(sum(t.principal_cents) filter (where t.status = 'posted' and t.type = 'cash_in'), 0)::bigint,
           coalesce(sum(t.principal_cents) filter (where t.status = 'posted' and t.type = 'cash_out'), 0)::bigint,
           coalesce(sum(t.customer_price_cents) filter (where t.status = 'posted' and t.type = 'mobile_load'), 0)::bigint,
           v_fees, v_margin, v_prov, v_exp, v_wo, v_var,
           v_fees + v_margin - v_prov - v_exp - v_wo
      from public.transactions t
     where t.business_date = p_date;
end;
$$;

create function public.daily_series(p_from date, p_to date)
returns table (business_date date, fees_cents bigint, load_margin_cents bigint, costs_cents bigint, net_profit_cents bigint, transaction_count bigint)
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
           (coalesce(m.fees, 0) + coalesce(m.margin, 0) - coalesce(m.costs, 0))::bigint, coalesce(c.n, 0)::bigint
      from days left join money m on m.d = days.d left join counts c on c.d = days.d
     order by days.d;
end;
$$;

-- The numbers behind the dashboard alerts. A section is null when the caller may not see it.
create function public.dashboard_facts()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_today date := public.business_date_of(now());
  v_owner boolean := public.is_owner();
  v_low jsonb; v_overdue jsonb; v_unrec jsonb; v_disc jsonb;
begin
  if not (v_owner or public.has_permission('accounts.view') or public.has_permission('debts.view')
          or public.has_permission('closing.perform') or public.has_permission('reports.view')) then
    return jsonb_build_object('low_accounts', null, 'overdue', null, 'unreconciled_dates', null, 'discrepancies', null);
  end if;

  if v_owner or public.has_permission('accounts.view') then
    select coalesce(jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name, 'balance_cents', b.bal, 'threshold_cents', a.low_threshold_cents) order by a.sort_order), '[]'::jsonb)
      into v_low
      from public.accounts a
      left join lateral (select coalesce(sum(l.amount_cents), 0) as bal from public.ledger_lines l where l.account_id = a.id) b on true
     where a.is_float and a.low_threshold_cents is not null and b.bal < a.low_threshold_cents;
  end if;

  if v_owner or public.has_permission('debts.view') then
    select jsonb_build_object('count', count(*), 'cents', coalesce(sum(b.outstanding_cents), 0))
      into v_overdue from public.debt_balances b where b.is_overdue;
  end if;

  if v_owner or public.has_permission('closing.perform') or public.has_permission('reports.view') then
    select coalesce(jsonb_agg(d.business_date order by d.business_date), '[]'::jsonb) into v_unrec
      from (select distinct t.business_date from public.transactions t
             where t.status = 'posted' and t.business_date >= v_today - 30 and t.business_date < v_today
               and coalesce((select c.status from public.daily_closings c where c.business_date = t.business_date
                              order by c.revision desc limit 1), 'draft') <> 'final') d;
    select coalesce(jsonb_agg(jsonb_build_object('business_date', c.business_date, 'account', a.name, 'variance_cents', cb.variance_cents)
                              order by c.business_date desc), '[]'::jsonb)
      into v_disc
      from public.closing_balances cb
      join public.daily_closings c on c.id = cb.closing_id and c.status = 'final'
      join public.accounts a on a.id = cb.account_id
     where c.business_date >= v_today - 14 and cb.variance_cents is not null and cb.variance_cents <> 0
       and c.revision = (select max(c2.revision) from public.daily_closings c2 where c2.business_date = c.business_date);
  end if;

  return jsonb_build_object('low_accounts', v_low, 'overdue', v_overdue, 'unreconciled_dates', v_unrec, 'discrepancies', v_disc);
end;
$$;

-- One account's ledger with a running balance (own-sign: assets and expenses grow with debits).
create function public.account_ledger(p_code text, p_from date default null, p_to date default null, p_limit int default 25, p_offset int default 0)
returns table (
  line_id bigint, entry_date date, created_at timestamptz, transaction_id uuid, public_ref text,
  tx_type public.transaction_type, customer_name text, entry_kind public.journal_entry_kind,
  change_cents bigint, balance_after_cents bigint, memo text, total_count bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not (public.is_owner() or public.has_permission('accounts.view')) then
    raise exception 'you are not allowed to see balances' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.accounts where code = p_code and is_float) then
    raise exception 'that account was not found' using errcode = 'check_violation';
  end if;
  return query
    with x as (
      select l.id as line_id, je.business_date as entry_date, je.created_at, je.transaction_id, je.kind as entry_kind, je.memo,
             l.amount_cents as change_cents,
             sum(l.amount_cents) over (order by je.business_date, je.created_at, l.id) as balance_after
        from public.ledger_lines l
        join public.journal_entries je on je.id = l.entry_id
        join public.accounts a on a.id = l.account_id
       where a.code = p_code)
    select x.line_id, x.entry_date, x.created_at, x.transaction_id, t.public_ref, t.type, c.display_name, x.entry_kind,
           x.change_cents, x.balance_after::bigint, x.memo, count(*) over ()::bigint
      from x
      join public.transactions t on t.id = x.transaction_id
      left join public.customers c on c.id = t.customer_id
     where (p_from is null or x.entry_date >= p_from) and (p_to is null or x.entry_date <= p_to)
     order by x.entry_date desc, x.created_at desc, x.line_id desc
     limit least(greatest(coalesce(p_limit, 25), 1), 500) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

grant execute on function
  public.account_overview(),
  public.daily_summary(date),
  public.daily_series(date, date),
  public.dashboard_facts(),
  public.account_ledger(text, date, date, int, int)
  to authenticated;
