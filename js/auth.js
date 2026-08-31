import {config} from './config.js';
import {createSupabaseClient} from './supabase-client.js';
import {clearLocalSecurity} from './app-lock.js';
export const supabase=createSupabaseClient({url:config.supabaseUrl,key:config.supabasePublishableKey});
export async function bootstrapIdentity(){let session=supabase.getSession();if(!session)return {session:null,identity:null};if(session.expires_at&&session.expires_at<Math.floor(Date.now()/1000)+60)session=await supabase.refreshSession();const identity=await supabase.getIdentity();return {session,identity:Array.isArray(identity)?identity[0]:identity};}
export async function login(email,password){const session=await supabase.signIn(email,password);const identity=await supabase.getIdentity();return {session,identity:Array.isArray(identity)?identity[0]:identity};}
export async function logout(identity){clearLocalSecurity(identity?.userId||identity?.user_id);await supabase.signOut();}
