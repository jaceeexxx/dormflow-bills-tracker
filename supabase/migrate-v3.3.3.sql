-- DormFlow v3.3.3
-- Beta stabilization for payment idempotency, household member directory reads,
-- profile read policy repair, and push-registration reliability.
-- Additive function/policy overrides only.

begin;

grant select on public.profiles to authenticated;

grant usage on schema public to service_role;
grant select on table
  public.profiles,
  public.household_members,
  public.push_subscriptions,
  public.notification_preferences,
  public.notifications
to service_role;
grant update on table
  public.push_subscriptions,
  public.notifications
to service_role;

grant usage on schema public to authenticated;
grant select,insert,update,delete on public.push_subscriptions to authenticated;
grant execute on function public.current_identity_v3() to authenticated;

drop policy if exists "push_subscriptions own" on public.push_subscriptions;
create policy "push_subscriptions own"
on public.push_subscriptions for all to authenticated
using (member_id=public.current_member_id_v3())
with check(member_id=public.current_member_id_v3());

drop policy if exists "profiles own or admin" on public.profiles;
drop policy if exists "profiles household read" on public.profiles;
create policy "profiles household read"
on public.profiles for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.household_members target
    where target.profile_id = profiles.id
      and target.is_active = true
      and target.household_id = public.current_household_id_v3()
  )
);

create or replace function public.household_member_directory_v3(
  p_include_inactive boolean default false
)
returns table(
  member_id uuid,
  display_name text,
  role text,
  avatar_path text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    hm.id as member_id,
    p.display_name,
    hm.role,
    p.avatar_path,
    hm.is_active
  from public.household_members hm
  join public.profiles p on p.id = hm.profile_id
  where hm.household_id = public.current_household_id_v3()
    and (p_include_inactive or hm.is_active = true)
  order by hm.created_at asc;
$$;

grant execute on function public.household_member_directory_v3(boolean) to authenticated;

create or replace function public.submit_payment_claim_v3(
  p_payee uuid,
  p_amount_cents bigint,
  p_paid_at timestamptz,
  p_method text,
  p_reference text,
  p_note text,
  p_suggested_allocations jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payer uuid := public.current_member_id_v3();
  v_household uuid;
  v_id uuid;
  v_key text;
begin
  if v_payer is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'payment amount must be positive';
  end if;

  if p_payee is null or p_payee = v_payer then
    raise exception 'invalid payee';
  end if;

  if nullif(trim(coalesce(p_method, '')), '') is null then
    raise exception 'payment method is required';
  end if;

  select household_id into v_household
  from public.household_members
  where id = v_payer;

  if not exists (
    select 1
    from public.household_members
    where id = p_payee
      and household_id = v_household
      and is_active = true
  ) then
    raise exception 'invalid payee';
  end if;

  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  if v_key is null then
    v_key := 'claim:' || gen_random_uuid()::text;
  end if;

  select id into v_id
  from public.payment_claims
  where household_id = v_household
    and idempotency_key = v_key;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.payment_claims(
    household_id,
    payer_member_id,
    payee_member_id,
    amount_cents,
    paid_at,
    method,
    reference_private,
    note,
    suggested_allocations,
    idempotency_key
  )
  values(
    v_household,
    v_payer,
    p_payee,
    p_amount_cents,
    coalesce(p_paid_at, now()),
    trim(p_method),
    coalesce(p_reference, ''),
    coalesce(p_note, ''),
    coalesce(p_suggested_allocations, '[]'::jsonb),
    v_key
  )
  returning id into v_id;

  insert into public.notifications(
    household_id,
    recipient_member_id,
    type,
    title,
    body,
    target_type,
    target_id,
    dedupe_key
  )
  select
    v_household,
    hm.id,
    'payment_claim',
    'Payment waiting for review',
    (
      select p.display_name
      from public.profiles p
      join public.household_members m on m.profile_id = p.id
      where m.id = v_payer
    ) || ' reported a payment.',
    'payment_claim',
    v_id,
    'claim:' || v_id::text
  from public.household_members hm
  where hm.household_id = v_household
    and hm.role = 'admin'
    and hm.is_active = true
  on conflict(recipient_member_id, dedupe_key) do nothing;

  return v_id;
end;
$$;

create or replace function public.record_payment_v3(
  p_payer uuid,
  p_payee uuid,
  p_amount_cents bigint,
  p_paid_at timestamptz,
  p_method text,
  p_reference text,
  p_allocations jsonb default '[]'::jsonb,
  p_credit_cents bigint default 0,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_member_id_v3();
  v_household uuid := public.current_household_id_v3();
  v_payment uuid;
  v_key text;
  j jsonb;
  v_sum bigint := 0;
  v_out bigint;
begin
  if not public.is_household_admin_v3(v_household) then
    raise exception 'admin required' using errcode = '42501';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'payment amount must be positive';
  end if;

  if p_payer is null or p_payee is null or p_payer = p_payee then
    raise exception 'invalid payment';
  end if;

  if nullif(trim(coalesce(p_method, '')), '') is null then
    raise exception 'payment method is required';
  end if;

  if coalesce(p_credit_cents, 0) < 0 then
    raise exception 'credit amount cannot be negative';
  end if;

  if not exists (
    select 1
    from public.household_members
    where id = p_payer
      and household_id = v_household
      and is_active = true
  )
  or not exists (
    select 1
    from public.household_members
    where id = p_payee
      and household_id = v_household
      and is_active = true
  ) then
    raise exception 'invalid household member';
  end if;

  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  if v_key is null then
    v_key := 'admin-payment:' || gen_random_uuid()::text;
  end if;

  select id into v_payment
  from public.payments
  where household_id = v_household
    and idempotency_key = v_key;

  if v_payment is not null then
    return v_payment;
  end if;

  insert into public.payments(
    household_id,
    payer_member_id,
    payee_member_id,
    amount_cents,
    paid_at,
    method,
    reference_private,
    idempotency_key,
    verified_by
  )
  values(
    v_household,
    p_payer,
    p_payee,
    p_amount_cents,
    coalesce(p_paid_at, now()),
    trim(p_method),
    coalesce(p_reference, ''),
    v_key,
    v_actor
  )
  returning id into v_payment;

  for j in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb))
  loop
    if coalesce((j->>'amount_cents')::bigint, 0) <= 0 then
      raise exception 'allocation amount must be positive';
    end if;

    perform 1
    from public.obligations
    where id = (j->>'obligation_id')::uuid
      and debtor_member_id = p_payer
      and (creditor_member_id = p_payee or creditor_member_id is null)
    for update;

    select outstanding_cents into v_out
    from public.obligation_balances_v3
    where id = (j->>'obligation_id')::uuid;

    if v_out is null then
      raise exception 'invalid payment obligation';
    end if;

    if (j->>'amount_cents')::bigint > v_out then
      raise exception 'allocation exceeds outstanding';
    end if;

    insert into public.payment_allocations(payment_id,obligation_id,amount_cents)
    values(v_payment,(j->>'obligation_id')::uuid,(j->>'amount_cents')::bigint);

    v_sum := v_sum + (j->>'amount_cents')::bigint;
  end loop;

  if v_sum + coalesce(p_credit_cents, 0) <> p_amount_cents then
    raise exception 'payment must be fully allocated or credited';
  end if;

  if coalesce(p_credit_cents, 0) > 0 then
    insert into public.credits(
      household_id,
      owner_member_id,
      creditor_member_id,
      original_amount_cents,
      remaining_amount_cents,
      source_payment_id
    )
    values(v_household,p_payer,p_payee,p_credit_cents,p_credit_cents,v_payment);
  end if;

  insert into public.notifications(
    household_id,
    recipient_member_id,
    type,
    title,
    body,
    target_type,
    target_id,
    dedupe_key
  )
  values(
    v_household,
    p_payer,
    'payment_recorded',
    'Payment recorded',
    'Your payment was recorded by the household admin.',
    'payment',
    v_payment,
    'payment-recorded:' || v_payment::text
  )
  on conflict(recipient_member_id, dedupe_key) do nothing;

  insert into public.audit_log(
    household_id,
    actor_member_id,
    action,
    entity_type,
    entity_id,
    after_json
  )
  values(
    v_household,
    v_actor,
    'record',
    'payment',
    v_payment,
    jsonb_build_object(
      'amount_cents', p_amount_cents,
      'allocated_cents', v_sum,
      'credit_cents', coalesce(p_credit_cents, 0)
    )
  );

  return v_payment;
end;
$$;

grant execute on function public.submit_payment_claim_v3(uuid,bigint,timestamptz,text,text,text,jsonb,text) to authenticated;
grant execute on function public.record_payment_v3(uuid,uuid,bigint,timestamptz,text,text,jsonb,bigint,text) to authenticated;

commit;
