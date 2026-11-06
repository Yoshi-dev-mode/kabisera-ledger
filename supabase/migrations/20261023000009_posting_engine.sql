-- Kabisera Ledger · migration 9 (Phase 3: the financial ledger engine)
--
-- Every financial write goes through one of the post_* functions below. Each function, in ONE database transaction:
--   checks the caller's permission -> validates -> locks the accounts it touches -> refuses to overdraw a balance ->
--   writes the transaction, a balanced journal entry and its lines -> writes an audit row.
-- A repeated submit with the same idempotency key returns the original record instead of posting twice.
-- Rules mirror src/lib/ledger/postings.ts and are tested against the same cases (tests/fixtures/posting-cases.json).
-- Sign convention: positive = debit, negative = credit. "principal" is the headline amount the customer asked for.

-- ---------------------------------------------------------------------------
-- A debt whose source transaction was voided is worth nothing. Rebuild the view with that rule.
-- ---------------------------------------------------------------------------
drop view public.debt_balances;
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
               where j.debt_id = d.id), 0)::bigint as adjusted_cents,
    exists (select 1 from public.transactions s
             where s.id = d.source_transaction_id and s.status = 'voided') as source_voided
  from public.debts d
)
select
  t.*,
  (case when t.source_voided then 0
        else t.original_cents - t.repaid_cents + t.adjusted_cents end)::bigint as outstanding_cents,
  case
    when t.source_voided then 'voided'
    when (t.original_cents - t.repaid_cents + t.adjusted_cents) = 0 then 'paid'
    when t.repaid_cents > 0 then 'partially_paid'
    else 'outstanding'
  end as debt_status,
  (not t.source_voided and t.due_date is not null
    and (t.original_cents - t.repaid_cents + t.adjusted_cents) > 0
    and t.due_date < public.business_date_of(now())) as is_overdue
from totals t;
grant select on public.debt_balances to authenticated;

-- The owner's reported starting capital. Documentation only: it is NOT posted as a balance.
insert into public.app_settings (key, value, description) values
  ('reported.starting_capital',
   '{"amount_cents": 140000, "source": "Reported by the owner", "effective_date": null, "date_known": false, "posted": false}'::jsonb,
   'Reported starting capital of 1,400.00. Not a balance: real opening cash, GCash and load are entered separately after counting.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Internal helpers (no grants: only the functions below call them)
-- ---------------------------------------------------------------------------
create function public._peso(p bigint)
returns text language sql immutable set search_path = public, pg_temp
as $$
  select case when p < 0 then '-' else '' end || '₱' || to_char(abs(p) / 100.0, 'FM999,999,999,990.00')
$$;

create function public._line(p_account text, p_amount bigint, p_customer uuid default null)
returns jsonb language sql immutable set search_path = public, pg_temp
as $$
  select jsonb_build_object('account', p_account, 'customer', p_customer, 'amount', p_amount)
$$;

-- Combine lines that share an account and customer, and drop zero lines.
create function public._merge_lines(p_lines jsonb[])
returns jsonb language sql immutable set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object('account', m.account, 'customer', m.customer, 'amount', m.amount)
                            order by m.account, m.customer nulls first), '[]'::jsonb)
  from (
    select e ->> 'account' as account, e ->> 'customer' as customer, sum((e ->> 'amount')::bigint) as amount
    from unnest(p_lines) as u(e)
    where e is not null
    group by 1, 2
  ) m
  where m.amount <> 0
$$;

create function public._lock_accounts(p_codes text[])
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform 1 from public.accounts where code = any (p_codes) order by code for update;
end;
$$;

create function public._require_active_customer(p_customer uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_customer is not null
     and not exists (select 1 from public.customers where id = p_customer and status = 'active') then
    raise exception 'that customer was not found or is archived' using errcode = 'check_violation';
  end if;
end;
$$;

create function public._assert_open_day(p_date date)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if (select c.status from public.daily_closings c
       where c.business_date = p_date order by c.revision desc limit 1) = 'final' then
    raise exception 'the day % is already closed; ask the owner to amend the closing first', p_date
      using errcode = 'check_violation';
  end if;
end;
$$;

create function public._next_public_ref(p_date date)
returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  n int;
begin
  insert into public.transaction_counters as c (business_date, last_value) values (p_date, 1)
  on conflict (business_date) do update set last_value = c.last_value + 1
  returning c.last_value into n;
  return 'KL-' || to_char(p_date, 'YYYYMMDD') || '-' || lpad(n::text, 4, '0');
end;
$$;

-- Refuse to overdraw a cash, GCash or load balance (or the receivables total) unless the policy allows it
-- or the OWNER supplies a reason.
create function public._enforce_balances(p_lines jsonb, p_override_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r record;
  policy_allows boolean;
begin
  -- Daily-closing variance entries align the books with what was actually counted; they must never be blocked.
  if coalesce(current_setting('kabisera.closing', true), '') = 'on' then
    return;
  end if;
  select coalesce((value)::boolean, false) into policy_allows
    from public.app_settings where key = 'policy.allow_negative_floats';
  if coalesce(policy_allows, false) then
    return;
  end if;
  if p_override_reason is not null and char_length(btrim(p_override_reason)) >= 3 and public.is_owner() then
    return;
  end if;
  for r in
    select a.name,
           coalesce((select sum(l.amount_cents) from public.ledger_lines l where l.account_id = a.id), 0) as current_net,
           d.delta
      from (select e ->> 'account' as code, sum((e ->> 'amount')::bigint) as delta
              from jsonb_array_elements(p_lines) e group by 1) d
      join public.accounts a on a.code = d.code
     where not a.allow_negative and a.kind = 'asset'
  loop
    if r.current_net + r.delta < 0 then
      raise exception 'not enough in %: this would leave % (the owner can override with a reason)',
        r.name, public._peso(r.current_net + r.delta) using errcode = 'check_violation';
    end if;
  end loop;
end;
$$;

-- The one place that writes a transaction, its journal entry and lines, and the audit row.
create function public._post_transaction(
  p_idem uuid, p_type public.transaction_type, p_customer uuid, p_occurred timestamptz,
  p_principal bigint, p_fee bigint, p_fee_mode public.fee_mode, p_provider_cost bigint, p_credit bigint,
  p_payment public.payment_method, p_gcash_ref text,
  p_load_product uuid, p_load_source public.load_source, p_load_cost bigint, p_price bigint,
  p_adjustment public.adjustment_kind, p_expense_category uuid, p_notes text,
  p_lines jsonb, p_override_reason text, p_entry_kind public.journal_entry_kind)
returns table (tx_id uuid, tx_ref text, was_duplicate boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_when timestamptz;
  v_date date;
  v_existing record;
  v_tx uuid;
  v_ref text;
  v_entry uuid;
  v_codes text[];
begin
  if v_actor is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if p_idem is null then
    raise exception 'missing idempotency key' using errcode = 'check_violation';
  end if;

  -- A repeated submit returns the original record.
  select t.id, t.public_ref, t.recorded_by into v_existing
    from public.transactions t where t.idempotency_key = p_idem;
  if found then
    if v_existing.recorded_by <> v_actor then
      raise exception 'this request key was already used' using errcode = 'check_violation';
    end if;
    return query select v_existing.id, v_existing.public_ref, true;
    return;
  end if;

  if p_occurred is not null and not public.is_owner()
     and coalesce(current_setting('kabisera.closing', true), '') <> 'on' then
    raise exception 'only the owner can record a different date or time' using errcode = 'insufficient_privilege';
  end if;
  v_when := coalesce(p_occurred, now());
  if v_when > now() + interval '5 minutes' then
    raise exception 'the time cannot be in the future' using errcode = 'check_violation';
  end if;
  v_date := public.business_date_of(v_when);
  perform public._assert_open_day(v_date);

  if p_type in ('cash_in', 'cash_out')
     and coalesce((select (value)::boolean from public.app_settings where key = 'policy.require_gcash_reference'), false)
     and nullif(btrim(coalesce(p_gcash_ref, '')), '') is null then
    raise exception 'enter the GCash reference number' using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(distinct e ->> 'account'), '{}') into v_codes from jsonb_array_elements(p_lines) e;
  perform public._lock_accounts(v_codes);
  perform public._enforce_balances(p_lines, p_override_reason);

  v_ref := public._next_public_ref(v_date);
  begin
    insert into public.transactions (
      public_ref, type, customer_id, occurred_at, principal_cents, fee_cents, fee_mode, provider_cost_cents,
      credit_cents, payment_method, gcash_reference, load_product_id, load_source, load_cost_cents,
      customer_price_cents, adjustment_kind, expense_category_id, notes, idempotency_key, recorded_by)
    values (
      v_ref, p_type, p_customer, v_when, coalesce(p_principal, 0), coalesce(p_fee, 0), p_fee_mode,
      coalesce(p_provider_cost, 0), coalesce(p_credit, 0), p_payment, nullif(btrim(p_gcash_ref), ''),
      p_load_product, p_load_source, p_load_cost, p_price, p_adjustment, p_expense_category,
      nullif(btrim(p_notes), ''), p_idem, v_actor)
    returning id into v_tx;
  exception when unique_violation then
    select t.id, t.public_ref into v_existing from public.transactions t where t.idempotency_key = p_idem;
    if found then
      return query select v_existing.id, v_existing.public_ref, true;
      return;
    end if;
    raise;
  end;

  insert into public.journal_entries (transaction_id, kind, business_date, created_by)
    values (v_tx, p_entry_kind, v_date, v_actor) returning id into v_entry;
  insert into public.ledger_lines (entry_id, account_id, customer_id, amount_cents)
    select v_entry, a.id, nullif(e ->> 'customer', '')::uuid, (e ->> 'amount')::bigint
      from jsonb_array_elements(p_lines) e
      join public.accounts a on a.code = e ->> 'account';

  insert into public.audit_log (actor_id, action, entity_type, entity_id, reason, after_data)
  values (v_actor, 'transaction.post', 'transactions', v_tx::text, nullif(btrim(p_override_reason), ''),
          jsonb_build_object('type', p_type, 'public_ref', v_ref, 'principal_cents', coalesce(p_principal, 0),
                             'fee_cents', coalesce(p_fee, 0), 'lines', p_lines));

  return query select v_tx, v_ref, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Opening balances (owner only, counted by hand; never assumed)
-- ---------------------------------------------------------------------------
create function public.post_opening_balances(
  p_idempotency_key uuid, p_cash_cents bigint, p_gcash_cents bigint, p_load_cents bigint,
  p_as_of date default null, p_notes text default null)
returns table (tx_id uuid, tx_ref text, was_duplicate boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_total bigint;
  v_when timestamptz;
  v_lines jsonb;
  v_res record;
begin
  if not public.is_owner() then
    raise exception 'only the owner can enter opening balances' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_cash_cents, 0) < 0 or coalesce(p_gcash_cents, 0) < 0 or coalesce(p_load_cents, 0) < 0 then
    raise exception 'opening balances cannot be negative' using errcode = 'check_violation';
  end if;
  v_total := coalesce(p_cash_cents, 0) + coalesce(p_gcash_cents, 0) + coalesce(p_load_cents, 0);
  if v_total <= 0 then
    raise exception 'enter at least one opening balance above zero' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.transactions where idempotency_key = p_idempotency_key)
     and exists (
       select 1
         from public.transactions t
         join public.journal_entries je on je.transaction_id = t.id and je.kind = 'opening'
         join public.ledger_lines l on l.entry_id = je.id
         join public.accounts a on a.id = l.account_id and a.is_float
        where t.type = 'opening_balance' and t.status = 'posted') then
    raise exception 'opening balances are already recorded; void them first to enter new ones'
      using errcode = 'check_violation';
  end if;
  v_when := case when p_as_of is null then now() else (p_as_of::timestamp at time zone 'Asia/Manila') end;
  v_lines := public._merge_lines(array[
    public._line('CASH_DRAWER', coalesce(p_cash_cents, 0)),
    public._line('GCASH_WALLET', coalesce(p_gcash_cents, 0)),
    public._line('LOAD_BALANCE', coalesce(p_load_cents, 0)),
    public._line('OPENING_BALANCE_EQUITY', -v_total)]);
  select t.tx_id, t.tx_ref, t.was_duplicate into v_res from public._post_transaction(
    p_idempotency_key, 'opening_balance', null, case when p_as_of is null then null else v_when end,
    v_total, 0, null, 0, 0, null, null, null, null, null, null, null, null, p_notes, v_lines, null, 'opening') t;
  return query select v_res.tx_id, v_res.tx_ref, v_res.was_duplicate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cash-in: the customer hands over cash and the shop sends GCash.
--   on_top  : customer pays principal + fee, wallet sends principal
--   deducted: customer pays principal,       wallet sends principal - fee
-- ---------------------------------------------------------------------------
create function public.post_cash_in(
  p_idempotency_key uuid, p_customer_id uuid, p_principal_cents bigint, p_fee_cents bigint,
  p_fee_mode public.fee_mode, p_credit_cents bigint default 0, p_provider_cost_cents bigint default 0,
  p_gcash_reference text default null, p_notes text default null,
  p_occurred_at timestamptz default null, p_override_reason text default null)
returns table (tx_id uuid, tx_ref text, was_duplicate boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_credit bigint := coalesce(p_credit_cents, 0);
  v_cost bigint := coalesce(p_provider_cost_cents, 0);
  v_cash_total bigint;
  v_gcash_out bigint;
  v_lines jsonb;
  v_res record;
begin
  if not public.has_permission('transactions.record') then
    raise exception 'you are not allowed to record transactions' using errcode = 'insufficient_privilege';
  end if;
  if p_principal_cents is null or p_principal_cents <= 0 then
    raise exception 'enter an amount greater than zero' using errcode = 'check_violation';
  end if;
  if p_fee_cents is null or p_fee_cents < 0 or v_credit < 0 or v_cost < 0 then
    raise exception 'fee, unpaid amount and provider cost cannot be negative' using errcode = 'check_violation';
  end if;
  if v_credit > 0 and p_customer_id is null then
    raise exception 'choose a customer to leave an amount unpaid' using errcode = 'check_violation';
  end if;
  perform public._require_active_customer(p_customer_id);
  if p_fee_mode = 'on_top' then
    v_cash_total := p_principal_cents + p_fee_cents;
    v_gcash_out := p_principal_cents;
  else
    if p_fee_cents >= p_principal_cents then
      raise exception 'the fee must be less than the amount' using errcode = 'check_violation';
    end if;
    v_cash_total := p_principal_cents;
    v_gcash_out := p_principal_cents - p_fee_cents;
  end if;
  if v_credit > v_cash_total then
    raise exception 'the unpaid amount is more than the customer owes you' using errcode = 'check_violation';
  end if;
  v_lines := public._merge_lines(array[
    public._line('CASH_DRAWER', v_cash_total - v_credit),
    public._line('GCASH_WALLET', -(v_gcash_out + v_cost)),
    public._line('CUSTOMER_RECEIVABLES', v_credit, p_customer_id),
    public._line('FEE_INCOME', -p_fee_cents),
    public._line('PROVIDER_COST', v_cost)]);
  select t.tx_id, t.tx_ref, t.was_duplicate into v_res from public._post_transaction(
    p_idempotency_key, 'cash_in', p_customer_id, p_occurred_at, p_principal_cents, p_fee_cents, p_fee_mode,
    v_cost, v_credit, case when v_credit = 0 then 'cash'::public.payment_method
                           when v_credit = v_cash_total then 'credit'::public.payment_method
                           else 'mixed'::public.payment_method end,
    p_gcash_reference, null, null, null, null, null, null, p_notes, v_lines, p_override_reason, 'posting') t;
  if not v_res.was_duplicate and v_credit > 0 then
    insert into public.debts (customer_id, origin, source_transaction_id, original_cents, created_by)
      values (p_customer_id, 'transaction', v_res.tx_id, v_credit, auth.uid());
  end if;
  return query select v_res.tx_id, v_res.tx_ref, v_res.was_duplicate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cash-out: the customer sends GCash to the shop and the shop pays cash.
--   on_top  : wallet receives principal + fee, customer gets principal in cash
--   deducted: wallet receives principal,       customer gets principal - fee in cash
-- ---------------------------------------------------------------------------
create function public.post_cash_out(
  p_idempotency_key uuid, p_customer_id uuid, p_principal_cents bigint, p_fee_cents bigint,
  p_fee_mode public.fee_mode, p_provider_cost_cents bigint default 0,
  p_gcash_reference text default null, p_notes text default null,
  p_occurred_at timestamptz default null, p_override_reason text default null)
returns table (tx_id uuid, tx_ref text, was_duplicate boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cost bigint := coalesce(p_provider_cost_cents, 0);
  v_gcash_in bigint;
  v_cash_out bigint;
  v_lines jsonb;
  v_res record;
begin
  if not public.has_permission('transactions.record') then
    raise exception 'you are not allowed to record transactions' using errcode = 'insufficient_privilege';
  end if;
  if p_principal_cents is null or p_principal_cents <= 0 then
    raise exception 'enter an amount greater than zero' using errcode = 'check_violation';
  end if;
  if p_fee_cents is null or p_fee_cents < 0 or v_cost < 0 then
    raise exception 'fee and provider cost cannot be negative' using errcode = 'check_violation';
  end if;
  perform public._require_active_customer(p_customer_id);
  if p_fee_mode = 'on_top' then
    v_gcash_in := p_principal_cents + p_fee_cents;
    v_cash_out := p_principal_cents;
  else
    if p_fee_cents >= p_principal_cents then
      raise exception 'the fee must be less than the amount' using errcode = 'check_violation';
    end if;
    v_gcash_in := p_principal_cents;
    v_cash_out := p_principal_cents - p_fee_cents;
  end if;
  v_lines := public._merge_lines(array[
    public._line('CASH_DRAWER', -v_cash_out),
    public._line('GCASH_WALLET', v_gcash_in - v_cost),
    public._line('FEE_INCOME', -p_fee_cents),
    public._line('PROVIDER_COST', v_cost)]);
  select t.tx_id, t.tx_ref, t.was_duplicate into v_res from public._post_transaction(
    p_idempotency_key, 'cash_out', p_customer_id, p_occurred_at, p_principal_cents, p_fee_cents, p_fee_mode,
    v_cost, 0, 'cash', p_gcash_reference, null, null, null, null, null, null, p_notes, v_lines,
    p_override_reason, 'posting') t;
  return query select v_res.tx_id, v_res.tx_ref, v_res.was_duplicate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mobile load. The cost is required: it is what leaves the load balance (or the wallet) and what makes the margin.
-- ---------------------------------------------------------------------------
create function public.post_mobile_load(
  p_idempotency_key uuid, p_customer_id uuid, p_load_product_id uuid, p_load_source public.load_source,
  p_face_cents bigint, p_cost_cents bigint, p_price_cents bigint, p_payment_method public.payment_method,
  p_credit_cents bigint default 0, p_gcash_reference text default null, p_notes text default null,
  p_occurred_at timestamptz default null, p_override_reason text default null)
returns table (tx_id uuid, tx_ref text, was_duplicate boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_credit bigint := coalesce(p_credit_cents, 0);
  v_lines jsonb;
  v_res record;
begin
  if not public.has_permission('transactions.record') then
    raise exception 'you are not allowed to record transactions' using errcode = 'insufficient_privilege';
  end if;
  if p_face_cents is null or p_face_cents <= 0 then
    raise exception 'enter the load amount' using errcode = 'check_violation';
  end if;
  if p_cost_cents is null or p_cost_cents <= 0 then
    raise exception 'enter what the load cost you' using errcode = 'check_violation';
  end if;
  if p_price_cents is null or p_price_cents <= 0 then
    raise exception 'enter the selling price' using errcode = 'check_violation';
  end if;
  if p_payment_method not in ('cash', 'gcash') then
    raise exception 'choose cash or GCash for the part paid now' using errcode = 'check_violation';
  end if;
  if v_credit < 0 or v_credit > p_price_cents then
    raise exception 'the unpaid amount is more than the selling price' using errcode = 'check_violation';
  end if;
  if v_credit > 0 and p_customer_id is null then
    raise exception 'choose a customer to leave an amount unpaid' using errcode = 'check_violation';
  end if;
  perform public._require_active_customer(p_customer_id);
  v_lines := public._merge_lines(array[
    public._line(case when p_payment_method = 'cash' then 'CASH_DRAWER' else 'GCASH_WALLET' end, p_price_cents - v_credit),
    public._line('CUSTOMER_RECEIVABLES', v_credit, p_customer_id),
    public._line(case when p_load_source = 'prepaid_wallet' then 'LOAD_BALANCE' else 'GCASH_WALLET' end, -p_cost_cents),
    public._line('LOAD_MARGIN', -(p_price_cents - p_cost_cents))]);
  select t.tx_id, t.tx_ref, t.was_duplicate into v_res from public._post_transaction(
    p_idempotency_key, 'mobile_load', p_customer_id, p_occurred_at, p_face_cents, 0, null, 0, v_credit,
    case when v_credit = 0 then p_payment_method
         when v_credit = p_price_cents then 'credit'::public.payment_method
         else 'mixed'::public.payment_method end,
    p_gcash_reference, p_load_product_id, p_load_source, p_cost_cents, p_price_cents, null, null,
    p_notes, v_lines, p_override_reason, 'posting') t;
  if not v_res.was_duplicate and v_credit > 0 then
    insert into public.debts (customer_id, origin, source_transaction_id, original_cents, created_by)
      values (p_customer_id, 'transaction', v_res.tx_id, v_credit, auth.uid());
  end if;
  return query select v_res.tx_id, v_res.tx_ref, v_res.was_duplicate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cash advance / new debt (utang): the shop hands over cash or GCash that the customer will repay
-- ---------------------------------------------------------------------------
create function public.post_debt_creation(
  p_idempotency_key uuid, p_customer_id uuid, p_amount_cents bigint, p_source_method public.payment_method,
  p_due_date date default null, p_notes text default null,
  p_occurred_at timestamptz default null, p_override_reason text default null)
returns table (tx_id uuid, tx_ref text, was_duplicate boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_lines jsonb;
  v_res record;
begin
  if not public.has_permission('transactions.record') then
    raise exception 'you are not allowed to record transactions' using errcode = 'insufficient_privilege';
  end if;
  if p_customer_id is null then
    raise exception 'choose a customer' using errcode = 'check_violation';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'enter an amount greater than zero' using errcode = 'check_violation';
  end if;
  if p_source_method not in ('cash', 'gcash') then
    raise exception 'choose whether the money came from cash or GCash' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and status = 'active') then
    raise exception 'that customer was not found or is archived' using errcode = 'check_violation';
  end if;
  v_lines := public._merge_lines(array[
    public._line(case when p_source_method = 'cash' then 'CASH_DRAWER' else 'GCASH_WALLET' end, -p_amount_cents),
    public._line('CUSTOMER_RECEIVABLES', p_amount_cents, p_customer_id)]);
  select t.tx_id, t.tx_ref, t.was_duplicate into v_res from public._post_transaction(
    p_idempotency_key, 'debt_creation', p_customer_id, p_occurred_at, p_amount_cents, 0, null, 0, p_amount_cents,
    'credit', null, null, null, null, null, null, null, p_notes, v_lines, p_override_reason, 'posting') t;
  if not v_res.was_duplicate then
    insert into public.debts (customer_id, origin, source_transaction_id, original_cents, due_date, notes, created_by)
      values (p_customer_id, 'manual', v_res.tx_id, p_amount_cents, p_due_date, nullif(btrim(p_notes), ''), auth.uid());
  end if;
  return query select v_res.tx_id, v_res.tx_ref, v_res.was_duplicate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Repayment: money in, receivable down. Never revenue. Allocated to the oldest debts first
-- (or to one chosen debt). A repayment larger than what is owed is rejected.
-- ---------------------------------------------------------------------------
create function public.post_repayment(
  p_idempotency_key uuid, p_customer_id uuid, p_amount_cents bigint, p_method public.payment_method,
  p_debt_id uuid default null, p_gcash_reference text default null, p_notes text default null,
  p_occurred_at timestamptz default null)
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
  if p_method not in ('cash', 'gcash') then
    raise exception 'choose cash or GCash' using errcode = 'check_violation';
  end if;
  perform public._require_active_customer(p_customer_id);

  -- Lock order everywhere: accounts first, then debts.
  perform public._lock_accounts(array['CASH_DRAWER', 'GCASH_WALLET', 'CUSTOMER_RECEIVABLES']);
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
    raise exception 'this is more than the customer owes (%)', public._peso(coalesce(v_owed, 0))
      using errcode = 'check_violation';
  end if;

  v_lines := public._merge_lines(array[
    public._line(case when p_method = 'cash' then 'CASH_DRAWER' else 'GCASH_WALLET' end, p_amount_cents),
    public._line('CUSTOMER_RECEIVABLES', -p_amount_cents, p_customer_id)]);
  select t.tx_id, t.tx_ref, t.was_duplicate into v_res from public._post_transaction(
    p_idempotency_key, 'debt_repayment', p_customer_id, p_occurred_at, p_amount_cents, 0, null, 0, 0,
    p_method, p_gcash_reference, null, null, null, null, null, null, p_notes, v_lines, null, 'posting') t;

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

-- ---------------------------------------------------------------------------
-- Business expense (owner only for now)
-- ---------------------------------------------------------------------------
create function public.post_expense(
  p_idempotency_key uuid, p_category_id uuid, p_amount_cents bigint, p_method public.payment_method,
  p_notes text default null, p_occurred_at timestamptz default null, p_override_reason text default null)
returns table (tx_id uuid, tx_ref text, was_duplicate boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_lines jsonb;
  v_res record;
begin
  if not public.is_owner() then
    raise exception 'only the owner can record expenses' using errcode = 'insufficient_privilege';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'enter an amount greater than zero' using errcode = 'check_violation';
  end if;
  if p_method not in ('cash', 'gcash') then
    raise exception 'choose cash or GCash' using errcode = 'check_violation';
  end if;
  if p_category_id is not null
     and not exists (select 1 from public.expense_categories where id = p_category_id and is_active) then
    raise exception 'that expense category was not found' using errcode = 'check_violation';
  end if;
  v_lines := public._merge_lines(array[
    public._line('BUSINESS_EXPENSES', p_amount_cents),
    public._line(case when p_method = 'cash' then 'CASH_DRAWER' else 'GCASH_WALLET' end, -p_amount_cents)]);
  select t.tx_id, t.tx_ref, t.was_duplicate into v_res from public._post_transaction(
    p_idempotency_key, 'expense', null, p_occurred_at, p_amount_cents, 0, null, 0, 0, p_method, null,
    null, null, null, null, null, p_category_id, p_notes, v_lines, p_override_reason, 'posting') t;
  return query select v_res.tx_id, v_res.tx_ref, v_res.was_duplicate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Float adjustments and owner capital (owner only)
-- ---------------------------------------------------------------------------
create function public.post_float_adjustment(
  p_idempotency_key uuid, p_kind public.adjustment_kind, p_amount_cents bigint, p_account text default null,
  p_notes text default null, p_occurred_at timestamptz default null, p_override_reason text default null)
returns table (tx_id uuid, tx_ref text, was_duplicate boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_lines jsonb;
  v_type public.transaction_type := 'float_adjustment';
  v_res record;
begin
  if not public.is_owner() then
    raise exception 'only the owner can adjust balances' using errcode = 'insufficient_privilege';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'enter an amount greater than zero' using errcode = 'check_violation';
  end if;
  case p_kind
    when 'transfer_cash_to_gcash' then
      v_lines := public._merge_lines(array[public._line('CASH_DRAWER', -p_amount_cents), public._line('GCASH_WALLET', p_amount_cents)]);
    when 'transfer_gcash_to_cash' then
      v_lines := public._merge_lines(array[public._line('GCASH_WALLET', -p_amount_cents), public._line('CASH_DRAWER', p_amount_cents)]);
    when 'load_topup' then
      if p_account is null or p_account not in ('CASH_DRAWER', 'GCASH_WALLET') then
        raise exception 'choose whether the load was paid from cash or the GCash wallet' using errcode = 'check_violation';
      end if;
      v_lines := public._merge_lines(array[public._line(p_account, -p_amount_cents), public._line('LOAD_BALANCE', p_amount_cents)]);
    when 'capital_contribution', 'capital_withdrawal' then
      if p_account is null or p_account not in ('CASH_DRAWER', 'GCASH_WALLET', 'LOAD_BALANCE') then
        raise exception 'choose the cash drawer, GCash wallet or load balance' using errcode = 'check_violation';
      end if;
      v_type := 'owner_capital';
      v_lines := public._merge_lines(array[
        public._line(p_account, case when p_kind = 'capital_contribution' then p_amount_cents else -p_amount_cents end),
        public._line('OWNER_EQUITY', case when p_kind = 'capital_contribution' then -p_amount_cents else p_amount_cents end)]);
    else
      raise exception 'that kind of adjustment is not available here' using errcode = 'check_violation';
  end case;
  select t.tx_id, t.tx_ref, t.was_duplicate into v_res from public._post_transaction(
    p_idempotency_key, v_type, null, p_occurred_at, p_amount_cents, 0, null, 0, 0, null, null,
    null, null, null, null, p_kind, null, p_notes, v_lines, p_override_reason, 'adjustment') t;
  return query select v_res.tx_id, v_res.tx_ref, v_res.was_duplicate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Voids. Staff may REQUEST one; only the owner can APPROVE (void). A void adds mirror-image entries dated
-- today and flags the transaction; nothing is edited or deleted.
-- ---------------------------------------------------------------------------
create function public.request_void(p_transaction_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not (public.has_permission('transactions.request_void') or public.is_owner()) then
    raise exception 'you are not allowed to request a void' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'give a reason' using errcode = 'check_violation';
  end if;
  update public.transactions t
     set void_requested_by = auth.uid(), void_requested_at = now(), void_request_reason = btrim(p_reason)
   where t.id = p_transaction_id and t.status = 'posted' and t.void_requested_at is null
     and (public.is_owner() or t.recorded_by = auth.uid()
          or public.has_permission('customers.view') or public.has_permission('reports.view'));
  if not found then
    raise exception 'a void cannot be requested for this transaction' using errcode = 'check_violation';
  end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, reason)
    values (auth.uid(), 'transaction.void_requested', 'transactions', p_transaction_id::text, btrim(p_reason));
end;
$$;

create function public.void_transaction(p_transaction_id uuid, p_reason text, p_override_reason text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_tx public.transactions%rowtype;
  v_entry record;
  v_rev uuid;
  v_today date := public.business_date_of(now());
  v_neg jsonb;
  v_codes text[];
begin
  if not public.is_owner() then
    raise exception 'only the owner can void a transaction' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'a reason is required' using errcode = 'check_violation';
  end if;
  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'transaction not found' using errcode = 'no_data_found';
  end if;
  if v_tx.status = 'voided' then
    raise exception 'this transaction is already voided' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.debts d join public.debt_balances b on b.debt_id = d.id
     where d.source_transaction_id = p_transaction_id and (b.repaid_cents <> 0 or b.adjusted_cents <> 0)) then
    raise exception 'void the repayments and adjustments on this debt first' using errcode = 'check_violation';
  end if;

  for v_entry in
    select je.id from public.journal_entries je
     where je.transaction_id = p_transaction_id and je.kind <> 'reversal'
       and not exists (select 1 from public.journal_entries r where r.reverses_entry_id = je.id)
  loop
    select jsonb_agg(jsonb_build_object('account', a.code, 'customer', l.customer_id, 'amount', -l.amount_cents))
      into v_neg
      from public.ledger_lines l join public.accounts a on a.id = l.account_id
     where l.entry_id = v_entry.id;
    select array_agg(distinct e ->> 'account') into v_codes from jsonb_array_elements(v_neg) e;
    perform public._lock_accounts(v_codes);
    perform public._enforce_balances(v_neg, p_override_reason);
    insert into public.journal_entries (transaction_id, kind, reverses_entry_id, business_date, memo, created_by)
      values (p_transaction_id, 'reversal', v_entry.id, v_today, 'void: ' || btrim(p_reason), v_actor)
      returning id into v_rev;
    insert into public.ledger_lines (entry_id, account_id, customer_id, amount_cents)
      select v_rev, l.account_id, l.customer_id, -l.amount_cents
        from public.ledger_lines l where l.entry_id = v_entry.id;
  end loop;

  update public.transactions
     set status = 'voided', voided_at = now(), voided_by = v_actor, void_reason = btrim(p_reason)
   where id = p_transaction_id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, reason, before_data, after_data)
    values (v_actor, 'transaction.void', 'transactions', p_transaction_id::text,
            btrim(p_reason) || coalesce(' | override: ' || nullif(btrim(p_override_reason), ''), ''),
            jsonb_build_object('status', 'posted', 'public_ref', v_tx.public_ref),
            jsonb_build_object('status', 'voided'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: only the public entry points
-- ---------------------------------------------------------------------------
grant execute on function
  public.post_opening_balances(uuid, bigint, bigint, bigint, date, text),
  public.post_cash_in(uuid, uuid, bigint, bigint, public.fee_mode, bigint, bigint, text, text, timestamptz, text),
  public.post_cash_out(uuid, uuid, bigint, bigint, public.fee_mode, bigint, text, text, timestamptz, text),
  public.post_mobile_load(uuid, uuid, uuid, public.load_source, bigint, bigint, bigint, public.payment_method, bigint, text, text, timestamptz, text),
  public.post_debt_creation(uuid, uuid, bigint, public.payment_method, date, text, timestamptz, text),
  public.post_repayment(uuid, uuid, bigint, public.payment_method, uuid, text, text, timestamptz),
  public.post_expense(uuid, uuid, bigint, public.payment_method, text, timestamptz, text),
  public.post_float_adjustment(uuid, public.adjustment_kind, bigint, text, text, timestamptz, text),
  public.request_void(uuid, text),
  public.void_transaction(uuid, text, text)
  to authenticated;
