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
begin
  if v_member is null or v_household is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

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
        ob.due_date,
        ob.source_category,
        ob.outstanding_cents,
        coalesce(e.description, ob.source_category, 'Expense') as label,
        coalesce(
          e.source_type,
          case when o.source_paylater_installment_id is not null then 'paylater' else 'expense' end
        ) as source_type,
        coalesce(cp.display_name, ob.creditor_label, 'Household member') as display_name,
        cp.avatar_path,
        case
          when ob.due_date is null then 'no_due_date'
          when ob.due_date < p_today then 'overdue'
          when ob.due_date <= p_today + 5 then 'due_soon'
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
          select bp_active.month
          from public.billing_periods bp_active
          where bp_active.household_id = v_household
            and bp_active.status = 'active'
          limit 1
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
    creditors as (
      select coalesce(jsonb_agg(creditor_row.payload order by (creditor_row.payload->>'amount_cents')::bigint desc), '[]'::jsonb) as rows
      from (
        select jsonb_build_object(
          'member_id', so.creditor_member_id,
          'display_name', so.display_name,
          'avatar_path', so.avatar_path,
          'amount_cents', sum(so.outstanding_cents)::bigint,
          'oldest_due_date', min(so.due_date),
          'due_status', case
            when bool_or(so.due_status = 'overdue') then 'overdue'
            when bool_or(so.due_status = 'due_soon') then 'due_soon'
            when bool_or(so.due_status = 'later') then 'later'
            else 'no_due_date'
          end,
          'breakdown', jsonb_agg(jsonb_build_object(
            'obligation_id', so.id,
            'category', so.source_category,
            'label', so.label,
            'source_type', so.source_type,
            'amount_cents', so.outstanding_cents,
            'due_date', so.due_date,
            'status', so.due_status
          ) order by so.due_date nulls last, so.source_category, so.outstanding_cents desc)
        ) as payload
        from scoped_obligations so
        where so.debtor_member_id = v_member
        group by so.creditor_member_id, so.display_name, so.avatar_path
      ) creditor_row
    ),
    due_groups as (
      select jsonb_build_object(
        'overdue', coalesce((select jsonb_agg(to_jsonb(so) order by so.due_date nulls last, so.source_category, so.outstanding_cents desc) from scoped_obligations so where so.debtor_member_id = v_member and so.due_status = 'overdue'), '[]'::jsonb),
        'due_soon', coalesce((select jsonb_agg(to_jsonb(so) order by so.due_date nulls last, so.source_category, so.outstanding_cents desc) from scoped_obligations so where so.debtor_member_id = v_member and so.due_status = 'due_soon'), '[]'::jsonb),
        'later', coalesce((select jsonb_agg(to_jsonb(so) order by so.due_date nulls last, so.source_category, so.outstanding_cents desc) from scoped_obligations so where so.debtor_member_id = v_member and so.due_status = 'later'), '[]'::jsonb),
        'no_due_date', coalesce((select jsonb_agg(to_jsonb(so) order by so.source_category, so.outstanding_cents desc) from scoped_obligations so where so.debtor_member_id = v_member and so.due_status = 'no_due_date'), '[]'::jsonb)
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
          so.source_category,
          sum(so.outstanding_cents)::bigint as amount_cents,
          count(*)::int as item_count
        from scoped_obligations so
        where so.debtor_member_id = v_member
        group by so.source_category
      ) category_row
    )
    select jsonb_build_object(
      'member_id', v_member,
      'outstanding_cents', totals.outstanding_cents,
      'owed_to_me_cents', totals.owed_to_me_cents,
      'credit_cents', credit_total.credit_cents,
      'net_position_cents', totals.outstanding_cents - totals.owed_to_me_cents - credit_total.credit_cents,
      'credit_breakdown', credit_breakdown.rows,
      'creditors', creditors.rows,
      'due_groups', due_groups.payload,
      'category_breakdown', category_breakdown.rows
    )
    from totals, credit_total, credit_breakdown, creditors, due_groups, category_breakdown
  );
end;
$$;

grant execute on function public.member_balance_detail_v3(date) to authenticated;

commit;
