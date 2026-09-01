import {supabase} from './auth.js';

export async function householdMemberDirectory({includeInactive=false}={}){
  const rows=await supabase.rpc('household_member_directory_v3',{p_include_inactive:includeInactive});
  return (Array.isArray(rows)?rows:[]).map(row=>({
    id:row.member_id||row.id,
    memberId:row.member_id||row.id,
    name:row.display_name||'Member',
    displayName:row.display_name||'Member',
    role:row.role||'member',
    avatarPath:row.avatar_path||'',
    avatar_path:row.avatar_path||'',
    isActive:row.is_active!==false,
    is_active:row.is_active!==false
  }));
}
