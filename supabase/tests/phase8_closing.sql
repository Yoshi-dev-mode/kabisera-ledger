-- Kabisera Ledger · Phase 8 daily-closing and report checks
--
-- WRITTEN BUT NOT EXECUTED by the assistant (no PostgreSQL was available).
-- Run on a FRESH local database in Studio's SQL editor. Rolled back; ends with an intentional error whose
-- message is the report. First line must say 0 failure(s); every line must start with PASS.
-- Scenario: opening balances counted YESTERDAY (
-- cash 10,000.00 / GCash 5,000.00 / load 2,000.00). Yesterday is closed with the drawer 5.00 over. Today has a
-- cash-in, the books move while someone is counting, and the owner amends the day.

do $$
declare
  report text := '';
  failures int;
  u_owner uuid := gen_random_uuid();
  u_closer uuid := gen_random_uuid();   -- closing.perform only
  u_view uuid := gen_random_uuid();     -- reports.view only
  u_none uuid := gen_random_uuid();
  today date := public.business_date_of(now());
  yday date := public.business_date_of(now() - interval '1 day');
  c_y uuid; c_t uuid; c_t2 uuid;
  j jsonb; r record; n bigint; v bigint; d date;
begin
  select count(*) into n from public.ledger_lines;
  report := report || case when n = 0 then 'PASS' else 'FAIL (database not fresh)' end || ': the ledger starts empty' || E'\n';
  insert into auth.users (id, email) values (u_owner, 'p8-owner@example.invalid'), (u_closer, 'p8-closer@example.invalid'), (u_view, 'p8-view@example.invalid'), (u_none, 'p8-none@example.invalid');
  insert into public.profiles (id, display_name, role, permissions) values
    (u_owner, 'P8 Owner', 'owner', '{}'),
    (u_closer, 'P8 Closer', 'staff', array['closing.perform']),
    (u_view, 'P8 Viewer', 'staff', array['reports.view']),
    (u_none, 'P8 None', 'staff', '{}');

  -- ----------------------------------------------------------------- owner: opening balances counted yesterday
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.post_opening_balances(gen_random_uuid(), 1000000, 500000, 200000, yday);
  reset role;

  -- ----------------------------------------------------------------- permissions
  perform set_config('request.jwt.claim.sub', u_none::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_none::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.closing_start(yday);
    report := report || 'FAIL: a person with no permissions started a closing' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: closing needs the closing permission' || E'\n';
  end;
  begin
    perform public.closing_detail(yday);
    report := report || 'FAIL: a person with no permissions read a closing' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: ...and so does reading one' || E'\n';
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', u_view::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_view::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.closing_detail(yday);
  report := report || case when j ->> 'status' = 'none' then 'PASS' else 'FAIL' end || ': reports.view can read a closing (a day not started shows as none)' || E'\n';
  begin
    perform public.closing_start(yday);
    report := report || 'FAIL: reports.view started a closing' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: ...but cannot start one' || E'\n';
  end;
  reset role;

  -- ----------------------------------------------------------------- closer closes YESTERDAY with the drawer 5.00 over
  perform set_config('request.jwt.claim.sub', u_closer::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_closer::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.closing_start(today + 1);
    report := report || 'FAIL: a future day was started' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a day that has not started cannot be closed' || E'\n';
  end;
  c_y := public.closing_start(yday);
  j := public.closing_detail(yday);
  report := report || case when (j -> 'accounts' -> 0 ->> 'expected_cents')::bigint = 1000000 and j ->> 'status' = 'draft' then 'PASS' else 'FAIL (' || (j -> 'accounts' -> 0)::text || ')' end
            || ': yesterday shows the expected cash from the opening balance (10,000.00)' || E'\n';

  begin
    perform public.closing_save(c_y, null, '[{"code":"CASH_DRAWER","actual_cents":1000500},{"code":"GCASH_WALLET","actual_cents":500000},{"code":"LOAD_BALANCE","actual_cents":200000}]'::jsonb);
    report := report || 'FAIL: a difference was saved with no reason' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a difference needs a reason' || E'\n';
  end;
  begin
    perform public.closing_save(c_y, null, '[{"code":"CASH_DRAWER","actual_cents":1000500,"reason":"found a 5.00 coin"},{"code":"GCASH_WALLET","actual_cents":500000}]'::jsonb);
    perform public.closing_finalize(c_y);
    report := report || 'FAIL: a day was closed without counting the load balance' || E'\n';
  exception when check_violation then
    report := report || 'PASS: all three balances must be counted before closing' || E'\n';
  end;
  perform public.closing_save(c_y, 'first closing', '[{"code":"CASH_DRAWER","actual_cents":1000500,"reason":"found a 5.00 coin"},{"code":"GCASH_WALLET","actual_cents":500000},{"code":"LOAD_BALANCE","actual_cents":200000}]'::jsonb);
  j := public.closing_detail(yday);
  report := report || case when (j -> 'accounts' -> 0 ->> 'variance_cents')::bigint = 500 and (j -> 'accounts' -> 1 ->> 'variance_cents')::bigint = 0 then 'PASS' else 'FAIL' end
            || ': variance = counted - expected (+5.00 cash, 0 GCash)' || E'\n';
  perform public.closing_finalize(c_y);
  reset role;

  select balance_cents into v from public.account_balances where code = 'CASH_DRAWER';
  report := report || case when v = 1000500 then 'PASS' else 'FAIL (got ' || v || ')' end || ': the books now agree with the count: cash = 10,005.00 (an explicit entry, not an overwrite)' || E'\n';
  select balance_cents into v from public.account_balances where code = 'RECON_VARIANCE';
  report := report || case when v = -500 then 'PASS' else 'FAIL (got ' || v || ')' end || ': the 5.00 is recorded in the variance account (a gain), not as income from a customer' || E'\n';
  select je.business_date into d from public.journal_entries je join public.transactions t on t.id = je.transaction_id
   where t.adjustment_kind = 'variance_correction' limit 1;
  report := report || case when d = yday then 'PASS' else 'FAIL (got ' || d || ')' end || ': the adjusting entry is dated on the closing day, even though a non-owner closed it' || E'\n';
  select count(*) into n from public.closing_balances where closing_id = c_y and adjustment_entry_id is not null;
  report := report || case when n = 1 then 'PASS' else 'FAIL (got ' || n || ')' end || ': only the account with a difference has an adjusting entry' || E'\n';
  select count(*) into n from public.audit_log where action = 'closing.finalize' and actor_id = u_closer;
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': closing is audited with the closer as actor' || E'\n';

  begin
    update public.daily_closings set note = 'tampered' where id = c_y;
    report := report || 'FAIL: a final closing was edited' || E'\n';
  exception when restrict_violation then
    report := report || 'PASS: a final closing cannot be edited, even directly' || E'\n';
  end;
  begin
    update public.closing_balances set actual_cents = 1 where closing_id = c_y;
    report := report || 'FAIL: final closing balances were edited' || E'\n';
  exception when restrict_violation then
    report := report || 'PASS: ...nor its balances' || E'\n';
  end;

  -- ----------------------------------------------------------------- today: activity, a stale count, then close
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.post_cash_in(gen_random_uuid(), null, 100000, 2000, 'on_top');     -- cash +1,020.00, GCash -1,000.00
  reset role;

  perform set_config('request.jwt.claim.sub', u_closer::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_closer::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.closing_detail(today);
  report := report || case when (j -> 'accounts' -> 0 ->> 'opening_cents')::bigint = 1000500 and (j -> 'accounts' -> 0 ->> 'inflow_cents')::bigint = 102000 and (j -> 'accounts' -> 0 ->> 'expected_cents')::bigint = 1102500 then 'PASS' else 'FAIL (' || (j -> 'accounts' -> 0)::text || ')' end
            || ': today starts from the counted 10,005.00, adds 1,020.00 and expects 11,025.00' || E'\n';
  c_t := public.closing_start(today);
  perform public.closing_save(c_t, null, '[{"code":"CASH_DRAWER","actual_cents":1102500},{"code":"GCASH_WALLET","actual_cents":400000},{"code":"LOAD_BALANCE","actual_cents":200000}]'::jsonb);
  reset role;

  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.post_expense(gen_random_uuid(), null, 100, 'cash');            -- the books move while the closer counts
  reset role;

  perform set_config('request.jwt.claim.sub', u_closer::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_closer::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.closing_finalize(c_t);
    report := report || 'FAIL: a stale count was finalized after the books moved' || E'\n';
  exception when check_violation then
    report := report || 'PASS: if the books move while counting, closing is refused until the counts are saved again' || E'\n';
  end;
  perform public.closing_save(c_t, 'recounted', '[{"code":"CASH_DRAWER","actual_cents":1102400},{"code":"GCASH_WALLET","actual_cents":400000},{"code":"LOAD_BALANCE","actual_cents":200000}]'::jsonb);
  perform public.closing_finalize(c_t);
  j := public.closing_detail(today);
  report := report || case when j ->> 'status' = 'final' and (j -> 'accounts' -> 0 ->> 'variance_cents')::bigint = 0 then 'PASS' else 'FAIL' end || ': a balanced day closes with no adjusting entry' || E'\n';
  select count(*) into n from public.transactions where adjustment_kind = 'variance_correction';
  report := report || case when n = 1 then 'PASS' else 'FAIL (got ' || n || ')' end || ': still only the one adjusting entry from yesterday' || E'\n';
  begin
    perform public.closing_save(c_t, 'x', '[]'::jsonb);
    report := report || 'FAIL: a final closing was saved over' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a final closing cannot be saved over' || E'\n';
  end;
  begin
    perform public.closing_amend(today, 'closer trying');
    report := report || 'FAIL: a closer amended a day' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: only the owner can amend a closed day' || E'\n';
  end;
  reset role;

  -- ----------------------------------------------------------------- a closed day takes no new transactions until amended
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.post_cash_in(gen_random_uuid(), null, 1000, 0, 'on_top');
    report := report || 'FAIL: a transaction was posted on a closed day' || E'\n';
  exception when check_violation then
    report := report || 'PASS: nothing can be posted on a closed day' || E'\n';
  end;
  begin
    perform public.closing_amend(today, 'x');
    report := report || 'FAIL: an amendment with no real reason was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: an amendment needs a reason' || E'\n';
  end;
  c_t2 := public.closing_amend(today, 'a cash-in was forgotten');
  report := report || case when c_t2 is not null and c_t2 <> c_t then 'PASS' else 'FAIL' end || ': amending creates a NEW revision; the old closing is untouched' || E'\n';
  select count(*) into n from public.daily_closings where business_date = today;
  report := report || case when n = 2 then 'PASS' else 'FAIL' end || ': both revisions are kept' || E'\n';
  perform public.post_cash_in(gen_random_uuid(), null, 50000, 1000, 'on_top');   -- cash +510.00, GCash -500.00; expected cash 11,024.00 + 510.00 = 11,534.00
  report := report || 'PASS: the amended day accepts the correction' || E'\n';
  begin
    perform public.closing_amend(today, 'again');
    report := report || 'FAIL: a day already being amended was amended again' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a day under amendment cannot be amended again' || E'\n';
  end;
  perform public.closing_save(c_t2, null, '[{"code":"CASH_DRAWER","actual_cents":1153400},{"code":"GCASH_WALLET","actual_cents":350000},{"code":"LOAD_BALANCE","actual_cents":200000}]'::jsonb);
  perform public.closing_finalize(c_t2);
  j := public.closing_detail(today);
  report := report || case when (j ->> 'revision')::int = 2 and j ->> 'status' = 'final' then 'PASS' else 'FAIL' end || ': revision 2 closes and becomes the current closing' || E'\n';
  select count(*) into n from public.list_closings(50, 0);
  report := report || case when n = 3 then 'PASS' else 'FAIL (got ' || n || ')' end || ': the history lists every final closing (yesterday, today rev 1, today rev 2)' || E'\n';

  -- ----------------------------------------------------------------- reports
  select count(*) into n from public.report_discrepancies(yday, today);
  report := report || case when n = 1 then 'PASS' else 'FAIL (got ' || n || ')' end || ': the discrepancy report lists the one 5.00 difference' || E'\n';
  select * into r from public.report_float_movement(yday, today) where code = 'CASH_DRAWER';
  report := report || case when r.opening_cents = 0 and r.closing_cents = (select balance_cents from public.account_balances where code = 'CASH_DRAWER') then 'PASS' else 'FAIL' end
            || ': the movement report ends at the account balance and starts at zero before the first entry' || E'\n';
  select * into r from public.report_period(yday, today);
  report := report || case when r.fees_cents = 3000 and r.cash_in_count = 2 and r.cash_in_volume_cents = 150000 then 'PASS' else 'FAIL (' || r.fees_cents || '/' || r.cash_in_count || ')' end
            || ': the period report counts two cash-ins (1,500.00) and 30.00 in fees' || E'\n';
  report := report || case when r.net_profit_cents = r.fees_cents + r.load_margin_cents - r.provider_cost_cents - r.expenses_cents - r.write_offs_cents then 'PASS' else 'FAIL' end
            || ': profit = earned minus costs, and excludes counting differences' || E'\n';
  report := report || case when r.variance_cents = -500 then 'PASS' else 'FAIL (got ' || r.variance_cents || ')' end || ': the counting difference (a 5.00 gain) is reported on its own line' || E'\n';
  begin
    perform * from public.report_period(today, yday);
    report := report || 'FAIL: a backwards range was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a backwards report range is refused' || E'\n';
  end;
  j := public.dashboard_facts();
  report := report || case when jsonb_array_length(j -> 'discrepancies') = 1 and jsonb_array_length(j -> 'unreconciled_dates') = 0 then 'PASS' else 'FAIL (' || (j ->> 'discrepancies') || ' / ' || (j ->> 'unreconciled_dates') || ')' end
            || ': the dashboard facts show the discrepancy and no unclosed days' || E'\n';
  select coalesce(sum(amount_cents), 0) into v from public.ledger_lines;
  report := report || case when v = 0 then 'PASS' else 'FAIL' end || ': the whole ledger still sums to zero' || E'\n';
  reset role;

  failures := (length(report) - length(replace(report, 'FAIL', ''))) / 4;
  raise exception E'PHASE 8 CHECKS: % failure(s). This error is intentional so that nothing is saved.\n%', failures, report;
end;
$$;
