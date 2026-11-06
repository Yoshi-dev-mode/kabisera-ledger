-- Kabisera Ledger · migration 12 (Phase 6: settings)
-- Owner-only functions that change the adjustable business rules. Every change is audited with the owner as
-- the actor (the audit triggers on these tables run inside the owner's session). Fee rules are never deleted:
-- each transaction stores the fee and mode it actually used, so changing a rule never rewrites history.

create function public.save_fee_rule(
  p_id uuid, p_service_type public.transaction_type, p_name text, p_fee_mode public.fee_mode,
  p_min_cents bigint, p_max_cents bigint, p_flat_cents bigint, p_percent_bps int,
  p_from date, p_to date, p_active boolean, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.is_owner() then
    raise exception 'only the owner can change fee rules' using errcode = 'insufficient_privilege';
  end if;
  if p_service_type not in ('cash_in', 'cash_out') then
    raise exception 'fee rules are for cash-in and cash-out' using errcode = 'check_violation';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'give the rule a short name' using errcode = 'check_violation';
  end if;
  if p_min_cents is null or p_min_cents < 0 or (p_max_cents is not null and p_max_cents <= p_min_cents) then
    raise exception 'the amount range is not valid (the top must be above the bottom)' using errcode = 'check_violation';
  end if;
  if p_flat_cents is null or p_flat_cents < 0 or p_percent_bps is null or p_percent_bps not between 0 and 10000 then
    raise exception 'the fee must be a flat amount and/or a percentage between 0 and 100' using errcode = 'check_violation';
  end if;
  if p_from is null or (p_to is not null and p_to <= p_from) then
    raise exception 'the dates are not valid (the end must be after the start)' using errcode = 'check_violation';
  end if;
  begin
    if p_id is null then
      insert into public.fee_rules (service_type, name, fee_mode, min_amount_cents, max_amount_cents, flat_fee_cents,
                                    percent_bps, effective_from, effective_to, is_active, notes, created_by)
      values (p_service_type, btrim(p_name), p_fee_mode, p_min_cents, p_max_cents, p_flat_cents, p_percent_bps,
              p_from, p_to, coalesce(p_active, true), nullif(btrim(p_notes), ''), auth.uid())
      returning id into v_id;
    else
      update public.fee_rules
         set service_type = p_service_type, name = btrim(p_name), fee_mode = p_fee_mode,
             min_amount_cents = p_min_cents, max_amount_cents = p_max_cents, flat_fee_cents = p_flat_cents,
             percent_bps = p_percent_bps, effective_from = p_from, effective_to = p_to,
             is_active = coalesce(p_active, true), notes = nullif(btrim(p_notes), '')
       where id = p_id returning id into v_id;
      if v_id is null then
        raise exception 'fee rule not found' using errcode = 'no_data_found';
      end if;
    end if;
  exception when exclusion_violation then
    raise exception 'another active rule already covers some of these amounts on some of these dates' using errcode = 'check_violation';
  end;
  return v_id;
end;
$$;

create function public.save_load_product(
  p_id uuid, p_network text, p_label text, p_default_source public.load_source, p_cost_bps int, p_active boolean)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.is_owner() then
    raise exception 'only the owner can change load products' using errcode = 'insufficient_privilege';
  end if;
  if p_network is null or char_length(btrim(p_network)) not between 1 and 40
     or p_label is null or char_length(btrim(p_label)) not between 1 and 80 then
    raise exception 'give the network and a label' using errcode = 'check_violation';
  end if;
  if p_cost_bps is not null and p_cost_bps not between 1 and 10000 then
    raise exception 'the cost share must be between 0.01 and 100 percent of the face value' using errcode = 'check_violation';
  end if;
  begin
    if p_id is null then
      insert into public.load_products (network, label, default_source, cost_bps_of_face, is_active)
        values (btrim(p_network), btrim(p_label), p_default_source, p_cost_bps, coalesce(p_active, true))
        returning id into v_id;
    else
      update public.load_products
         set network = btrim(p_network), label = btrim(p_label), default_source = p_default_source,
             cost_bps_of_face = p_cost_bps, is_active = coalesce(p_active, true)
       where id = p_id returning id into v_id;
      if v_id is null then
        raise exception 'load product not found' using errcode = 'no_data_found';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'a load product with this network and label already exists' using errcode = 'check_violation';
  end;
  return v_id;
end;
$$;

create function public.save_expense_category(p_id uuid, p_name text, p_active boolean)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.is_owner() then
    raise exception 'only the owner can change expense categories' using errcode = 'insufficient_privilege';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'give the category a short name' using errcode = 'check_violation';
  end if;
  begin
    if p_id is null then
      insert into public.expense_categories (name, is_active) values (btrim(p_name), coalesce(p_active, true)) returning id into v_id;
    else
      update public.expense_categories set name = btrim(p_name), is_active = coalesce(p_active, true)
       where id = p_id returning id into v_id;
      if v_id is null then
        raise exception 'category not found' using errcode = 'no_data_found';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'a category with this name already exists' using errcode = 'check_violation';
  end;
  return v_id;
end;
$$;

-- Only these settings can be changed, and only to valid values. The rest are fixed integrity rules.
create function public.save_app_setting(p_key text, p_value jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_owner() then
    raise exception 'only the owner can change settings' using errcode = 'insufficient_privilege';
  end if;
  if p_key in ('fees.cash_in.default_mode', 'fees.cash_out.default_mode') then
    if p_value is null or p_value not in ('"on_top"'::jsonb, '"deducted"'::jsonb) then
      raise exception 'choose on top or deducted' using errcode = 'check_violation';
    end if;
  elsif p_key = 'fees.percent_rounding' then
    if p_value is null or p_value not in ('"half_up"'::jsonb, '"down"'::jsonb, '"up"'::jsonb) then
      raise exception 'choose half up, down or up' using errcode = 'check_violation';
    end if;
  elsif p_key in ('policy.allow_negative_floats', 'policy.require_gcash_reference') then
    if p_value is null or p_value not in ('true'::jsonb, 'false'::jsonb) then
      raise exception 'choose yes or no' using errcode = 'check_violation';
    end if;
  else
    raise exception 'that setting cannot be changed here' using errcode = 'check_violation';
  end if;
  update public.app_settings set value = p_value, updated_by = auth.uid() where key = p_key;
  if not found then
    raise exception 'setting not found' using errcode = 'no_data_found';
  end if;
end;
$$;

-- A low-balance warning level for the cash drawer, GCash wallet or load balance. Null clears it.
create function public.set_account_threshold(p_code text, p_cents bigint)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_owner() then
    raise exception 'only the owner can set warning levels' using errcode = 'insufficient_privilege';
  end if;
  if p_cents is not null and p_cents < 0 then
    raise exception 'the warning level cannot be negative' using errcode = 'check_violation';
  end if;
  update public.accounts set low_threshold_cents = p_cents where code = p_code and is_float;
  if not found then
    raise exception 'that account has no warning level' using errcode = 'check_violation';
  end if;
end;
$$;

grant execute on function
  public.save_fee_rule(uuid, public.transaction_type, text, public.fee_mode, bigint, bigint, bigint, int, date, date, boolean, text),
  public.save_load_product(uuid, text, text, public.load_source, int, boolean),
  public.save_expense_category(uuid, text, boolean),
  public.save_app_setting(text, jsonb),
  public.set_account_threshold(text, bigint)
  to authenticated;
