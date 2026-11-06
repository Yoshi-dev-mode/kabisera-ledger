-- Kabisera Ledger · Phase 7 dashboard and accounts checks
--
-- WRITTEN BUT NOT EXECUTED by the assistant (no PostgreSQL was available).
-- Run on a FRESH local database in Studio's SQL editor. Rolled back; ends with an intentional error whose
-- message is the report. First line must say 0 failure(s); every line must start with PASS.
-- Expected figures were worked out by hand (see the comments).

do $$
declare
  report text := '';
  failures int;
  u_owner uuid := gen_random_uuid();
  u_bal   uuid := gen_random_uuid();   -- accounts.view only
  u_rep   uuid := gen_random_uuid();   -- reports.view only
  u_none  uuid := gen_random_uuid();
  tx_exp uuid; today date := public.business_date_of(now()); yday date := public.business_date_of(now() - interval '1 day');
  r record; j jsonb; n bigint; v bigint;
begin
  select count(*) into n from public.ledger_lines;
  report := report || case when n = 0 then 'PASS' else 'FAIL (database not fresh)' end || ': the ledger starts empty' || E'\n';
  insert into auth.users (id, email) values (u_owner, 'p7-owner@example.invalid'), (u_bal, 'p7-bal@example.invalid'), (u_rep, 'p7-rep@example.invalid'), (u_none, 'p7-none@example.invalid');
  insert into public.profiles (id, display_name, role, permissions) values
    (u_owner, 'P7 Owner', 'owner', '{}'),
    (u_bal, 'P7 Balances', 'staff', array['accounts.view']),
    (u_rep, 'P7 Reports', 'staff', array['reports.view']),
    (u_none, 'P7 None', 'staff', '{}');

  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Opening: cash 10,000.00 / GCash 5,000.00 / load 2,000.00
  perform public.post_opening_balances(gen_random_uuid(), 1000000, 500000, 200000);
  -- cash-in 1,000.00 fee 20.00 on top      : cash +1,020.00, GCash -1,000.00, fee 20.00
  perform public.post_cash_in(gen_random_uuid(), null, 100000, 2000, 'on_top');
  -- load 100.00 cost 97.00 sold 100.00     : cash +100.00, load -97.00, margin 3.00
  perform public.post_mobile_load(gen_random_uuid(), null, null, 'prepaid_wallet', 10000, 9700, 10000, 'cash');
  -- expense 50.00 in cash                  : cash -50.00, expense 50.00
  select t.tx_id into tx_exp from public.post_expense(gen_random_uuid(), null, 5000, 'cash') t;
  -- cash-out 500.00 fee 10.00 deducted     : cash -490.00, GCash +500.00, fee 10.00
  perform public.post_cash_out(gen_random_uuid(), null, 50000, 1000, 'deducted');

  select * into r from public.daily_summary(today);
  report := report || case when r.transaction_count = 4 and r.fees_cents = 3000 and r.load_margin_cents = 300 and r.expenses_cents = 5000 and r.net_profit_cents = -1700 then 'PASS' else 'FAIL (' || r.transaction_count || '/' || r.fees_cents || '/' || r.load_margin_cents || '/' || r.expenses_cents || '/' || r.net_profit_cents || ')' end
            || ': today = 4 transactions, fees 30.00, margin 3.00, expenses 50.00, net profit -17.00' || E'\n';
  report := report || case when r.cash_in_volume_cents = 100000 and r.cash_out_volume_cents = 50000 and r.load_sales_cents = 10000 then 'PASS' else 'FAIL' end
            || ': volume (1,000.00 / 500.00 / 100.00) is reported separately from income' || E'\n';
  report := report || case when r.net_profit_cents <> r.cash_in_volume_cents + r.cash_out_volume_cents then 'PASS' else 'FAIL' end
            || ': profit is never the transaction volume' || E'\n';

  perform public.void_transaction(tx_exp, 'recorded by mistake');
  select * into r from public.daily_summary(today);
  report := report || case when r.transaction_count = 3 and r.voided_count = 1 and r.expenses_cents = 0 and r.net_profit_cents = 3300 then 'PASS' else 'FAIL (' || r.transaction_count || '/' || r.voided_count || '/' || r.expenses_cents || '/' || r.net_profit_cents || ')' end
            || ': a void removes the expense (net 33.00), counts as voided, and is not a transaction' || E'\n';

  -- Balances: cash 10,000 + 1,020 + 100 - 50 - 490 + 50 (void) = 10,630.00 ; GCash 5,000 - 1,000 + 500 = 4,500.00 ; load 2,000 - 97 = 1,903.00
  select balance_cents into v from public.account_overview() where code = 'CASH_DRAWER';
  report := report || case when v = 1063000 then 'PASS' else 'FAIL (got ' || v || ')' end || ': cash drawer = 10,630.00' || E'\n';
  select balance_cents into v from public.account_overview() where code = 'GCASH_WALLET';
  report := report || case when v = 450000 then 'PASS' else 'FAIL (got ' || v || ')' end || ': GCash wallet = 4,500.00' || E'\n';
  select balance_cents into v from public.account_overview() where code = 'LOAD_BALANCE';
  report := report || case when v = 190300 then 'PASS' else 'FAIL (got ' || v || ')' end || ': load balance = 1,903.00' || E'\n';
  select count(*) into n from public.account_overview();
  report := report || case when n = 3 then 'PASS' else 'FAIL (got ' || n || ')' end || ': exactly the three float accounts are listed (debts are not cash)' || E'\n';
  select count(*) into n from public.account_overview() where last_reconciled_on is not null;
  report := report || case when n = 0 then 'PASS' else 'FAIL' end || ': nothing is shown as counted before a closing exists' || E'\n';

  -- warning levels and alerts
  perform public.set_account_threshold('CASH_DRAWER', 2000000);
  select is_low into r from public.account_overview() where code = 'CASH_DRAWER';
  report := report || case when r.is_low then 'PASS' else 'FAIL' end || ': a balance below its warning level is flagged low' || E'\n';
  j := public.dashboard_facts();
  report := report || case when jsonb_array_length(j -> 'low_accounts') = 1 and (j -> 'low_accounts' -> 0 ->> 'code') = 'CASH_DRAWER' then 'PASS' else 'FAIL' end || ': the alert facts list only the low account' || E'\n';
  perform public.set_account_threshold('CASH_DRAWER', 500000);
  j := public.dashboard_facts();
  report := report || case when jsonb_array_length(j -> 'low_accounts') = 0 then 'PASS' else 'FAIL' end || ': no alert once the balance is above its level' || E'\n';
  perform public.set_account_threshold('CASH_DRAWER', null);

  -- an earlier day with activity and no closing is reported as not closed
  perform public.post_expense(gen_random_uuid(), null, 100, 'cash', null, now() - interval '1 day');
  j := public.dashboard_facts();
  report := report || case when (j -> 'unreconciled_dates') @> to_jsonb(array[yday::text]) then 'PASS' else 'FAIL (' || (j -> 'unreconciled_dates')::text || ')' end || ': yesterday has activity but no closing, so it is reported' || E'\n';
  report := report || case when not ((j -> 'unreconciled_dates') @> to_jsonb(array[today::text])) then 'PASS' else 'FAIL' end || ': today is never reported as unclosed' || E'\n';
  report := report || case when (j -> 'overdue' ->> 'count') = '0' and jsonb_array_length(j -> 'discrepancies') = 0 then 'PASS' else 'FAIL' end || ': no overdue debts and no discrepancies are invented' || E'\n';

  -- series fills days with no activity
  select count(*) into n from public.daily_series(today - 2, today);
  report := report || case when n = 3 then 'PASS' else 'FAIL (got ' || n || ')' end || ': the series has one row per day, including quiet days' || E'\n';
  select costs_cents, transaction_count into r from public.daily_series(yday, yday);
  report := report || case when r.costs_cents = 100 and r.transaction_count = 1 then 'PASS' else 'FAIL' end || ': yesterday shows its own 1.00 expense' || E'\n';
  select count(*) into n from public.daily_series(today - 3, today - 3) where net_profit_cents = 0 and transaction_count = 0;
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': a day with nothing shows zeros' || E'\n';
  begin
    perform * from public.daily_series(today, today - 1);
    report := report || 'FAIL: a backwards range was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a backwards date range is refused' || E'\n';
  end;

  -- account ledger with running balance
  select count(*), max(total_count) into r from public.account_ledger('CASH_DRAWER', null, null, 100, 0);
  report := report || case when r.max = 7 then 'PASS' else 'FAIL (total ' || r.max || ')' end || ': the cash ledger has 7 movements' || E'\n';
  select balance_after_cents into v from public.account_ledger('CASH_DRAWER', null, null, 1, 0);
  report := report || case when v = 1062900 then 'PASS' else 'FAIL (got ' || v || ')' end || ': the newest row''s running balance equals the account balance (10,629.00)' || E'\n';
  select count(*) into n from public.account_ledger('CASH_DRAWER', null, null, 100, 0) where entry_kind = 'reversal' and change_cents = 5000;
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': the void shows as its own reversing row, not as an edit' || E'\n';
  begin
    perform * from public.account_ledger('FEE_INCOME');
    report := report || 'FAIL: a non-float account ledger was returned' || E'\n';
  exception when check_violation then
    report := report || 'PASS: the account ledger is only for cash, GCash and load' || E'\n';
  end;
  reset role;

  -- permissions
  perform set_config('request.jwt.claim.sub', u_bal::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_bal::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.account_overview();
  report := report || case when n = 3 then 'PASS' else 'FAIL' end || ': accounts.view can see balances' || E'\n';
  begin
    perform * from public.daily_summary(today);
    report := report || 'FAIL: accounts.view saw profit figures' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: ...but not profit figures' || E'\n';
  end;
  j := public.dashboard_facts();
  report := report || case when (j -> 'low_accounts') is not null and jsonb_typeof(j -> 'overdue') = 'null' and jsonb_typeof(j -> 'unreconciled_dates') = 'null' then 'PASS' else 'FAIL' end
            || ': alert facts only include the sections this person may see' || E'\n';
  reset role;

  perform set_config('request.jwt.claim.sub', u_rep::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_rep::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.daily_summary(today);
  report := report || case when r.net_profit_cents = 3300 then 'PASS' else 'FAIL' end || ': reports.view can see profit' || E'\n';
  begin
    perform * from public.account_overview();
    report := report || 'FAIL: reports.view saw balances' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: ...but not balances' || E'\n';
  end;
  begin
    perform * from public.account_ledger('CASH_DRAWER');
    report := report || 'FAIL: reports.view saw the account ledger' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: ...or the account ledger' || E'\n';
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', u_none::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_none::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.dashboard_facts();
  report := report || case when jsonb_typeof(j -> 'low_accounts') = 'null' and jsonb_typeof(j -> 'overdue') = 'null' and jsonb_typeof(j -> 'discrepancies') = 'null' then 'PASS' else 'FAIL' end || ': a person with no permissions gets no alert facts' || E'\n';
  begin
    perform * from public.daily_series(today - 1, today);
    report := report || 'FAIL: a person with no permissions saw the series' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: ...and cannot read the profit series' || E'\n';
  end;
  reset role;

  failures := (length(report) - length(replace(report, 'FAIL', ''))) / 4;
  raise exception E'PHASE 7 CHECKS: % failure(s). This error is intentional so that nothing is saved.\n%', failures, report;
end;
$$;
