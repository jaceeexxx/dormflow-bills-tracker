# DormFlow v3.3.4 Balance Rent Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build v3.3.4 so Balance shows clear repayment breakdowns, Jace-paid rent can be recorded, due items are grouped by urgency, profile photos appear in payee rows, and mobile rows no longer overlap.

**Architecture:** Add one additive Supabase read RPC, `member_balance_detail_v3(p_today date default current_date)`, that returns Balance-ready JSON without changing existing financial write RPCs. Keep rent on the existing expense/obligation engine by adding a client Rent form that calls `create_expense_v3` with `category = 'Rent'` and `source_type = 'rent'`. Update the Balance and payment-profile UI to consume the detailed read model while preserving existing routes and push-after-save behavior.

**Tech Stack:** Plain JavaScript ES modules, Supabase RPC/PostgREST, PostgreSQL PL/pgSQL, CSS, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-02-dormflow-v3-3-4-balance-rent-clarity-design.md`

## Global Constraints

- Ship as an additive v3.3.4 update after v3.3.3.
- Do not reset Supabase, rerun `schema.sql`, or rewrite settled payment/allocation history.
- All money remains integer centavos.
- Supabase RPCs remain authoritative for balance truth; client rendering may group and format but must not invent balances.
- Push notification delivery remains post-save and non-blocking.
- Existing `member_balance_v3`, `open_obligations_v3`, `create_expense_v3`, `record_payment_v3`, and `submit_payment_claim_v3` contracts stay compatible.
- Rent is paid by Jace and split as a normal household obligation unless Jace deliberately changes the payer in an admin correction flow.
- Existing deployments run only `supabase/migrate-v3.3.4.sql`; `supabase/schema.sql` mirrors the final fresh-install state.
- New compact components must not use viewport-width font scaling or negative letter spacing.

---

### Task 1: Detailed Balance Read Model

**Files:**
- Create: `supabase/migrate-v3.3.4.sql`
- Modify: `supabase/schema.sql`
- Create: `tests/v3-3-4-balance-detail.test.mjs`

**Interfaces:**
- Consumes: `public.obligation_balances_v3`, `public.billing_periods`, `public.household_members`, `public.profiles`, `public.expenses`, `public.credits`, `public.payments`, `public.current_member_id_v3()`, `public.current_household_id_v3()`.
- Produces: `public.member_balance_detail_v3(p_today date default current_date) returns jsonb` with top-level keys `member_id`, `outstanding_cents`, `owed_to_me_cents`, `credit_cents`, `net_position_cents`, `credit_breakdown`, `creditors`, `due_groups`, and `category_breakdown`.

- [ ] **Step 1: Write the failing migration/read-model test**

Add `tests/v3-3-4-balance-detail.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const latestFunctionBlock=(sql,name)=>{
  const re=new RegExp(`create or replace function public\\.${name}\\b`,'gi');
  let match,start=-1;
  while((match=re.exec(sql))) start=match.index;
  assert.notEqual(start,-1, `${name} should be defined`);
  const end=sql.indexOf('$$;',start);
  assert.notEqual(end,-1, `${name} should use a dollar-quoted body`);
  return sql.slice(start,end+3);
};

test('v3.3.4 migration creates additive member balance detail RPC',()=>{
  const sql=read('supabase/migrate-v3.3.4.sql');
  const fn=latestFunctionBlock(sql,'member_balance_detail_v3');
  assert.match(fn,/p_today date default current_date/i);
  for(const key of ['member_id','outstanding_cents','owed_to_me_cents','credit_cents','net_position_cents','credit_breakdown','creditors','due_groups','category_breakdown']){
    assert.match(fn,new RegExp(`'${key}'`,'i'), key);
  }
  assert.match(fn,/grant execute on function public\.member_balance_detail_v3\(date\) to authenticated/i);
  assert.doesNotMatch(sql,/drop table|truncate|delete from public\.(payments|payment_allocations|obligations|expenses|credits)/i);
});

test('balance detail groups creditors with avatar paths and category breakdown',()=>{
  for(const file of ['supabase/migrate-v3.3.4.sql','supabase/schema.sql']){
    const fn=latestFunctionBlock(read(file),'member_balance_detail_v3');
    assert.match(fn,/avatar_path/i);
    assert.match(fn,/jsonb_agg\([^)]*breakdown/is);
    assert.match(fn,/source_type/i);
    assert.match(fn,/source_category/i);
    assert.match(fn,/category_breakdown/i);
    assert.match(fn,/count\(\*\)::int/i);
  }
});

test('balance detail classifies due status by overdue five day later and no due date',()=>{
  const fn=latestFunctionBlock(read('supabase/migrate-v3.3.4.sql'),'member_balance_detail_v3');
  assert.match(fn,/when .*due_date is null then 'no_due_date'/is);
  assert.match(fn,/when .*due_date < p_today then 'overdue'/is);
  assert.match(fn,/when .*due_date <= p_today \+ 5 then 'due_soon'/is);
  assert.match(fn,/else 'later'/is);
  assert.match(fn,/'overdue'/i);
  assert.match(fn,/'due_soon'/i);
  assert.match(fn,/'later'/i);
  assert.match(fn,/'no_due_date'/i);
});

test('credit breakdown includes creditor identity and source payment metadata',()=>{
  const fn=latestFunctionBlock(read('supabase/migrate-v3.3.4.sql'),'member_balance_detail_v3');
  for(const key of ['credit_id','creditor_member_id','creditor_display_name','original_amount_cents','remaining_amount_cents','source_payment_id','source_payment_date','source_payment_method']){
    assert.match(fn,new RegExp(`'${key}'`,'i'), key);
  }
  assert.match(fn,/from public\.credits c/i);
  assert.match(fn,/left join public\.payments pay/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests\v3-3-4-balance-detail.test.mjs`  
Expected: FAIL because `supabase/migrate-v3.3.4.sql` and `member_balance_detail_v3` do not exist.

- [ ] **Step 3: Write minimal additive SQL implementation**

Create `supabase/migrate-v3.3.4.sql`:

```sql
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
  v_outstanding bigint := 0;
  v_owed bigint := 0;
  v_credit bigint := 0;
begin
  if v_member is null or v_household is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

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
      coalesce(e.source_type, case when ob.source_paylater_installment_id is not null then 'paylater' else 'expense' end) as source_type,
      case
        when ob.due_date is null then 'no_due_date'
        when ob.due_date < p_today then 'overdue'
        when ob.due_date <= p_today + 5 then 'due_soon'
        else 'later'
      end as due_status
    from public.obligation_balances_v3 ob
    join public.billing_periods bp on bp.id = ob.period_id
    left join public.expenses e on e.id = ob.source_expense_id
    where ob.household_id = v_household
      and ob.outstanding_cents > 0
      and bp.month <= (
        select bp_active.month
        from public.billing_periods bp_active
        where bp_active.household_id = v_household
          and bp_active.status = 'active'
        limit 1
      )
  )
  select
    coalesce(sum(outstanding_cents) filter (where debtor_member_id = v_member),0)::bigint,
    coalesce(sum(outstanding_cents) filter (where creditor_member_id = v_member),0)::bigint
  into v_outstanding, v_owed
  from scoped_obligations;

  select coalesce(sum(c.remaining_amount_cents),0)::bigint into v_credit
  from public.credits c
  where c.owner_member_id = v_member
    and c.household_id = v_household
    and c.status = 'active';

  return jsonb_build_object(
    'member_id', v_member,
    'outstanding_cents', v_outstanding,
    'owed_to_me_cents', v_owed,
    'credit_cents', v_credit,
    'net_position_cents', v_outstanding - v_owed - v_credit,
    'credit_breakdown', coalesce((
      select jsonb_agg(jsonb_build_object(
        'credit_id', c.id,
        'creditor_member_id', c.creditor_member_id,
        'creditor_display_name', coalesce(cp.display_name, 'Household member'),
        'original_amount_cents', c.original_amount_cents,
        'remaining_amount_cents', c.remaining_amount_cents,
        'source_payment_id', c.source_payment_id,
        'source_payment_date', pay.paid_at,
        'source_payment_method', pay.method
      ) order by c.created_at desc)
      from public.credits c
      join public.household_members chm on chm.id = c.creditor_member_id
      join public.profiles cp on cp.id = chm.profile_id
      left join public.payments pay on pay.id = c.source_payment_id
      where c.owner_member_id = v_member
        and c.household_id = v_household
        and c.status = 'active'
        and c.remaining_amount_cents > 0
    ), '[]'::jsonb),
    'creditors', coalesce((
      select jsonb_agg(creditor_row.payload order by (creditor_row.payload->>'amount_cents')::bigint desc)
      from (
        select jsonb_build_object(
          'member_id', so.creditor_member_id,
          'display_name', coalesce(p.display_name, so.creditor_label, 'Household member'),
          'avatar_path', p.avatar_path,
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
        left join public.household_members hm on hm.id = so.creditor_member_id
        left join public.profiles p on p.id = hm.profile_id
        where so.debtor_member_id = v_member
        group by so.creditor_member_id, so.creditor_label, p.display_name, p.avatar_path
      ) creditor_row
    ), '[]'::jsonb),
    'due_groups', jsonb_build_object(
      'overdue', coalesce((select jsonb_agg(to_jsonb(so) order by so.due_date nulls last, so.source_category, so.outstanding_cents desc) from scoped_obligations so where so.debtor_member_id = v_member and so.due_status = 'overdue'), '[]'::jsonb),
      'due_soon', coalesce((select jsonb_agg(to_jsonb(so) order by so.due_date nulls last, so.source_category, so.outstanding_cents desc) from scoped_obligations so where so.debtor_member_id = v_member and so.due_status = 'due_soon'), '[]'::jsonb),
      'later', coalesce((select jsonb_agg(to_jsonb(so) order by so.due_date nulls last, so.source_category, so.outstanding_cents desc) from scoped_obligations so where so.debtor_member_id = v_member and so.due_status = 'later'), '[]'::jsonb),
      'no_due_date', coalesce((select jsonb_agg(to_jsonb(so) order by so.source_category, so.outstanding_cents desc) from scoped_obligations so where so.debtor_member_id = v_member and so.due_status = 'no_due_date'), '[]'::jsonb)
    ),
    'category_breakdown', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', category_row.source_category,
        'amount_cents', category_row.amount_cents,
        'item_count', category_row.item_count
      ) order by category_row.amount_cents desc)
      from (
        select so.source_category, sum(so.outstanding_cents)::bigint as amount_cents, count(*)::int as item_count
        from scoped_obligations so
        where so.debtor_member_id = v_member
        group by so.source_category
      ) category_row
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.member_balance_detail_v3(date) to authenticated;

commit;
```

Mirror the same function and grant at the end of `supabase/schema.sql` under a v3.3.4 comment.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests\v3-3-4-balance-detail.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrate-v3.3.4.sql supabase/schema.sql tests/v3-3-4-balance-detail.test.mjs
git commit -m "feat: add v3.3.4 balance detail read model"
```

### Task 2: Rent Admin Action

**Files:**
- Modify: `js/admin-actions.js`
- Modify: `js/admin-overview-v3.js`
- Modify: `js/admin-generic-v3.js`
- Modify: `js/app.js`
- Modify: `js/icons.js`
- Test: `tests/v3-3-4-rent-action.test.mjs`

**Interfaces:**
- Consumes: `equalSplit(amountCents, memberIds)`, `parseMoneyCents(value)`, `householdMemberDirectory()`, `bindSaveFlow()`, `requireActivePeriod()`, `create_expense_v3`.
- Produces: `openRentSheet({identity, periodId, onDone})`, new admin add action `{id:'rent', label:'Rent'}`, and `icon('rent')`.

- [ ] **Step 1: Write the failing rent action test**

Create `tests/v3-3-4-rent-action.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {icon} from '../js/icons.js';

const read=path=>fs.readFileSync(path,'utf8');

test('admin add actions expose rent as a first class Jace paid charge',()=>{
  const actions=read('js/admin-actions.js');
  assert.match(actions,/id:\s*'rent'/);
  assert.match(actions,/label:\s*'Rent'/);
  const overview=read('js/admin-overview-v3.js');
  assert.match(overview,/action\.id==='rent'\?'rent'/);
  assert.match(overview,/ADMIN_ADD_ACTIONS\.slice\(0,6\)/);
  assert.match(overview,/data-admin-add="\$\{a\.id\}"/);
});

test('rent sheet writes a rent expense through the authoritative expense RPC',()=>{
  const src=read('js/admin-generic-v3.js');
  assert.match(src,/export async function openRentSheet/);
  assert.match(src,/requireActivePeriod\(periodId\)/);
  assert.match(src,/bindSaveFlow/);
  assert.match(src,/p_category:\s*'Rent'/);
  assert.match(src,/p_source_type:\s*'rent'/);
  assert.match(src,/p_source_label:\s*'Monthly rent'/);
  assert.match(src,/p_payers:\s*\[\{member_id:\s*identity\.memberId\|\|identity\.member_id,\s*amount_cents:amount\}\]/);
  assert.match(src,/p_utility_type:\s*null/);
  assert.match(src,/queuePushForTarget\(\{targetType:'expense',targetId:id\}\)/);
});

test('app routes admin add rent to the rent sheet',()=>{
  const src=read('js/app.js');
  assert.match(src,/openRentSheet/);
  assert.match(src,/if\(adminAdd==='rent'\) return openRentSheet/);
});

test('rent icon renders as custom svg',()=>{
  const svg=icon('rent');
  assert.match(svg,/<svg/);
  assert.match(svg,/app-icon/);
  assert.doesNotMatch(svg,/>Rent</);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests\v3-3-4-rent-action.test.mjs`  
Expected: FAIL because rent action/sheet/icon are absent.

- [ ] **Step 3: Implement the rent action**

In `js/admin-actions.js`, add rent near utility/grocery:

```js
{id:'rent',label:'Rent'}
```

In `js/icons.js`, add a `rent` path using the existing style:

```js
rent:'<path d="M4.5 11.2 12 4.8l7.5 6.4"/><path d="M6.2 10.6v8.7h11.6v-8.7"/><path d="M9.1 19.3v-5.2h5.8v5.2"/><path d="M8.2 8.3V5.6h3"/>'
```

In `js/admin-overview-v3.js`, map rent to `icon('rent')` in both `quickAction()` and `renderAddSheet()`, and show six quick actions:

```js
const addIcon=id=>id==='rent'?'rent':id==='utility'?'utilities':id==='grocery'?'grocery':id==='paylater'?'paylater':id==='other'?'wallet':id==='payment'?'transfer':'announcement';
```

In `js/admin-generic-v3.js`, add:

```js
export async function openRentSheet({identity,periodId,onDone=()=>{}}){
  requireActivePeriod(periodId);
  const members=await activeHouseholdMembers(),adminId=identity.memberId||identity.member_id;
  const sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content');
  const today=new Date().toISOString().slice(0,10);
  const month=today.slice(0,7);
  content.innerHTML=`<form class="sheet-body" id="rent-form">...</form>`;
  sheet.showModal();
  const form=content.querySelector('form'),closeButton=content.querySelector('[data-close-sheet]');
  bindDirtyClose({form,closeButtons:[closeButton],close:()=>sheet.close()});
  bindSaveFlow(form,{idleLabel:'Save rent',successMessage:'Rent saved',close:()=>sheet.close(),save:async d=>{
    if(!navigator.onLine)throw new Error('Reconnect before adding rent.');
    const amount=parseMoneyCents(d.get('amount')),ids=d.getAll('member'),splits=equalSplit(amount,ids);
    const rentMonth=String(d.get('rentMonth')||month);
    const expenseId=await supabase.rpc('create_expense_v3',{
      p_household:identity.householdId||identity.household_id,
      p_period:periodId,
      p_category:'Rent',
      p_description:String(d.get('description')||`${rentMonth} rent`).trim(),
      p_amount_cents:amount,
      p_expense_date:`${rentMonth}-01`,
      p_due_date:d.get('dueDate')||null,
      p_payers:[{member_id:identity.memberId||identity.member_id,amount_cents:amount}],
      p_splits:splits,
      p_source_type:'rent',
      p_source_label:'Monthly rent',
      p_idempotency_key:crypto.randomUUID(),
      p_utility_type:null
    });
    return expenseId;
  },onSaved:async id=>{queuePushForTarget({targetType:'expense',targetId:id});await onDone(id);}});
}
```

In `js/app.js`, import `openRentSheet` and add:

```js
if(adminAdd==='rent') return openRentSheet({identity:state.identity,periodId:overview.periodId,onDone:done});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests\v3-3-4-rent-action.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/admin-actions.js js/admin-overview-v3.js js/admin-generic-v3.js js/app.js js/icons.js tests/v3-3-4-rent-action.test.mjs
git commit -m "feat: add rent admin action"
```

### Task 3: Balance Detail UI and Payment Sheet Breakdown

**Files:**
- Modify: `js/member-balance.js`
- Modify: `js/people-settings.js`
- Modify: `js/member-home.js`
- Modify: `js/read-model-v3.js`
- Modify: `js/icons.js`
- Modify: `css/styles.css`
- Test: `tests/v3-3-4-balance-ui.test.mjs`

**Interfaces:**
- Consumes: `member_balance_detail_v3`, `signedHouseholdMediaUrl(path)`, `openPaymentProfileSheet(memberId,{identity,balanceDetail})`, and `formatPeso(cents)`.
- Produces: balance rows with `avatar_path` photos, `due-status-*` badges, grouped due schedule, open-obligation category breakdown, expandable credit breakdown, mobile-safe row classes, and payment sheet obligation breakdown.

- [ ] **Step 1: Write the failing Balance UI test**

Create `tests/v3-3-4-balance-ui.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderMemberBalance, classifyDueStatus, summarizeCategories} from '../js/member-balance.js';
import {icon} from '../js/icons.js';

const read=path=>fs.readFileSync(path,'utf8');

test('classifyDueStatus follows overdue five day later and no due date rules',()=>{
  assert.equal(classifyDueStatus({due_date:'2026-09-01'},'2026-09-02'),'overdue');
  assert.equal(classifyDueStatus({due_date:'2026-09-02'},'2026-09-02'),'due_soon');
  assert.equal(classifyDueStatus({due_date:'2026-09-07'},'2026-09-02'),'due_soon');
  assert.equal(classifyDueStatus({due_date:'2026-09-08'},'2026-09-02'),'later');
  assert.equal(classifyDueStatus({due_date:null},'2026-09-02'),'no_due_date');
});

test('summarizeCategories produces compact repayment labels',()=>{
  assert.equal(summarizeCategories([{category:'Rent'}]),'Rent');
  assert.equal(summarizeCategories([{category:'Rent'},{category:'Groceries'},{category:'PayLater / Loans'}]),'Rent + 2 more');
});

test('balance renderer uses detailed payee rows without overlapping transfer label',()=>{
  const html=renderMemberBalance({
    outstanding_cents:100000,
    owed_to_me_cents:0,
    credit_cents:25000,
    credit_breakdown:[{credit_id:'c1',creditor_display_name:'Jace',remaining_amount_cents:25000,source_payment_method:'Bank Transfer',source_payment_date:'2026-08-31'}],
    creditors:[{member_id:'jace',display_name:'Jace',avatar_url:'avatar.jpg',amount_cents:100000,due_status:'due_soon',breakdown:[{category:'Rent',amount_cents:80000,status:'due_soon',due_date:'2026-09-05',label:'September rent'},{category:'Groceries',amount_cents:20000,status:'later',due_date:'2026-09-12',label:'Puregold'}]}],
    due_groups:{overdue:[],due_soon:[{id:'o1',source_category:'Rent',label:'September rent',display_name:'Jace',due_date:'2026-09-05',outstanding_cents:80000,due_status:'due_soon'}],later:[],no_due_date:[]},
    category_breakdown:[{label:'Rent',amount_cents:80000,item_count:1},{label:'Groceries',amount_cents:20000,item_count:1}]
  });
  assert.match(html,/class="payee-card balance-payee-v2 due-status-due_soon"/);
  assert.match(html,/avatar\.jpg/);
  assert.match(html,/Rent \+ 1 more/);
  assert.match(html,/Due within 5 days/);
  assert.match(html,/Credit with Jace/);
  assert.match(html,/data-credit-breakdown/);
  assert.doesNotMatch(html,/Outstanding transfer/);
});

test('balance renderer groups due schedule in fixed order',()=>{
  const html=renderMemberBalance({due_groups:{overdue:[{id:'o1',source_category:'Rent',label:'Rent',display_name:'Jace',due_date:'2026-09-01',outstanding_cents:100,due_status:'overdue'}],due_soon:[],later:[],no_due_date:[]}});
  const order=['Overdue','Due within 5 days','Later this month','No due date'].map(label=>html.indexOf(label));
  assert.deepEqual(order, [...order].sort((a,b)=>a-b));
});

test('payment profile sheet can render obligation breakdown context',()=>{
  const src=read('js/people-settings.js');
  assert.match(src,/balanceDetail/);
  assert.match(src,/payment-obligation-breakdown/);
  assert.match(src,/Total owed/);
  assert.match(src,/data-action="report-payment"/);
});

test('new premium status icons render as custom svg',()=>{
  for(const name of ['overdue','dueSoon','credit','category']){
    const svg=icon(name);
    assert.match(svg,/<svg/);
    assert.match(svg,/app-icon/);
  }
});

test('balance css protects compact rows from amount overlap',()=>{
  const css=read('css/styles.css');
  assert.match(css,/\.balance-payee-v2/);
  assert.match(css,/grid-template-columns:44px minmax\(0,1fr\) auto/);
  assert.match(css,/\.payee-amount-block/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(css,/\.balance-payee-v2\{grid-template-columns:44px minmax\(0,1fr\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests\v3-3-4-balance-ui.test.mjs`  
Expected: FAIL because helpers/classes/detail context are absent.

- [ ] **Step 3: Implement detailed Balance loading**

In `js/member-balance.js`:

- call `supabase.rpc('member_balance_detail_v3',{})`;
- fall back to the old `member_balance_v3` path only if the new RPC is unavailable;
- resolve creditor `avatar_path` into `avatar_url` with `signedHouseholdMediaUrl`;
- export `classifyDueStatus(item,today)` and `summarizeCategories(items)`;
- render `credit_breakdown`, grouped `due_groups`, and `category_breakdown` from open obligations.

Use classes:

- `balance-payee-v2`
- `payee-main-copy`
- `payee-category-summary`
- `payee-amount-block`
- `due-status-overdue`
- `due-status-due_soon`
- `due-status-later`
- `due-status-no_due_date`
- `due-group-card`
- `payment-obligation-breakdown`

- [ ] **Step 4: Implement payment sheet breakdown context**

In `js/people-settings.js`, update `openPaymentProfileSheet(memberId,{identity,balanceDetail}={})`:

- find matching creditor in `balanceDetail.creditors`;
- render total owed and breakdown grouped by category when present;
- preserve QR, copy details, report payment, and edit payment profile actions;
- keep behavior unchanged when opened from Payment Methods with no balance detail.

In `js/member-balance.js` and `js/member-home.js`, keep `data-payment-profile="<member id>"`; in `app.js` load or reuse Balance detail before opening the sheet when the current route is Balance/Home.

- [ ] **Step 5: Implement CSS and icons**

In `js/icons.js`, add `overdue`, `dueSoon`, `credit`, and `category`.

Append compact CSS to `css/styles.css`:

```css
.balance-payee-v2{grid-template-columns:44px minmax(0,1fr) auto;gap:12px;padding:14px 0;align-items:start}
.balance-payee-v2 .payee-avatar{width:44px;height:44px;border-radius:15px}
.payee-main-copy{display:grid;gap:5px;min-width:0}
.payee-line{display:flex;align-items:center;gap:8px;min-width:0}
.payee-line strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.payee-category-summary{font-size:10px;color:var(--muted);line-height:1.35;white-space:normal}
.payee-amount-block{display:grid;justify-items:end;gap:5px;white-space:nowrap}
.payee-amount-block b{font-size:13px}
.due-status-badge{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;border-radius:999px;font-size:8px;font-weight:850;text-transform:uppercase}
.due-status-overdue .due-status-badge,.due-status-badge.overdue{background:#f9eaea;color:var(--red)}
.due-status-due_soon .due-status-badge,.due-status-badge.due_soon{background:var(--accent-soft);color:#a8641d}
.due-status-later .due-status-badge,.due-status-badge.later{background:#edf2f8;color:var(--navy)}
.due-status-no_due_date .due-status-badge,.due-status-badge.no_due_date{background:#eef3f1;color:#66756f}
.credit-breakdown-list,.due-group-list,.payment-obligation-breakdown{display:grid;gap:10px}
.due-group-card{display:grid;gap:8px;padding-top:8px}
.due-group-card h3{margin:0;font-size:12px}
@media(max-width:560px){.balance-payee-v2{grid-template-columns:44px minmax(0,1fr);gap:12px}.payee-amount-block{grid-column:2;justify-items:start}.payee-line{align-items:flex-start;flex-wrap:wrap}.balance-main-grid{grid-template-columns:1fr}}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests\v3-3-4-balance-ui.test.mjs`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add js/member-balance.js js/people-settings.js js/member-home.js js/read-model-v3.js js/icons.js css/styles.css tests/v3-3-4-balance-ui.test.mjs
git commit -m "feat: clarify balance repayment breakdown"
```

### Task 4: Release Verification and Upgrade Markers

**Files:**
- Modify: `package.json`
- Modify: `service-worker.js`
- Modify: `README.md` or deployment/migration docs if they contain current-version upgrade instructions
- Test: `tests/v3-3-4-release.test.mjs`

**Interfaces:**
- Consumes: existing release metadata tests and project check.
- Produces: version/cache/migration markers that identify v3.3.4 and require only `supabase/migrate-v3.3.4.sql` for existing deployments.

- [ ] **Step 1: Write the failing release marker test**

Create `tests/v3-3-4-release.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');

test('release metadata and cache namespace target v3.3.4',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'3.3.4');
  assert.match(read('service-worker.js'),/dormflow-v3\.3\.4/);
});

test('upgrade docs mention only the additive v3.3.4 migration for existing databases',()=>{
  const haystack=['README.md','docs/superpowers/specs/2026-09-02-dormflow-v3-3-4-balance-rent-clarity-design.md'].filter(fs.existsSync).map(read).join('\n');
  assert.match(haystack,/migrate-v3\.3\.4\.sql/);
  assert.match(haystack,/Do not reset Supabase|Do not reset/i);
  assert.match(haystack,/schema\.sql.*fresh/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests\v3-3-4-release.test.mjs`  
Expected: FAIL because package/cache markers still target v3.3.2 or v3.3.3.

- [ ] **Step 3: Update release markers**

Set `package.json` version to `3.3.4`. In `service-worker.js`, bump cache constants to include `dormflow-v3.3.4`. In docs, add a short v3.3.4 upgrade note if README already carries release upgrade instructions:

```md
Existing v3.3.3 databases should run only `supabase/migrate-v3.3.4.sql`. Do not rerun `schema.sql`; `schema.sql` is for fresh Supabase projects only.
```

- [ ] **Step 4: Run focused release test**

Run: `node --test tests\v3-3-4-release.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm.cmd test
npm.cmd run check
```

Expected: all tests pass, project check passes, no syntax or forbidden-artifact failures.

- [ ] **Step 6: Commit**

```bash
git add package.json service-worker.js README.md tests/v3-3-4-release.test.mjs
git commit -m "chore: mark v3.3.4 release"
```
