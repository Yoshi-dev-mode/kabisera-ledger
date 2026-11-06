-- Kabisera Ledger · Phase 2 access-control checks
--
-- WRITTEN BUT NOT EXECUTED by the assistant (no PostgreSQL was available).
-- Run after `npm run db:reset` (all 8 migrations), in Studio's SQL editor. Works with or without real data present.
-- Like the Phase 1 script it runs in one DO block, rolls everything back, and ENDS WITH AN ERROR ON PURPOSE:
-- that message is the report. Every line must start with PASS and the first line must say 0 failure(s).

do $$
declare
  report text := '';
  failures int;
  n bigint;
  b boolean;
  base_profiles bigint;
  base_customers bigint;
  base_tx bigint;
  u_owner uuid := gen_random_uuid();
  u_full  uuid := gen_random_uuid();   -- customers.view, debts.view, accounts.view
  u_none  uuid := gen_random_uuid();   -- staff with no permissions
  u_rec   uuid := gen_random_uuid();   -- transactions.record only
  u_off   uuid := gen_random_uuid();   -- inactive staff that still has permissions
  u_new   uuid := gen_random_uuid();   -- created through owner_create_staff_profile
  u_bad   uuid := gen_random_uuid();   -- used to test an invalid permission key
  cust    uuid := gen_random_uuid();
  tx_rec  uuid := gen_random_uuid();
  tx_full uuid := gen_random_uuid();
begin
  -- ------------------------------------------------------------ setup (as the database owner)
  select count(*) into base_profiles from public.profiles;
  select count(*) into base_customers from public.customers;
  select count(*) into base_tx from public.transactions;
  insert into auth.users (id, email) values
    (u_owner, 'p2-owner@example.invalid'), (u_full, 'p2-full@example.invalid'), (u_none, 'p2-none@example.invalid'),
    (u_rec, 'p2-rec@example.invalid'), (u_off, 'p2-off@example.invalid'), (u_new, 'p2-new@example.invalid'),
    (u_bad, 'p2-bad@example.invalid');
  insert into public.profiles (id, display_name, role, permissions) values
    (u_owner, 'P2 Owner', 'owner', '{}'),
    (u_full,  'P2 Full',  'staff', array['customers.view', 'debts.view', 'accounts.view']),
    (u_none,  'P2 None',  'staff', '{}'),
    (u_rec,   'P2 Rec',   'staff', array['transactions.record']);
  insert into public.profiles (id, display_name, role, permissions, is_active) values
    (u_off, 'P2 Off', 'staff', array['customers.view', 'transactions.record', 'reports.view'], false);
  insert into public.customers (id, display_name) values (cust, 'P2 Customer');
  insert into public.transactions (id, public_ref, type, customer_id, principal_cents, fee_mode, payment_method, idempotency_key, recorded_by)
    values (tx_rec,  'KL-P2-0001', 'cash_in', cust, 100, 'on_top', 'cash', gen_random_uuid(), u_rec),
           (tx_full, 'KL-P2-0002', 'cash_in', cust, 200, 'on_top', 'cash', gen_random_uuid(), u_full);

  -- ------------------------------------------------------------ owner
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles;
  report := report || case when n = base_profiles + 5 then 'PASS' else 'FAIL (saw ' || n || ')' end || ': the owner sees every profile' || E'\n';
  select count(*) into n from public.customers;
  report := report || case when n >= 1 then 'PASS' else 'FAIL' end || ': the owner sees customers' || E'\n';
  select count(*) into n from public.audit_log;
  report := report || case when n >= 1 then 'PASS' else 'FAIL' end || ': the owner can read the audit log' || E'\n';
  select count(*) into n from public.transactions;
  report := report || case when n = base_tx + 2 then 'PASS' else 'FAIL (saw ' || n || ')' end || ': the owner sees all transactions' || E'\n';
  select count(*) into n from public.account_balances;
  report := report || case when n >= 11 then 'PASS' else 'FAIL (saw ' || n || ')' end || ': the owner reads account balances' || E'\n';
  reset role;

  -- ------------------------------------------------------------ staff with no permissions
  perform set_config('request.jwt.claim.sub', u_none::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_none::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles;
  report := report || case when n = 1 then 'PASS' else 'FAIL (saw ' || n || ')' end || ': staff see only their own profile' || E'\n';
  select count(*) into n from public.customers;
  report := report || case when n = 0 then 'PASS' else 'FAIL' end || ': staff without permission see no customers' || E'\n';
  select count(*) into n from public.transactions;
  report := report || case when n = 0 then 'PASS' else 'FAIL' end || ': staff without permission see no transactions' || E'\n';
  select count(*) into n from public.audit_log;
  report := report || case when n = 0 then 'PASS' else 'FAIL' end || ': staff cannot read the audit log' || E'\n';
  select count(*) into n from public.ledger_lines;
  report := report || case when n = 0 then 'PASS' else 'FAIL' end || ': staff without permission see no ledger lines' || E'\n';
  reset role;

  -- ------------------------------------------------------------ staff with read permissions
  perform set_config('request.jwt.claim.sub', u_full::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_full::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.customers;
  report := report || case when n = base_customers + 1 then 'PASS' else 'FAIL' end || ': customers.view shows customers' || E'\n';
  select count(*) into n from public.transactions;
  report := report || case when n = base_tx + 2 then 'PASS' else 'FAIL (saw ' || n || ')' end || ': customers.view shows all transactions (history)' || E'\n';
  select count(*) into n from public.audit_log;
  report := report || case when n = 0 then 'PASS' else 'FAIL' end || ': read permissions never include the audit log' || E'\n';
  select count(*) into n from public.import_batches;
  report := report || case when n = 0 then 'PASS' else 'FAIL' end || ': import batches are owner-only' || E'\n';
  reset role;

  -- ------------------------------------------------------------ staff who only record
  perform set_config('request.jwt.claim.sub', u_rec::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_rec::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.transactions;
  report := report || case when n = 1 then 'PASS' else 'FAIL (saw ' || n || ')' end || ': a recorder sees only their own transactions' || E'\n';
  select count(*) into n from public.customers;
  report := report || case when n = base_customers + 1 then 'PASS' else 'FAIL' end || ': a recorder can pick customers' || E'\n';
  select count(*) into n from public.ledger_lines;
  report := report || case when n = 0 then 'PASS' else 'FAIL' end || ': a recorder cannot read the ledger' || E'\n';
  reset role;

  -- ------------------------------------------------------------ inactive staff
  perform set_config('request.jwt.claim.sub', u_off::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_off::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.customers;
  report := report || case when n = 0 then 'PASS' else 'FAIL' end || ': an inactive person sees no customers despite their permissions' || E'\n';
  select count(*) into n from public.transactions;
  report := report || case when n = 0 then 'PASS' else 'FAIL' end || ': an inactive person sees no transactions' || E'\n';
  select count(*) into n from public.profiles;
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': an inactive person can still read their own profile (to be told why)' || E'\n';
  select public.has_permission('reports.view') into b;
  report := report || case when b = false then 'PASS' else 'FAIL' end || ': has_permission is false for an inactive person' || E'\n';
  reset role;

  -- ------------------------------------------------------------ no direct writes, no privilege escalation
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner::text, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    insert into public.customers (display_name) values ('direct insert');
    reset role;
    report := report || 'FAIL: even an owner session could INSERT directly into customers' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: nobody can write to customers directly (writes go through functions)' || E'\n';
  end;

  perform set_config('request.jwt.claim.sub', u_none::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_none::text, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    update public.profiles set role = 'owner', permissions = array['reports.view'] where id = u_none;
    reset role;
    report := report || 'FAIL: staff could promote themselves' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: staff cannot edit profiles, so they cannot promote themselves' || E'\n';
  end;
  begin
    set local role authenticated;
    perform public.owner_create_staff_profile(u_new, 'Sneaky', array['reports.view']);
    reset role;
    report := report || 'FAIL: staff could create staff' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: staff cannot call the owner staff functions' || E'\n';
  end;
  begin
    set local role anon;
    perform count(*) from public.profiles;
    reset role;
    report := report || 'FAIL: the anon role can read profiles' || E'\n';
  exception when insufficient_privilege then
    report := report || 'PASS: the anon role still has no access' || E'\n';
  end;

  -- ------------------------------------------------------------ owner staff functions
  perform set_config('request.jwt.claim.sub', u_owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.owner_create_staff_profile(u_new, '  New Staff  ', array['transactions.record']);
  reset role;
  select count(*) into n from public.profiles
   where id = u_new and role = 'staff' and must_change_password and display_name = 'New Staff';
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': the owner can create staff, who must change their password' || E'\n';
  select count(*) into n from public.audit_log
   where entity_type = 'profiles' and entity_id = u_new::text and actor_id = u_owner;
  report := report || case when n >= 1 then 'PASS' else 'FAIL' end || ': creating staff is audited with the owner as the actor' || E'\n';

  begin
    set local role authenticated;
    perform public.owner_create_staff_profile(u_new, 'Duplicate', '{}');
    reset role;
    report := report || 'FAIL: the same user got a second profile' || E'\n';
  exception when unique_violation then
    report := report || 'PASS: a user cannot get two profiles' || E'\n';
  end;

  begin
    set local role authenticated;
    perform public.owner_create_staff_profile(u_bad, 'Bad', array['not.a.permission']);
    reset role;
    report := report || 'FAIL: an unknown permission was accepted' || E'\n';
  exception when check_violation then
    report := report || 'PASS: unknown permission keys are rejected' || E'\n';
  end;

  set local role authenticated;
  perform public.owner_update_staff(u_none, null, array['reports.view', 'customers.view'], null);
  reset role;
  select count(*) into n from public.profiles where id = u_none and permissions @> array['reports.view'];
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': the owner can change a staff member''s permissions' || E'\n';

  begin
    set local role authenticated;
    perform public.owner_update_staff(u_owner, 'Hijack', '{}', false);   -- an owner row, not staff
    reset role;
    report := report || 'FAIL: owner_update_staff changed an owner' || E'\n';
  exception when no_data_found then
    report := report || 'PASS: staff functions cannot touch owner accounts' || E'\n';
  end;

  -- the new staff member clears their own must-change flag
  perform set_config('request.jwt.claim.sub', u_new::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_new::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.clear_my_must_change_password();
  reset role;
  select count(*) into n from public.profiles where id = u_new and not must_change_password;
  report := report || case when n = 1 then 'PASS' else 'FAIL' end || ': a person can clear their own must-change-password flag' || E'\n';

  -- ------------------------------------------------------------ last owner protection (as the database owner)
  -- Deactivate any real owners inside this rolled-back test so the test owner is the only active one.
  update public.profiles set is_active = false where role = 'owner' and id <> u_owner;
  begin
    update public.profiles set is_active = false where id = u_owner;
    report := report || 'FAIL: the last owner was deactivated' || E'\n';
  exception when restrict_violation then
    report := report || 'PASS: the last active owner cannot be deactivated' || E'\n';
  end;
  begin
    update public.profiles set role = 'staff' where id = u_owner;
    report := report || 'FAIL: the last owner was demoted' || E'\n';
  exception when restrict_violation then
    report := report || 'PASS: the last active owner cannot be demoted' || E'\n';
  end;
  begin
    delete from public.profiles where id = u_owner;
    report := report || 'FAIL: the last owner was deleted' || E'\n';
  exception when restrict_violation then
    report := report || 'PASS: the last active owner cannot be deleted' || E'\n';
  end;

  failures := (length(report) - length(replace(report, 'FAIL', ''))) / 4;
  raise exception E'PHASE 2 CHECKS: % failure(s). This error is intentional so that nothing is saved.\n%', failures, report;
end;
$$;
