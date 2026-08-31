-- DormFlow v3.3 additive upgrade: authoritative Inbox + active billing month.
-- Safe for an existing v3.2 household. Historical financial rows are not moved or deleted.

begin;

alter table public.notification_preferences
  add column if not exists month_balance_updates boolean not null default true;

alter table public.notifications
  add column if not exists push_sent_at timestamptz,
  add column if not exists push_attempted_at timestamptz;

alter table public.notification_preferences alter column expense_updates set default true;

update public.notification_preferences
set payment_updates=true,
    due_reminders=true,
    announcements=true,
    expense_updates=true,
    month_balance_updates=true,
    updated_at=now();

-- Repair any pre-v3.3 accidental multiple active periods before enforcing the invariant.
with ranked as (
  select id,row_number() over(partition by household_id order by month desc,created_at desc,id desc) as rn
  from public.billing_periods
  where status='active'
)
update public.billing_periods bp
set status='closed',updated_at=now()
from ranked r
where bp.id=r.id and r.rn>1;

create unique index if not exists billing_periods_one_active_per_household
  on public.billing_periods(household_id)
  where (status='active');

create or replace function public.set_active_month_v3(p_month date)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  i record;
  v_month date:=date_trunc('month',p_month)::date;
  v_target uuid;
  v_target_status text;
  v_previous uuid;
  v_member record;
  v_carry bigint;
  v_label text;
  v_type text;
  v_body text;
begin
  select * into i from public.current_identity_v3();
  if i.member_id is null or i.role<>'admin' then
    raise exception 'admin required' using errcode='42501';
  end if;

  -- Serialize month changes for this household.
  perform 1 from public.billing_periods where household_id=i.household_id for update;

  select id,status into v_target,v_target_status
  from public.billing_periods
  where household_id=i.household_id and month=v_month;

  if v_target_status='closed' then
    raise exception 'closed billing periods cannot be reactivated';
  end if;

  if v_target is null then
    insert into public.billing_periods(household_id,month,status,created_by)
    values(i.household_id,v_month,'draft',i.member_id)
    returning id,status into v_target,v_target_status;
  end if;

  select id into v_previous
  from public.billing_periods
  where household_id=i.household_id and status='active' and id<>v_target
  order by month desc
  limit 1;

  update public.billing_periods
  set status='closed',updated_at=now()
  where household_id=i.household_id and status='active' and id<>v_target;

  update public.billing_periods
  set status='active',updated_at=now()
  where id=v_target;

  insert into public.audit_log(household_id,actor_member_id,action,entity_type,entity_id,before_json,after_json)
  values(i.household_id,i.member_id,'activate','billing_period',v_target,
    jsonb_build_object('previous_period_id',v_previous),
    jsonb_build_object('month',v_month,'status','active'));

  v_label:=trim(to_char(v_month,'FMMonth YYYY'));

  for v_member in
    select hm.id
    from public.household_members hm
    where hm.household_id=i.household_id and hm.is_active and hm.id<>i.member_id
  loop
    select coalesce(sum(ob.outstanding_cents),0)::bigint into v_carry
    from public.obligation_balances_v3 ob
    join public.billing_periods bp on bp.id=ob.period_id
    where ob.debtor_member_id=v_member.id
      and ob.outstanding_cents>0
      and bp.month<v_month;

    if v_carry>0 then
      v_type:='balance_carry_forward';
      v_body:='₱'||to_char(v_carry/100.0,'FM999G999G990D00')||' from earlier months remains in your current balance.';
    else
      v_type:='month_activated';
      v_body:='Your '||v_label||' billing month is now active.';
    end if;

    insert into public.notifications(household_id,recipient_member_id,type,title,body,target_type,target_id,dedupe_key)
    values(i.household_id,v_member.id,v_type,v_label||' is now active',v_body,'billing_period',v_target,'month:'||v_target::text)
    on conflict(recipient_member_id,dedupe_key) do nothing;
  end loop;

  return v_target;
end $$;

grant execute on function public.set_active_month_v3(date) to authenticated;

create or replace function public.initialize_month_v3(p_household uuid,p_month date,p_idempotency_key text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare i record;
begin
  select * into i from public.current_identity_v3();
  if i.member_id is null or i.role<>'admin' or i.household_id<>p_household then
    raise exception 'admin required' using errcode='42501';
  end if;
  return public.set_active_month_v3(p_month);
end $$;

grant execute on function public.initialize_month_v3(uuid,date,text) to authenticated;

create or replace function public.member_home_v3() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare i record; b jsonb; v_period uuid; v_month date; v_total bigint;
begin
  select * into i from public.current_identity_v3();
  if i.member_id is null then raise exception 'identity not linked'; end if;
  b:=public.member_balance_v3();
  select id,month into v_period,v_month from public.billing_periods where household_id=i.household_id and status='active' limit 1;
  select coalesce(sum(amount_cents),0) into v_total from public.expenses where period_id=v_period and status='active';
  return b||jsonb_build_object(
    'display_name',i.display_name,
    'role',i.role,
    'household_total_cents',v_total,
    'period_id',v_period,
    'period_month',v_month,
    'due_soon_cents',coalesce((select sum(outstanding_cents) from public.obligation_balances_v3 where debtor_member_id=i.member_id and due_date between current_date and current_date+3),0),
    'categories',coalesce((select jsonb_object_agg(category,total) from (select category,sum(amount_cents)::bigint total from public.expenses where period_id=v_period and status='active' group by category) x),'{}'::jsonb)
  );
end $$;

create or replace function public.admin_overview_v3() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare i record; v_period uuid; v_month date;
begin
  select * into i from public.current_identity_v3();
  if i.role<>'admin' then raise exception 'admin required' using errcode='42501'; end if;
  select id,month into v_period,v_month from public.billing_periods where household_id=i.household_id and status='active' limit 1;
  return jsonb_build_object(
    'display_name',i.display_name,
    'period_id',v_period,
    'period_month',v_month,
    'outstanding_cents',coalesce((select sum(outstanding_cents) from public.obligation_balances_v3 where household_id=i.household_id),0),
    'pending_claims',coalesce((select count(*) from public.payment_claims where household_id=i.household_id and status='pending'),0),
    'overdue_count',coalesce((select count(*) from public.obligation_balances_v3 where household_id=i.household_id and outstanding_cents>0 and due_date<current_date),0)
  );
end $$;

grant execute on function public.member_home_v3(),public.admin_overview_v3() to authenticated;

-- v3.3 event-producing RPC overrides: Inbox creation never depends on push preferences.
create or replace function public.create_expense_v3(p_household uuid,p_period uuid,p_category text,p_description text,p_amount_cents bigint,p_expense_date date,p_due_date date,p_payers jsonb,p_splits jsonb,p_source_type text default 'other',p_source_label text default null,p_idempotency_key text default null,p_utility_type text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=public.current_member_id_v3(); v_id uuid; v_payer_total bigint; v_split_total bigint; j jsonb; v_recipient uuid; v_share bigint; v_type text; v_body text;
begin
  if not public.is_household_admin_v3(p_household) then raise exception 'admin required' using errcode='42501'; end if;
  if p_amount_cents<=0 then raise exception 'amount must be positive'; end if;
  if p_idempotency_key is not null then select id into v_id from public.expenses where household_id=p_household and idempotency_key=p_idempotency_key; if v_id is not null then return v_id; end if; end if;
  select coalesce(sum((x->>'amount_cents')::bigint),0) into v_payer_total from jsonb_array_elements(p_payers) x;
  select coalesce(sum((x->>'amount_cents')::bigint),0) into v_split_total from jsonb_array_elements(p_splits) x;
  if v_payer_total<>p_amount_cents or v_split_total<>p_amount_cents then raise exception 'payers and splits must equal expense total'; end if;
  insert into public.expenses(household_id,period_id,category,description,amount_cents,expense_date,due_date,source_type,source_label,idempotency_key,created_by,updated_by)
  values(p_household,p_period,trim(p_category),trim(p_description),p_amount_cents,coalesce(p_expense_date,current_date),p_due_date,coalesce(p_source_type,'other'),p_source_label,p_idempotency_key,v_actor,v_actor) returning id into v_id;
  for j in select * from jsonb_array_elements(p_payers) loop insert into public.expense_payers(expense_id,member_id,amount_cents) values(v_id,(j->>'member_id')::uuid,(j->>'amount_cents')::bigint); end loop;
  for j in select * from jsonb_array_elements(p_splits) loop insert into public.expense_splits(expense_id,member_id,amount_cents,percentage) values(v_id,(j->>'member_id')::uuid,(j->>'amount_cents')::bigint,nullif(j->>'percentage','')::numeric); end loop;
  perform public.generate_expense_obligations_v3(v_id);
  if p_utility_type is not null then insert into public.utility_records(expense_id,utility_type) values(v_id,p_utility_type); end if;
  v_type:=case when p_utility_type is null then 'expense_added' else 'utility_added' end;
  for j in select * from jsonb_array_elements(p_splits) loop
    v_recipient:=(j->>'member_id')::uuid; v_share:=(j->>'amount_cents')::bigint;
    if v_share>0 and v_recipient<>v_actor and exists(select 1 from public.household_members hm where hm.id=v_recipient and hm.household_id=p_household and hm.is_active) then
      v_body:='Your share is ₱'||to_char(v_share/100.0,'FM999G999G990D00')||case when p_due_date is not null then ' · due '||to_char(p_due_date,'Mon DD') else '' end||'.';
      insert into public.notifications(household_id,recipient_member_id,type,title,body,target_type,target_id,dedupe_key)
      values(p_household,v_recipient,v_type,trim(p_description),v_body,'expense',v_id,'expense:'||v_id::text)
      on conflict(recipient_member_id,dedupe_key) do nothing;
    end if;
  end loop;
  insert into public.audit_log(household_id,actor_member_id,action,entity_type,entity_id,after_json) values(p_household,v_actor,'create','expense',v_id,jsonb_build_object('amount_cents',p_amount_cents,'category',p_category));
  return v_id;
end $$;

-- Existing v3.2 submit/review functions already create payment_claim, payment_verified, and payment_rejected Inbox rows without preference checks.
-- The v3.3 migration preserves those functions and changes admin-recorded payment to payment_recorded.
create or replace function public.record_payment_v3(p_payer uuid,p_payee uuid,p_amount_cents bigint,p_paid_at timestamptz,p_method text,p_reference text,p_allocations jsonb default '[]'::jsonb,p_credit_cents bigint default 0,p_idempotency_key text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=public.current_member_id_v3(); v_household uuid:=public.current_household_id_v3(); v_payment uuid; j jsonb; v_sum bigint:=0; v_out bigint;
begin
  if not public.is_household_admin_v3(v_household) then raise exception 'admin required' using errcode='42501'; end if;
  if p_amount_cents<=0 or p_payer=p_payee then raise exception 'invalid payment'; end if;
  if not exists(select 1 from public.household_members where id=p_payer and household_id=v_household and is_active) or not exists(select 1 from public.household_members where id=p_payee and household_id=v_household and is_active) then raise exception 'invalid household member'; end if;
  if p_idempotency_key is not null then select id into v_payment from public.payments where household_id=v_household and idempotency_key=p_idempotency_key; if v_payment is not null then return v_payment; end if; end if;
  insert into public.payments(household_id,payer_member_id,payee_member_id,amount_cents,paid_at,method,reference_private,idempotency_key,verified_by) values(v_household,p_payer,p_payee,p_amount_cents,p_paid_at,trim(p_method),coalesce(p_reference,''),p_idempotency_key,v_actor) returning id into v_payment;
  for j in select * from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) loop
    perform 1 from public.obligations where id=(j->>'obligation_id')::uuid and debtor_member_id=p_payer and (creditor_member_id=p_payee or creditor_member_id is null) for update;
    select outstanding_cents into v_out from public.obligation_balances_v3 where id=(j->>'obligation_id')::uuid;
    if v_out is null or (j->>'amount_cents')::bigint>v_out then raise exception 'allocation exceeds outstanding'; end if;
    insert into public.payment_allocations(payment_id,obligation_id,amount_cents) values(v_payment,(j->>'obligation_id')::uuid,(j->>'amount_cents')::bigint); v_sum:=v_sum+(j->>'amount_cents')::bigint;
  end loop;
  if v_sum+p_credit_cents<>p_amount_cents then raise exception 'payment must be fully allocated or credited'; end if;
  if p_credit_cents>0 then insert into public.credits(household_id,owner_member_id,creditor_member_id,original_amount_cents,remaining_amount_cents,source_payment_id) values(v_household,p_payer,p_payee,p_credit_cents,p_credit_cents,v_payment); end if;
  insert into public.notifications(household_id,recipient_member_id,type,title,body,target_type,target_id,dedupe_key) values(v_household,p_payer,'payment_recorded','Payment recorded','Your payment was recorded by the household admin.','payment',v_payment,'payment-recorded:'||v_payment::text) on conflict(recipient_member_id,dedupe_key) do nothing;
  insert into public.audit_log(household_id,actor_member_id,action,entity_type,entity_id,after_json) values(v_household,v_actor,'record','payment',v_payment,jsonb_build_object('amount_cents',p_amount_cents,'allocated_cents',v_sum,'credit_cents',p_credit_cents));
  return v_payment;
end $$;

create or replace function public.create_announcement_v3(p_title text,p_body text,p_priority text,p_starts_at timestamptz,p_ends_at timestamptz,p_notify_household boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=public.current_member_id_v3();v_household uuid;v_id uuid;r record;
begin
  select household_id into v_household from public.household_members where id=v_actor;
  if not public.is_household_admin_v3(v_household) then raise exception 'admin required' using errcode='42501';end if;
  insert into public.announcements(household_id,title,body,priority,starts_at,ends_at,notify_household,created_by,updated_by) values(v_household,trim(p_title),trim(p_body),p_priority,p_starts_at,p_ends_at,p_notify_household,v_actor,v_actor) returning id into v_id;
  for r in select hm.id from public.household_members hm where hm.household_id=v_household and hm.is_active and hm.id<>v_actor loop
    insert into public.notifications(household_id,recipient_member_id,type,title,body,target_type,target_id,dedupe_key) values(v_household,r.id,'announcement',p_title,p_body,'announcement',v_id,'announcement:'||v_id::text) on conflict(recipient_member_id,dedupe_key) do nothing;
  end loop;
  return v_id;
end $$;


commit;
