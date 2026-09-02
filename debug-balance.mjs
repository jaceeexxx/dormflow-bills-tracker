import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase_url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabase_key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabase_url || !supabase_key) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before running debug-balance.mjs.');
}

const client = createClient(supabase_url, supabase_key, {
  auth: { persistSession: false },
});

// Read household data from seed or migrations
const query = `
select 
  (select id from profiles where lower(display_name) = 'kd' limit 1) as kd_profile_id,
  (select id from profiles where lower(display_name) = 'aerian' limit 1) as aerian_profile_id,
  (select id from household_members where profile_id = (select id from profiles where lower(display_name) = 'kd' limit 1) limit 1) as kd_member_id,
  (select id from household_members where profile_id = (select id from profiles where lower(display_name) = 'aerian' limit 1) limit 1) as aerian_member_id,
  (select household_id from household_members where profile_id = (select id from profiles where lower(display_name) = 'kd' limit 1) limit 1) as household_id;
`;

const { data, error } = await client.rpc('public.member_balance_detail_v3');
console.log('Error:', error);
console.log('Balance detail:', JSON.stringify(data, null, 2));
