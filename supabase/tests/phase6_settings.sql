-- Kabisera Ledger · Phase 6 settings checks
--
-- WRITTEN BUT NOT EXECUTED by the assistant (no PostgreSQL was available).
-- Run on a FRESH local database in Studio's SQL editor. Rolled back; ends with an intentional error whose
-- message is the report. First line must say 0 failure(s); every line must start with PASS.

do $$
declare
  report text := '';
  failures int;
  u_owner uuid := gen_random_uuid();
  u_staff uuid := gen_random_uuid();
  rule1 uuid; rule2 uuid; prod uuid; cat uuid;
  n bigint; v bigint; s jsonb; thr bigint;
begin
  insert into auth.users (id, email) values (u_owner, 'p6-owner@example.invalid'), (u_staff, 'p6-staff@example.invalid');
  insert into public.profiles (id, display_name, role, permissions) values
    (u_owner, 'P6 Owner', 'owner', '{}'),
    (u_staff, 'P6 Staff', 'staff', array['transactions.record']);

  -- staff cannot change anything
  perform set_config('request.jwt.claim.sub', u_staff::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.save_app_setting('policy.allow_negative_floats', 'true'::jsonb);
    report := report || 'FAIL: staff changed a setting' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: staff cannot change settings' || E'\n';
  end;
  begin
    perform public.save_fee_rule(null, 'cash_in', 'x', 'on_top', 0, null, 100, 0, current_date, null, true);
    report := report || 'FAIL: staff added a fee rule' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: staff cannot add fee rules' || E'\n';
  end;
  begin
    perform public.set_account_threshold('CASH_DRAWER', 100);
    report := report || 'FAIL: staff set a warning level' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: staff cannot set warning levels' || E'\n';
  end;
  select count(*) into n from public.fee_rules;
  reset role;

  -- owner
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- fee rules
  rule1 := public.save_fee_rule(null, 'cash_in', 'Small', 'on_top', 0, 50001, 1000, 0, date '2026-01-01', null, true);
  rule2 := public.save_fee_rule(null, 'cash_in', 'Large', 'on_top', 50001, null, 0, 200, date '2026-01-01', null, true);
  report := report || case when rule1 is not null and rule2 is not null then 'PASS' else 'FAIL' end || ': the owner can add adjacent fee tiers' || E'\n';
  begin
    perform public.save_fee_rule(null, 'cash_in', 'Overlap', 'on_top', 0, 100000, 500, 0, date '2026-01-01', null, true);
    report := report || 'FAIL: an overlapping rule was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: an overlapping rule is refused with a plain message' || E'\n';
  end;
  perform public.save_fee_rule(rule1, 'cash_in', 'Small (edited)', 'deducted', 0, 50001, 1500, 0, date '2026-01-01', null, true);
  select count(*) into n from public.fee_rules where id = rule1 and name = 'Small (edited)' and flat_fee_cents = 1500 and fee_mode = 'deducted';
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': a rule can be edited' || E'\n';
  perform public.save_fee_rule(rule1, 'cash_in', 'Small (edited)', 'deducted', 0, 50001, 1500, 0, date '2026-01-01', null, false);
  perform public.save_fee_rule(null, 'cash_in', 'Replacement', 'on_top', 0, 50001, 500, 0, date '2026-01-01', null, true);
  report := report || 'PASS: switching a rule off lets another cover its range' || E'\n';
  begin
    perform public.save_fee_rule(null, 'mobile_load', 'x', 'on_top', 0, null, 100, 0, current_date, null, true);
    report := report || 'FAIL: a load fee rule was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: fee rules are only for cash-in and cash-out' || E'\n';
  end;
  begin
    perform public.save_fee_rule(null, 'cash_out', 'Bad range', 'on_top', 1000, 500, 0, 100, current_date, null, true);
    report := report || 'FAIL: a backwards amount range was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a backwards amount range is refused' || E'\n';
  end;

  -- history is not rewritten: a transaction keeps the fee it used
  perform public.post_opening_balances(gen_random_uuid(), 10000000, 10000000, 1000000);
  select t.tx_id into rule1 from public.post_cash_in(gen_random_uuid(), null, 10000, 1000, 'on_top') t;
  perform public.save_fee_rule((select id from public.fee_rules where name = 'Replacement'), 'cash_in', 'Replacement', 'on_top', 0, 50001, 9999, 0, date '2026-01-01', null, true);
  select fee_cents into v from public.transactions where id = rule1;
  report := report || case when v = 1000 then 'PASS' else 'FAIL (got ' || v || ')' end || ': changing a fee rule does not change a past transaction''s fee' || E'\n';

  -- settings whitelist
  perform public.save_app_setting('fees.cash_in.default_mode', '"deducted"'::jsonb);
  select value into s from public.app_settings where key = 'fees.cash_in.default_mode';
  report := report || case when s = '"deducted"'::jsonb then 'PASS' else 'FAIL' end || ': a setting can be changed' || E'\n';
  begin
    perform public.save_app_setting('fees.cash_in.default_mode', '"free"'::jsonb);
    report := report || 'FAIL: an invalid fee mode was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: an invalid value is refused' || E'\n';
  end;
  begin
    perform public.save_app_setting('policy.debt_overpayment', '"accept"'::jsonb);
    report := report || 'FAIL: a fixed integrity rule was changed' || E'\n';
  exception when check_violation then
    report := report || 'PASS: fixed integrity rules cannot be changed from settings' || E'\n';
  end;

  -- the require-reference policy is enforced when posting
  perform public.save_app_setting('policy.require_gcash_reference', 'true'::jsonb);
  begin
    perform public.post_cash_in(gen_random_uuid(), null, 10000, 100, 'on_top');
    report := report || 'FAIL: a cash-in without a reference was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: with the policy on, a cash-in needs a GCash reference' || E'\n';
  end;
  perform public.post_cash_in(gen_random_uuid(), null, 10000, 100, 'on_top', 0, 0, 'REF123');
  report := report || 'PASS: ...and with a reference it posts' || E'\n';
  perform public.post_expense(gen_random_uuid(), null, 100, 'cash');
  report := report || 'PASS: the policy does not affect other transaction types' || E'\n';
  perform public.save_app_setting('policy.require_gcash_reference', 'false'::jsonb);

  -- load products and categories
  prod := public.save_load_product(null, 'Globe', 'Regular', 'prepaid_wallet', 9700, true);
  report := report || case when prod is not null then 'PASS' else 'FAIL' end || ': the owner can add a load product' || E'\n';
  begin
    perform public.save_load_product(null, 'Globe', 'Regular', 'prepaid_wallet', 9700, true);
    report := report || 'FAIL: a duplicate product was added' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a duplicate product is refused with a plain message' || E'\n';
  end;
  begin
    perform public.save_load_product(null, 'Smart', 'Big', 'prepaid_wallet', 10001, true);
    report := report || 'FAIL: a cost share above 100% was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a cost share above 100% is refused' || E'\n';
  end;
  cat := public.save_expense_category(null, 'Rent', true);
  begin
    perform public.save_expense_category(null, ' rent ', true);
    report := report || 'FAIL: a duplicate category was added' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a duplicate category is refused (case and spaces ignored)' || E'\n';
  end;
  perform public.save_expense_category(cat, 'Rent and utilities', false);
  perform public.post_expense(gen_random_uuid(), null, 100, 'cash');
  begin
    perform public.post_expense(gen_random_uuid(), cat, 100, 'cash');
    report := report || 'FAIL: an inactive category was used' || E'\n';
  exception when check_violation then
    report := report || 'PASS: an inactive expense category cannot be used' || E'\n';
  end;

  -- thresholds
  perform public.set_account_threshold('CASH_DRAWER', 500000);
  select low_threshold_cents into thr from public.accounts where code = 'CASH_DRAWER';
  report := report || case when thr = 500000 then 'PASS' else 'FAIL' end || ': a warning level can be set' || E'\n';
  perform public.set_account_threshold('CASH_DRAWER', null);
  select low_threshold_cents into thr from public.accounts where code = 'CASH_DRAWER';
  report := report || case when thr is null then 'PASS' else 'FAIL' end || ': ...and cleared' || E'\n';
  begin
    perform public.set_account_threshold('FEE_INCOME', 100);
    report := report || 'FAIL: a warning level was set on an income account' || E'\n';
  exception when check_violation then
    report := report || 'PASS: only cash, GCash and load can have warning levels' || E'\n';
  end;
  begin
    perform public.set_account_threshold('CASH_DRAWER', -1);
    report := report || 'FAIL: a negative level was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a negative warning level is refused' || E'\n';
  end;
  reset role;

  select count(*) into n from public.audit_log where entity_type = 'fee_rules' and actor_id = u_owner;
  report := report || case when n >= 3 then 'PASS' else 'FAIL (got ' || n || ')' end || ': fee rule changes are audited with the owner as actor' || E'\n';
  select count(*) into n from public.audit_log where entity_type = 'app_settings' and actor_id = u_owner;
  report := report || case when n >= 1 then 'PASS' else 'FAIL' end || ': setting changes are audited' || E'\n';

  failures := (length(report) - length(replace(report, 'FAIL', ''))) / 4;
  raise exception E'PHASE 6 CHECKS: % failure(s). This error is intentional so that nothing is saved.\n%', failures, report;
end;
$$;
