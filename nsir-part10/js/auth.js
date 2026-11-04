import {get,put,all,uuid} from './db.js';
import {hashPassword,verifyPassword,makeAdminKeys,randomKey,signText,verifyText,jsonB64,unJsonB64,fingerprint} from './crypto.js';
const MAX_FAIL=5,LOCK_MS=5*60e3,IDLE_MS=5*60e3,CODE_TTL=3*864e5;
let session=null,idleT=null;
export const currentSession=()=>session;
const meta=async k=>(await get('meta',k))?.value;
const setMeta=(k,v)=>put('meta',{key:k,value:v});
export async function deviceId(){let d=await meta('deviceId');if(!d){d=uuid();await setMeta('deviceId',d);}return d;}
// ۱) راه‌اندازی اولیه فقط روی دستگاه مدیر
export async function setupAdmin(username,password){
  if(await meta('adminKeys'))throw new Error('قبلاً راه‌اندازی شده است');
  const keys=await makeAdminKeys();await setMeta('adminKeys',keys);await setMeta('pinnedAdminPub',keys.publicJwk);
  const uid=uuid(),cp={k:'act',uid,u:username,role:'admin',pk:keys.publicJwk,pub:keys.publicJwk,exp:Date.now()+3650*864e5},cb=jsonB64(cp);
  await setMeta('cert',cb+'.'+await signText(keys.privateKey,cb));await setMeta('netKey',randomKey());
  const user={id:uid,username,role:'admin',active:true,deviceId:await deviceId(),...await hashPassword(password),fails:0,lockUntil:0};
  await put('users',user);return user.id;
}
// ۲) کاربر: ساخت «کد درخواست ورود»
async function ensureNet(){let n=await meta('netKey');if(!n){n=randomKey();await setMeta('netKey',n);}return n;}
// هر دستگاه یک جفت‌کلید امضا دارد؛ کلید عمومی‌اش داخل کد درخواست می‌رود و مدیر آن را گواهی می‌کند.
export async function makeRequestCode(username){let dk=await meta('deviceKeys');if(!dk){dk=await makeAdminKeys();await setMeta('deviceKeys',dk);}
  return jsonB64({d:await deviceId(),u:username,n:uuid().slice(0,8),t:Date.now(),pk:dk.publicJwk});}
export async function identity(){const admin=await meta('adminKeys'),dk=admin||await meta('deviceKeys');return{revoked:(await meta('revoked'))||[],cert:await meta('cert'),privateKey:dk&&dk.privateKey,netKey:await meta('netKey'),pinned:await meta('pinnedAdminPub')};}
// ۳) مدیر: تأیید ورود و ساخت «کد فعال‌سازی» امضاشده برای همان کاربر و همان دستگاه
export async function approveRequest(requestCode,role){
  if(session?.role!=='admin')throw new Error('فقط مدیر');
  if(!['employer','storekeeper'].includes(role))throw new Error('نقش نامعتبر');
  const r=unJsonB64(requestCode),keys=await meta('adminKeys');
  if(!r.pk)throw new Error('کد درخواست قدیمی است؛ کاربر باید کد جدید بسازد');
  const payload={k:'act',d:r.d,u:r.u,role,uid:uuid(),jti:uuid(),exp:Date.now()+CODE_TTL,pub:keys.publicJwk,pk:r.pk,net:await ensureNet()};
  const body=jsonB64(payload);
  await put('devices',{id:r.d,username:r.u,role,uid:payload.uid,jti:payload.jti,active:true,approvedAt:Date.now()});
  return body+'.'+await signText(keys.privateKey,body);
}
// ۴) کاربر: وارد کردن کد فعال‌سازی و گذاشتن رمز (هر کد فقط یک‌بار)
export async function redeemActivation(code,password){
  const [body,sig]=code.trim().split('.');const p=unJsonB64(body);if(p.k==='rec')throw new Error('این کد بازیابی است نه فعال‌سازی');
  const pinned=await meta('pinnedAdminPub');
  if(pinned&&(pinned.x!==p.pub.x||pinned.y!==p.pub.y))throw new Error('کد از طرف مدیر دیگری است');
  if(!await verifyText(p.pub,body,sig))throw new Error('امضای کد معتبر نیست');
  if(p.d!==await deviceId())throw new Error('این کد برای این دستگاه نیست');
  if(Date.now()>p.exp)throw new Error('کد منقضی شده است');
  const used=(await meta('usedJti'))||[];if(used.includes(p.jti))throw new Error('این کد قبلاً استفاده شده است');
  if(!p.net||!p.pk)throw new Error('کد قدیمی است؛ مدیر باید کد جدید بسازد');
  if(!pinned)await setMeta('pinnedAdminPub',p.pub);await setMeta('cert',code.trim());await setMeta('netKey',p.net);
  await put('users',{id:p.uid,username:p.u,role:p.role,active:true,deviceId:p.d,...await hashPassword(password),fails:0,lockUntil:0});
  await setMeta('usedJti',[...used,p.jti]);
  return fingerprint(p.pub); // اثر انگشت را کاربر با مدیر مقایسه کند
}
// ۵) ورود با قفل موقت و قفل خودکار
export async function login(username,password){
  const u=(await all('users')).find(x=>x.username===username);
  if(!u||!u.active)throw new Error('کاربر یا رمز نادرست است');
  if(((await meta('revoked'))||[]).includes(u.id))throw new Error('این کاربر توسط مدیر غیرفعال شده است');
  if(Date.now()<u.lockUntil)throw new Error('به‌دلیل رمز اشتباه، موقتاً قفل است');
  if(!await verifyPassword(password,u)){u.fails++;if(u.fails>=MAX_FAIL){u.lockUntil=Date.now()+LOCK_MS;u.fails=0;}await put('users',u);throw new Error('کاربر یا رمز نادرست است');}
  u.fails=0;await put('users',u);session={id:u.id,role:u.role,username:u.username};touch();return session;
}
export function logout(){session=null;clearTimeout(idleT);}
export function touch(){clearTimeout(idleT);if(session)idleT=setTimeout(logout,IDLE_MS);}

// بازیابی رمز: کاربر با makeRequestCode درخواست می‌دهد؛ مدیر کد یک‌بارمصرف می‌سازد.
export async function approveRecovery(requestCode){
  if(session?.role!=='admin')throw new Error('فقط مدیر');
  const r=unJsonB64(requestCode),dev=await get('devices',r.d);
  if(!dev||dev.username!==r.u||!dev.active)throw new Error('این دستگاه یا کاربر تأییدشده نیست');
  const keys=await meta('adminKeys'),p={k:'rec',d:r.d,u:r.u,jti:uuid(),exp:Date.now()+864e5,pub:keys.publicJwk},body=jsonB64(p);
  return body+'.'+await signText(keys.privateKey,body);
}
export async function redeemRecovery(code,newPassword){
  const [body,sig]=code.trim().split('.'),p=unJsonB64(body),pinned=await meta('pinnedAdminPub');
  if(p.k!=='rec')throw new Error('این کد بازیابی نیست');
  if(!pinned||pinned.x!==p.pub.x||pinned.y!==p.pub.y||!await verifyText(p.pub,body,sig))throw new Error('کد معتبر نیست');
  if(p.d!==await deviceId())throw new Error('این کد برای این دستگاه نیست');
  if(Date.now()>p.exp)throw new Error('کد منقضی شده است');
  const used=(await meta('usedJti'))||[];if(used.includes(p.jti))throw new Error('این کد قبلاً استفاده شده است');
  const u=(await all('users')).find(x=>x.username===p.u);if(!u)throw new Error('کاربر پیدا نشد');
  Object.assign(u,await hashPassword(newPassword),{fails:0,lockUntil:0});await put('users',u);await setMeta('usedJti',[...used,p.jti]);
}
export async function setDeviceActive(id,active){if(session?.role!=='admin')throw new Error('فقط مدیر');const d=await get('devices',id);d.active=active;await put('devices',d);}
