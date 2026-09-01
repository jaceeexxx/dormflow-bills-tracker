-- DormFlow v3 fresh authenticated schema. Run once on a NEW Supabase project.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null check(length(trim(display_name)) between 1 and 60),
  avatar_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.households (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  timezone text not null default 'Asia/Manila', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.household_members (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade, role text not null check(role in ('admin','member')),
  is_active boolean not null default true, accent text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(household_id,profile_id)
);
create table public.member_payment_methods (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references public.household_members(id) on delete cascade,
  method text not null, label text not null, masked_account text not null default '', qr_attachment_id uuid,
  is_default boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.billing_periods (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  month date not null check(month=date_trunc('month',month)::date), status text not null default 'draft' check(status in ('draft','active','closed')),
  created_by uuid references public.household_members(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(household_id,month)
);
create unique index billing_periods_one_active_per_household on public.billing_periods(household_id) where (status='active');
create table public.expenses (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  period_id uuid not null references public.billing_periods(id) on delete restrict, category text not null,
  description text not null, amount_cents bigint not null check(amount_cents>0), expense_date date not null default current_date, due_date date,
  source_type text not null default 'other', source_label text, status text not null default 'active' check(status in ('draft','active','void')),
  version integer not null default 1, idempotency_key text, created_by uuid references public.household_members(id), updated_by uuid references public.household_members(id),
  voided_at timestamptz, voided_by uuid references public.household_members(id), void_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(household_id,idempotency_key)
);
create table public.expense_payers (
  id uuid primary key default gen_random_uuid(), expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id uuid not null references public.household_members(id), amount_cents bigint not null check(amount_cents>0), unique(expense_id,member_id)
);
create table public.expense_splits (
  id uuid primary key default gen_random_uuid(), expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id uuid not null references public.household_members(id), amount_cents bigint not null check(amount_cents>=0), percentage numeric(8,4), unique(expense_id,member_id)
);
create table public.obligations (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  period_id uuid not null references public.billing_periods(id) on delete restrict, source_expense_id uuid references public.expenses(id) on delete restrict,
  source_paylater_installment_id uuid, debtor_member_id uuid not null references public.household_members(id), creditor_member_id uuid references public.household_members(id), creditor_label text,
  original_amount_cents bigint not null check(original_amount_cents>0), due_date date, source_category text not null, status text not null default 'active' check(status in ('active','void')),
  created_at timestamptz not null default now(), check(creditor_member_id is not null or length(trim(coalesce(creditor_label,'')))>0), check(creditor_member_id is null or creditor_member_id<>debtor_member_id)
);
create table public.payment_claims (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  payer_member_id uuid not null references public.household_members(id), payee_member_id uuid not null references public.household_members(id),
  amount_cents bigint not null check(amount_cents>0), paid_at timestamptz not null, method text not null, reference_private text not null default '', note text not null default '',
  suggested_allocations jsonb not null default '[]'::jsonb, receipt_attachment_id uuid, status text not null default 'pending' check(status in ('pending','verified','rejected','withdrawn')),
  idempotency_key text not null, version integer not null default 1, reviewed_by uuid references public.household_members(id), reviewed_at timestamptz, rejection_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(household_id,idempotency_key), check(payer_member_id<>payee_member_id)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  payer_member_id uuid not null references public.household_members(id), payee_member_id uuid not null references public.household_members(id), claim_id uuid unique references public.payment_claims(id),
  amount_cents bigint not null check(amount_cents>0), paid_at timestamptz not null, method text not null, reference_private text not null default '', status text not null default 'approved' check(status in ('approved','void')),
  idempotency_key text not null, verified_by uuid references public.household_members(id), updated_by uuid references public.household_members(id), voided_by uuid references public.household_members(id), voided_at timestamptz, void_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(household_id,idempotency_key), check(payer_member_id<>payee_member_id)
);
create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.payments(id) on delete restrict,
  obligation_id uuid not null references public.obligations(id) on delete restrict, amount_cents bigint not null check(amount_cents>0), created_at timestamptz not null default now(), unique(payment_id,obligation_id)
);
create table public.credits (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  owner_member_id uuid not null references public.household_members(id), creditor_member_id uuid not null references public.household_members(id),
  original_amount_cents bigint not null check(original_amount_cents>0), remaining_amount_cents bigint not null check(remaining_amount_cents>=0), source_payment_id uuid references public.payments(id),
  status text not null default 'active' check(status in ('active','used','void')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(owner_member_id<>creditor_member_id)
);
create table public.credit_applications (
  id uuid primary key default gen_random_uuid(), credit_id uuid not null references public.credits(id) on delete restrict,
  obligation_id uuid not null references public.obligations(id) on delete restrict, amount_cents bigint not null check(amount_cents>0), created_at timestamptz not null default now()
);
create table public.utility_records (
  id uuid primary key default gen_random_uuid(), expense_id uuid not null unique references public.expenses(id) on delete cascade,
  utility_type text not null check(utility_type in ('electricity','water','wifi')), account_label text, bill_period_start date, bill_period_end date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.paylater_accounts (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  provider text not null, borrower_member_id uuid references public.household_members(id), borrower_label text, creditor_member_id uuid references public.household_members(id),
  original_total_cents bigint not null check(original_total_cents>0), schedule_mode text not null default 'equal' check(schedule_mode in ('equal','custom')), status text not null default 'active' check(status in ('active','completed','void')),
  created_by uuid references public.household_members(id), updated_by uuid references public.household_members(id), archived_at timestamptz, archived_by uuid references public.household_members(id), archive_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(borrower_member_id is not null or length(trim(coalesce(borrower_label,'')))>0)
);
create table public.paylater_installments (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references public.paylater_accounts(id) on delete cascade,
  period_id uuid references public.billing_periods(id), due_date date not null, amount_cents bigint not null check(amount_cents>0), sequence_no integer not null check(sequence_no>0),
  status text not null default 'scheduled' check(status in ('scheduled','posted','paid','void')), source_expense_id uuid references public.expenses(id), updated_at timestamptz not null default now(), unique(account_id,sequence_no)
);
create table public.split_presets (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  name text not null, mode text not null check(mode in ('equal','custom_amount','custom_percentage','single')), config jsonb not null default '{}'::jsonb,
  is_default boolean not null default false, created_by uuid references public.household_members(id), created_at timestamptz not null default now(), unique(household_id,name)
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  title text not null, body text not null, priority text not null default 'normal' check(priority in ('normal','important','urgent')),
  starts_at timestamptz not null default now(), ends_at timestamptz, is_active boolean not null default true, notify_household boolean not null default false,
  created_by uuid references public.household_members(id), updated_by uuid references public.household_members(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(ends_at is null or ends_at>starts_at)
);
create table public.attachments (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  owner_member_id uuid references public.household_members(id), parent_type text not null, parent_id uuid not null,
  bucket text not null default 'financial-documents', object_path text not null unique, mime_type text not null, file_size bigint not null check(file_size>0),
  created_by uuid references public.household_members(id), created_at timestamptz not null default now()
);
alter table public.member_payment_methods add constraint member_payment_methods_qr_attachment_id_fkey foreign key(qr_attachment_id) references public.attachments(id) deferrable initially deferred;
alter table public.payment_claims add constraint payment_claims_receipt_attachment_id_fkey foreign key(receipt_attachment_id) references public.attachments(id) deferrable initially deferred;
create table public.notifications (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  recipient_member_id uuid not null references public.household_members(id) on delete cascade, type text not null, title text not null, body text not null,
  target_type text, target_id uuid, dedupe_key text, read_at timestamptz, push_sent_at timestamptz, push_attempted_at timestamptz, created_at timestamptz not null default now(), unique(recipient_member_id,dedupe_key)
);
create table public.notification_preferences (
  member_id uuid primary key references public.household_members(id) on delete cascade, payment_updates boolean not null default true,
  due_reminders boolean not null default true, announcements boolean not null default true, expense_updates boolean not null default true, month_balance_updates boolean not null default true, updated_at timestamptz not null default now()
);
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references public.household_members(id) on delete cascade,
  endpoint text not null, p256dh text not null, auth_secret text not null, user_agent text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(member_id,endpoint)
);
create table public.audit_log (
  id bigint generated by default as identity primary key, household_id uuid not null references public.households(id) on delete cascade,
  actor_member_id uuid references public.household_members(id), action text not null, entity_type text not null, entity_id uuid, before_json jsonb, after_json jsonb, reason text,
  created_at timestamptz not null default now()
);

create index obligations_debtor_idx on public.obligations(debtor_member_id,status,due_date);
create index obligations_creditor_idx on public.obligations(creditor_member_id,status);
create index claims_status_idx on public.payment_claims(household_id,status,created_at desc);
create index announcements_active_idx on public.announcements(household_id,is_active,starts_at,ends_at);

-- Identity helpers. SECURITY DEFINER avoids RLS recursion; only UUID/role membership is exposed.
create or replace function public.current_member_id_v3() returns uuid language sql stable security definer set search_path=public as $$
  select hm.id from public.household_members hm join public.profiles p on p.id=hm.profile_id where p.user_id=auth.uid() and hm.is_active order by hm.created_at limit 1
$$;
create or replace function public.current_household_id_v3() returns uuid language sql stable security definer set search_path=public as $$
  select hm.household_id from public.household_members hm join public.profiles p on p.id=hm.profile_id where p.user_id=auth.uid() and hm.is_active order by hm.created_at limit 1
$$;
create or replace function public.is_household_admin_v3(p_household uuid default null) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.household_members hm join public.profiles p on p.id=hm.profile_id where p.user_id=auth.uid() and hm.is_active and hm.role='admin' and (p_household is null or hm.household_id=p_household))
$$;
create or replace function public.current_identity_v3() returns table(user_id uuid,profile_id uuid,member_id uuid,household_id uuid,display_name text,role text) language sql stable security definer set search_path=public as $$
  select p.user_id,p.id,hm.id,hm.household_id,p.display_name,hm.role from public.profiles p join public.household_members hm on hm.profile_id=p.id where p.user_id=auth.uid() and hm.is_active limit 1
$$;

-- Outstanding read helper excludes voided financial activity.
create or replace view public.obligation_balances_v3 as
select o.id,o.household_id,o.period_id,o.source_expense_id,o.debtor_member_id,o.creditor_member_id,o.creditor_label,o.original_amount_cents,o.due_date,o.source_category,
  greatest(0,o.original_amount_cents
    -coalesce((select sum(pa.amount_cents) from public.payment_allocations pa join public.payments p on p.id=pa.payment_id where pa.obligation_id=o.id and p.status='approved'),0)
    -coalesce((select sum(ca.amount_cents) from public.credit_applications ca join public.credits c on c.id=ca.credit_id where ca.obligation_id=o.id and c.status<>'void'),0))::bigint as outstanding_cents
from public.obligations o left join public.expenses e on e.id=o.source_expense_id
where o.status='active' and (e.id is null or e.status='active');

-- Transaction helper: create obligations from member net positions for an expense.
create or replace function public.generate_expense_obligations_v3(p_expense uuid) returns void language plpgsql security definer set search_path=public as $$
declare d record; c record; v_need bigint; v_take bigint;
begin
  delete from public.obligations where source_expense_id=p_expense;
  for d in
    with net as (
      select s.member_id, coalesce(p.paid,0)-s.amount_cents as balance
      from public.expense_splits s left join (select member_id,sum(amount_cents)::bigint paid from public.expense_payers where expense_id=p_expense group by member_id) p using(member_id)
      where s.expense_id=p_expense
    ) select member_id,-balance as need from net where balance<0 order by member_id
  loop
    v_need:=d.need;
    for c in
      with net as (
        select s.member_id, coalesce(p.paid,0)-s.amount_cents as balance
        from public.expense_splits s left join (select member_id,sum(amount_cents)::bigint paid from public.expense_payers where expense_id=p_expense group by member_id) p using(member_id)
        where s.expense_id=p_expense
      ), used as (select creditor_member_id,sum(original_amount_cents)::bigint used from public.obligations where source_expense_id=p_expense group by creditor_member_id)
      select n.member_id,n.balance-coalesce(u.used,0) available from net n left join used u on u.creditor_member_id=n.member_id where n.balance>0 order by n.member_id
    loop
      exit when v_need<=0; continue when c.available<=0; v_take:=least(v_need,c.available);
      insert into public.obligations(household_id,period_id,source_expense_id,debtor_member_id,creditor_member_id,original_amount_cents,due_date,source_category)
      select e.household_id,e.period_id,e.id,d.member_id,c.member_id,v_take,e.due_date,e.category from public.expenses e where e.id=p_expense;
      v_need:=v_need-v_take;
    end loop;
    if v_need<>0 then raise exception 'payer/split funding did not reconcile'; end if;
  end loop;
end $$;

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

create or replace function public.submit_payment_claim_v3(p_payee uuid,p_amount_cents bigint,p_paid_at timestamptz,p_method text,p_reference text,p_note text,p_suggested_allocations jsonb,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_payer uuid:=public.current_member_id_v3(); v_household uuid; v_id uuid;
begin
  if v_payer is null then raise exception 'authentication required' using errcode='42501'; end if;
  select household_id into v_household from public.household_members where id=v_payer;
  if not exists(select 1 from public.household_members where id=p_payee and household_id=v_household and is_active) then raise exception 'invalid payee'; end if;
  select id into v_id from public.payment_claims where household_id=v_household and idempotency_key=p_idempotency_key; if v_id is not null then return v_id; end if;
  insert into public.payment_claims(household_id,payer_member_id,payee_member_id,amount_cents,paid_at,method,reference_private,note,suggested_allocations,idempotency_key)
  values(v_household,v_payer,p_payee,p_amount_cents,p_paid_at,trim(p_method),coalesce(p_reference,''),coalesce(p_note,''),coalesce(p_suggested_allocations,'[]'::jsonb),p_idempotency_key) returning id into v_id;
  insert into public.notifications(household_id,recipient_member_id,type,title,body,target_type,target_id,dedupe_key)
  select v_household,hm.id,'payment_claim','Payment waiting for review',(select display_name from public.profiles p join public.household_members m on m.profile_id=p.id where m.id=v_payer)||' reported a payment.','payment_claim',v_id,'claim:'||v_id::text from public.household_members hm where hm.household_id=v_household and hm.role='admin' and hm.is_active;
  return v_id;
end $$;

create or replace function public.review_payment_claim_v3(p_claim uuid,p_decision text,p_allocations jsonb default '[]'::jsonb,p_rejection_reason text default null,p_idempotency_key text default null,p_credit_cents bigint default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.payment_claims%rowtype; v_actor uuid:=public.current_member_id_v3(); v_payment uuid; j jsonb; v_sum bigint:=0; v_out bigint;
begin
  select * into c from public.payment_claims where id=p_claim for update; if c.id is null then raise exception 'claim not found'; end if;
  if not public.is_household_admin_v3(c.household_id) then raise exception 'admin required' using errcode='42501'; end if;
  if c.status<>'pending' then return jsonb_build_object('claim_id',c.id,'status',c.status); end if;
  if p_decision='reject' then update public.payment_claims set status='rejected',rejection_reason=coalesce(p_rejection_reason,'Rejected by admin'),reviewed_by=v_actor,reviewed_at=now(),version=version+1,updated_at=now() where id=c.id;
    insert into public.notifications(household_id,recipient_member_id,type,title,body,target_type,target_id,dedupe_key) values(c.household_id,c.payer_member_id,'payment_rejected','Payment not verified',coalesce(p_rejection_reason,'Your payment report was not verified.'),'payment_claim',c.id,'claim-rejected:'||c.id); return jsonb_build_object('claim_id',c.id,'status','rejected'); end if;
  if p_decision<>'verify' then raise exception 'invalid decision'; end if;
  if p_idempotency_key is null then p_idempotency_key:='claim:'||c.id::text; end if;
  select id into v_payment from public.payments where household_id=c.household_id and idempotency_key=p_idempotency_key;
  if v_payment is null then insert into public.payments(household_id,payer_member_id,payee_member_id,claim_id,amount_cents,paid_at,method,reference_private,idempotency_key,verified_by) values(c.household_id,c.payer_member_id,c.payee_member_id,c.id,c.amount_cents,c.paid_at,c.method,c.reference_private,p_idempotency_key,v_actor) returning id into v_payment; end if;
  for j in select * from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) loop
    perform 1 from public.obligations where id=(j->>'obligation_id')::uuid for update; select outstanding_cents into v_out from public.obligation_balances_v3 where id=(j->>'obligation_id')::uuid; if v_out is null or (j->>'amount_cents')::bigint>v_out then raise exception 'allocation exceeds outstanding'; end if;
    insert into public.payment_allocations(payment_id,obligation_id,amount_cents) values(v_payment,(j->>'obligation_id')::uuid,(j->>'amount_cents')::bigint) on conflict(payment_id,obligation_id) do nothing; v_sum:=v_sum+(j->>'amount_cents')::bigint;
  end loop;
  if v_sum+p_credit_cents<>c.amount_cents then raise exception 'payment must be fully allocated or credited'; end if;
  if p_credit_cents>0 then insert into public.credits(household_id,owner_member_id,creditor_member_id,original_amount_cents,remaining_amount_cents,source_payment_id) values(c.household_id,c.payer_member_id,c.payee_member_id,p_credit_cents,p_credit_cents,v_payment); end if;
  update public.payment_claims set status='verified',reviewed_by=v_actor,reviewed_at=now(),version=version+1,updated_at=now() where id=c.id;
  insert into public.notifications(household_id,recipient_member_id,type,title,body,target_type,target_id,dedupe_key) values(c.household_id,c.payer_member_id,'payment_verified','Payment verified','Your payment was approved.','payment_claim',c.id,'claim-verified:'||c.id);
  insert into public.audit_log(household_id,actor_member_id,action,entity_type,entity_id,after_json) values(c.household_id,v_actor,'verify','payment_claim',c.id,jsonb_build_object('payment_id',v_payment,'allocated_cents',v_sum,'credit_cents',p_credit_cents));
  return jsonb_build_object('claim_id',c.id,'status','verified','payment_id',v_payment);
end $$;

create or replace function public.delete_or_void_expense_v3(p_expense uuid,p_reason text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.expenses%rowtype; v_actor uuid:=public.current_member_id_v3(); v_linked boolean;
begin
  select * into e from public.expenses where id=p_expense for update; if e.id is null then raise exception 'expense not found'; end if;
  if not public.is_household_admin_v3(e.household_id) then raise exception 'admin required' using errcode='42501'; end if;
  select exists(select 1 from public.obligations o join public.payment_allocations pa on pa.obligation_id=o.id join public.payments p on p.id=pa.payment_id where o.source_expense_id=e.id and p.status='approved') into v_linked;
  if v_linked then update public.expenses set status='void',voided_at=now(),voided_by=v_actor,void_reason=coalesce(nullif(trim(p_reason),''),'Voided by admin'),updated_by=v_actor,updated_at=now(),version=version+1 where id=e.id; update public.obligations set status='void' where source_expense_id=e.id; insert into public.audit_log(household_id,actor_member_id,action,entity_type,entity_id,before_json,after_json,reason) values(e.household_id,v_actor,'void','expense',e.id,to_jsonb(e),jsonb_build_object('status','void'),p_reason); return jsonb_build_object('mode','voided','id',e.id); end if;
  delete from public.expenses where id=e.id; insert into public.audit_log(household_id,actor_member_id,action,entity_type,entity_id,before_json,reason) values(e.household_id,v_actor,'delete','expense',e.id,to_jsonb(e),p_reason); return jsonb_build_object('mode','deleted','id',e.id);
end $$;

create or replace function public.edit_expense_v3(p_expense uuid,p_expected_version integer,p_description text,p_amount_cents bigint,p_due_date date) returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.expenses%rowtype; v_actor uuid:=public.current_member_id_v3();
begin
  select * into e from public.expenses where id=p_expense for update; if e.id is null then raise exception 'expense not found'; end if; if not public.is_household_admin_v3(e.household_id) then raise exception 'admin required' using errcode='42501'; end if; if e.version<>p_expected_version then raise exception 'stale record'; end if;
  if p_amount_cents<>e.amount_cents and exists(select 1 from public.obligations o join public.payment_allocations pa on pa.obligation_id=o.id where o.source_expense_id=e.id) then raise exception 'settled expense amount requires adjustment/void'; end if;
  update public.expenses set description=trim(p_description),amount_cents=p_amount_cents,due_date=p_due_date,updated_by=v_actor,updated_at=now(),version=version+1 where id=e.id;
  insert into public.audit_log(household_id,actor_member_id,action,entity_type,entity_id,before_json,after_json) select e.household_id,v_actor,'edit','expense',e.id,to_jsonb(e),to_jsonb(x) from public.expenses x where x.id=e.id;
  return (select to_jsonb(x) from public.expenses x where x.id=e.id);
end $$;

create or replace function public.set_active_month_v3(p_month date)
returns uuid language plpgsql security definer set search_path=public as $$
declare i record; v_month date:=date_trunc('month',p_month)::date; v_target uuid; v_target_status text; v_previous uuid; v_member record; v_carry bigint; v_label text; v_type text; v_body text;
begin
  select * into i from public.current_identity_v3(); if i.member_id is null or i.role<>'admin' then raise exception 'admin required' using errcode='42501'; end if;
  perform 1 from public.billing_periods where household_id=i.household_id for update;
  select id,status into v_target,v_target_status from public.billing_periods where household_id=i.household_id and month=v_month;
  if v_target_status='closed' then raise exception 'closed billing periods cannot be reactivated'; end if;
  if v_target is null then insert into public.billing_periods(household_id,month,status,created_by) values(i.household_id,v_month,'draft',i.member_id) returning id,status into v_target,v_target_status; end if;
  select id into v_previous from public.billing_periods where household_id=i.household_id and status='active' and id<>v_target order by month desc limit 1;
  update public.billing_periods set status='closed',updated_at=now() where household_id=i.household_id and status='active' and id<>v_target;
  update public.billing_periods set status='active',updated_at=now() where id=v_target;
  insert into public.audit_log(household_id,actor_member_id,action,entity_type,entity_id,before_json,after_json) values(i.household_id,i.member_id,'activate','billing_period',v_target,jsonb_build_object('previous_period_id',v_previous),jsonb_build_object('month',v_month,'status','active'));
  v_label:=trim(to_char(v_month,'FMMonth YYYY'));
  for v_member in select hm.id from public.household_members hm where hm.household_id=i.household_id and hm.is_active and hm.id<>i.member_id loop
    select coalesce(sum(ob.outstanding_cents),0)::bigint into v_carry from public.obligation_balances_v3 ob join public.billing_periods bp on bp.id=ob.period_id where ob.debtor_member_id=v_member.id and ob.outstanding_cents>0 and bp.month<v_month;
    if v_carry>0 then v_type:='balance_carry_forward'; v_body:='₱'||to_char(v_carry/100.0,'FM999G999G990D00')||' from earlier months remains in your current balance.'; else v_type:='month_activated'; v_body:='Your '||v_label||' billing month is now active.'; end if;
    insert into public.notifications(household_id,recipient_member_id,type,title,body,target_type,target_id,dedupe_key) values(i.household_id,v_member.id,v_type,v_label||' is now active',v_body,'billing_period',v_target,'month:'||v_target::text) on conflict(recipient_member_id,dedupe_key) do nothing;
  end loop;
  return v_target;
end $$;

create or replace function public.initialize_month_v3(p_household uuid,p_month date,p_idempotency_key text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare i record; begin select * into i from public.current_identity_v3(); if i.member_id is null or i.role<>'admin' or i.household_id<>p_household then raise exception 'admin required' using errcode='42501'; end if; return public.set_active_month_v3(p_month); end $$;

create or replace function public.member_balance_v3() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_member uuid:=public.current_member_id_v3(); v_household uuid; begin
  select household_id into v_household from public.household_members where id=v_member;
  return jsonb_build_object('member_id',v_member,'outstanding_cents',coalesce((select sum(outstanding_cents) from public.obligation_balances_v3 where debtor_member_id=v_member),0),'owed_to_me_cents',coalesce((select sum(outstanding_cents) from public.obligation_balances_v3 where creditor_member_id=v_member),0),'credit_cents',coalesce((select sum(remaining_amount_cents) from public.credits where owner_member_id=v_member and status='active'),0),'creditors',coalesce((select jsonb_agg(x order by (x->>'amount_cents')::bigint desc) from (select jsonb_build_object('member_id',creditor_member_id,'label',coalesce((select p.display_name from public.household_members hm join public.profiles p on p.id=hm.profile_id where hm.id=creditor_member_id),creditor_label),'amount_cents',sum(outstanding_cents)) x from public.obligation_balances_v3 where debtor_member_id=v_member and outstanding_cents>0 group by creditor_member_id,creditor_label) q),'[]'::jsonb));
end $$;
create or replace function public.member_home_v3() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare i record; b jsonb; v_period uuid; v_month date; v_total bigint; begin select * into i from public.current_identity_v3(); if i.member_id is null then raise exception 'identity not linked'; end if; b:=public.member_balance_v3(); select id,month into v_period,v_month from public.billing_periods where household_id=i.household_id and status='active' limit 1; select coalesce(sum(amount_cents),0) into v_total from public.expenses where period_id=v_period and status='active'; return b||jsonb_build_object('display_name',i.display_name,'role',i.role,'household_total_cents',v_total,'period_id',v_period,'period_month',v_month,'due_soon_cents',coalesce((select sum(outstanding_cents) from public.obligation_balances_v3 where debtor_member_id=i.member_id and due_date between current_date and current_date+3),0),'categories',coalesce((select jsonb_object_agg(category,total) from (select category,sum(amount_cents)::bigint total from public.expenses where period_id=v_period and status='active' group by category) x),'{}'::jsonb)); end $$;
create or replace function public.admin_overview_v3() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare i record; v_period uuid; v_month date; begin select * into i from public.current_identity_v3(); if i.role<>'admin' then raise exception 'admin required' using errcode='42501'; end if; select id,month into v_period,v_month from public.billing_periods where household_id=i.household_id and status='active' limit 1; return jsonb_build_object('display_name',i.display_name,'period_id',v_period,'period_month',v_month,'outstanding_cents',coalesce((select sum(outstanding_cents) from public.obligation_balances_v3 where household_id=i.household_id),0),'pending_claims',coalesce((select count(*) from public.payment_claims where household_id=i.household_id and status='pending'),0),'overdue_count',coalesce((select count(*) from public.obligation_balances_v3 where household_id=i.household_id and outstanding_cents>0 and due_date<current_date),0)); end $$;

-- RLS
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.member_payment_methods enable row level security;
alter table public.billing_periods enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_payers enable row level security;
alter table public.expense_splits enable row level security;
alter table public.obligations enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.payment_claims enable row level security;
alter table public.credits enable row level security;
alter table public.credit_applications enable row level security;
alter table public.utility_records enable row level security;
alter table public.paylater_accounts enable row level security;
alter table public.paylater_installments enable row level security;
alter table public.split_presets enable row level security;
alter table public.announcements enable row level security;
alter table public.attachments enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles own or admin" on public.profiles for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.household_members hm where hm.profile_id=profiles.id and public.is_household_admin_v3(hm.household_id)));
create policy "households member read" on public.households for select to authenticated using(exists(select 1 from public.household_members hm where hm.household_id=households.id and hm.id=public.current_member_id_v3()));
create policy "household_members household read" on public.household_members for select to authenticated using(household_id=public.current_household_id_v3());
create policy "member_payment_methods own or admin" on public.member_payment_methods for all to authenticated using(member_id=public.current_member_id_v3() or public.is_household_admin_v3((select household_id from public.household_members where id=member_id))) with check(member_id=public.current_member_id_v3() or public.is_household_admin_v3((select household_id from public.household_members where id=member_id)));
create policy "billing periods household read" on public.billing_periods for select to authenticated using(household_id=public.current_household_id_v3());
create policy "expenses household read" on public.expenses for select to authenticated using(household_id=public.current_household_id_v3());
create policy "expenses admin write" on public.expenses for all to authenticated using(public.is_household_admin_v3(household_id)) with check(public.is_household_admin_v3(household_id));
create policy "expense_payers household read" on public.expense_payers for select to authenticated using(exists(select 1 from public.expenses e where e.id=expense_id and e.household_id=public.current_household_id_v3()));
create policy "expense_splits own or admin" on public.expense_splits for select to authenticated using(member_id=public.current_member_id_v3() or exists(select 1 from public.expenses e where e.id=expense_id and public.is_household_admin_v3(e.household_id)));
create policy "obligations own relation or admin" on public.obligations for select to authenticated using(debtor_member_id=public.current_member_id_v3() or creditor_member_id=public.current_member_id_v3() or public.is_household_admin_v3(household_id));
create policy "payments own relation or admin" on public.payments for select to authenticated using(payer_member_id=public.current_member_id_v3() or payee_member_id=public.current_member_id_v3() or public.is_household_admin_v3(household_id));
create policy "payment_allocations related" on public.payment_allocations for select to authenticated using(exists(select 1 from public.payments p where p.id=payment_id and (p.payer_member_id=public.current_member_id_v3() or p.payee_member_id=public.current_member_id_v3() or public.is_household_admin_v3(p.household_id))));
create policy "payment_claims owner or admin" on public.payment_claims for select to authenticated using(payer_member_id=public.current_member_id_v3() or public.is_household_admin_v3(household_id));
create policy "payment_claims owner pending update" on public.payment_claims for update to authenticated using(payer_member_id=public.current_member_id_v3() and status='pending') with check(payer_member_id=public.current_member_id_v3() and status in ('pending','withdrawn'));
create policy "credits owner relation or admin" on public.credits for select to authenticated using(owner_member_id=public.current_member_id_v3() or creditor_member_id=public.current_member_id_v3() or public.is_household_admin_v3(household_id));
create policy "utility household read" on public.utility_records for select to authenticated using(exists(select 1 from public.expenses e where e.id=expense_id and e.household_id=public.current_household_id_v3()));
create policy "paylater household read" on public.paylater_accounts for select to authenticated using(household_id=public.current_household_id_v3());
create policy "paylater installments household read" on public.paylater_installments for select to authenticated using(exists(select 1 from public.paylater_accounts a where a.id=account_id and a.household_id=public.current_household_id_v3()));
create policy "split presets household read" on public.split_presets for select to authenticated using(household_id=public.current_household_id_v3());
create policy "split presets admin write" on public.split_presets for all to authenticated using(public.is_household_admin_v3(household_id)) with check(public.is_household_admin_v3(household_id));
create policy "announcements household read" on public.announcements for select to authenticated using(household_id=public.current_household_id_v3() and is_active and starts_at<=now() and (ends_at is null or ends_at>now()));
create policy "announcements admin write" on public.announcements for all to authenticated using(public.is_household_admin_v3(household_id)) with check(public.is_household_admin_v3(household_id));
create policy "attachments owner or admin" on public.attachments for select to authenticated using(owner_member_id=public.current_member_id_v3() or public.is_household_admin_v3(household_id));
create policy "notifications own" on public.notifications for select to authenticated using(recipient_member_id=public.current_member_id_v3());
create policy "notifications own update" on public.notifications for update to authenticated using(recipient_member_id=public.current_member_id_v3()) with check(recipient_member_id=public.current_member_id_v3());
create policy "notification_preferences own" on public.notification_preferences for all to authenticated using(member_id=public.current_member_id_v3()) with check(member_id=public.current_member_id_v3());
create policy "push_subscriptions own" on public.push_subscriptions for all to authenticated using(member_id=public.current_member_id_v3()) with check(member_id=public.current_member_id_v3());
create policy "audit admin only" on public.audit_log for select to authenticated using(public.is_household_admin_v3(household_id));

-- Keep operational inserts behind RPCs; grant only read/update surfaces needed by member UI.
grant usage on schema public to authenticated;
grant select on public.households,public.household_members,public.billing_periods,public.expenses,public.expense_payers,public.expense_splits,public.obligations,public.payments,public.payment_allocations,public.payment_claims,public.credits,public.utility_records,public.paylater_accounts,public.paylater_installments,public.split_presets,public.announcements,public.attachments,public.notifications,public.notification_preferences,public.member_payment_methods to authenticated;
grant update on public.payment_claims,public.notifications,public.notification_preferences,public.member_payment_methods to authenticated;
grant insert,update,delete on public.announcements to authenticated;
grant insert,delete on public.member_payment_methods,public.notification_preferences,public.push_subscriptions to authenticated;
grant select,insert,update,delete on public.push_subscriptions to authenticated;
grant execute on function public.current_identity_v3(),public.current_household_id_v3(),public.member_home_v3(),public.member_balance_v3(),public.admin_overview_v3() to authenticated;
grant execute on function public.set_active_month_v3(date) to authenticated;
grant execute on function public.submit_payment_claim_v3(uuid,bigint,timestamptz,text,text,text,jsonb,text) to authenticated;
grant execute on function public.create_expense_v3(uuid,uuid,text,text,bigint,date,date,jsonb,jsonb,text,text,text,text) to authenticated;
grant execute on function public.review_payment_claim_v3(uuid,text,jsonb,text,text,bigint),public.delete_or_void_expense_v3(uuid,text),public.edit_expense_v3(uuid,integer,text,bigint,date),public.initialize_month_v3(uuid,date,text) to authenticated;

-- Private storage bucket. Never make originals public.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('financial-documents','financial-documents',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "attachments private read" on storage.objects for select to authenticated using(bucket_id='financial-documents' and exists(select 1 from public.attachments a where a.object_path=name and (a.owner_member_id=public.current_member_id_v3() or public.is_household_admin_v3(a.household_id))));
create policy "attachments private insert" on storage.objects for insert to authenticated with check(bucket_id='financial-documents' and split_part(name,'/',1)=public.current_household_id_v3()::text);
create policy "attachments private delete" on storage.objects for delete to authenticated using(bucket_id='financial-documents' and exists(select 1 from public.attachments a where a.object_path=name and (a.owner_member_id=public.current_member_id_v3() or public.is_household_admin_v3(a.household_id))));

-- notification defaults are created after household linking by seed-members.sql.
create policy "attachments owner insert" on public.attachments for insert to authenticated with check(owner_member_id=public.current_member_id_v3() and created_by=public.current_member_id_v3() and household_id=public.current_household_id_v3());
grant insert,update on public.attachments to authenticated;
create or replace function public.open_obligations_v3(p_debtor uuid default null,p_creditor uuid default null)
returns table(id uuid,due_date date,source_category text,outstanding_cents bigint) language plpgsql stable security definer set search_path=public as $$
declare v_current uuid:=public.current_member_id_v3(); v_debtor uuid:=coalesce(p_debtor,v_current); v_household uuid;
begin select household_id into v_household from public.household_members where id=v_debtor;if v_debtor<>v_current and not public.is_household_admin_v3(v_household) then raise exception 'not allowed' using errcode='42501';end if;return query select ob.id,ob.due_date,ob.source_category,ob.outstanding_cents from public.obligation_balances_v3 ob where ob.debtor_member_id=v_debtor and (p_creditor is null or ob.creditor_member_id=p_creditor) and ob.outstanding_cents>0 order by ob.due_date nulls last,ob.id;end $$;
grant execute on function public.open_obligations_v3(uuid,uuid) to authenticated;

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
grant execute on function public.record_payment_v3(uuid,uuid,bigint,timestamptz,text,text,jsonb,bigint,text) to authenticated;

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
grant execute on function public.create_announcement_v3(text,text,text,timestamptz,timestamptz,boolean) to authenticated;

create or replace function public.create_paylater_v3(p_provider text,p_borrower uuid,p_total_cents bigint,p_schedule jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=public.current_member_id_v3();v_household uuid;v_id uuid;j jsonb;v_period uuid;begin select household_id into v_household from public.household_members where id=v_actor;if not public.is_household_admin_v3(v_household) then raise exception 'admin required' using errcode='42501';end if;if not exists(select 1 from public.household_members where id=p_borrower and household_id=v_household) then raise exception 'invalid borrower';end if;insert into public.paylater_accounts(household_id,provider,borrower_member_id,creditor_member_id,original_total_cents) values(v_household,trim(p_provider),p_borrower,v_actor,p_total_cents) returning id into v_id;for j in select * from jsonb_array_elements(p_schedule) loop select id into v_period from public.billing_periods where household_id=v_household and month=date_trunc('month',(j->>'due_date')::date)::date;insert into public.paylater_installments(account_id,period_id,due_date,amount_cents,sequence_no) values(v_id,v_period,(j->>'due_date')::date,(j->>'amount_cents')::bigint,(j->>'sequence_no')::integer);end loop;return v_id;end $$;
grant execute on function public.create_paylater_v3(text,uuid,bigint,jsonb) to authenticated;

create policy "profiles own update" on public.profiles for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant update on public.profiles to authenticated;


-- v3.3.1 final admin-management overrides
-- Normal removal is archival/voiding. Financial records are retained even when
-- no payment has yet been allocated, so audit/history never disappears.
create or replace function public.delete_or_void_expense_v3(p_expense uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.expenses%rowtype; v_actor uuid:=public.current_member_id_v3();
begin
  select * into e from public.expenses where id=p_expense for update;
  if e.id is null then raise exception 'expense not found'; end if;
  if not public.is_household_admin_v3(e.household_id) then raise exception 'admin required' using errcode='42501'; end if;
  if e.status='void' then return jsonb_build_object('mode','voided','id',e.id); end if;
  update public.expenses set status='void',voided_at=now(),voided_by=v_actor,
    void_reason=coalesce(nullif(trim(p_reason),''),'Archived by admin'),updated_by=v_actor,updated_at=now(),version=version+1
  where id=e.id;
  update public.obligations set status='void' where source_expense_id=e.id and status='active';
  insert into public.audit_log(household_id,actor_member_id,action,entity_type,entity_id,before_json,after_json,reason)
    values(e.household_id,v_actor,'archive','expense',e.id,to_jsonb(e),jsonb_build_object('status','void'),coalesce(p_reason,'Archived by admin'));
  return jsonb_build_object('mode','voided','id',e.id);
end $$;

grant execute on function public.delete_or_void_expense_v3(uuid,text) to authenticated;

-- Admin-recorded payments may safely edit descriptive metadata only. Amount,
-- payer/payee and allocations are deliberately immutable after posting.
create or replace function public.edit_admin_payment_v3(p_payment uuid,p_method text,p_reference text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.payments%rowtype; v_actor uuid:=public.current_member_id_v3();
begin
  select * into p from public.payments where id=p_payment for update;
  if p.id is null then raise exception 'payment not found'; end if;
  if not public.is_household_admin_v3(p.household_id) then raise exception 'admin required' using errcode='42501'; end if;
  if p.status<>'approved' then raise exception 'only approved payments can be edited'; end if;
  update public.payments set method=trim(p_method),reference_private=coalesce(p_reference,''),updated_by=v_actor,updated_at=now() where id=p.id;
  insert into public.audit_log(household_id,actor_member_id,action,entity_type,entity_id,before_json,after_json)
    select p.household_id,v_actor,'edit','payment',p.id,to_jsonb(p),to_jsonb(x) from public.payments x where x.id=p.id;
  return (select to_jsonb(x) from public.payments x where x.id=p.id);
end $$;

create or replace function public.void_admin_payment_v3(p_payment uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.payments%rowtype; v_actor uuid:=public.current_member_id_v3();
begin
  select * into p from public.payments where id=p_payment for update;
  if p.id is null then raise exception 'payment not found'; end if;
  if not public.is_household_admin_v3(p.household_id) then raise exception 'admin required' using errcode='42501'; end if;
  if p.status='void' then return jsonb_build_object('id',p.id,'status','void'); end if;
  if exists(select 1 from public.credits c join public.credit_applications ca on ca.credit_id=c.id where c.source_payment_id=p.id)
    then raise exception 'payment credit has already been applied; create a correcting transaction instead'; end if;
  update public.credits set status='void',updated_at=now() where source_payment_id=p.id and status<>'void';
  update public.payments set status='void',voided_by=v_actor,voided_at=now(),void_reason=coalesce(nullif(trim(p_reason),''),'Voided by admin'),updated_by=v_actor,updated_at=now() where id=p.id;
  insert into public.audit_log(household_id,actor_member_id,action,entity_type,entity_id,before_json,after_json,reason)
    values(p.household_id,v_actor,'void','payment',p.id,to_jsonb(p),jsonb_build_object('status','void'),coalesce(p_reason,'Voided by admin'));
  return jsonb_build_object('id',p.id,'status','void');
end $$;

grant execute on function public.edit_admin_payment_v3(uuid,text,text) to authenticated;
grant execute on function public.void_admin_payment_v3(uuid,text) to authenticated;



-- v3.3.1 final PayLater reimbursement overrides
-- PayLater reimbursement accounting. Every installment is economically split
-- across exactly four active dormies. The borrower pays the provider, so the
-- borrower's own share is settled implicitly and only the other three shares
-- become obligations owed to the borrower.
alter table public.obligations add column if not exists source_paylater_installment_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='obligations_source_paylater_installment_id_fkey'
  ) then
    alter table public.obligations
      add constraint obligations_source_paylater_installment_id_fkey
      foreign key(source_paylater_installment_id) references public.paylater_installments(id) on delete restrict;
  end if;
end $$;

create or replace function public.populate_paylater_schedule_v3(
  p_account uuid,p_borrower uuid,p_total_cents bigint,p_items jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_account public.paylater_accounts%rowtype;
  v_actor uuid:=public.current_member_id_v3();
  v_member record;
  v_installment uuid;
  v_period uuid;
  v_month date;
  v_due date;
  v_amount bigint;
  v_sum bigint;
  v_count integer;
  v_base bigint;
  v_remainder integer;
  v_rank integer;
  v_share bigint;
  j jsonb;
begin
  select * into v_account from public.paylater_accounts where id=p_account for update;
  if v_account.id is null then raise exception 'PayLater account not found'; end if;
  if not public.is_household_admin_v3(v_account.household_id) then raise exception 'admin required' using errcode='42501'; end if;
  if p_total_cents<=0 then raise exception 'PayLater principal must be positive'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'PayLater schedule is required'; end if;
  select count(*) into v_count from public.household_members where household_id=v_account.household_id and is_active=true;
  if v_count<>4 then raise exception 'PayLater requires exactly four active dormies'; end if;
  if not exists(select 1 from public.household_members where id=p_borrower and household_id=v_account.household_id and is_active=true)
    then raise exception 'Borrower must be an active dormie'; end if;
  select coalesce(sum((x->>'amount_cents')::bigint),0) into v_sum from jsonb_array_elements(p_items) x;
  if v_sum<>p_total_cents then raise exception 'PayLater installment total must equal principal exactly'; end if;

  for j in select value from jsonb_array_elements(p_items) with ordinality x(value,n) order by n loop
    v_due:=(j->>'due_date')::date;
    v_amount:=(j->>'amount_cents')::bigint;
    if v_amount<=0 then raise exception 'PayLater installment amount must be positive'; end if;
    v_month:=date_trunc('month',v_due)::date;
    insert into public.billing_periods(household_id,month,status,created_by)
      values(v_account.household_id,v_month,'draft',v_actor)
      on conflict(household_id,month) do update set updated_at=public.billing_periods.updated_at
      returning id into v_period;
    insert into public.paylater_installments(account_id,period_id,due_date,amount_cents,sequence_no,status)
      values(p_account,v_period,v_due,v_amount,coalesce((j->>'sequence_no')::integer,1),'scheduled')
      returning id into v_installment;

    v_base:=v_amount/4;
    v_remainder:=(v_amount%4)::integer;
    v_rank:=0;
    for v_member in
      select id from public.household_members
      where household_id=v_account.household_id and is_active=true
      order by id
    loop
      v_rank:=v_rank+1;
      v_share:=v_base+case when v_rank<=v_remainder then 1 else 0 end;
      if v_member.id<>p_borrower then
        insert into public.obligations(
          household_id,period_id,source_paylater_installment_id,debtor_member_id,
          creditor_member_id,original_amount_cents,due_date,source_category,status
        ) values(
          v_account.household_id,v_period,v_installment,v_member.id,
          p_borrower,v_share,v_due,'PayLater','active'
        );
      end if;
    end loop;
  end loop;
end $$;

create or replace function public.create_paylater_v3(
  p_provider text,p_borrower uuid,p_total_cents bigint,p_schedule jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_actor uuid:=public.current_member_id_v3();
  v_household uuid;
  v_id uuid;
  v_mode text;
  v_items jsonb;
  v_borrower_label text;
  v_member record;
begin
  select household_id into v_household from public.household_members where id=v_actor and is_active=true;
  if not public.is_household_admin_v3(v_household) then raise exception 'admin required' using errcode='42501'; end if;
  if not exists(select 1 from public.household_members where id=p_borrower and household_id=v_household and is_active=true)
    then raise exception 'invalid borrower'; end if;
  v_mode:=case when jsonb_typeof(p_schedule)='object' then coalesce(p_schedule->>'mode','equal') else 'equal' end;
  v_items:=case when jsonb_typeof(p_schedule)='object' then p_schedule->'items' else p_schedule end;
  if v_mode not in ('equal','custom') then raise exception 'invalid PayLater schedule mode'; end if;
  select p.display_name into v_borrower_label
    from public.household_members hm join public.profiles p on p.id=hm.profile_id where hm.id=p_borrower;
  insert into public.paylater_accounts(
    household_id,provider,borrower_member_id,borrower_label,creditor_member_id,
    original_total_cents,schedule_mode,status,created_by,updated_by
  ) values(
    v_household,trim(p_provider),p_borrower,v_borrower_label,p_borrower,
    p_total_cents,v_mode,'active',v_actor,v_actor
  ) returning id into v_id;
  perform public.populate_paylater_schedule_v3(v_id,p_borrower,p_total_cents,v_items);
  insert into public.audit_log(household_id,actor_member_id,action,entity_type,entity_id,after_json)
    select v_household,v_actor,'create','paylater',v_id,to_jsonb(a) from public.paylater_accounts a where a.id=v_id;
  for v_member in select id from public.household_members where household_id=v_household and is_active=true and id<>v_actor loop
    insert into public.notifications(household_id,recipient_member_id,type,title,body,target_type,target_id,dedupe_key)
      values(v_household,v_member.id,'paylater_added','PayLater schedule added',v_borrower_label||' is covering this PayLater schedule. Your installment shares will appear in Balance.','paylater',v_id,'paylater-added:'||v_id::text)
      on conflict(recipient_member_id,dedupe_key) do nothing;
  end loop;
  return v_id;
end $$;

create or replace function public.edit_paylater_v3(
  p_account uuid,p_provider text,p_borrower uuid,p_total_cents bigint,p_schedule jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  a public.paylater_accounts%rowtype;
  v_actor uuid:=public.current_member_id_v3();
  v_mode text;
  v_items jsonb;
  v_label text;
  v_member record;
begin
  select * into a from public.paylater_accounts where id=p_account for update;
  if a.id is null then raise exception 'PayLater account not found'; end if;
  if not public.is_household_admin_v3(a.household_id) then raise exception 'admin required' using errcode='42501'; end if;
  if a.status='void' then raise exception 'Archived PayLater cannot be edited'; end if;
  if not exists(select 1 from public.household_members where id=p_borrower and household_id=a.household_id and is_active=true)
    then raise exception 'invalid borrower'; end if;
  if exists(
    select 1 from public.payment_allocations pa
    join public.obligations o on o.id=pa.obligation_id
    join public.paylater_installments i on i.id=o.source_paylater_installment_id
    where i.account_id=p_account
  ) or exists(
    select 1 from public.credit_applications ca
    join public.obligations o on o.id=ca.obligation_id
    join public.paylater_installments i on i.id=o.source_paylater_installment_id
    where i.account_id=p_account
  ) then raise exception 'PayLater has settled history; archive it and create a correcting schedule instead'; end if;
  v_mode:=case when jsonb_typeof(p_schedule)='object' then coalesce(p_schedule->>'mode','equal') else 'equal' end;
  v_items:=case when jsonb_typeof(p_schedule)='object' then p_schedule->'items' else p_schedule end;
  if v_mode not in ('equal','custom') then raise exception 'invalid PayLater schedule mode'; end if;
  select p.display_name into v_label from public.household_members hm join public.profiles p on p.id=hm.profile_id where hm.id=p_borrower;
  insert into public.audit_log(household_id,actor_member_id,action,entity_type,entity_id,before_json)
    values(a.household_id,v_actor,'edit','paylater',a.id,to_jsonb(a));
  delete from public.obligations o using public.paylater_installments i
    where o.source_paylater_installment_id=i.id and i.account_id=p_account;
  delete from public.paylater_installments where account_id=p_account;
  update public.paylater_accounts set provider=trim(p_provider),borrower_member_id=p_borrower,
    borrower_label=v_label,creditor_member_id=p_borrower,original_total_cents=p_total_cents,
    schedule_mode=v_mode,updated_by=v_actor,updated_at=now()
    where id=p_account;
  perform public.populate_paylater_schedule_v3(p_account,p_borrower,p_total_cents,v_items);
  update public.audit_log set after_json=(select to_jsonb(x) from public.paylater_accounts x where x.id=p_account)
    where id=(select max(id) from public.audit_log where entity_type='paylater' and entity_id=p_account and action='edit' and actor_member_id=v_actor);
  for v_member in select id from public.household_members where household_id=a.household_id and is_active=true and id<>v_actor loop
    insert into public.notifications(household_id,recipient_member_id,type,title,body,target_type,target_id,dedupe_key)
      values(a.household_id,v_member.id,'paylater_updated','PayLater schedule updated','A PayLater schedule affecting the household was updated.','paylater',p_account,'paylater-updated:'||p_account::text||':'||extract(epoch from now())::bigint::text)
      on conflict(recipient_member_id,dedupe_key) do nothing;
  end loop;
  return p_account;
end $$;

create or replace function public.archive_paylater_v3(p_account uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  a public.paylater_accounts%rowtype;
  v_actor uuid:=public.current_member_id_v3();
  v_member record;
begin
  select * into a from public.paylater_accounts where id=p_account for update;
  if a.id is null then raise exception 'PayLater account not found'; end if;
  if not public.is_household_admin_v3(a.household_id) then raise exception 'admin required' using errcode='42501'; end if;
  if a.status='void' then return jsonb_build_object('id',a.id,'status','void'); end if;
  update public.paylater_accounts set status='void',archived_at=now(),archived_by=v_actor,
    archive_reason=coalesce(nullif(trim(p_reason),''),'Archived by admin'),updated_by=v_actor,updated_at=now()
    where id=p_account;
  update public.paylater_installments set status='void',updated_at=now() where account_id=p_account and status<>'void';
  update public.obligations o set status='void' from public.paylater_installments i
    where o.source_paylater_installment_id=i.id and i.account_id=p_account and o.status='active';
  insert into public.audit_log(household_id,actor_member_id,action,entity_type,entity_id,before_json,after_json,reason)
    values(a.household_id,v_actor,'archive','paylater',a.id,to_jsonb(a),jsonb_build_object('status','void'),coalesce(p_reason,'Archived by admin'));
  for v_member in select id from public.household_members where household_id=a.household_id and is_active=true and id<>v_actor loop
    insert into public.notifications(household_id,recipient_member_id,type,title,body,target_type,target_id,dedupe_key)
      values(a.household_id,v_member.id,'paylater_archived','PayLater schedule archived','A PayLater schedule was archived. Remaining unpaid shares no longer affect your balance.','paylater',a.id,'paylater-archived:'||a.id::text)
      on conflict(recipient_member_id,dedupe_key) do nothing;
  end loop;
  return jsonb_build_object('id',a.id,'status','void');
end $$;

grant execute on function public.populate_paylater_schedule_v3(uuid,uuid,bigint,jsonb) to authenticated;
grant execute on function public.create_paylater_v3(text,uuid,bigint,jsonb) to authenticated;
grant execute on function public.edit_paylater_v3(uuid,text,uuid,bigint,jsonb) to authenticated;
grant execute on function public.archive_paylater_v3(uuid,text) to authenticated;


-- v3.3.2 authoritative current-period read model overrides.
-- Future draft PayLater installments exist for scheduling but must not affect the
-- user's current balance until their billing period becomes active.
create or replace function public.member_balance_v3() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare v_member uuid:=public.current_member_id_v3();v_household uuid;v_active_month date;
begin
  select household_id into v_household from public.household_members where id=v_member;
  select month into v_active_month from public.billing_periods where household_id=v_household and status='active' limit 1;
  return jsonb_build_object(
    'member_id',v_member,
    'outstanding_cents',coalesce((select sum(ob.outstanding_cents) from public.obligation_balances_v3 ob join public.billing_periods bp on bp.id=ob.period_id where ob.debtor_member_id=v_member and bp.month <= v_active_month),0),
    'owed_to_me_cents',coalesce((select sum(ob.outstanding_cents) from public.obligation_balances_v3 ob join public.billing_periods bp on bp.id=ob.period_id where ob.creditor_member_id=v_member and bp.month <= v_active_month),0),
    'credit_cents',coalesce((select sum(remaining_amount_cents) from public.credits where owner_member_id=v_member and status='active'),0),
    'creditors',coalesce((select jsonb_agg(x order by (x->>'amount_cents')::bigint desc) from (
      select jsonb_build_object('member_id',ob.creditor_member_id,'label',coalesce((select p.display_name from public.household_members hm join public.profiles p on p.id=hm.profile_id where hm.id=ob.creditor_member_id),ob.creditor_label),'amount_cents',sum(ob.outstanding_cents)) x
      from public.obligation_balances_v3 ob join public.billing_periods bp on bp.id=ob.period_id
      where ob.debtor_member_id=v_member and ob.outstanding_cents>0 and bp.month <= v_active_month
      group by ob.creditor_member_id,ob.creditor_label
    ) q),'[]'::jsonb)
  );
end $$;

create or replace function public.open_obligations_v3(p_debtor uuid default null,p_creditor uuid default null)
returns table(id uuid,due_date date,source_category text,outstanding_cents bigint)
language plpgsql stable security definer set search_path=public as $$
declare v_current uuid:=public.current_member_id_v3();v_debtor uuid:=coalesce(p_debtor,v_current);v_household uuid;v_active_month date;
begin
  select household_id into v_household from public.household_members where id=v_debtor;
  if v_debtor<>v_current and not public.is_household_admin_v3(v_household) then raise exception 'not allowed' using errcode='42501'; end if;
  select month into v_active_month from public.billing_periods where household_id=v_household and status='active' limit 1;
  return query select ob.id,ob.due_date,ob.source_category,ob.outstanding_cents
    from public.obligation_balances_v3 ob join public.billing_periods bp on bp.id=ob.period_id
    where ob.debtor_member_id=v_debtor and (p_creditor is null or ob.creditor_member_id=p_creditor)
      and ob.outstanding_cents>0 and bp.month <= v_active_month
    order by ob.due_date nulls last,ob.id;
end $$;

create or replace function public.member_home_v3() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare i record;b jsonb;v_period uuid;v_month date;v_total bigint;
begin
  select * into i from public.current_identity_v3();if i.member_id is null then raise exception 'identity not linked';end if;
  b:=public.member_balance_v3();select id,month into v_period,v_month from public.billing_periods where household_id=i.household_id and status='active' limit 1;
  select coalesce(sum(amount_cents),0) into v_total from public.expenses where period_id=v_period and status='active';
  return b||jsonb_build_object('display_name',i.display_name,'role',i.role,'household_total_cents',v_total,'period_id',v_period,'period_month',v_month,
    'due_soon_cents',coalesce((select sum(ob.outstanding_cents) from public.obligation_balances_v3 ob join public.billing_periods bp on bp.id=ob.period_id where ob.debtor_member_id=i.member_id and ob.due_date between current_date and current_date+3 and bp.month <= v_month),0),
    'categories',coalesce((select jsonb_object_agg(category,total) from (select category,sum(amount_cents)::bigint total from public.expenses where period_id=v_period and status='active' group by category)x),'{}'::jsonb));
end $$;

create or replace function public.admin_overview_v3() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare i record;v_period uuid;v_active_month date;
begin
  select * into i from public.current_identity_v3();if i.role<>'admin' then raise exception 'admin required' using errcode='42501';end if;
  select id,month into v_period,v_active_month from public.billing_periods where household_id=i.household_id and status='active' limit 1;
  return jsonb_build_object('display_name',i.display_name,'period_id',v_period,'period_month',v_active_month,
    'outstanding_cents',coalesce((select sum(ob.outstanding_cents) from public.obligation_balances_v3 ob join public.billing_periods bp on bp.id=ob.period_id where ob.household_id=i.household_id and bp.month <= v_active_month),0),
    'pending_claims',coalesce((select count(*) from public.payment_claims where household_id=i.household_id and status='pending'),0),
    'overdue_count',coalesce((select count(*) from public.obligation_balances_v3 ob join public.billing_periods bp on bp.id=ob.period_id where ob.household_id=i.household_id and ob.outstanding_cents>0 and ob.due_date<current_date and bp.month <= v_active_month),0));
end $$;

grant execute on function public.member_balance_v3() to authenticated;
grant execute on function public.member_home_v3() to authenticated;
grant execute on function public.open_obligations_v3(uuid,uuid) to authenticated;
grant execute on function public.admin_overview_v3() to authenticated;

-- v3.3.3 beta stabilization overrides.
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

  insert into public.audit_log(household_id,actor_member_id,action,entity_type,entity_id,after_json)
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
