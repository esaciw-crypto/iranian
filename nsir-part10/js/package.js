import {openDb,get,all,uuid} from './db.js';
import {stripForRole} from './roles.js';
import {stockMap} from './invoice.js';
import {b64u,unb64u,jsonB64,unJsonB64,signText,verifyText,sha256,encBytes,decBytes} from './crypto.js';
// نوع بسته ← چه نقشی بفرستد و چه نقشی بگیرد (بر اساس گواهی امضاشده‌ی مدیر، نه ادعای فرستنده)
export const RULES={daily:{from:['storekeeper'],to:['employer']},combined:{from:['employer'],to:['admin']},approved:{from:['admin'],to:['employer']},basedata:{from:['admin'],to:['employer','storekeeper']}};
const enc=new TextEncoder(),dec=new TextDecoder();
const pipe=async(bytes,T)=>new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(T)).arrayBuffer());
export const gz=b=>pipe(b,new CompressionStream('gzip')),gunz=b=>pipe(b,new DecompressionStream('gzip'));
const signedStr=h=>[h.pkgId,h.type,h.at,h.hash,h.count,h.to.join(',')].join('|');
// --- توابع خالص (بدون پایگاه داده؛ قابل تست) ---
export async function sealPackage({ident,from,type,records,attachments=[],extra={},to}){
  const rule=RULES[type];if(!rule||!rule.from.includes(from.role))throw new Error('این نقش اجازه‌ی ساخت این نوع بسته را ندارد');
  const payload=JSON.stringify({records,attachments,...extra});
  const {iv,ct}=await encBytes(ident.netKey,await gz(enc.encode(payload)));
  const h={pkgId:uuid(),type,at:new Date().toISOString(),count:records.length,to:to||rule.to,from:{uid:from.id,username:from.username,role:from.role},cert:ident.cert,iv,hash:await sha256(ct)};
  return JSON.stringify({app:'nsir',kind:'pkg',v:1,h,sig:await signText(ident.privateKey,signedStr(h)),ct:b64u(ct)});
}
export async function openPackage(text,{ident,role}){
  let f;try{f=JSON.parse(text);}catch{throw new Error('فایل معتبر نیست');}
  if(f.app!=='nsir'||f.kind!=='pkg')throw new Error('این فایل بسته‌ی این برنامه نیست');
  if(f.v!==1)throw new Error('نسخه‌ی قالب فایل پشتیبانی نمی‌شود');
  const h=f.h,ct=unb64u(f.ct);
  if(await sha256(ct)!==h.hash)throw new Error('فایل دست‌کاری یا ناقص است');
  const [cb,cs]=String(h.cert).split('.'),c=unJsonB64(cb);
  if(!ident.pinned||c.pub.x!==ident.pinned.x||c.pub.y!==ident.pinned.y||!await verifyText(c.pub,cb,cs))throw new Error('گواهی فرستنده معتبر نیست');
  if(Date.now()>c.exp)throw new Error('گواهی فرستنده منقضی شده است');
  if(c.uid!==h.from.uid||c.role!==h.from.role)throw new Error('مشخصات فرستنده با گواهی نمی‌خواند');
  if(!await verifyText(c.pk,signedStr(h),f.sig))throw new Error('امضای فایل معتبر نیست');
  const rule=RULES[h.type];if(!rule||!rule.from.includes(c.role))throw new Error('این فرستنده مجاز به ساخت این نوع بسته نیست');
  if(!h.to.every(x=>rule.to.includes(x))||!h.to.includes(role))throw new Error('این بسته برای نقش شما نیست');
  if((ident.revoked||[]).includes(c.uid))throw new Error('این فرستنده توسط مدیر غیرفعال شده است');
  const data=JSON.parse(dec.decode(await gunz(await decBytes(ident.netKey,h.iv,ct))));
  return{h,...data};
}
// --- بخش پایگاه داده ---
const rq=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
const toB64=async a=>({...a,blob:{b:b64u(await a.blob.arrayBuffer()),t:a.blob.type}});
// بسته‌ی روزانه‌ی انباردار: رکوردهای «آماده‌ی ارسال». commit بعد از ارسال موفق، وضعیت را «ارسال‌شده» می‌کند.
export async function buildDaily(ident,s,{withAtt=true}={}){
  const recs=(await all('records')).filter(r=>r.owner===s.id&&r.status==='ready');if(!recs.length)throw new Error('رکورد آماده‌ی ارسالی نیست');
  const out=recs.map(r=>({...r,status:'sent',v:r.v+1,sentAt:new Date().toISOString()}));
  const atts=withAtt?await Promise.all((await all('attachments')).filter(a=>recs.some(r=>r.id===a.recordId)).map(toB64)):[];
  const text=await sealPackage({ident,from:s,type:'daily',records:out,attachments:atts});
  return{blob:new Blob([text],{type:'application/octet-stream'}),count:out.length,size:text.length,
    commit:async()=>{const db=await openDb(),t=db.transaction('records','readwrite');out.forEach(r=>t.objectStore('records').put(r));await new Promise((a,b)=>{t.oncomplete=a;t.onerror=()=>b(t.error);});}};
}
const ADV=['draft','ready','sent','emp_ok','acc_sent'];
// مالکیت رکوردها را بر اساس نوع بسته و گواهی بررسی می‌کند.
export function checkOwners(h,records){
  for(const r of records){
    if(h.type==='daily'){if(r.owner!==h.from.uid||r.ownerRole!==h.from.role)throw new Error('رکوردی با مالک نامعتبر در بسته هست؛ ورود لغو شد');}
    else if(h.type==='combined'){if(!['storekeeper','employer'].includes(r.ownerRole)||(r.ownerRole==='employer'&&r.owner!==h.from.uid))throw new Error('رکوردی با مالک نامعتبر در بسته هست؛ ورود لغو شد');}
    else if(h.type==='approved'){if(!['storekeeper','employer','admin'].includes(r.ownerRole))throw new Error('رکوردی با مالک نامعتبر در بسته هست؛ ورود لغو شد');}
    else if(h.type==='basedata'){throw new Error('بسته‌ی اطلاعات پایه نباید رکورد داشته باشد');}
    else throw new Error('ورود این نوع بسته هنوز پشتیبانی نمی‌شود');
  }
}
// بسته‌ی ترکیبی کارفرما به حسابدار: همه‌ی رکوردهای «تأییدشده توسط کارفرما» (خودش و انبارداران).
export async function buildCombined(ident,s,{withAtt=true}={}){
  const recs=(await all('records')).filter(r=>r.status==='emp_ok'&&r.type!=='proforma');if(!recs.length)throw new Error('رکورد تأییدشده‌ای برای ارسال نیست');
  const pkg=recs.map(r=>({...r,v:r.v+1})),local=pkg.map(r=>({...r,status:'acc_sent'}));
  const atts=withAtt?await Promise.all((await all('attachments')).filter(a=>recs.some(r=>r.id===a.recordId)).map(toB64)):[];
  const text=await sealPackage({ident,from:s,type:'combined',records:pkg,attachments:atts});
  return{blob:new Blob([text],{type:'application/octet-stream'}),count:pkg.length,size:text.length,
    commit:async()=>{const db=await openDb(),t=db.transaction('records','readwrite');local.forEach(r=>t.objectStore('records').put(r));await new Promise((a,b)=>{t.oncomplete=a;t.onerror=()=>b(t.error);});}};
}
export async function importPackage(ident,s,text){
  const p=await openPackage(text,{ident,role:s.role}),prev=await get('imports',p.h.pkgId);
  if(prev)throw new Error('این فایل قبلاً وارد شده است ('+new Date(prev.at).toLocaleString('fa-IR')+')');
  checkOwners(p.h,p.records);
  if(p.h.type==='basedata')return importBase(s,p);
  const add=[],rep=[];let dup=0,conflict=0;
  for(const r of p.records){
    const ex=await get('records',r.id);
    if(!ex)add.push(r);else if(ex.v===r.v)dup++;else if(r.v>ex.v&&ADV.includes(ex.status))rep.push(r);else conflict++;
  }
  const db=await openDb(),t=db.transaction(['records','attachments','imports','logs'],'readwrite'),ids=new Set([...add,...rep].map(r=>r.id));
  [...add,...rep].forEach(r=>t.objectStore('records').put(r));
  for(const a of p.attachments||[]){if(!ids.has(a.recordId))continue;if(await rq(t.objectStore('attachments').get(a.id)))continue;t.objectStore('attachments').put({...a,blob:new Blob([unb64u(a.blob.b)],{type:a.blob.t})});}
  const report={added:add.length,replaced:rep.length,duplicate:dup,conflict};
  t.objectStore('imports').put({packageId:p.h.pkgId,at:new Date().toISOString(),type:p.h.type,from:p.h.from.username,report});
  t.objectStore('logs').put({ts:Date.now(),by:s.id,kind:'import',pkg:p.h.pkgId,report});
  await new Promise((a,b)=>{t.oncomplete=a;t.onerror=()=>b(t.error);t.onabort=()=>b(t.error);});
  return{from:p.h.from.username,type:p.h.type,...report};
}

// بسته‌ی اطلاعات پایه: برای هر نقش جداگانه ساخته می‌شود (انباردار قیمت خرید و مانده‌ی اول دوره را نمی‌گیرد).
export async function buildBase(ident,s,toRole){
  const items=(await all('items')).map(i=>stripForRole(toRole,i)),parties=(await all('parties')).map(p=>{if(toRole==='storekeeper'){const{opening,...q}=p;return q;}return p;});
  const revoked=(await all('devices')).filter(d=>!d.active).map(d=>d.uid);
  const text=await sealPackage({ident,from:s,type:'basedata',records:[],extra:{settings:(await get('meta','settings'))?.value||null,items,parties,revoked,stock:stockMap(await all('records'),await all('items'))},to:[toRole]});
  return{blob:new Blob([text],{type:'application/octet-stream'}),count:items.length+parties.length,size:text.length,commit:async()=>{}};
}
// بسته‌ی «تأییدشده توسط حسابداری» برای کارفرما.
export async function buildApproved(ident,s){
  const recs=(await all('records')).filter(r=>r.status==='final'&&!r.ackSent);if(!recs.length)throw new Error('رکورد جدیدی برای ارسال نیست');
  const text=await sealPackage({ident,from:s,type:'approved',records:recs});
  return{blob:new Blob([text],{type:'application/octet-stream'}),count:recs.length,size:text.length,
    commit:async()=>{const db=await openDb(),t=db.transaction('records','readwrite');recs.forEach(r=>t.objectStore('records').put({...r,ackSent:true}));await new Promise((a,b)=>{t.oncomplete=a;t.onerror=()=>b(t.error);});}};
}
async function importBase(s,p){
  const db=await openDb(),t=db.transaction(['items','parties','meta','users','imports','logs'],'readwrite');let up=0;
  for(const [st,list] of [['items',p.items||[]],['parties',p.parties||[]]])for(const x of list){const ex=await rq(t.objectStore(st).get(x.id));if(!ex||(x.updated||'')>(ex.updated||'')){t.objectStore(st).put(x);up++;}}
  const rev=p.revoked||[];t.objectStore('meta').put({key:'revoked',value:rev});if(p.settings)t.objectStore('meta').put({key:'settings',value:p.settings});if(p.stock)t.objectStore('meta').put({key:'officialStock',value:{map:p.stock,at:Date.now()}});
  for(const id of rev){const u=await rq(t.objectStore('users').get(id));if(u){u.active=false;t.objectStore('users').put(u);}}
  t.objectStore('imports').put({packageId:p.h.pkgId,at:new Date().toISOString(),type:'basedata',from:p.h.from.username,report:{updated:up}});
  t.objectStore('logs').put({ts:Date.now(),by:s.id,kind:'import',pkg:p.h.pkgId,report:{updated:up}});
  await new Promise((a,b)=>{t.oncomplete=a;t.onerror=()=>b(t.error);t.onabort=()=>b(t.error);});
  return{from:p.h.from.username,type:'basedata',added:up,replaced:0,duplicate:0,conflict:0};
}
