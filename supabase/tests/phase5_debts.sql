-- Kabisera Ledger · Phase 5 debt-module checks  (generated once from supabase/seed/opening-debts.json)
--
-- WRITTEN BUT NOT EXECUTED by the assistant (no PostgreSQL was available).
-- Run on a FRESH local database (`npm run db:reset`) BEFORE importing your real opening debts, in Studio's SQL editor.
-- Everything is rolled back; the script ENDS WITH AN ERROR ON PURPOSE and the message is the report.
-- The first line must say 0 failure(s) and every line must start with PASS.

do $$
declare
  report text := '';
  failures int;
  u_owner uuid := gen_random_uuid();
  u_rec   uuid := gen_random_uuid();   -- repayments.record + debts.view
  u_none  uuid := gen_random_uuid();
  payload jsonb;
  r record;
  n bigint; v bigint; b boolean;
  c_ceejay uuid; c_cj uuid; c_jh uuid; d_jh uuid; d_ceejay uuid; c_new uuid;
  tx_adj uuid; tx_rep uuid; idem uuid := gen_random_uuid(); idem2 uuid := gen_random_uuid();
begin
  select count(*) into n from public.ledger_lines;
  report := report || case when n = 0 then 'PASS' else 'FAIL (database not fresh: run npm run db:reset first)' end
            || ': the ledger starts empty' || E'\n';

  insert into auth.users (id, email) values
    (u_owner, 'p5-owner@example.invalid'), (u_rec, 'p5-rec@example.invalid'), (u_none, 'p5-none@example.invalid');
  insert into public.profiles (id, display_name, role, permissions) values
    (u_owner, 'P5 Owner', 'owner', '{}'),
    (u_rec, 'P5 Recorder', 'staff', array['repayments.record', 'debts.view']),
    (u_none, 'P5 None', 'staff', '{}');

  payload := jsonb_build_array(
    jsonb_build_object('seed_key', 'opening-debt:jhanrey', 'display_name', 'Jhanrey', 'amount_cents', 30500),
    jsonb_build_object('seed_key', 'opening-debt:ralfh', 'display_name', 'Ralfh', 'amount_cents', 202400),
    jsonb_build_object('seed_key', 'opening-debt:thy', 'display_name', 'Thy', 'amount_cents', 21000),
    jsonb_build_object('seed_key', 'opening-debt:ken', 'display_name', 'Ken', 'amount_cents', 204500),
    jsonb_build_object('seed_key', 'opening-debt:denver', 'display_name', 'Denver', 'amount_cents', 20500),
    jsonb_build_object('seed_key', 'opening-debt:cee-jay', 'display_name', 'Cee jay', 'amount_cents', 100000),
    jsonb_build_object('seed_key', 'opening-debt:von', 'display_name', 'Von', 'amount_cents', 239000),
    jsonb_build_object('seed_key', 'opening-debt:gab', 'display_name', 'Gab', 'amount_cents', 200000),
    jsonb_build_object('seed_key', 'opening-debt:cj', 'display_name', 'Cj', 'amount_cents', 88500),
    jsonb_build_object('seed_key', 'opening-debt:alexis', 'display_name', 'Alexis', 'amount_cents', 6500),
    jsonb_build_object('seed_key', 'opening-debt:isid', 'display_name', 'Isid', 'amount_cents', 22000));

  -- ----------------------------------------------------------------- permissions
  perform set_config('request.jwt.claim.sub', u_rec::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_rec::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.import_opening_debts('x test', 1134900, payload);
    report := report || 'FAIL: staff imported opening debts' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: only the owner can import opening debts' || E'\n';
  end;
  begin
    perform public.debt_adjust(gen_random_uuid(), gen_random_uuid(), -100, 'staff trying');
    report := report || 'FAIL: staff adjusted a debt' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: only the owner can adjust a debt' || E'\n';
  end;
  reset role;

  -- ----------------------------------------------------------------- the import (as owner)
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    perform * from public.import_opening_debts('Reported by the owner', 1134900 + 1, payload);
    report := report || 'FAIL: a wrong expected total was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: the import refuses a total that does not match' || E'\n';
  end;

  select * into r from public.import_opening_debts('Reported by the owner. Not derived from transaction records.', 1134900, payload);
  report := report || case when r.total_cents = 1134900 and r.debts_created = 11 and r.customers_created = 11 and not r.was_duplicate then 'PASS' else 'FAIL' end
            || ': 11 debts and customers are created, totalling exactly 11,349.00' || E'\n';
  select coalesce(sum(outstanding_cents), 0) into v from public.customer_receivable_balances;
  report := report || case when v = 1134900 then 'PASS' else 'FAIL (got ' || v || ')' end || ': the ledger shows 11,349.00 owed by customers' || E'\n';
  select coalesce(sum(outstanding_cents), 0) into v from public.debt_balances;
  report := report || case when v = 1134900 then 'PASS' else 'FAIL (got ' || v || ')' end || ': the debt records agree with the ledger' || E'\n';
  select coalesce(sum(balance_cents), 0) into v from public.account_balances where code in ('CASH_DRAWER', 'GCASH_WALLET', 'LOAD_BALANCE');
  report := report || case when v = 0 then 'PASS' else 'FAIL' end || ': importing debts does not touch cash, GCash or load' || E'\n';
  select balance_cents into v from public.account_balances where code in ('FEE_INCOME') ;
  report := report || case when v = 0 then 'PASS' else 'FAIL' end || ': ...and creates no income' || E'\n';
  select balance_cents into v from public.account_balances where code = 'OPENING_BALANCE_EQUITY';
  report := report || case when v = 1134900 then 'PASS' else 'FAIL (got ' || v || ')' end || ': the offset is "opening balances" equity' || E'\n';

  select count(*) into n from public.import_batches where kind = 'opening_debts' and not date_known and reported_on is null;
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': the batch records that the original date is unknown' || E'\n';
  select count(*) into n from public.debts where origin = 'opening' and source_transaction_id is not null and import_batch_id is not null;
  report := report || case when n = 11 then 'PASS' else 'FAIL' end || ': every opening debt points to its import batch and transaction' || E'\n';

  select id into c_ceejay from public.customers where seed_key = 'opening-debt:cee-jay';
  select id into c_cj from public.customers where seed_key = 'opening-debt:cj';
  report := report || case when c_ceejay is not null and c_cj is not null and c_ceejay <> c_cj then 'PASS' else 'FAIL' end
            || ': "Cee jay" and "Cj" are two different customers' || E'\n';
  select outstanding_cents into v from public.debt_balances where customer_id = c_ceejay;
  report := report || case when v = 100000 then 'PASS' else 'FAIL (got ' || v || ')' end || ': Cee jay owes 1,000.00' || E'\n';
  select outstanding_cents into v from public.debt_balances where customer_id = c_cj;
  report := report || case when v = 88500 then 'PASS' else 'FAIL (got ' || v || ')' end || ': Cj owes 885.00' || E'\n';

  -- running it again changes nothing
  select * into r from public.import_opening_debts('Reported by the owner. Not derived from transaction records.', 1134900, payload);
  report := report || case when r.was_duplicate and r.debts_created = 0 then 'PASS' else 'FAIL' end || ': importing the same list again is recognised and adds nothing' || E'\n';
  select count(*) into n from public.debts;
  report := report || case when n = 11 then 'PASS' else 'FAIL (got ' || n || ')' end || ': there are still exactly 11 debts' || E'\n';
  select count(*) into n from public.customers;
  report := report || case when n = 11 then 'PASS' else 'FAIL (got ' || n || ')' end || ': ...and 11 customers' || E'\n';
  select count(*) into n from public.import_batches;
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': ...and one import batch' || E'\n';

  -- ----------------------------------------------------------------- reports
  select * into r from public.debt_summary();
  report := report || case when r.total_outstanding_cents = 1134900 and r.customers_owing = 11 and r.unknown_date_cents = 1134900 and r.overdue_cents = 0 then 'PASS' else 'FAIL' end
            || ': the summary says 11,349.00 owed by 11 customers, all with unknown dates, none overdue' || E'\n';
  select count(*) into n from public.debt_aging() where bucket = 'Date unknown' and outstanding_cents = 1134900;
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': opening debts are aged as "Date unknown", never guessed' || E'\n';
  select count(*) into n from public.list_debts();
  report := report || case when n = 11 then 'PASS' else 'FAIL (got ' || n || ')' end || ': the debt list shows all of them' || E'\n';
  select count(*) into n from public.list_debts(p_query => 'cee');
  report := report || case when n = 1 then 'PASS' else 'FAIL (got ' || n || ')' end || ': searching "cee" finds only Cee jay' || E'\n';

  -- ----------------------------------------------------------------- repayment (needs money to land in; opening balance first)
  perform public.post_opening_balances(gen_random_uuid(), 1000000, 1000000, 0);
  select id into d_jh from public.debts where seed_key = 'opening-debt:jhanrey';
  select customer_id into c_jh from public.debts where id = d_jh;
  reset role;

  perform set_config('request.jwt.claim.sub', u_rec::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_rec::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select t.tx_id into tx_rep from public.post_repayment(idem, c_jh, 10000, 'cash') t;
  select outstanding_cents into v from public.debt_balances where debt_id = d_jh;
  report := report || case when v = 20500 then 'PASS' else 'FAIL (got ' || v || ')' end || ': a partial repayment of 100.00 leaves 205.00 (305.00 - 100.00)' || E'\n';
  select debt_status into r from public.debt_balances where debt_id = d_jh;
  report := report || case when r.debt_status = 'partially_paid' then 'PASS' else 'FAIL (' || r.debt_status || ')' end || ': ...and the debt is part paid' || E'\n';
  select balance_cents into v from public.account_balances where code = 'FEE_INCOME';
  report := report || case when v = 0 then 'PASS' else 'FAIL' end || ': the repayment is not revenue' || E'\n';
  select t.tx_id into tx_rep from public.post_repayment(gen_random_uuid(), c_jh, 20500, 'gcash') t;
  select outstanding_cents, debt_status into r from public.debt_balances where debt_id = d_jh;
  report := report || case when r.outstanding_cents = 0 and r.debt_status = 'paid' then 'PASS' else 'FAIL' end || ': paying the rest marks the debt paid' || E'\n';
  select count(*) into n from public.debts where id = d_jh;
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': ...and the debt record is kept' || E'\n';
  select count(*) into n from public.debt_allocations where debt_id = d_jh;
  report := report || case when n = 2 then 'PASS' else 'FAIL (got ' || n || ')' end || ': ...with both repayments on its ledger' || E'\n';
  begin
    perform public.post_repayment(gen_random_uuid(), c_jh, 1, 'cash');
    report := report || 'FAIL: a repayment was accepted on a debt that is fully paid' || E'\n';
  exception when check_violation then
    report := report || 'PASS: nothing more can be repaid once it is paid' || E'\n';
  end;
  select count(*) into n from public.customer_debt_events(c_jh) where event_kind = 'repayment';
  report := report || case when n = 2 then 'PASS' else 'FAIL' end || ': the customer''s debt history still lists both repayments' || E'\n';
  reset role;

  -- ----------------------------------------------------------------- owner adjustments
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select id into d_ceejay from public.debts where customer_id = c_ceejay;
  begin
    perform public.debt_adjust(gen_random_uuid(), d_ceejay, -100, 'x');
    report := report || 'FAIL: an adjustment with no real reason was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: an adjustment needs a reason' || E'\n';
  end;
  begin
    perform public.debt_adjust(gen_random_uuid(), d_ceejay, -100001, 'too much');
    report := report || 'FAIL: a debt was reduced below zero' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a debt cannot be reduced below zero' || E'\n';
  end;
  select t.tx_id into tx_adj from public.debt_adjust(idem2, d_ceejay, -2500, 'agreed discount') t;
  select outstanding_cents into v from public.debt_balances where debt_id = d_ceejay;
  report := report || case when v = 97500 then 'PASS' else 'FAIL (got ' || v || ')' end || ': a 25.00 discount leaves 975.00' || E'\n';
  select balance_cents into v from public.account_balances where code = 'DEBT_ADJUSTMENTS';
  report := report || case when v = 2500 then 'PASS' else 'FAIL (got ' || v || ')' end || ': ...booked as a 25.00 cost, not as cash' || E'\n';
  select count(*) into n from public.debt_adjustments where debt_id = d_ceejay and reason = 'agreed discount' and approved_by = u_owner;
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': the adjustment records its reason and approver' || E'\n';
  select t.was_duplicate into b from public.debt_adjust(idem2, d_ceejay, -2500, 'agreed discount') t;
  select outstanding_cents into v from public.debt_balances where debt_id = d_ceejay;
  report := report || case when b and v = 97500 then 'PASS' else 'FAIL' end || ': repeating the same adjustment request changes nothing' || E'\n';

  perform public.void_transaction(tx_adj, 'discount cancelled');
  select outstanding_cents into v from public.debt_balances where debt_id = d_ceejay;
  report := report || case when v = 100000 then 'PASS' else 'FAIL (got ' || v || ')' end || ': voiding the adjustment restores the debt' || E'\n';
  select coalesce(sum(outstanding_cents), 0) into v from public.customer_receivable_balances where customer_id = c_ceejay;
  report := report || case when v = 100000 then 'PASS' else 'FAIL (got ' || v || ')' end || ': ...and the ledger agrees' || E'\n';

  -- a cash advance with a due date becomes overdue; an unknown date is never overdue
  c_new := public.customer_create('P5 Borrower');
  perform public.post_debt_creation(gen_random_uuid(), c_new, 5000, 'cash', current_date - 3, 'p5 test');
  select count(*) into n from public.list_debts(p_overdue_only => true);
  report := report || case when n = 1 then 'PASS' else 'FAIL (got ' || n || ')' end || ': a debt past its due date is overdue (and only that one)' || E'\n';
  select t.tx_id into tx_rep from public.post_repayment(gen_random_uuid(), c_new, 5000, 'cash') t;
  select count(*) into n from public.list_debts(p_overdue_only => true);
  report := report || case when n = 0 then 'PASS' else 'FAIL' end || ': ...and stops being overdue once paid' || E'\n';

  select coalesce(sum(amount_cents), 0) into v from public.ledger_lines;
  report := report || case when v = 0 then 'PASS' else 'FAIL' end || ': the whole ledger still sums to zero' || E'\n';
  reset role;

  failures := (length(report) - length(replace(report, 'FAIL', ''))) / 4;
  raise exception E'PHASE 5 CHECKS: % failure(s). This error is intentional so that nothing is saved.\n%', failures, report;
end;
$$;
