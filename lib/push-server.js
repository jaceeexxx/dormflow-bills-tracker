let cached;
async function webpush(){if(!cached){const mod=await import('web-push');cached=mod.default||mod;const subject=process.env.VAPID_SUBJECT||'mailto:dormflow@example.invalid';cached.setVapidDetails(subject,process.env.VAPID_PUBLIC_KEY||'',process.env.VAPID_PRIVATE_KEY||'');}return cached;}
export async function sendPush(subscription,payload){const wp=await webpush();return wp.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth_secret}},JSON.stringify(payload),{TTL:3600});}
