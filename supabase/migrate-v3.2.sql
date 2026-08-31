-- DormFlow v3.2 additive migration.
-- Run ONCE on the existing authenticated v3 Supabase project.
-- Do not rerun schema.sql, seed-members.sql, or migrate-history.sql.
begin;

-- Existing RLS policy on profiles needs the table privilege as well.
grant select on public.profiles to authenticated;

-- Household members need names/avatars for payees, settlement cards, and payment profiles.
drop policy if exists "profiles own or admin" on public.profiles;
drop policy if exists "profiles household read" on public.profiles;
create policy "profiles household read"
on public.profiles for select to authenticated
using (
  user_id=auth.uid()
  or exists (
    select 1 from public.household_members target
    where target.profile_id=profiles.id
      and target.is_active
      and target.household_id=public.current_household_id_v3()
  )
);

-- Align existing payment methods with the premium household payment-profile UI.
alter table public.member_payment_methods
  add column if not exists provider text,
  add column if not exists account_name text;

update public.member_payment_methods
set provider = coalesce(nullif(trim(provider),''), nullif(trim(method),''), 'MariBank'),
    account_name = coalesce(account_name, '')
where provider is null or trim(provider)='' or account_name is null;

alter table public.member_payment_methods
  alter column provider set default 'MariBank',
  alter column provider set not null,
  alter column account_name set default '',
  alter column account_name set not null;

-- Same-household members may READ payment profiles. Only owner/admin may write.
drop policy if exists "member_payment_methods own or admin" on public.member_payment_methods;
drop policy if exists "payment methods household read" on public.member_payment_methods;
drop policy if exists "payment methods owner admin insert" on public.member_payment_methods;
drop policy if exists "payment methods owner admin update" on public.member_payment_methods;
drop policy if exists "payment methods owner admin delete" on public.member_payment_methods;

create policy "payment methods household read"
on public.member_payment_methods for select to authenticated
using (
  exists (
    select 1
    from public.household_members target
    where target.id=member_payment_methods.member_id
      and target.is_active
      and target.household_id=public.current_household_id_v3()
  )
);

create policy "payment methods owner admin insert"
on public.member_payment_methods for insert to authenticated
with check (
  member_id=public.current_member_id_v3()
  or public.is_household_admin_v3((select household_id from public.household_members where id=member_id))
);

create policy "payment methods owner admin update"
on public.member_payment_methods for update to authenticated
using (
  member_id=public.current_member_id_v3()
  or public.is_household_admin_v3((select household_id from public.household_members where id=member_id))
)
with check (
  member_id=public.current_member_id_v3()
  or public.is_household_admin_v3((select household_id from public.household_members where id=member_id))
);

create policy "payment methods owner admin delete"
on public.member_payment_methods for delete to authenticated
using (
  member_id=public.current_member_id_v3()
  or public.is_household_admin_v3((select household_id from public.household_members where id=member_id))
);

grant select,insert,update,delete on public.member_payment_methods to authenticated;

-- Payment-profile attachments are intentionally household-visible, unlike receipts.
drop policy if exists "payment profile attachments household read" on public.attachments;
create policy "payment profile attachments household read"
on public.attachments for select to authenticated
using (
  parent_type='payment_profile'
  and household_id=public.current_household_id_v3()
);

drop policy if exists "payment profile attachments owner admin insert" on public.attachments;
drop policy if exists "payment profile attachments owner admin delete" on public.attachments;
create policy "payment profile attachments owner admin insert"
on public.attachments for insert to authenticated
with check (
  parent_type='payment_profile' and household_id=public.current_household_id_v3()
  and (owner_member_id=public.current_member_id_v3() or public.is_household_admin_v3(household_id))
);
create policy "payment profile attachments owner admin delete"
on public.attachments for delete to authenticated
using (
  parent_type='payment_profile' and household_id=public.current_household_id_v3()
  and (owner_member_id=public.current_member_id_v3() or public.is_household_admin_v3(household_id))
);
grant delete on public.attachments to authenticated;

-- Private bucket dedicated to avatars and household-safe payment QR images.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'household-media','household-media',false,5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

-- Household media read: any active member of the household may see avatars/QRs.
drop policy if exists "household media read" on storage.objects;
drop policy if exists "household media insert" on storage.objects;
drop policy if exists "household media update" on storage.objects;
drop policy if exists "household media delete" on storage.objects;

create policy "household media read"
on storage.objects for select to authenticated
using (
  bucket_id='household-media'
  and split_part(name,'/',1)=public.current_household_id_v3()::text
  and split_part(name,'/',2) in ('profiles','payment-profiles')
);

create policy "household media insert"
on storage.objects for insert to authenticated
with check (
  bucket_id='household-media'
  and split_part(name,'/',1)=public.current_household_id_v3()::text
  and split_part(name,'/',2) in ('profiles','payment-profiles')
  and (
    split_part(name,'/',3)=public.current_member_id_v3()::text
    or public.is_household_admin_v3(public.current_household_id_v3())
  )
);

create policy "household media update"
on storage.objects for update to authenticated
using (
  bucket_id='household-media'
  and split_part(name,'/',1)=public.current_household_id_v3()::text
  and (
    split_part(name,'/',3)=public.current_member_id_v3()::text
    or public.is_household_admin_v3(public.current_household_id_v3())
  )
)
with check (
  bucket_id='household-media'
  and split_part(name,'/',1)=public.current_household_id_v3()::text
  and split_part(name,'/',2) in ('profiles','payment-profiles')
);

create policy "household media delete"
on storage.objects for delete to authenticated
using (
  bucket_id='household-media'
  and split_part(name,'/',1)=public.current_household_id_v3()::text
  and (
    split_part(name,'/',3)=public.current_member_id_v3()::text
    or public.is_household_admin_v3(public.current_household_id_v3())
  )
);

commit;

-- Verification output.
select 'profiles grant' as check_name,
       has_table_privilege('authenticated','public.profiles','SELECT')::int as value
union all
select 'household-media bucket', count(*)::int
from storage.buckets where id='household-media'
union all
select 'payment profile columns', count(*)::int
from information_schema.columns
where table_schema='public' and table_name='member_payment_methods'
  and column_name in ('provider','account_name','qr_attachment_id');
