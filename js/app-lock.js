const enc=new TextEncoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export async function hashPinVerifier(pin,salt){
  const data=enc.encode(`${salt}:${pin}`);
  let hash=await crypto.subtle.digest('SHA-256',data);
  for(let i=0;i<1200;i++) hash=await crypto.subtle.digest('SHA-256',new Uint8Array(hash));
  return hex(new Uint8Array(hash));
}
export async function setLocalPin(userId,pin,storage=localStorage){const salt=crypto.randomUUID();const verifier=await hashPinVerifier(pin,salt);storage.setItem(`dormflow:v3:lock:${userId}`,JSON.stringify({mode:'pin',salt,verifier}));}
export async function verifyLocalPin(userId,pin,storage=localStorage){const raw=storage.getItem(`dormflow:v3:lock:${userId}`);if(!raw)return true;const item=JSON.parse(raw);return item.mode==='pin'&&await hashPinVerifier(pin,item.salt)===item.verifier;}
export function clearLocalSecurity(userId,storage=localStorage){if(userId)storage.removeItem(`dormflow:v3:lock:${userId}`);storage.removeItem('dormflow:v3:offline-summary');}
export function getLockConfig(userId,storage=localStorage){const raw=storage.getItem(`dormflow:v3:lock:${userId}`);return raw?JSON.parse(raw):{mode:'off'};}
