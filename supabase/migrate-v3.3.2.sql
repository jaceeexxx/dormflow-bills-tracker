-- DormFlow v3.3.2 — Admin & accounting stabilization.
-- Run ONCE after migrate-v3.3.1.sql on an existing DormFlow household.
-- Reconciles legacy PayLater schedule metadata to the canonical workbook while
-- preserving the already-verified August ledger/payment allocations.

begin;

-- Current Balance means previous months + active month. Future draft periods
-- must not leak into balances just because their PayLater obligations already exist.
create or replace function public.member_balance_v3() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  v_member uuid:=public.current_member_id_v3();
  v_household uuid;
  v_active_month date;
begin
  select household_id into v_household from public.household_members where id=v_member;
  select month into v_active_month
    from public.billing_periods
    where household_id=v_household and status='active'
    limit 1;

  return jsonb_build_object(
    'member_id',v_member,
    'outstanding_cents',coalesce((
      select sum(ob.outstanding_cents)
      from public.obligation_balances_v3 ob
      join public.billing_periods bp on bp.id=ob.period_id
      where ob.debtor_member_id=v_member
        and bp.month <= v_active_month
    ),0),
    'owed_to_me_cents',coalesce((
      select sum(ob.outstanding_cents)
      from public.obligation_balances_v3 ob
      join public.billing_periods bp on bp.id=ob.period_id
      where ob.creditor_member_id=v_member
        and bp.month <= v_active_month
    ),0),
    'credit_cents',coalesce((
      select sum(remaining_amount_cents)
      from public.credits
      where owner_member_id=v_member and status='active'
    ),0),
    'creditors',coalesce((
      select jsonb_agg(x order by (x->>'amount_cents')::bigint desc)
      from (
        select jsonb_build_object(
          'member_id',ob.creditor_member_id,
          'label',coalesce((
            select p.display_name
            from public.household_members hm
            join public.profiles p on p.id=hm.profile_id
            where hm.id=ob.creditor_member_id
          ),ob.creditor_label),
          'amount_cents',sum(ob.outstanding_cents)
        ) x
        from public.obligation_balances_v3 ob
        join public.billing_periods bp on bp.id=ob.period_id
        where ob.debtor_member_id=v_member
          and ob.outstanding_cents>0
          and bp.month <= v_active_month
        group by ob.creditor_member_id,ob.creditor_label
      ) q
    ),'[]'::jsonb)
  );
end $$;

create or replace function public.open_obligations_v3(p_debtor uuid default null,p_creditor uuid default null)
returns table(id uuid,due_date date,source_category text,outstanding_cents bigint)
language plpgsql stable security definer set search_path=public as $$
declare
  v_current uuid:=public.current_member_id_v3();
  v_debtor uuid:=coalesce(p_debtor,v_current);
  v_household uuid;
  v_active_month date;
begin
  select household_id into v_household from public.household_members where id=v_debtor;
  if v_debtor<>v_current and not public.is_household_admin_v3(v_household) then
    raise exception 'not allowed' using errcode='42501';
  end if;
  select month into v_active_month
    from public.billing_periods
    where household_id=v_household and status='active'
    limit 1;

  return query
  select ob.id,ob.due_date,ob.source_category,ob.outstanding_cents
  from public.obligation_balances_v3 ob
  join public.billing_periods bp on bp.id=ob.period_id
  where ob.debtor_member_id=v_debtor
    and (p_creditor is null or ob.creditor_member_id=p_creditor)
    and ob.outstanding_cents>0
    and bp.month <= v_active_month
  order by ob.due_date nulls last,ob.id;
end $$;

create or replace function public.member_home_v3() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  i record;
  b jsonb;
  v_period uuid;
  v_month date;
  v_total bigint;
begin
  select * into i from public.current_identity_v3();
  if i.member_id is null then raise exception 'identity not linked'; end if;
  b:=public.member_balance_v3();
  select id,month into v_period,v_month
    from public.billing_periods
    where household_id=i.household_id and status='active'
    limit 1;
  select coalesce(sum(amount_cents),0) into v_total
    from public.expenses where period_id=v_period and status='active';
  return b||jsonb_build_object(
    'display_name',i.display_name,
    'role',i.role,
    'household_total_cents',v_total,
    'period_id',v_period,
    'period_month',v_month,
    'due_soon_cents',coalesce((
      select sum(ob.outstanding_cents)
      from public.obligation_balances_v3 ob
      join public.billing_periods bp on bp.id=ob.period_id
      where ob.debtor_member_id=i.member_id
        and ob.due_date between current_date and current_date+3
        and bp.month <= v_month
    ),0),
    'categories',coalesce((
      select jsonb_object_agg(category,total)
      from (
        select category,sum(amount_cents)::bigint total
        from public.expenses
        where period_id=v_period and status='active'
        group by category
      ) x
    ),'{}'::jsonb)
  );
end $$;

create or replace function public.admin_overview_v3() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  i record;
  v_period uuid;
  v_active_month date;
begin
  select * into i from public.current_identity_v3();
  if i.role<>'admin' then raise exception 'admin required' using errcode='42501'; end if;
  select id,month into v_period,v_active_month
    from public.billing_periods
    where household_id=i.household_id and status='active'
    limit 1;
  return jsonb_build_object(
    'display_name',i.display_name,
    'period_id',v_period,
    'period_month',v_active_month,
    'outstanding_cents',coalesce((
      select sum(ob.outstanding_cents)
      from public.obligation_balances_v3 ob
      join public.billing_periods bp on bp.id=ob.period_id
      where ob.household_id=i.household_id and bp.month <= v_active_month
    ),0),
    'pending_claims',coalesce((
      select count(*) from public.payment_claims
      where household_id=i.household_id and status='pending'
    ),0),
    'overdue_count',coalesce((
      select count(*)
      from public.obligation_balances_v3 ob
      join public.billing_periods bp on bp.id=ob.period_id
      where ob.household_id=i.household_id
        and ob.outstanding_cents>0
        and ob.due_date<current_date
        and bp.month <= v_active_month
    ),0)
  );
end $$;

grant execute on function public.member_balance_v3() to authenticated;
grant execute on function public.member_home_v3() to authenticated;
grant execute on function public.open_obligations_v3(uuid,uuid) to authenticated;
grant execute on function public.admin_overview_v3() to authenticated;

-- Legacy schedules from migrate-history predate borrower_member_id/created_by.
-- Scope reconciliation to created_by IS NULL so user-created beta/production plans
-- are never silently rewritten.
do $$
declare
  v_household uuid;
  v_actor uuid;
  v_borrower uuid;
  v_account uuid;
  v_installment uuid;
  v_period uuid;
  v_member record;
  r record;
begin
  select id into v_household from public.households where slug='20-st-paul';
  if v_household is null then raise exception 'DormFlow household not found'; end if;
  select id into v_actor from public.household_members
    where household_id=v_household and role='admin' and is_active=true limit 1;
  if v_actor is null then raise exception 'DormFlow admin member not found'; end if;

  -- Canonical workbook schedule. The fifth value is the exact per-dormie share.
  -- These September rows are intentionally kept verbatim for release verification:
  -- ('SPayLater','Aerian','2026-09-05',59200,14800)
  -- ('SPayLater','Jace','2026-09-05',466000,116500)
  -- ('SPayLater','Aexy','2026-09-15',28000,7000)
  -- ('SPayLater','Kean','2026-09-15',42800,10700)
  -- ('TikTok PayLater','Jace','2026-09-16',36000,9000)
  for r in
    select * from (values
      ('SPayLater','Aerian','2026-08-05'::date,59200::bigint,14800::bigint,1,'posted'),
      ('SPayLater','Aerian','2026-09-05'::date,59200::bigint,14800::bigint,2,'scheduled'),
      ('SPayLater','Aerian','2026-10-05'::date,59200::bigint,14800::bigint,3,'scheduled'),
      ('SPayLater','Aexy','2026-08-15'::date,28000::bigint,7000::bigint,1,'posted'),
      ('SPayLater','Aexy','2026-09-15'::date,28000::bigint,7000::bigint,2,'scheduled'),
      ('SPayLater','Aexy','2026-10-15'::date,28000::bigint,7000::bigint,3,'scheduled'),
      ('SPayLater','Kean','2026-08-15'::date,42800::bigint,10700::bigint,1,'posted'),
      ('SPayLater','Kean','2026-09-15'::date,42800::bigint,10700::bigint,2,'scheduled'),
      ('SPayLater','Kean','2026-10-15'::date,42800::bigint,10700::bigint,3,'scheduled'),
      ('SPayLater','Jace','2026-09-05'::date,466000::bigint,116500::bigint,1,'scheduled'),
      ('SPayLater','Jace','2026-10-05'::date,466000::bigint,116500::bigint,2,'scheduled'),
      ('SPayLater','Jace','2026-11-05'::date,466000::bigint,116500::bigint,3,'scheduled'),
      ('TikTok PayLater','Jace','2026-08-16'::date,36000::bigint,9000::bigint,1,'posted'),
      ('TikTok PayLater','Jace','2026-09-16'::date,36000::bigint,9000::bigint,2,'scheduled'),
      ('TikTok PayLater','Jace','2026-10-16'::date,36000::bigint,9000::bigint,3,'scheduled')
    ) as canonical(provider,borrower_name,due_date,amount_cents,each_cents,sequence_no,installment_status)
    order by provider,borrower_name,sequence_no
  loop
    select hm.id into v_borrower
      from public.household_members hm
      join public.profiles p on p.id=hm.profile_id
      where hm.household_id=v_household and hm.is_active=true and p.display_name=r.borrower_name
      limit 1;
    if v_borrower is null then raise exception 'Missing borrower %',r.borrower_name; end if;

    select a.id into v_account
      from public.paylater_accounts a
      where a.household_id=v_household
        and a.provider=r.provider
        and a.creditor_member_id=v_borrower
        and a.created_by is null
      order by a.created_at
      limit 1;
    if v_account is null then
      -- A fresh/history import may not have this metadata yet; create only the legacy
      -- account shell, still leaving created_by NULL so its provenance remains clear.
      insert into public.paylater_accounts(
        household_id,provider,borrower_member_id,borrower_label,creditor_member_id,
        original_total_cents,schedule_mode,status,created_by,updated_by
      ) values(
        v_household,r.provider,v_borrower,r.borrower_name,v_borrower,
        r.amount_cents,'custom','active',null,v_actor
      ) returning id into v_account;
    end if;

    update public.paylater_accounts
      set borrower_member_id = creditor_member_id,
          borrower_label = r.borrower_name,
          schedule_mode = 'custom',
          status = case when status='void' then status else 'active' end,
          updated_by = v_actor,
          updated_at = now()
      where id=v_account and created_by is null;

    select id into v_period from public.billing_periods
      where household_id=v_household and month=date_trunc('month',r.due_date)::date;
    if v_period is null then
      insert into public.billing_periods(household_id,month,status,created_by)
        values(v_household,date_trunc('month',r.due_date)::date,'draft',v_actor)
        on conflict(household_id,month) do update set updated_at=public.billing_periods.updated_at
        returning id into v_period;
    end if;

    insert into public.paylater_installments(account_id,period_id,due_date,amount_cents,sequence_no,status)
      values(v_account,v_period,r.due_date,r.amount_cents,r.sequence_no,r.installment_status)
      on conflict(account_id,sequence_no) do update
        set period_id=excluded.period_id,
            due_date=excluded.due_date,
            amount_cents=excluded.amount_cents,
            status=excluded.status,
            updated_at=now()
      returning id into v_installment;

    -- Posted August remains represented by the frozen imported expense/payment ledger.
    -- Scheduled installments receive reimbursement obligations. Rebuild only when no
    -- payment/credit has ever settled that installment.
    if r.installment_status='scheduled' and not exists(
      select 1 from public.payment_allocations pa
      join public.obligations o on o.id=pa.obligation_id
      where o.source_paylater_installment_id=v_installment
    ) and not exists(
      select 1 from public.credit_applications ca
      join public.obligations o on o.id=ca.obligation_id
      where o.source_paylater_installment_id=v_installment
    ) then
      delete from public.obligations where source_paylater_installment_id=v_installment;
      for v_member in
        select debtor_member_id from (
          select id as debtor_member_id from public.household_members
          where household_id=v_household and is_active=true
        ) candidates
        where debtor_member_id <> v_borrower
        order by debtor_member_id
      loop
        insert into public.obligations(
          household_id,period_id,source_paylater_installment_id,
          debtor_member_id,creditor_member_id,original_amount_cents,
          due_date,source_category,status
        ) values(
          v_household,v_period,v_installment,
          v_member.debtor_member_id,v_borrower,r.each_cents,
          r.due_date,'PayLater / Loans','active'
        );
      end loop;
    end if;
  end loop;

  -- Canonical principals are sums of canonical installments. This changes only
  -- PayLater plan metadata; it does not rewrite the frozen August expense ledger.
  update public.paylater_accounts a set original_total_cents=x.total_cents,updated_at=now()
  from (
    select a2.id,
      case
        when a2.provider='SPayLater' and p.display_name='Aerian' then 177600::bigint
        when a2.provider='SPayLater' and p.display_name='Aexy' then 84000::bigint
        when a2.provider='SPayLater' and p.display_name='Kean' then 128400::bigint
        when a2.provider='SPayLater' and p.display_name='Jace' then 1398000::bigint
        when a2.provider='TikTok PayLater' and p.display_name='Jace' then 108000::bigint
      end total_cents
    from public.paylater_accounts a2
    join public.household_members hm on hm.id=a2.creditor_member_id
    join public.profiles p on p.id=hm.profile_id
    where a2.household_id=v_household and a2.created_by is null
  ) x
  where a.id=x.id and x.total_cents is not null;
end $$;

commit;
