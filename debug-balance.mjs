import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase_url = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const supabase_key = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkaWJiZmpmcmhyanBhYnp2a2d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTA2NzMyMDAsImV4cCI6MTk4NjI3MzIwMH0.7fDWHVfVAH3mVXWr_8w_VUfqEeVFf7xXrWz_50M_z9E';

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
