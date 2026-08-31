-- DormFlow v3 member linking.
-- Prerequisite: create these four Supabase Auth users first:
--   jace@gmail.com, kean@gmail.com, aerian@gmail.com, aexy@gmail.com
-- Safe to rerun.

begin;

insert into public.households(name,slug,timezone)
values('20 St. Paul','20-st-paul','Asia/Manila')
on conflict(slug) do update
set name=excluded.name,
    timezone=excluded.timezone;

-- 1) Link the four Auth users to DormFlow profiles first.
with wanted(display_name,email) as (
  values
    ('Jace','jace@gmail.com'),
    ('Kean','kean@gmail.com'),
    ('Aerian','aerian@gmail.com'),
    ('Aexy','aexy@gmail.com')
)
insert into public.profiles(user_id,display_name)
select u.id,w.display_name
from wanted w
join auth.users u on lower(u.email)=lower(w.email)
on conflict(user_id) do update
set display_name=excluded.display_name,
    updated_at=now();

-- 2) Create/update household membership after profiles exist.
with wanted(display_name,email,role,accent) as (
  values
    ('Jace','jace@gmail.com','admin','#203449'),
    ('Kean','kean@gmail.com','member','#2e7268'),
    ('Aerian','aerian@gmail.com','member','#9d772f'),
    ('Aexy','aexy@gmail.com','member','#6b5f92')
)
insert into public.household_members(household_id,profile_id,role,accent)
select h.id,p.id,w.role,w.accent
from wanted w
join auth.users u on lower(u.email)=lower(w.email)
join public.profiles p on p.user_id=u.id
join public.households h on h.slug='20-st-paul'
on conflict(household_id,profile_id) do update
set role=excluded.role,
    accent=excluded.accent,
    is_active=true,
    updated_at=now();

-- 3) Ensure each linked member has notification preferences.
insert into public.notification_preferences(member_id)
select hm.id
from public.household_members hm
join public.households h on h.id=hm.household_id
where h.slug='20-st-paul'
on conflict(member_id) do nothing;

-- 4) Create/update the default equal split preset.
insert into public.split_presets(household_id,name,mode,config,is_default,created_by)
select
  h.id,
  'All 4 Equally',
  'equal',
  jsonb_build_object(
    'members',(
      select jsonb_agg(hm.id order by p.display_name)
      from public.household_members hm
      join public.profiles p on p.id=hm.profile_id
      where hm.household_id=h.id and hm.is_active=true
    )
  ),
  true,
  (
    select hm.id
    from public.household_members hm
    where hm.household_id=h.id and hm.role='admin'
    limit 1
  )
from public.households h
where h.slug='20-st-paul'
on conflict(household_id,name) do update
set config=excluded.config,
    is_default=true,
    created_by=excluded.created_by;

commit;

-- Verification: expect 4 rows and notification_preferences_count = 4.
select
  p.display_name,
  u.email,
  hm.role,
  hm.is_active,
  hm.id as member_id,
  (
    select count(*)
    from public.notification_preferences np
    join public.household_members hm2 on hm2.id=np.member_id
    join public.households h2 on h2.id=hm2.household_id
    where h2.slug='20-st-paul'
  ) as notification_preferences_count
from public.household_members hm
join public.profiles p on p.id=hm.profile_id
join auth.users u on u.id=p.user_id
join public.households h on h.id=hm.household_id
where h.slug='20-st-paul'
order by case when hm.role='admin' then 0 else 1 end,p.display_name;
