-- DormFlow v3.3.5
-- Exact payment item selection and approved receipt visibility.
-- Additive function/policy overrides only. Does not rewrite financial history.

begin;

grant select on public.obligation_balances_v3 to authenticated;

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
  select hm.id, p.display_name, hm.role, p.avatar_path, hm.is_active
  from public.household_members hm
  join public.profiles p on p.id = hm.profile_id
  where hm.household_id = public.current_household_id_v3()
    and (p_include_inactive or hm.is_active = true)
  order by hm.created_at asc;
$$;

grant execute on function public.household_member_directory_v3(boolean) to authenticated;

create or replace function public.payment_target_options_v3(
  p_debtor uuid default null,
  p_creditor uuid default null
)
returns table(
  obligation_id uuid,
  due_date date,
  source_category text,
  label text,
  source_type text,
  outstanding_cents bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current uuid := public.current_member_id_v3();
  v_debtor uuid := coalesce(p_debtor, v_current);
  v_household uuid;
  v_active_month date;
begin
  if v_current is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select hm.household_id into v_household
  from public.household_members hm
  where hm.id = v_debtor
    and hm.is_active = true;

  if v_household is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_debtor <> v_current and not public.is_household_admin_v3(v_household) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_creditor is not null and not exists (
    select 1
    from public.household_members hm
    where hm.id = p_creditor
      and hm.household_id = v_household
      and hm.is_active = true
  ) then
    raise exception 'invalid payee';
  end if;

  select max(bp.month) into v_active_month
  from public.billing_periods bp
  where bp.household_id = v_household
    and bp.status = 'active';

  return query
  select
    ob.id as obligation_id,
    coalesce(e.due_date, ob.due_date) as due_date,
    coalesce(e.category, ob.source_category, 'Expense') as source_category,
    coalesce(e.description, e.category, ob.source_category, 'Expense') as label,
    coalesce(
      e.source_type,
      case when o.source_paylater_installment_id is not null then 'paylater' else 'expense' end
    ) as source_type,
    ob.outstanding_cents::bigint
  from public.obligation_balances_v3 ob
  join public.obligations o on o.id = ob.id
  join public.billing_periods bp on bp.id = ob.period_id
  left join public.expenses e on e.id = ob.source_expense_id
  where ob.household_id = v_household
    and ob.debtor_member_id = v_debtor
    and (p_creditor is null or ob.creditor_member_id = p_creditor)
    and ob.outstanding_cents > 0
    and bp.month <= coalesce(v_active_month, bp.month)
  order by coalesce(e.due_date, ob.due_date) nulls last, coalesce(e.category, ob.source_category, 'Expense'), ob.id;
end;
$$;

grant execute on function public.payment_target_options_v3(uuid,uuid) to authenticated;

create or replace function public.validated_payment_allocations_v3(
  p_household uuid,
  p_payer uuid,
  p_payee uuid,
  p_allocations jsonb,
  p_expected_allocated_cents bigint,
  p_allow_empty boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current uuid := public.current_member_id_v3();
  v_active_month date;
  v_sum bigint := 0;
  v_rows jsonb := '[]'::jsonb;
  v_allocation jsonb;
  v_obligation record;
begin
  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'payment allocations must be a list';
  end if;

  if v_current is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_household is null or p_payer is null or p_payee is null or p_payer = p_payee then
    raise exception 'invalid payment';
  end if;

  if v_current <> p_payer and not public.is_household_admin_v3(p_household) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.household_members payer
    join public.household_members payee
      on payee.id = p_payee
      and payee.household_id = payer.household_id
      and payee.is_active = true
    where payer.id = p_payer
      and payer.household_id = p_household
      and payer.is_active = true
  ) then
    raise exception 'invalid household member';
  end if;

  if jsonb_array_length(coalesce(p_allocations, '[]'::jsonb)) = 0 then
    if p_allow_empty and coalesce(p_expected_allocated_cents, 0) = 0 then
      return '[]'::jsonb;
    end if;
    raise exception 'choose at least one payment item';
  end if;

  if exists (
    select 1
    from (
      select nullif(item.value->>'obligation_id', '') as obligation_id
      from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) as item(value)
    ) selected
    where selected.obligation_id is not null
    group by selected.obligation_id
    having count(*) > 1
  ) then
    raise exception 'selected payment item was duplicated';
  end if;

  select max(bp.month) into v_active_month
  from public.billing_periods bp
  where bp.household_id = p_household
    and bp.status = 'active';

  for v_allocation in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb))
  loop
    if nullif(v_allocation->>'obligation_id', '') is null then
      raise exception 'selected payment item no longer available';
    end if;

    if coalesce((v_allocation->>'amount_cents')::bigint, 0) <= 0 then
      raise exception 'allocation amount must be positive';
    end if;

    select
      o.id,
      coalesce(e.due_date, o.due_date) as due_date,
      coalesce(e.category, o.source_category, 'Expense') as source_category,
      coalesce(e.description, e.category, o.source_category, 'Expense') as label,
      coalesce(
        e.source_type,
        case when o.source_paylater_installment_id is not null then 'paylater' else 'expense' end
      ) as source_type,
      ob.outstanding_cents::bigint as outstanding_cents
    into v_obligation
    from public.obligations o
    join public.billing_periods bp on bp.id = o.period_id
    join public.obligation_balances_v3 ob on ob.id = o.id
    left join public.expenses e on e.id = o.source_expense_id
    where o.id = (v_allocation->>'obligation_id')::uuid
      and o.household_id = p_household
      and o.debtor_member_id = p_payer
      and o.creditor_member_id = p_payee
      and o.status = 'active'
      and ob.outstanding_cents > 0
      and bp.month <= coalesce(v_active_month, bp.month)
    for update of o;

    if not found then
      raise exception 'selected payment item no longer available';
    end if;

    if (v_allocation->>'amount_cents')::bigint > v_obligation.outstanding_cents then
      raise exception 'selected payment item no longer available or exceeds outstanding';
    end if;

    v_sum := v_sum + (v_allocation->>'amount_cents')::bigint;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'obligation_id', v_obligation.id,
      'amount_cents', (v_allocation->>'amount_cents')::bigint,
      'category', v_obligation.source_category,
      'label', v_obligation.label,
      'source_type', v_obligation.source_type,
      'due_date', v_obligation.due_date
    ));
  end loop;

  if v_sum <> coalesce(p_expected_allocated_cents, 0) then
    raise exception 'selected payment total must match payment amount';
  end if;

  return v_rows;
end;
$$;

revoke all on function public.validated_payment_allocations_v3(uuid,uuid,uuid,jsonb,bigint,boolean) from public;
revoke all on function public.validated_payment_allocations_v3(uuid,uuid,uuid,jsonb,bigint,boolean) from authenticated;

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
  v_allocations jsonb;
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

  select hm.household_id into v_household
  from public.household_members hm
  where hm.id = v_payer;

  if not exists (
    select 1
    from public.household_members hm
    where hm.id = p_payee
      and hm.household_id = v_household
      and hm.is_active = true
  ) then
    raise exception 'invalid payee';
  end if;

  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  if v_key is null then
    v_key := 'claim:' || gen_random_uuid()::text;
  end if;

  select pc.id into v_id
  from public.payment_claims pc
  where pc.household_id = v_household
    and pc.idempotency_key = v_key;

  if v_id is not null then
    return v_id;
  end if;

  v_allocations := public.validated_payment_allocations_v3(
    v_household,
    v_payer,
    p_payee,
    p_suggested_allocations,
    p_amount_cents,
    false
  );

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
    v_allocations,
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

create or replace function public.review_payment_claim_v3(
  p_claim uuid,
  p_decision text,
  p_allocations jsonb default '[]'::jsonb,
  p_rejection_reason text default null,
  p_idempotency_key text default null,
  p_credit_cents bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.payment_claims%rowtype;
  v_actor uuid := public.current_member_id_v3();
  v_payment uuid;
  j jsonb;
  v_sum bigint := 0;
  v_payer_name text;
  v_allocations jsonb := '[]'::jsonb;
  v_expected_allocated bigint;
begin
  select * into c
  from public.payment_claims pc
  where pc.id = p_claim
  for update;

  if c.id is null then
    raise exception 'claim not found';
  end if;

  if not public.is_household_admin_v3(c.household_id) then
    raise exception 'admin required' using errcode = '42501';
  end if;

  if c.status <> 'pending' then
    return jsonb_build_object('claim_id', c.id, 'status', c.status);
  end if;

  if p_decision = 'reject' then
    update public.payment_claims
    set status = 'rejected',
        rejection_reason = coalesce(p_rejection_reason, 'Rejected by admin'),
        reviewed_by = v_actor,
        reviewed_at = now(),
        version = version + 1,
        updated_at = now()
    where id = c.id;

    insert into public.notifications(household_id,recipient_member_id,type,title,body,target_type,target_id,dedupe_key)
    values(c.household_id,c.payer_member_id,'payment_rejected','Payment not verified',coalesce(p_rejection_reason,'Your payment report was not verified.'),'payment_claim',c.id,'claim-rejected:'||c.id)
    on conflict(recipient_member_id, dedupe_key) do nothing;

    return jsonb_build_object('claim_id', c.id, 'status', 'rejected');
  end if;

  if p_decision <> 'verify' then
    raise exception 'invalid decision';
  end if;

  if coalesce(p_credit_cents, 0) < 0 then
    raise exception 'credit amount cannot be negative';
  end if;

  v_expected_allocated := c.amount_cents - coalesce(p_credit_cents, 0);
  if v_expected_allocated < 0 then
    raise exception 'credit amount cannot exceed payment amount';
  end if;

  v_allocations := public.validated_payment_allocations_v3(
    c.household_id,
    c.payer_member_id,
    c.payee_member_id,
    p_allocations,
    v_expected_allocated,
    v_expected_allocated = 0
  );

  if p_idempotency_key is null then
    p_idempotency_key := 'claim:' || c.id::text;
  end if;

  select p.display_name into v_payer_name
  from public.profiles p
  join public.household_members hm on hm.profile_id = p.id
  where hm.id = c.payer_member_id;

  select pay.id into v_payment
  from public.payments pay
  where pay.household_id = c.household_id
    and pay.idempotency_key = p_idempotency_key;

  if v_payment is null then
    insert into public.payments(
      household_id,
      payer_member_id,
      payee_member_id,
      claim_id,
      amount_cents,
      paid_at,
      method,
      reference_private,
      idempotency_key,
      verified_by
    )
    values(
      c.household_id,
      c.payer_member_id,
      c.payee_member_id,
      c.id,
      c.amount_cents,
      c.paid_at,
      c.method,
      c.reference_private,
      p_idempotency_key,
      v_actor
    )
    returning id into v_payment;
  end if;

  for j in select * from jsonb_array_elements(v_allocations)
  loop
    insert into public.payment_allocations(payment_id,obligation_id,amount_cents)
    values(v_payment,(j->>'obligation_id')::uuid,(j->>'amount_cents')::bigint)
    on conflict(payment_id,obligation_id) do nothing;

    v_sum := v_sum + (j->>'amount_cents')::bigint;
  end loop;

  if v_sum + coalesce(p_credit_cents, 0) <> c.amount_cents then
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
    values(c.household_id,c.payer_member_id,c.payee_member_id,p_credit_cents,p_credit_cents,v_payment);
  end if;

  update public.payment_claims
  set status = 'verified',
      suggested_allocations = v_allocations,
      reviewed_by = v_actor,
      reviewed_at = now(),
      version = version + 1,
      updated_at = now()
  where id = c.id;

  insert into public.notifications(household_id,recipient_member_id,type,title,body,target_type,target_id,dedupe_key)
  values(c.household_id,c.payer_member_id,'payment_verified','Payment verified','Your payment was approved.','payment_claim',c.id,'claim-verified:'||c.id)
  on conflict(recipient_member_id, dedupe_key) do nothing;

  insert into public.notifications(household_id,recipient_member_id,type,title,body,target_type,target_id,dedupe_key)
  values(
    c.household_id,
    c.payee_member_id,
    'payment_received',
    'Payment received',
    'Yehey, ' || coalesce(v_payer_name, 'your roommate') || ' pays you. Please check the receipt and details for your reference!',
    'payment_claim',
    c.id,
    'claim-received:' || c.id
  )
  on conflict(recipient_member_id, dedupe_key) do nothing;

  insert into public.audit_log(household_id,actor_member_id,action,entity_type,entity_id,after_json)
  values(c.household_id,v_actor,'verify','payment_claim',c.id,jsonb_build_object('payment_id',v_payment,'allocated_cents',v_sum,'credit_cents',coalesce(p_credit_cents,0)));

  return jsonb_build_object('claim_id', c.id, 'status', 'verified', 'payment_id', v_payment);
end;
$$;

create or replace function public.edit_payment_claim_v3(
  p_claim uuid,
  p_payee uuid,
  p_amount_cents bigint,
  p_paid_at timestamptz,
  p_method text,
  p_reference text,
  p_note text,
  p_suggested_allocations jsonb,
  p_expected_version integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.payment_claims%rowtype;
  v_actor uuid := public.current_member_id_v3();
  v_allocations jsonb;
begin
  select * into c
  from public.payment_claims pc
  where pc.id = p_claim
  for update;

  if c.id is null then
    raise exception 'claim not found';
  end if;

  if c.payer_member_id <> v_actor or c.status <> 'pending' then
    raise exception 'only pending claims can be edited' using errcode = '42501';
  end if;

  if p_expected_version is not null and c.version <> p_expected_version then
    raise exception 'stale claim';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'payment amount must be positive';
  end if;

  if p_payee is null or p_payee = v_actor then
    raise exception 'invalid payee';
  end if;

  if nullif(trim(coalesce(p_method, '')), '') is null then
    raise exception 'payment method is required';
  end if;

  if not exists (
    select 1
    from public.household_members hm
    where hm.id = p_payee
      and hm.household_id = c.household_id
      and hm.is_active = true
  ) then
    raise exception 'invalid payee';
  end if;

  v_allocations := public.validated_payment_allocations_v3(
    c.household_id,
    c.payer_member_id,
    p_payee,
    p_suggested_allocations,
    p_amount_cents,
    false
  );

  update public.payment_claims
  set payee_member_id = p_payee,
      amount_cents = p_amount_cents,
      paid_at = coalesce(p_paid_at, now()),
      method = trim(p_method),
      reference_private = coalesce(p_reference, ''),
      note = coalesce(p_note, ''),
      suggested_allocations = v_allocations,
      version = version + 1,
      updated_at = now()
  where id = c.id;

  return c.id;
end;
$$;

create or replace function public.withdraw_payment_claim_v3(
  p_claim uuid,
  p_expected_version integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.payment_claims%rowtype;
  v_actor uuid := public.current_member_id_v3();
begin
  select * into c
  from public.payment_claims pc
  where pc.id = p_claim
  for update;

  if c.id is null then
    raise exception 'claim not found';
  end if;

  if c.payer_member_id <> v_actor or c.status <> 'pending' then
    raise exception 'only pending claims can be withdrawn' using errcode = '42501';
  end if;

  if p_expected_version is not null and c.version <> p_expected_version then
    raise exception 'stale claim';
  end if;

  update public.payment_claims
  set status = 'withdrawn',
      version = version + 1,
      updated_at = now()
  where id = c.id;

  return c.id;
end;
$$;

create or replace function public.attach_payment_claim_receipt_v3(
  p_claim uuid,
  p_attachment uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.payment_claims%rowtype;
  a public.attachments%rowtype;
  v_actor uuid := public.current_member_id_v3();
begin
  select * into c
  from public.payment_claims pc
  where pc.id = p_claim
  for update;

  if c.id is null then
    raise exception 'claim not found';
  end if;

  if c.payer_member_id <> v_actor or c.status <> 'pending' then
    raise exception 'only pending claims can attach receipts' using errcode = '42501';
  end if;

  select * into a
  from public.attachments att
  where att.id = p_attachment;

  if a.id is null
    or a.household_id <> c.household_id
    or a.owner_member_id <> v_actor
    or a.parent_type <> 'payment_claim'
    or a.parent_id <> c.id
    or a.bucket <> 'financial-documents'
  then
    raise exception 'invalid receipt attachment';
  end if;

  update public.payment_claims
  set receipt_attachment_id = a.id,
      updated_at = now()
  where id = c.id;

  return c.id;
end;
$$;

grant execute on function public.submit_payment_claim_v3(uuid,bigint,timestamptz,text,text,text,jsonb,text) to authenticated;
grant execute on function public.review_payment_claim_v3(uuid,text,jsonb,text,text,bigint) to authenticated;
grant execute on function public.edit_payment_claim_v3(uuid,uuid,bigint,timestamptz,text,text,text,jsonb,integer) to authenticated;
grant execute on function public.withdraw_payment_claim_v3(uuid,integer) to authenticated;
grant execute on function public.attach_payment_claim_receipt_v3(uuid,uuid) to authenticated;

drop policy if exists "payment_claims owner or admin" on public.payment_claims;
drop policy if exists "payment_claims owner pending update" on public.payment_claims;
drop policy if exists "payment_claims payer payee or admin" on public.payment_claims;
create policy "payment_claims payer payee or admin"
on public.payment_claims for select to authenticated
using (
  payer_member_id = public.current_member_id_v3()
  or (
    payee_member_id = public.current_member_id_v3()
    and status = 'verified'
  )
  or public.is_household_admin_v3(household_id)
);

revoke update on public.payment_claims from authenticated;

drop policy if exists "attachments owner or admin" on public.attachments;
drop policy if exists "attachments payment claim participant read" on public.attachments;
create policy "attachments payment claim participant read"
on public.attachments for select to authenticated
using (
  owner_member_id = public.current_member_id_v3()
  or public.is_household_admin_v3(household_id)
  or exists (
    select 1
    from public.payment_claims pc
    where pc.receipt_attachment_id = attachments.id
      and pc.household_id = attachments.household_id
      and pc.status = 'verified'
      and (
        pc.payer_member_id = public.current_member_id_v3()
        or pc.payee_member_id = public.current_member_id_v3()
      )
  )
);

drop policy if exists "attachments private read" on storage.objects;
create policy "attachments private read"
on storage.objects for select to authenticated
using (
  bucket_id = 'financial-documents'
  and exists (
    select 1
    from public.attachments a
    where a.object_path = name
      and (
        a.owner_member_id = public.current_member_id_v3()
        or public.is_household_admin_v3(a.household_id)
        or exists (
          select 1
          from public.payment_claims pc
          where pc.receipt_attachment_id = a.id
            and pc.household_id = a.household_id
            and pc.status = 'verified'
            and (
              pc.payer_member_id = public.current_member_id_v3()
              or pc.payee_member_id = public.current_member_id_v3()
            )
        )
      )
  )
);

commit;
