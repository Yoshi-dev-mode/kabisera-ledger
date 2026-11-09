-- Run after migration 16 on a local test database with the current day open.
-- The final exception intentionally rolls back all test records.
do $$
declare
  v_actor uuid := gen_random_uuid();
  v_key uuid := gen_random_uuid();
  v_customer uuid;
  v_tx uuid;
  v_oldest uuid;
  v_day date := public.business_date_of(now());
  v_before record;
  v_after record;
  v_row record;
begin
  insert into auth.users (id, email) values (v_actor, v_actor::text || '@example.invalid');
  insert into public.profiles (id, display_name, role) values (v_actor, 'Tip test owner', 'owner');
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  set local role authenticated;

  v_customer := public.customer_create('Tip test ' || v_actor::text);
  perform public.post_float_adjustment(gen_random_uuid(), 'capital_contribution', 100500, 'CASH_DRAWER');
  perform public.post_debt_creation(gen_random_uuid(), v_customer, 50000, 'cash');
  perform public.post_debt_creation(gen_random_uuid(), v_customer, 50500, 'cash');
  select id into strict v_oldest from public.debts where customer_id = v_customer order by created_at, id limit 1;
  select * into strict v_before from public.report_period(v_day, v_day);

  begin
    perform public.post_repayment(gen_random_uuid(), v_customer, 102500, 'gcash', p_tip_cents => 2000);
    raise exception 'Overpayment was accepted as debt principal';
  exception when check_violation then null;
  end;
  begin
    perform public.post_repayment(gen_random_uuid(), v_customer, 1000, 'gcash', p_tip_cents => -1);
    raise exception 'Negative tip was accepted';
  exception when check_violation then null;
  end;

  select tx_id into strict v_tx from public.post_repayment(v_key, v_customer, 100500, 'gcash', p_tip_cents => 2000);
  select * into strict v_row from public.list_transactions(p_customer_id => v_customer) where id = v_tx;
  if v_row.principal_cents <> 100500 or v_row.tip_cents <> 2000 or v_row.shop_gcash_cents <> 102500 then
    raise exception 'Repayment principal, tip or GCash movement is incorrect';
  end if;
  if (select sum(amount_cents) from public.debt_allocations where transaction_id = v_tx) is distinct from 100500 then
    raise exception 'Allocations must equal the debt payment only';
  end if;
  select * into strict v_after from public.report_period(v_day, v_day);
  if v_after.tip_income_cents - v_before.tip_income_cents <> 2000
     or v_after.net_profit_cents - v_before.net_profit_cents <> 2000
     or v_after.repayments_cents - v_before.repayments_cents <> 100500
     or v_after.load_margin_cents <> v_before.load_margin_cents then
    raise exception 'Profit report did not separate tips, load margin and debt payments';
  end if;
  if (select tip_income_cents from public.daily_summary(v_day)) <> v_after.tip_income_cents
     or (select tip_income_cents from public.daily_series(v_day, v_day)) <> v_after.tip_income_cents then
    raise exception 'Daily profit reports omitted tips';
  end if;
  if not (select was_duplicate from public.post_repayment(v_key, v_customer, 100500, 'gcash', p_tip_cents => 2000)) then
    raise exception 'Retry did not return the original repayment';
  end if;

  perform public.void_transaction(v_tx, 'Tip test reversal');
  if (select sum(outstanding_cents) from public.debt_balances where customer_id = v_customer) is distinct from 100500
     or (select tip_income_cents from public.report_period(v_day, v_day)) <> v_before.tip_income_cents then
    raise exception 'Void did not restore the debt and reverse tip income';
  end if;

  -- The original RPC call shape still posts a zero-tip payment to the oldest debt.
  select tx_id into strict v_tx from public.post_repayment(gen_random_uuid(), v_customer, 1000, 'cash');
  if (select debt_id from public.debt_allocations where transaction_id = v_tx) is distinct from v_oldest
     or (select tip_cents from public.list_transactions(p_customer_id => v_customer) where id = v_tx) is distinct from 0 then
    raise exception 'A no-tip payment failed to allocate oldest first';
  end if;

  raise exception E'PHASE 9 CHECKS: 0 failures\nPASS: repayment, tips, reports, retry and reversal';
end;
$$;
