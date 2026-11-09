-- Store mobile-load service fees separately from acquisition margin.
-- The default fee preserves the behavior of callers that use the original arguments.
drop function public.post_mobile_load(uuid, uuid, uuid, public.load_source, bigint, bigint, bigint, public.payment_method, bigint, text, text, timestamptz, text);

create function public.post_mobile_load(
  p_idempotency_key uuid, p_customer_id uuid, p_load_product_id uuid, p_load_source public.load_source,
  p_face_cents bigint, p_cost_cents bigint, p_price_cents bigint, p_payment_method public.payment_method,
  p_credit_cents bigint default 0, p_gcash_reference text default null, p_notes text default null,
  p_occurred_at timestamptz default null, p_override_reason text default null, p_fee_cents bigint default 0)
returns table (tx_id uuid, tx_ref text, was_duplicate boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_credit bigint := coalesce(p_credit_cents, 0);
  v_lines jsonb;
  v_res record;
begin
  if not public.has_permission('transactions.record') then
    raise exception 'you are not allowed to record transactions' using errcode = 'insufficient_privilege';
  end if;
  if p_face_cents is null or p_face_cents <= 0 then
    raise exception 'enter the load amount' using errcode = 'check_violation';
  end if;
  if p_cost_cents is null or p_cost_cents <= 0 then
    raise exception 'enter what the load cost you' using errcode = 'check_violation';
  end if;
  if p_price_cents is null or p_price_cents <= 0 then
    raise exception 'enter the selling price' using errcode = 'check_violation';
  end if;
  if p_fee_cents is null or p_fee_cents < 0 then
    raise exception 'enter a service fee of zero or more' using errcode = 'check_violation';
  end if;
  if p_fee_cents > 0 and (p_price_cents::numeric <> p_face_cents::numeric + p_fee_cents or p_price_cents > 100000000000) then
    raise exception 'the total must equal the load amount plus the service fee and be within the supported amount' using errcode = 'check_violation';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'gcash') then
    raise exception 'choose cash or GCash for the part paid now' using errcode = 'check_violation';
  end if;
  if v_credit < 0 or v_credit > p_price_cents then
    raise exception 'the unpaid amount is more than the selling price' using errcode = 'check_violation';
  end if;
  if v_credit > 0 and p_customer_id is null then
    raise exception 'choose a customer to leave an amount unpaid' using errcode = 'check_violation';
  end if;
  perform public._require_active_customer(p_customer_id);
  v_lines := public._merge_lines(array[
    public._line(case when p_payment_method = 'cash' then 'CASH_DRAWER' else 'GCASH_WALLET' end, p_price_cents - v_credit),
    public._line('CUSTOMER_RECEIVABLES', v_credit, p_customer_id),
    public._line(case when p_load_source = 'prepaid_wallet' then 'LOAD_BALANCE' else 'GCASH_WALLET' end, -p_cost_cents),
    public._line('LOAD_MARGIN', -(p_price_cents - p_cost_cents - p_fee_cents)),
    public._line('FEE_INCOME', -p_fee_cents)]);
  select t.tx_id, t.tx_ref, t.was_duplicate into v_res from public._post_transaction(
    p_idempotency_key, 'mobile_load', p_customer_id, p_occurred_at, p_face_cents, p_fee_cents, null, 0, v_credit,
    case when v_credit = 0 then p_payment_method
         when v_credit = p_price_cents then 'credit'::public.payment_method
         else 'mixed'::public.payment_method end,
    p_gcash_reference, p_load_product_id, p_load_source, p_cost_cents, p_price_cents, null, null,
    p_notes, v_lines, p_override_reason, 'posting') t;
  if not v_res.was_duplicate and v_credit > 0 then
    insert into public.debts (customer_id, origin, source_transaction_id, original_cents, created_by)
      values (p_customer_id, 'transaction', v_res.tx_id, v_credit, auth.uid());
  end if;
  return query select v_res.tx_id, v_res.tx_ref, v_res.was_duplicate;
end;
$$;

revoke execute on function public.post_mobile_load(uuid, uuid, uuid, public.load_source, bigint, bigint, bigint, public.payment_method, bigint, text, text, timestamptz, text, bigint) from public, anon, authenticated;
grant execute on function public.post_mobile_load(uuid, uuid, uuid, public.load_source, bigint, bigint, bigint, public.payment_method, bigint, text, text, timestamptz, text, bigint) to authenticated;
