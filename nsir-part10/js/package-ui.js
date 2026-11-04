import {all} from './db.js';
import {identity} from './auth.js';
import {buildDaily,importPackage,buildBase,buildApproved} from './package.js';
import {shareOrSave} from './backup.js';
let C,pending=null;
const FA=s=>String(s).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
export function initPkg(ctx){C=ctx;const{act}=C;
  act.buildPkg=async()=>{const s=C.auth.currentSession();pending=await buildDaily(await identity(),s,{withAtt:document.getElementById('wa').checked});
    document.getElementById('pk2').innerHTML=`<p>${FA(pending.count)} رکورد، حجم حدود ${FA((pending.size/1048576).toFixed(2))} مگابایت</p><button data-act="sendPkg">ارسال یا ذخیره‌ی فایل</button>`;};
  act.sendPkg=async()=>{const r=await shareOrSave(pending.blob,`nsir-daily-${new Date().toISOString().slice(0,10)}.nsir`);
    if(r==='cancelled')return;await pending.commit();pending=null;document.getElementById('pk2').innerHTML='<p class="ok">ارسال شد و رکوردها «ارسال‌شده» شدند.</p>';};
  act.buildAdm=async d=>{const s=C.auth.currentSession(),id=await identity();
    pending=d.k==='ap'?await buildApproved(id,s):await buildBase(id,s,d.k==='sk'?'storekeeper':'employer');pending.name=d.k;
    document.getElementById('pk4').innerHTML=`<p>${FA(pending.count)} مورد، حجم حدود ${FA((pending.size/1048576).toFixed(2))} مگابایت</p><button data-act="sendAdm">ارسال یا ذخیره‌ی فایل</button>`;};
  act.sendAdm=async()=>{const r=await shareOrSave(pending.blob,`nsir-${{sk:'base-storekeeper',em:'base-employer',ap:'approved'}[pending.name]}-${new Date().toISOString().slice(0,10)}.nsir`);if(r==='cancelled')return;await pending.commit();pending=null;document.getElementById('pk4').innerHTML='<p class="ok">انجام شد.</p>';};
  act.impPkg=async()=>{const f=document.getElementById('pf').files[0];if(!f)return C.msg('فایل را انتخاب کنید');
    const r=await importPackage(await identity(),C.auth.currentSession(),await f.text());
    document.getElementById('pk3').innerHTML=`<p class="ok">ورود موفق از ${C.esc(r.from)}: جدید ${FA(r.added)}، به‌روزشده ${FA(r.replaced)}، تکراری ${FA(r.duplicate)}، تعارض ${FA(r.conflict)}</p>`;};
}
export async function renderPkg(s){
  if(!document.getElementById('app')||s.role==='admin'&&false)return;let h='';
  if(s.role==='storekeeper'){const n=(await all('records')).filter(r=>r.owner===s.id&&r.status==='ready').length;
    h+=`<div class="card"><h3>ارسال بسته‌ی امروز</h3><p>رکورد آماده‌ی ارسال: ${FA(n)}</p><label><input type="checkbox" id="wa" checked style="width:auto;min-height:0"> همراه عکس و ویس</label><button data-act="buildPkg">ساخت بسته</button><div id="pk2"></div></div>`;}
  h+=`<div class="card"><h3>ورود فایل بسته (.nsir)</h3><input id="pf" type="file"><button data-act="impPkg">ورود فایل</button><div id="pk3"></div></div>`;
  if(s.role==='admin')h+=`<div class="card"><h3>ارسال برای دیگران (مدیر)</h3><button class="sec" data-act="buildAdm" data-k="sk">اطلاعات پایه برای انبارداران</button><button class="sec" data-act="buildAdm" data-k="em">اطلاعات پایه برای کارفرما</button><button class="sec" data-act="buildAdm" data-k="ap">«تأییدشده توسط حسابداری» برای کارفرما</button><div id="pk4"></div></div>`;
  C.root.insertAdjacentHTML('beforeend',h);
}
