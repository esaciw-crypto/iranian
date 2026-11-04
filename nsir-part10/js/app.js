import {openDb,requestPersist,all,put,uuid} from './db.js';
import * as auth from './auth.js';
import {can,ROLES,stripForRole} from './roles.js';
import {parseRial,parseQty,formatRial,normDigits} from './money.js';
import {fingerprint} from './crypto.js';
import {parseCsv,toCsv} from './csv.js';
import {TEMPLATES,validate} from './importer.js';
import {initSales,showSales} from './sales-ui.js';
import {initPkg,renderPkg} from './package-ui.js';
import {initInbox,showInbox} from './inbox-ui.js';
import {initReports,showStock,showDue,renderSettings} from './reports-ui.js';
import {partyBalance} from './invoice.js';
import {makeBackup,restoreBackup,shareOrSave} from './backup.js';
const root=document.getElementById('app'),nav=document.getElementById('nav');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const v=id=>document.getElementById(id).value.trim();
const msg=(t,ok)=>{const e=document.getElementById('msg');if(e){e.className=ok?'ok':'bad';e.textContent=t;}};
let installEv=null;addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEv=e;});
const page=(h)=>{nav.hidden=true;root.innerHTML=h;if(/data-act="(setup|login)"/.test(h)&&!matchMedia('(display-mode: standalone)').matches)root.insertAdjacentHTML('beforeend','<div class="card"><button class="sec" data-act="install">نصب برنامه روی گوشی</button><p id="imsg"></p></div>');};
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
const act={}; // اکشن‌ها با data-act
document.addEventListener('click',e=>{auth.touch();const b=e.target.closest('[data-act]');if(b&&act[b.dataset.act])act[b.dataset.act](b.dataset).catch(x=>msg(x.message));});

document.addEventListener('input',e=>{const t=e.target;if(t.dataset&&t.dataset.rows!==undefined){const k=t.value.trim().toLowerCase();t.closest('.card').querySelectorAll('.row').forEach(r=>{r.style.display=!k||r.textContent.toLowerCase().includes(k)?'':'none';});}});
async function start(){
  await openDb();const p=await requestPersist();const users=await all('users');
  const warn=p.persisted?'':'<p class="bad">هشدار: حافظه‌ی پایدار فعال نشد. برنامه را به صفحه‌ی اصلی اضافه کنید و پشتیبان بگیرید.</p>';
  if(!users.length)return page(`<div class="card"><h2>نور و صدای ایرانیان</h2>${warn}<button data-act="setup">من مدیر هستم (راه‌اندازی اولیه)</button><button class="sec" data-act="activate">فعال‌سازی کاربر روی این گوشی</button></div>`);
  page(`<div class="card"><h2>ورود</h2>${warn}<label>نام کاربری</label><input id="u"><label>رمز عبور</label><input id="p" type="password"><button data-act="login">ورود</button><button class="sec" data-act="recover">فراموشی رمز</button><p id="msg"></p></div>`);
}
act.setup=async()=>page(`<div class="card"><h2>راه‌اندازی مدیر</h2><label>نام کاربری مدیر</label><input id="u"><label>رمز (حداقل ۸ نویسه)</label><input id="p" type="password"><button data-act="doSetup">ساخت حساب مدیر</button><p id="msg"></p></div>`);
act.doSetup=async()=>{if(v('p').length<8)return msg('رمز کوتاه است');await auth.setupAdmin(v('u'),v('p'));await auth.login(v('u'),v('p'));home('parties');};
act.login=async()=>{await auth.login(v('u'),v('p'));home('parties');};
act.activate=async()=>page(`<div class="card"><h2>فعال‌سازی</h2><label>نام کاربری (همان‌که مدیر ساخته)</label><input id="u"><button data-act="mkreq">ساخت کد درخواست</button><div id="req"></div><hr>
<label>کد فعال‌سازی که مدیر فرستاد</label><textarea id="c" class="code" rows="4"></textarea><label>رمز شخصی (حداقل ۸ نویسه)</label><input id="p" type="password"><button data-act="redeem">فعال‌سازی</button><p id="msg"></p><button class="sec" data-act="back">بازگشت</button></div>`);
act.mkreq=async()=>{if(!v('u'))return msg('نام کاربری را بنویسید');document.getElementById('req').innerHTML=`<p>این کد را برای مدیر بفرستید:</p><textarea class="code" rows="3" readonly>${esc(await auth.makeRequestCode(v('u')))}</textarea>`;};
act.redeem=async()=>{if(v('p').length<8)return msg('رمز کوتاه است');const fp=await auth.redeemActivation(v('c'),v('p'));page(`<div class="card"><h2 class="ok">فعال شد</h2><p>اثر انگشت مدیر: <code>${esc(fp)}</code><br>این را با مدیر مقایسه کنید.</p><button data-act="back">رفتن به ورود</button></div>`);};
act.back=start;

const TABS={parties:'طرف‌حساب‌ها',items:'کالاها',sales:'اسناد',stock:'موجودی',due:'موعد تسویه',inbox:'کارتابل',users:'کاربران',tools:'ابزارها'};
function home(tab){
  const s=auth.currentSession();if(!s)return start();
  const tabs=['parties','items',...(can(s.role,'sales')?['sales']:[]),...(can(s.role,'warehouse')?['stock']:[]),...(can(s.role,'settlement_due')?['due']:[]),...(s.role==='admin'||can(s.role,'employer_inbox')?['inbox']:[]),...(s.role==='admin'?['users']:[]),'tools'];
  nav.hidden=false;nav.innerHTML=tabs.map(t=>`<button data-act="tab" data-t="${t}" class="${t===tab?'on':''}">${TABS[t]}</button>`).join('')+`<button data-act="logout">خروج</button>`;
  Promise.resolve((({parties:showParties,items:showItems,users:showUsers,tools:showTools,sales:showSales,inbox:showInbox,stock:showStock,due:showDue})[tab])(s)).then(banner).then(()=>tab==='tools'&&(renderPkg(s),renderSettings(s)));
}
act.tab=async d=>home(d.t);act.logout=async()=>{auth.logout();start();};
setInterval(()=>{if(!auth.currentSession()&&!nav.hidden)start();},10000); // قفل خودکار

async function showParties(s){
  const list=await all('parties'),recs=await all('records');const mng=can(s.role,'parties.manage');
  root.innerHTML=`<div class="card"><h3>طرف‌حساب‌ها</h3><input data-rows placeholder="جستجو (نام یا تلفن)…">${list.map(p=>`<div class="row"><b>${esc(p.name)}</b> — ${{customer:'مشتری',supplier:'تأمین‌کننده',both:'هر دو'}[p.type]}<br>${esc(p.phone)}${mng?` | مانده: ${formatRial(partyBalance(p,recs))} ریال`:''}</div>`).join('')||'<p>موردی ثبت نشده.</p>'}</div>`+(mng?`<div class="card"><h3>افزودن</h3><label>نام یا شرکت</label><input id="n"><label>نوع</label><select id="t"><option value="customer">مشتری</option><option value="supplier">تأمین‌کننده</option><option value="both">هر دو</option></select><label>تلفن</label><input id="ph" inputmode="tel"><label>مانده‌ی اول دوره (ریال)</label><input id="o" inputmode="numeric" value="0"><button data-act="addParty">ثبت</button><p id="msg"></p></div>`:'');
}
act.addParty=async()=>{const s=auth.currentSession();if(!can(s.role,'parties.manage'))return;const o=parseRial(v('o'));if(!v('n'))return msg('نام لازم است');if(o===null)return msg('مبلغ باید عدد صحیح باشد');
  const now=new Date().toISOString();await put('parties',{id:uuid(),code:'',name:v('n'),type:v('t'),phone:normDigits(v('ph')),opening:o,owner:s.id,ownerRole:s.role,created:now,updated:now,v:1});home('parties');};
async function showItems(s){
  const list=await all('items');const mng=can(s.role,'items.manage');
  root.innerHTML=`<div class="card"><h3>کالاها</h3><input data-rows placeholder="جستجو (نام یا برند)…">${list.map(raw=>{const i=stripForRole(s.role,raw);return`<div class="row"><b>${esc(i.name)}</b> (${esc(i.brand)}) — ${esc(i.unit)}<br>فروش: ${formatRial(i.sell)} ریال${i.buyPrice!==undefined?` | خرید: ${formatRial(i.buyPrice)}`:''}</div>`}).join('')||'<p>موردی ثبت نشده.</p>'}</div>`+(mng?`<div class="card"><h3>افزودن</h3><label>نام کالا</label><input id="n"><label>برند</label><input id="b"><label>واحد (عدد، متر، ...)</label><input id="un" value="عدد"><label>قیمت فروش (ریال)</label><input id="sp" inputmode="numeric"><label>قیمت خرید (ریال)</label><input id="bp" inputmode="numeric"><label>موجودی اول دوره</label><input id="oq" inputmode="decimal" value="0"><label>حداقل موجودی (هشدار)</label><input id="mq" inputmode="decimal" value="0"><button data-act="addItem">ثبت</button><p id="msg"></p></div>`:'');
}
act.addItem=async()=>{const s=auth.currentSession();if(!can(s.role,'items.manage'))return;const sp=parseRial(v('sp')),bp=parseRial(v('bp'));if(!v('n'))return msg('نام لازم است');if(sp===null||bp===null)return msg('قیمت‌ها باید عدد صحیح باشند');
  const now=new Date().toISOString();await put('items',{id:uuid(),name:v('n'),brand:v('b'),unit:v('un'),sell:sp,buyPrice:bp,openingQty:parseQty(v('oq')||'0')??0,minQty:parseQty(v('mq')||'0')??0,active:true,owner:s.id,ownerRole:s.role,created:now,updated:now,v:1});home('items');};
async function showUsers(s){
  if(s.role!=='admin')return;const devs=await all('devices');
  root.innerHTML=`<div class="card"><h3>تأیید ورود کاربر</h3><label>کد درخواست کاربر</label><textarea id="rq" class="code" rows="3"></textarea><label>نقش</label><select id="r"><option value="storekeeper">${ROLES.storekeeper}</option><option value="employer">${ROLES.employer}</option></select><button data-act="approve">ساخت کد فعال‌سازی</button><div id="out"></div><p id="msg"></p></div><div class="card"><h3>دستگاه‌های تأییدشده</h3>${devs.map(d=>`<div class="row">${esc(d.username)} — ${ROLES[d.role]} — ${d.active?'فعال':'غیرفعال'}<button class="sec" data-act="toggleDev" data-id="${esc(d.id)}" data-on="${d.active?0:1}">${d.active?'غیرفعال‌کردن':'فعال‌کردن'}</button></div>`).join('')||'<p>هنوز کسی نیست.</p>'}</div><div class="card"><h3>بازیابی رمز کاربر</h3><label>کد درخواست بازیابی</label><textarea id="rr" class="code" rows="3"></textarea><button data-act="approveRec">ساخت کد بازیابی</button><div id="out2"></div></div>`;
}
act.approve=async()=>{const c=await auth.approveRequest(v('rq'),v('r'));document.getElementById('out').innerHTML=`<p>این کد را برای کاربر بفرستید:</p><textarea class="code" rows="5" readonly>${esc(c)}</textarea>`;};

act.toggleDev=async d=>{await auth.setDeviceActive(d.id,d.on==='1');home('users');};
act.approveRec=async()=>{document.getElementById('out2').innerHTML=`<p>این کد را برای کاربر بفرستید (۲۴ ساعت اعتبار):</p><textarea class="code" rows="5" readonly>${esc(await auth.approveRecovery(v('rr')))}</textarea>`;};
act.recover=async()=>page(`<div class="card"><h2>فراموشی رمز</h2><label>نام کاربری</label><input id="u"><button data-act="mkreq2">ساخت کد درخواست بازیابی</button><div id="req"></div><hr><label>کد بازیابی از مدیر</label><textarea id="c" class="code" rows="4"></textarea><label>رمز جدید (حداقل ۸ نویسه)</label><input id="p" type="password"><button data-act="doRecover">تغییر رمز</button><p id="msg"></p><button class="sec" data-act="back">بازگشت</button></div>`);
act.mkreq2=act.mkreq;
act.doRecover=async()=>{if(v('p').length<8)return msg('رمز کوتاه است');await auth.redeemRecovery(v('c'),v('p'));page('<div class="card"><h2 class="ok">رمز تغییر کرد</h2><button data-act="back">رفتن به ورود</button></div>');};
async function banner(){const lb=(await all('meta')).find(m=>m.key==='lastBackup')?.value||0;if(Date.now()-lb>20*36e5&&auth.currentSession()&&!document.getElementById('bk'))root.insertAdjacentHTML('afterbegin','<div id="bk" class="card bad">یادآوری: امروز پشتیبان نگرفته‌اید. (تب ابزارها)</div>');}
let pending=null;
initSales({root,nav,esc,msg,act,auth,home});
initPkg({root,esc,msg,act,auth});
initInbox({root,esc,msg,act,auth,home});
initReports({root,esc,act,msg});
act.install=async()=>{if(installEv){installEv.prompt();await installEv.userChoice;installEv=null;}else document.getElementById('imsg').textContent='در Chrome: منوی سه‌نقطه ⋮ ← «Install app» یا «افزودن به صفحه‌ی اصلی». اگر این گزینه نیست، برنامه باید از آدرس https باز شده باشد.';};
async function showTools(s){
  root.innerHTML=`<div class="card"><h3>پشتیبان</h3><p>فایل پشتیبان را در «پیام‌های ذخیره‌شده»ی پیام‌رسان یا گوشی دیگر نگه دارید. رمز پشتیبان را فراموش نکنید؛ بدون آن بازیابی ممکن نیست.</p><label>رمز پشتیبان</label><input id="bp" type="password"><button data-act="doBackup">ساخت فایل پشتیبان</button><label>بازیابی از فایل</label><input id="bf" type="file"><button class="sec" data-act="doRestore">بازیابی (جایگزین داده‌ی فعلی می‌شود)</button><p id="msg"></p></div>`
  +(s.role==='admin'?`<div class="card"><h3>ورود از اکسل یا CSV (فقط مدیر)</h3><button class="sec" data-act="tpl" data-k="parties">دانلود قالب طرف‌حساب‌ها</button><button class="sec" data-act="tpl" data-k="items">دانلود قالب کالاها</button><label>نوع</label><select id="ik"><option value="parties">طرف‌حساب‌ها</option><option value="items">کالاها</option></select><input id="xf" type="file" accept=".csv,.xlsx,.xls"><button data-act="preview">پیش‌نمایش و بررسی</button><div id="pv"></div></div>`:'');
}
act.doBackup=async()=>{if(v('bp').length<8)return msg('رمز پشتیبان حداقل ۸ نویسه');const blob=await makeBackup(v('bp'));const r=await shareOrSave(blob,`nsir-backup-${new Date().toISOString().slice(0,10)}.nsir`);msg(r==='cancelled'?'لغو شد':'پشتیبان ساخته شد',r!=='cancelled');};
act.doRestore=async()=>{const f=document.getElementById('bf').files[0];if(!f)return msg('فایل را انتخاب کنید');if(!confirm('داده‌ی فعلی این گوشی با پشتیبان جایگزین می‌شود. ادامه؟'))return;await restoreBackup(v('bp'),await f.text());auth.logout();alert('بازیابی انجام شد.');location.reload();};
act.tpl=async d=>{const t=TEMPLATES[d.k];await shareOrSave(new Blob([toCsv([t.head,t.sample])],{type:'text/csv'}),`قالب-${d.k}.csv`);};
function loadXlsx(){return window.XLSX?Promise.resolve():new Promise((res,rej)=>{const e=document.createElement('script');e.src='libs/xlsx.full.min.js';e.onload=res;e.onerror=()=>rej(new Error('کتابخانه‌ی اکسل بارگذاری نشد'));document.head.appendChild(e);});}
act.preview=async()=>{const f=document.getElementById('xf').files[0];if(!f)return msg('فایل را انتخاب کنید');const kind=v('ik');let rows;
  if(/\.csv$/i.test(f.name))rows=parseCsv(await f.text());
  else{await loadXlsx();const wb=XLSX.read(await f.arrayBuffer());rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:''}).filter(r=>r.some(c=>String(c).trim()!==''));}
  const ex=(await all(kind)).map(x=>x.name),res=validate(kind,rows,ex);pending={kind,ok:res.ok};
  document.getElementById('pv').innerHTML=`<p class="ok">ردیف معتبر: ${res.ok.length}</p>`+(res.errors.length?`<p class="bad">خطا: ${res.errors.length} (تا خطاها رفع نشود ثبت انجام نمی‌شود)</p>`+res.errors.slice(0,30).map(e=>`<div class="row">ردیف ${e.row}: ${esc(e.msg)}</div>`).join(''):`<button data-act="commit">ثبت نهایی ${res.ok.length} ردیف</button>`);};
act.commit=async()=>{const s=auth.currentSession();if(s.role!=='admin'||!pending)return;const now=new Date().toISOString();
  for(const r of pending.ok)await put(pending.kind,{...r,id:uuid(),owner:s.id,ownerRole:s.role,created:now,updated:now,v:1});
  const n=pending.ok.length;pending=null;document.getElementById('pv').innerHTML=`<p class="ok">${n} ردیف ثبت شد.</p>`;};
start();
