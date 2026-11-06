-- Kabisera Ledger · Phase 1 database invariant checks
--
-- WRITTEN BUT NOT EXECUTED by the assistant (no Postgres was available in its environment).
-- Run it on a FRESH local database (`npm run db:reset`), in Supabase Studio's SQL editor
-- (http://127.0.0.1:54323 > SQL Editor) or with psql.
--
-- Everything happens inside one DO block and is rolled back. The block ENDS WITH AN ERROR ON PURPOSE:
-- the error message is the report. Each line starts with PASS or FAIL. Any FAIL, or a different
-- error, means a migration needs fixing before Phase 2.

do $$
declare
  report   text := '';
  failures int;
  uid      uuid := gen_random_uuid();
  acc_cash uuid; acc_gcash uuid; acc_fee uuid; acc_recv uuid;
  cust_a uuid := gen_random_uuid();
  cust_b uuid := gen_random_uuid();
  cust_dup uuid := gen_random_uuid();
  tx1 uuid := gen_random_uuid();
  tx2 uuid := gen_random_uuid();
  je1 uuid := gen_random_uuid();
  je2 uuid := gen_random_uuid();
  je_bad uuid := gen_random_uuid();
  je_rev uuid := gen_random_uuid();
  je_badrev uuid := gen_random_uuid();
  closing uuid := gen_random_uuid();
  n bigint;
  v bigint;
  d date;
begin
  -- ---------------------------------------------------------------- setup
  select count(*) into n from public.ledger_lines;
  report := report || case when n = 0 then 'PASS' else 'FAIL (database not fresh: run npm run db:reset first)' end
            || ': a fresh database has no ledger lines, so no opening balances were invented' || E'\n';

  select id into acc_cash  from public.accounts where code = 'CASH_DRAWER';
  select id into acc_gcash from public.accounts where code = 'GCASH_WALLET';
  select id into acc_fee   from public.accounts where code = 'FEE_INCOME';
  select id into acc_recv  from public.accounts where code = 'CUSTOMER_RECEIVABLES';

  select count(*) into n from public.accounts;
  report := report || case when n >= 11 then 'PASS' else 'FAIL (found ' || n || ')' end
            || ': at least the 11 original reference accounts exist' || E'\n';

  select count(*) into n from public.account_balances where balance_cents <> 0;
  report := report || case when n = 0 then 'PASS' else 'FAIL' end
            || ': every account balance starts at zero' || E'\n';

  insert into auth.users (id, email) values (uid, 'phase1-check@example.invalid');
  insert into public.profiles (id, display_name, role) values (uid, 'Phase 1 check', 'owner');

  -- ---------------------------------------------------------------- customers
  insert into public.customers (id, display_name, contact_number) values (cust_a, 'Cee jay', '09171234567');
  insert into public.customers (id, display_name) values (cust_b, 'Cj');
  select count(distinct display_name_normalized) into n from public.customers where id in (cust_a, cust_b);
  report := report || case when n = 2 then 'PASS' else 'FAIL' end
            || ': "Cee jay" and "Cj" are stored as two different customers' || E'\n';

  insert into public.customers (id, display_name) values (cust_dup, 'cee   JAY');
  select count(*) into n from public.customers
   where display_name_normalized = (select display_name_normalized from public.customers where id = cust_a);
  report := report || case when n = 2 then 'PASS' else 'FAIL' end
            || ': a look-alike name is allowed (the app warns; the owner resolves it)' || E'\n';

  select count(*) into n from public.audit_log
   where entity_type = 'customers' and after_data::text like '%09171234567%';
  report := report || case when n = 0 then 'PASS' else 'FAIL' end
            || ': customer contact numbers are kept out of the audit log' || E'\n';

  select count(*) into n from public.audit_log where entity_type = 'customers' and action = 'customers.insert';
  report := report || case when n >= 3 then 'PASS' else 'FAIL' end
            || ': customer creation is audited' || E'\n';

  -- ---------------------------------------------------------------- transactions
  insert into public.transactions
    (id, public_ref, type, customer_id, occurred_at, principal_cents, fee_cents, fee_mode,
     payment_method, idempotency_key, recorded_by)
  values
    (tx1, 'KL-TEST-0001', 'cash_in', cust_a, timestamptz '2026-10-23 16:30:00+00', 100000, 2000, 'on_top',
     'cash', gen_random_uuid(), uid);
  select business_date into d from public.transactions where id = tx1;
  report := report || case when d = date '2026-10-24' then 'PASS' else 'FAIL (got ' || d || ')' end
            || ': 16:30 UTC on 23 Oct is dated 24 Oct in Philippine time' || E'\n';

  insert into public.transactions
    (id, public_ref, type, customer_id, principal_cents, fee_cents, fee_mode, payment_method, idempotency_key, recorded_by)
  values (tx2, 'KL-TEST-0002', 'cash_in', cust_a, 500, 0, 'on_top', 'cash', gen_random_uuid(), uid);

  begin
    insert into public.transactions (public_ref, type, principal_cents, idempotency_key, recorded_by)
    values ('KL-TEST-0003', 'cash_in', 100, gen_random_uuid(), uid);   -- cash_in without fee_mode
    report := report || 'FAIL: cash_in without a fee mode was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: cash_in must record which fee mode was used' || E'\n';
  end;

  begin
    insert into public.transactions (public_ref, type, principal_cents, idempotency_key, recorded_by)
    values ('KL-TEST-0004', 'debt_repayment', 100, gen_random_uuid(), uid);   -- no customer
    report := report || 'FAIL: repayment without a customer was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a repayment must name a customer' || E'\n';
  end;

  begin
    insert into public.transactions (public_ref, type, principal_cents, fee_mode, idempotency_key, recorded_by)
    select 'KL-TEST-0005', 'cash_in', 100, 'on_top', idempotency_key, uid from public.transactions where id = tx1;
    report := report || 'FAIL: a repeated idempotency key was accepted' || E'\n';
  exception when unique_violation then
    report := report || 'PASS: a repeated idempotency key cannot double-post' || E'\n';
  end;

  -- ---------------------------------------------------------------- ledger
  begin
    set constraints all deferred;
    insert into public.journal_entries (id, transaction_id, kind, business_date, created_by)
      values (je_bad, tx1, 'posting', date '2026-10-24', uid);
    insert into public.ledger_lines (entry_id, account_id, amount_cents)
      values (je_bad, acc_cash, 102000), (je_bad, acc_gcash, -100000);   -- does not sum to zero
    set constraints all immediate;
    report := report || 'FAIL: an unbalanced journal entry was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: an unbalanced journal entry is rejected' || E'\n';
  end;

  begin
    set constraints all deferred;
    insert into public.journal_entries (id, transaction_id, kind, business_date, created_by)
      values (je_bad, tx1, 'posting', date '2026-10-24', uid);
    insert into public.ledger_lines (entry_id, account_id, amount_cents)
      values (je_bad, acc_recv, 500), (je_bad, acc_cash, -500);        -- receivable with no customer
    set constraints all immediate;
    report := report || 'FAIL: a receivables line without a customer was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a receivables line must name a customer' || E'\n';
  end;

  begin
    set constraints all deferred;
    insert into public.journal_entries (id, transaction_id, kind, business_date, created_by)
      values (je_bad, tx1, 'posting', date '2026-10-24', uid);
    insert into public.ledger_lines (entry_id, account_id, customer_id, amount_cents)
      values (je_bad, acc_cash, cust_a, 500), (je_bad, acc_gcash, null, -500);   -- customer on cash
    set constraints all immediate;
    report := report || 'FAIL: a customer on a cash line was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: only receivables lines may carry a customer' || E'\n';
  end;

  begin
    set constraints all deferred;
    insert into public.journal_entries (id, transaction_id, kind, business_date, created_by)
      values (je_bad, tx1, 'posting', date '2026-10-24', uid);
    set constraints all immediate;
    report := report || 'FAIL: an entry with no lines was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: an entry with no lines is rejected' || E'\n';
  end;

  -- balanced cash-in: cash +1,020.00 / GCash -1,000.00 / fee income -20.00 (credit)
  set constraints all deferred;
  insert into public.journal_entries (id, transaction_id, kind, business_date, created_by)
    values (je1, tx1, 'posting', date '2026-10-24', uid);
  insert into public.ledger_lines (entry_id, account_id, amount_cents)
    values (je1, acc_cash, 102000), (je1, acc_gcash, -100000), (je1, acc_fee, -2000);
  set constraints all immediate;
  select balance_cents into v from public.account_balances where code = 'CASH_DRAWER';
  report := report || case when v = 102000 then 'PASS' else 'FAIL (cash ' || v || ')' end
            || ': a balanced entry posts and the cash balance is derived from it' || E'\n';
  select balance_cents into v from public.account_balances where code = 'FEE_INCOME';
  report := report || case when v = 2000 then 'PASS' else 'FAIL (fee ' || v || ')' end
            || ': fee income shows as +20.00 although it is a credit' || E'\n';

  begin
    update public.ledger_lines set amount_cents = 1 where entry_id = je1;
    report := report || 'FAIL: a ledger line was edited' || E'\n';
  exception when restrict_violation then
    report := report || 'PASS: ledger lines cannot be edited' || E'\n';
  end;
  begin
    delete from public.ledger_lines where entry_id = je1;
    report := report || 'FAIL: a ledger line was deleted' || E'\n';
  exception when restrict_violation then
    report := report || 'PASS: ledger lines cannot be deleted' || E'\n';
  end;
  begin
    truncate public.ledger_lines;
    report := report || 'FAIL: the ledger was truncated' || E'\n';
  exception when restrict_violation then
    report := report || 'PASS: the ledger cannot be truncated' || E'\n';
  end;

  -- ---------------------------------------------------------------- transaction immutability and voids
  begin
    update public.transactions set principal_cents = 1 where id = tx1;
    report := report || 'FAIL: a posted transaction amount was edited' || E'\n';
  exception when restrict_violation then
    report := report || 'PASS: a posted transaction cannot be edited' || E'\n';
  end;
  begin
    delete from public.transactions where id = tx1;
    report := report || 'FAIL: a transaction was deleted' || E'\n';
  exception when restrict_violation then
    report := report || 'PASS: a transaction cannot be deleted' || E'\n';
  end;

  update public.transactions
     set status = 'voided', voided_at = now(), voided_by = uid, void_reason = 'phase 1 check'
   where id = tx1;
  report := report || 'PASS: a transaction can be voided with a reason' || E'\n';

  begin
    update public.transactions set status = 'posted', voided_at = null where id = tx1;
    report := report || 'FAIL: a voided transaction was restored' || E'\n';
  exception when restrict_violation then
    report := report || 'PASS: a void cannot be undone' || E'\n';
  end;

  -- a reversal that does not mirror the original is rejected
  set constraints all deferred;
  insert into public.journal_entries (id, transaction_id, kind, business_date, created_by)
    values (je2, tx2, 'posting', date '2026-10-24', uid);
  insert into public.ledger_lines (entry_id, account_id, amount_cents)
    values (je2, acc_cash, 500), (je2, acc_gcash, -500);
  set constraints all immediate;

  begin
    set constraints all deferred;
    insert into public.journal_entries (id, transaction_id, kind, reverses_entry_id, business_date, created_by)
      values (je_badrev, tx2, 'reversal', je2, date '2026-10-24', uid);
    insert into public.ledger_lines (entry_id, account_id, amount_cents)
      values (je_badrev, acc_cash, -400), (je_badrev, acc_gcash, 400);   -- balanced but not a mirror
    set constraints all immediate;
    report := report || 'FAIL: a non-mirror reversal was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a reversal must exactly negate the original entry' || E'\n';
  end;

  -- the correct reversal of je1 is accepted and nets the balances back to zero
  set constraints all deferred;
  insert into public.journal_entries (id, transaction_id, kind, reverses_entry_id, business_date, created_by)
    values (je_rev, tx1, 'reversal', je1, date '2026-10-24', uid);
  insert into public.ledger_lines (entry_id, account_id, amount_cents)
    values (je_rev, acc_cash, -102000), (je_rev, acc_gcash, 100000), (je_rev, acc_fee, 2000);
  set constraints all immediate;
  select balance_cents into v from public.account_balances where code = 'FEE_INCOME';
  report := report || case when v = 0 then 'PASS' else 'FAIL (fee ' || v || ')' end
            || ': a mirror-image reversal nets fee income back to zero; the original rows remain' || E'\n';

  begin
    set constraints all deferred;
    insert into public.journal_entries (transaction_id, kind, reverses_entry_id, business_date, created_by)
      values (tx1, 'reversal', je1, date '2026-10-24', uid);
    set constraints all immediate;
    report := report || 'FAIL: an entry was reversed twice' || E'\n';
  exception when unique_violation then
    report := report || 'PASS: an entry can be reversed only once' || E'\n';
  end;

  -- ---------------------------------------------------------------- fee rules (adjustable, no overlaps)
  insert into public.fee_rules (service_type, name, fee_mode, min_amount_cents, max_amount_cents, flat_fee_cents, effective_from)
    values ('cash_in', 'test tier 1', 'on_top', 0, 50001, 1000, date '2026-01-01');
  begin
    insert into public.fee_rules (service_type, name, fee_mode, min_amount_cents, max_amount_cents, flat_fee_cents, effective_from)
      values ('cash_in', 'overlapping tier', 'on_top', 0, 100000, 2000, date '2026-01-01');
    report := report || 'FAIL: overlapping fee rules were accepted' || E'\n';
  exception when exclusion_violation then
    report := report || 'PASS: two active fee rules cannot cover the same amount and dates' || E'\n';
  end;
  insert into public.fee_rules (service_type, name, fee_mode, min_amount_cents, max_amount_cents, percent_bps, effective_from)
    values ('cash_in', 'test tier 2', 'on_top', 50001, null, 200, date '2026-01-01');
  insert into public.fee_rules (service_type, name, fee_mode, min_amount_cents, flat_fee_cents, effective_from)
    values ('cash_out', 'same range, other service', 'deducted', 0, 1000, date '2026-01-01');
  report := report || 'PASS: adjacent tiers and other services can coexist' || E'\n';

  -- ---------------------------------------------------------------- daily closing
  insert into public.daily_closings (id, business_date, created_by) values (closing, date '2026-10-24', uid);
  begin
    insert into public.closing_balances (closing_id, account_id, expected_cents, actual_cents)
      values (closing, acc_cash, 1000, 900);                 -- variance of -100 with no reason
    report := report || 'FAIL: a variance without a reason was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: a closing variance needs a reason' || E'\n';
  end;
  insert into public.closing_balances (closing_id, account_id, expected_cents, actual_cents, variance_reason)
    values (closing, acc_cash, 1000, 900, 'short change given');
  select variance_cents into v from public.closing_balances where closing_id = closing;
  report := report || case when v = -100 then 'PASS' else 'FAIL' end
            || ': variance = actual - expected (negative means below expected)' || E'\n';

  update public.daily_closings set status = 'final', finalized_by = uid, finalized_at = now() where id = closing;
  begin
    update public.daily_closings set note = 'edited after finalizing' where id = closing;
    report := report || 'FAIL: a finalized closing was edited' || E'\n';
  exception when restrict_violation then
    report := report || 'PASS: a finalized closing cannot be edited' || E'\n';
  end;
  begin
    update public.closing_balances set actual_cents = 1000 where closing_id = closing;
    report := report || 'FAIL: balances of a finalized closing were edited' || E'\n';
  exception when restrict_violation then
    report := report || 'PASS: balances of a finalized closing cannot change' || E'\n';
  end;

  -- ---------------------------------------------------------------- audit log
  begin
    update public.audit_log set action = 'tampered' where id = (select min(id) from public.audit_log);
    report := report || 'FAIL: an audit row was edited' || E'\n';
  exception when restrict_violation then
    report := report || 'PASS: audit rows cannot be edited' || E'\n';
  end;
  begin
    delete from public.audit_log;
    report := report || 'FAIL: audit rows were deleted' || E'\n';
  exception when restrict_violation then
    report := report || 'PASS: audit rows cannot be deleted' || E'\n';
  end;

  -- ---------------------------------------------------------------- deny by default
  begin
    set local role anon;
    perform count(*) from public.customers;
    reset role;
    report := report || 'FAIL: the anon role can read customers' || E'\n';
  exception when insufficient_privilege then
    reset role;
    report := report || 'PASS: the anon role cannot read customers' || E'\n';
  end;
  begin
    set local role authenticated;
    perform count(*) from public.transactions;
    reset role;
    report := report || 'FAIL: a signed-in role can read transactions before policies exist' || E'\n';
  exception when insufficient_privilege then
    reset role;
    report := report || 'PASS: signed-in roles have no access until Phase 2 policies' || E'\n';
  end;
  select count(*) into n from pg_tables where schemaname = 'public' and not rowsecurity;
  report := report || case when n = 0 then 'PASS' else 'FAIL (' || n || ' tables without RLS)' end
            || ': row-level security is enabled on every table' || E'\n';

  -- ---------------------------------------------------------------- report (intentional error = rollback)
  failures := (length(report) - length(replace(report, 'FAIL', ''))) / 4;
  raise exception E'PHASE 1 CHECKS: % failure(s). This error is intentional so that nothing is saved.\n%', failures, report;
end;
$$;
