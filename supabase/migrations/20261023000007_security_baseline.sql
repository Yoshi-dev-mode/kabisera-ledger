-- Kabisera Ledger · migration 7 of 7
-- Secure by default: row-level security ON for every table, and NO access for the API roles.
-- Phase 2 (authentication) adds the role-based policies and the narrow GRANTs the app needs.
-- Until then the browser and API can read and write nothing; only server-side admin tools can.

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

comment on schema public is
  'Kabisera Ledger. Deny-by-default: RLS enabled everywhere, API roles hold no privileges until Phase 2 policies and grants.';
