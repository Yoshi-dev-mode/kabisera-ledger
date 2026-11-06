-- Kabisera Ledger · Phase 4 customer and history checks
--
-- WRITTEN BUT NOT EXECUTED by the assistant (no PostgreSQL was available).
-- Run on a FRESH local database (`npm run db:reset`), in Studio's SQL editor. Same format as the other scripts:
-- everything is rolled back; the script ENDS WITH AN ERROR ON PURPOSE and the message is the report.
-- The first line must say 0 failure(s) and every line must start with PASS.

do $$
declare
  report text := '';
  failures int;
  u_owner uuid := gen_random_uuid();
  u_mgr   uuid := gen_random_uuid();   -- customers.manage + customers.view
  u_rec   uuid := gen_random_uuid();   -- transactions.record only
  u_none  uuid := gen_random_uuid();
  c_ken uuid; c_cee uuid; c_cj uuid; c_dup uuid;
  tx1 uuid; tx2 uuid; tx3 uuid;
  n bigint; v bigint; b boolean; s text; j jsonb; rec record;
begin
  insert into auth.users (id, email) values
    (u_owner, 'p4-owner@example.invalid'), (u_mgr, 'p4-mgr@example.invalid'),
    (u_rec, 'p4-rec@example.invalid'), (u_none, 'p4-none@example.invalid');
  insert into public.profiles (id, display_name, role, permissions) values
    (u_owner, 'P4 Owner', 'owner', '{}'),
    (u_mgr, 'P4 Manager', 'staff', array['customers.manage', 'customers.view', 'repayments.record']),
    (u_rec, 'P4 Recorder', 'staff', array['transactions.record']),
    (u_none, 'P4 None', 'staff', '{}');

  -- ----------------------------------------------------------------- owner sets up money and posts
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.post_opening_balances(gen_random_uuid(), 10000000, 10000000, 1000000);
  c_ken := public.customer_create('Ken', '09170000001', 'p4 note');
  c_cee := public.customer_create('Cee jay');
  c_cj  := public.customer_create('Cj');
  report := report || case when c_ken is not null and c_cee is not null and c_cj is not null then 'PASS' else 'FAIL' end
            || ': the owner can add customers ("Cee jay" and "Cj" are separate people)' || E'\n';

  begin
    perform public.customer_create('  KEN ');
    report := report || 'FAIL: an exact duplicate name was added' || E'\n';
  exception when check_violation then
    report := report || 'PASS: an exact duplicate name is blocked' || E'\n';
  end;
  c_dup := public.customer_create('Ken', null, null, true);
  report := report || case when c_dup is not null then 'PASS' else 'FAIL' end || ': only the owner can force a duplicate' || E'\n';

  select count(*) into n from public.find_similar_customers('Cee jay') where match_kind = 'exact';
  report := report || case when n = 1 then 'PASS' else 'FAIL (got ' || n || ')' end || ': an exact match is found' || E'\n';
  select count(*) into n from public.find_similar_customers('Cj') where id = c_cee;
  report := report || case when n = 0 then 'PASS' else 'FAIL' end || ': "Cj" is not flagged as similar to "Cee jay"' || E'\n';
  select count(*) into n from public.find_similar_customers('Kenn') where id = c_ken and match_kind = 'similar';
  report := report || case when n = 1 then 'PASS' else 'FAIL (got ' || n || ')' end || ': a one-letter typo is flagged as similar' || E'\n';

  -- credit sale for Ken (unpaid 520.00), a plain cash-in for Cee jay
  select t.tx_id into tx1 from public.post_cash_in(gen_random_uuid(), c_ken, 100000, 2000, 'on_top', 52000) t;
  select t.tx_id into tx2 from public.post_cash_in(gen_random_uuid(), c_cee, 50000, 1000, 'on_top') t;
  reset role;

  -- ----------------------------------------------------------------- staff post their own
  perform set_config('request.jwt.claim.sub', u_rec::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_rec::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select t.tx_id into tx3 from public.post_cash_in(gen_random_uuid(), null, 1000, 20, 'on_top') t;
  select count(*) into n from public.list_transactions();
  report := report || case when n = 1 then 'PASS' else 'FAIL (saw ' || n || ')' end || ': a recorder sees only their own transactions in the list' || E'\n';
  j := public.transaction_detail(tx1);
  report := report || case when j is null then 'PASS' else 'FAIL' end || ': ...and cannot open someone else''s transaction' || E'\n';
  j := public.transaction_detail(tx3);
  report := report || case when j is not null then 'PASS' else 'FAIL' end || ': ...but can open their own' || E'\n';
  begin
    perform public.customer_overview(c_ken);
    report := report || 'FAIL: a recorder read a customer overview' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: a recorder cannot read customer history totals' || E'\n';
  end;
  begin
    perform public.customer_create('Nope');
    report := report || 'FAIL: a recorder added a customer' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: only people with customers.manage can add customers' || E'\n';
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', u_none::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_none::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.list_customers();
    report := report || 'FAIL: a person with no permissions listed customers' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: a person with no permissions cannot list customers' || E'\n';
  end;
  begin
    perform * from public.list_transactions();
    report := report || 'FAIL: a person with no permissions listed transactions' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: ...or transactions' || E'\n';
  end;
  reset role;

  -- ----------------------------------------------------------------- manager: history, search, archive
  perform set_config('request.jwt.claim.sub', u_mgr::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_mgr::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from public.list_transactions(p_customer_id => c_ken);
  report := report || case when n = 1 then 'PASS' else 'FAIL (got ' || n || ')' end || ': the customer filter returns only that customer''s transactions' || E'\n';
  select count(*) into n from public.list_transactions();
  report := report || case when n = 3 then 'PASS' else 'FAIL (got ' || n || ')' end || ': a customers.view reader sees all transactions' || E'\n';
  select total_count into v from public.list_transactions(p_limit => 1);
  report := report || case when v = 3 then 'PASS' else 'FAIL (got ' || v || ')' end || ': total_count counts every match, not just the page' || E'\n';
  select count(*) into n from public.list_transactions(p_limit => 1, p_offset => 2);
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': paging by offset works' || E'\n';
  select count(*) into n from public.list_transactions(p_types => array['cash_out']::public.transaction_type[]);
  report := report || case when n = 0 then 'PASS' else 'FAIL' end || ': the type filter works' || E'\n';
  select count(*) into n from public.list_transactions(p_search => '%');
  report := report || case when n = 0 then 'PASS' else 'FAIL (got ' || n || ')' end || ': a search for % is treated as text, not a wildcard' || E'\n';
  select count(*) into n from public.list_transactions(p_search => 'Cee');
  report := report || case when n = 1 then 'PASS' else 'FAIL (got ' || n || ')' end || ': searching by customer name works' || E'\n';
  select count(*) into n from public.list_transactions(p_from => current_date + 5);
  report := report || case when n = 0 then 'PASS' else 'FAIL' end || ': the date filter works' || E'\n';
  select shop_cash_cents, shop_gcash_cents into rec from public.list_transactions(p_customer_id => c_ken);
  report := report || case when rec.shop_cash_cents = 50000 and rec.shop_gcash_cents = -100000 then 'PASS' else 'FAIL (' || rec.shop_cash_cents || '/' || rec.shop_gcash_cents || ')' end
            || ': shop cash and GCash movement come from the posting (cash 500.00 in, wallet 1,000.00 out)' || E'\n';

  select * into rec from public.customer_overview(c_ken);
  report := report || case when rec.outstanding_cents = 52000 and rec.cash_in_cents = 100000 and rec.fee_cents = 2000 and rec.transaction_count = 1 then 'PASS' else 'FAIL' end
            || ': the overview separates what is owed (520.00) from activity (cash-in 1,000.00, fees 20.00)' || E'\n';

  select count(*) into n from public.customer_debt_events(c_ken) where event_kind = 'debt' and amount_cents = 52000 and date_known;
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': the debt ledger lists the unpaid amount with a known date' || E'\n';

  select count(*) into n from public.list_customers(p_query => 'ken');
  report := report || case when n = 2 then 'PASS' else 'FAIL (got ' || n || ')' end || ': search finds both "Ken" records (a forced duplicate)' || E'\n';
  select count(*) into n from public.list_customers(p_query => '091700');
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': search by contact number works' || E'\n';
  select count(*) into n from public.list_customers(p_only_with_debt => true);
  report := report || case when n = 1 then 'PASS' else 'FAIL (got ' || n || ')' end || ': the "owes money" filter works' || E'\n';
  select outstanding_cents into v from public.list_customers(p_query => 'Cee');
  report := report || case when v = 0 then 'PASS' else 'FAIL' end || ': a customer who owes nothing shows 0' || E'\n';

  begin
    perform public.customer_archive(c_ken, 'moved away');
    report := report || 'FAIL: a manager archived a customer who still owes money' || E'\n';
  exception when check_violation then
    report := report || 'PASS: only the owner can archive a customer who still owes money' || E'\n';
  end;
  perform public.customer_archive(c_cee, 'stopped coming');
  select count(*) into n from public.customers where id = c_cee and status = 'archived' and archive_reason = 'stopped coming';
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': a customer who owes nothing can be archived by a manager' || E'\n';
  select count(*) into n from public.list_transactions(p_customer_id => c_cee);
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': an archived customer keeps their transaction history' || E'\n';
  begin
    perform public.post_cash_in(gen_random_uuid(), c_cee, 1000, 0, 'on_top');
    report := report || 'FAIL: a transaction was posted for an archived customer' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: (this manager cannot post transactions, so the archived-customer rule is checked below)' || E'\n';
  end;
  perform public.customer_restore(c_cee);
  select count(*) into n from public.customers where id = c_cee and status = 'active' and archived_at is null;
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': a customer can be restored' || E'\n';
  perform public.customer_update(c_cj, 'Cj', '09170000002', null);
  begin
    perform public.customer_update(c_cj, 'Ken');
    report := report || 'FAIL: a customer was renamed to an existing name' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a customer cannot be renamed to another customer''s name' || E'\n';
  end;
  reset role;

  -- an archived customer cannot receive new transactions (as the owner)
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.customer_archive(c_cj, 'test');
  begin
    perform public.post_cash_in(gen_random_uuid(), c_cj, 1000, 0, 'on_top');
    report := report || 'FAIL: a transaction was posted for an archived customer' || E'\n';
  exception when check_violation then
    report := report || 'PASS: an archived customer cannot receive new transactions' || E'\n';
  end;
  reset role;

  select count(*) into n from public.audit_log where entity_type = 'customers' and action = 'customers.update';
  report := report || case when n >= 3 then 'PASS' else 'FAIL (got ' || n || ')' end || ': archive, restore and edit are audited' || E'\n';
  select count(*) into n from public.audit_log where entity_type = 'customers' and (before_data::text like '%09170000002%' or after_data::text like '%09170000002%');
  report := report || case when n = 0 then 'PASS' else 'FAIL' end || ': contact numbers never appear in the audit log' || E'\n';

  failures := (length(report) - length(replace(report, 'FAIL', ''))) / 4;
  raise exception E'PHASE 4 CHECKS: % failure(s). This error is intentional so that nothing is saved.\n%', failures, report;
end;
$$;
