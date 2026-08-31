-- DormFlow v3.3.1 beta stabilization
-- Additive migration. Run once after migrate-v3.3.sql.

begin;

alter table public.payments add column if not exists updated_by uuid references public.household_members(id);
alter table public.payments add column if not exists updated_at timestamptz not null default now();
alter table public.payments add column if not exists voided_by uuid references public.household_members(id);
alter table public.payments add column if not exists voided_at timestamptz;
alter table public.payments add column if not exists void_reason text;

alter table public.paylater_accounts add column if not exists schedule_mode text not null default 'equal' check(schedule_mode in ('equal','custom'));
alter table public.paylater_accounts add column if not exists created_by uuid references public.household_members(id);
alter table public.paylater_accounts add column if not exists updated_by uuid references public.household_members(id);
alter table public.paylater_accounts add column if not exists archived_at timestamptz;
alter table public.paylater_accounts add column if not exists archived_by uuid references public.household_members(id);
alter table public.paylater_accounts add column if not exists archive_reason text;
alter table public.paylater_installments add column if not exists updated_at timestamptz not null default now();

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

commit;
