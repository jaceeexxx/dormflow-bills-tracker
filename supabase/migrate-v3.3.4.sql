-- DormFlow v3.3.4
-- Balance, rent, and repayment clarity read-model upgrade.
-- Additive only. Does not modify settled financial data.

begin;

create or replace function public.member_balance_detail_v3(
  p_today date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member uuid := public.current_member_id_v3();
  v_household uuid := public.current_household_id_v3();
  v_authoritative_balance jsonb;
begin
  if v_member is null or v_household is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  v_authoritative_balance := public.member_balance_v3();

  return (
    with scoped_obligations as (
      select
        ob.id,
        ob.household_id,
        ob.period_id,
        ob.source_expense_id,
        ob.debtor_member_id,
        ob.creditor_member_id,
        ob.creditor_label,
        coalesce(e.due_date, ob.due_date) as due_date,
        coalesce(e.category, ob.source_category, 'Expense') as source_category,
        ob.outstanding_cents,
        coalesce(e.description, e.category, ob.source_category, 'Expense') as label,
        coalesce(
          e.source_type,
          case when o.source_paylater_installment_id is not null then 'paylater' else 'expense' end
        ) as source_type,
        coalesce(cp.display_name, ob.creditor_label, 'Household member') as display_name,
        cp.avatar_path,
        case
          when coalesce(e.due_date, ob.due_date) is null then 'no_due_date'
          when coalesce(e.due_date, ob.due_date) < p_today then 'overdue'
          when coalesce(e.due_date, ob.due_date) <= p_today + 5 then 'due_soon'
          else 'later'
        end as due_status
      from public.obligation_balances_v3 ob
      join public.billing_periods bp on bp.id = ob.period_id
      join public.obligations o on o.id = ob.id
      left join public.expenses e on e.id = ob.source_expense_id
      left join public.household_members chm on chm.id = ob.creditor_member_id
      left join public.profiles cp on cp.id = chm.profile_id
      where ob.household_id = v_household
        and ob.outstanding_cents > 0
        and bp.month <= (
          select max(bp_active.month)
          from public.billing_periods bp_active
          where bp_active.household_id = v_household
            and bp_active.status = 'active'
        )
    ),
    totals as (
      select
        coalesce(sum(so.outstanding_cents) filter (where so.debtor_member_id = v_member), 0)::bigint as outstanding_cents,
        coalesce(sum(so.outstanding_cents) filter (where so.creditor_member_id = v_member), 0)::bigint as owed_to_me_cents
      from scoped_obligations so
    ),
    credit_total as (
      select coalesce(sum(c.remaining_amount_cents), 0)::bigint as credit_cents
      from public.credits c
      where c.owner_member_id = v_member
        and c.household_id = v_household
        and c.status = 'active'
    ),
    authoritative_totals as (
      select
        coalesce((v_authoritative_balance->>'outstanding_cents')::bigint, totals.outstanding_cents) as outstanding_cents,
        coalesce((v_authoritative_balance->>'owed_to_me_cents')::bigint, totals.owed_to_me_cents) as owed_to_me_cents,
        coalesce((v_authoritative_balance->>'credit_cents')::bigint, credit_total.credit_cents) as credit_cents
      from totals, credit_total
    ),
    credit_breakdown as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'credit_id', c.id,
        'creditor_member_id', c.creditor_member_id,
        'creditor_display_name', coalesce(cp.display_name, 'Household member'),
        'original_amount_cents', c.original_amount_cents,
        'remaining_amount_cents', c.remaining_amount_cents,
        'source_payment_id', c.source_payment_id,
        'source_payment_date', pay.paid_at,
        'source_payment_method', pay.method
      ) order by c.created_at desc), '[]'::jsonb) as rows
      from public.credits c
      join public.household_members chm on chm.id = c.creditor_member_id
      join public.profiles cp on cp.id = chm.profile_id
      left join public.payments pay on pay.id = c.source_payment_id
      where c.owner_member_id = v_member
        and c.household_id = v_household
        and c.status = 'active'
        and c.remaining_amount_cents > 0
    ),
    detailed_creditors as (
      select
        so.creditor_member_id as member_id,
        so.display_name,
        so.avatar_path,
        sum(so.outstanding_cents)::bigint as amount_cents,
        min(so.due_date) as oldest_due_date,
        case
          when bool_or(so.due_status = 'overdue') then 'overdue'
          when bool_or(so.due_status = 'due_soon') then 'due_soon'
          when bool_or(so.due_status = 'later') then 'later'
          else 'no_due_date'
        end as due_status,
        jsonb_agg(jsonb_build_object(
          'obligation_id', so.id,
          'category', so.source_category,
          'label', so.label,
          'source_type', so.source_type,
          'amount_cents', so.outstanding_cents,
          'due_date', so.due_date,
          'status', so.due_status
        ) order by so.due_date nulls last, so.source_category, so.outstanding_cents desc) as breakdown
      from scoped_obligations so
      where so.debtor_member_id = v_member
      group by so.creditor_member_id, so.display_name, so.avatar_path
    ),
    authoritative_creditors as (
      select
        (entry->>'member_id')::uuid as member_id,
        coalesce(entry->>'label', 'Household member') as display_name,
        coalesce((entry->>'amount_cents')::bigint, 0)::bigint as amount_cents
      from jsonb_array_elements(coalesce(v_authoritative_balance->'creditors', '[]'::jsonb)) entry
      where coalesce((entry->>'amount_cents')::bigint, 0) > 0
    ),
    reconciliation_rows as (
      select
        ac.member_id,
        ac.display_name,
        dc.avatar_path,
        (ac.amount_cents - coalesce(dc.amount_cents, 0))::bigint as amount_cents
      from authoritative_creditors ac
      left join detailed_creditors dc
        on dc.member_id is not distinct from ac.member_id
       and (ac.member_id is not null or lower(dc.display_name) = lower(ac.display_name))
      where ac.amount_cents > coalesce(dc.amount_cents, 0)
    ),
    balance_reconciliation as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'member_id', ac.member_id,
        'creditor_label', case when ac.member_id is null then ac.display_name else null end,
        'display_name', ac.display_name,
        'avatar_path', dc.avatar_path,
        'amount_cents', ac.amount_cents,
        'oldest_due_date', dc.oldest_due_date,
        'due_status', coalesce(dc.due_status, 'no_due_date'),
        'breakdown', coalesce(dc.breakdown, '[]'::jsonb) || case
          when rr.amount_cents > 0 then jsonb_build_array(jsonb_build_object(
            'obligation_id', null,
            'category', 'Other open balance',
            'label', 'Balance detail pending refresh',
            'source_type', 'balance_reconciliation',
            'amount_cents', rr.amount_cents,
            'due_date', null,
            'status', 'no_due_date'
          ))
          else '[]'::jsonb
        end
      ) order by ac.amount_cents desc), '[]'::jsonb) as rows
      from authoritative_creditors ac
      left join detailed_creditors dc
        on (dc.member_id = ac.member_id or (ac.member_id is null and lower(dc.display_name) = lower(ac.display_name)))
      left join reconciliation_rows rr
        on (rr.member_id = ac.member_id or (ac.member_id is null and lower(rr.display_name) = lower(ac.display_name)))
    ),
    due_groups as (
      select jsonb_build_object(
        'overdue', coalesce((select jsonb_agg(to_jsonb(so) order by so.due_date nulls last, so.source_category, so.outstanding_cents desc) from scoped_obligations so where so.debtor_member_id = v_member and so.due_status = 'overdue'), '[]'::jsonb),
        'due_soon', coalesce((select jsonb_agg(to_jsonb(so) order by so.due_date nulls last, so.source_category, so.outstanding_cents desc) from scoped_obligations so where so.debtor_member_id = v_member and so.due_status = 'due_soon'), '[]'::jsonb),
        'later', coalesce((select jsonb_agg(to_jsonb(so) order by so.due_date nulls last, so.source_category, so.outstanding_cents desc) from scoped_obligations so where so.debtor_member_id = v_member and so.due_status = 'later'), '[]'::jsonb),
        'no_due_date',
          coalesce((select jsonb_agg(to_jsonb(so) order by so.source_category, so.outstanding_cents desc) from scoped_obligations so where so.debtor_member_id = v_member and so.due_status = 'no_due_date'), '[]'::jsonb)
          || coalesce((select jsonb_agg(jsonb_build_object(
            'id', null,
            'debtor_member_id', v_member,
            'creditor_member_id', rr.member_id,
            'display_name', rr.display_name,
            'due_date', null,
            'source_category', 'Other open balance',
            'outstanding_cents', rr.amount_cents,
            'label', 'Balance detail pending refresh',
            'source_type', 'balance_reconciliation',
            'due_status', 'no_due_date'
          ) order by rr.amount_cents desc) from reconciliation_rows rr), '[]'::jsonb)
      ) as payload
    ),
    category_breakdown as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'label', category_row.source_category,
        'amount_cents', category_row.amount_cents,
        'item_count', category_row.item_count
      ) order by category_row.amount_cents desc), '[]'::jsonb) as rows
      from (
        select
          category_parts.source_category,
          sum(category_parts.amount_cents)::bigint as amount_cents,
          sum(category_parts.item_count)::int as item_count
        from (
          select
            so.source_category,
            sum(so.outstanding_cents)::bigint as amount_cents,
            count(*)::int as item_count
          from scoped_obligations so
          where so.debtor_member_id = v_member
          group by so.source_category
          union all
          select
            'Other open balance'::text,
            sum(rr.amount_cents)::bigint,
            count(*)::int
          from reconciliation_rows rr
          having sum(rr.amount_cents) > 0
        ) category_parts
        group by category_parts.source_category
      ) category_row
    )
    select jsonb_build_object(
      'member_id', v_member,
      'outstanding_cents', authoritative_totals.outstanding_cents,
      'owed_to_me_cents', authoritative_totals.owed_to_me_cents,
      'credit_cents', authoritative_totals.credit_cents,
      'net_position_cents', authoritative_totals.outstanding_cents - authoritative_totals.owed_to_me_cents - authoritative_totals.credit_cents,
      'credit_breakdown', credit_breakdown.rows,
      'creditors', balance_reconciliation.rows,
      'due_groups', due_groups.payload,
      'category_breakdown', category_breakdown.rows
    )
    from authoritative_totals, credit_breakdown, balance_reconciliation, due_groups, category_breakdown
  );
end;
$$;

grant execute on function public.member_balance_detail_v3(date) to authenticated;

commit;
