import {all,get,put} from './db.js';
import {identity} from './auth.js';
import {saveRecord,calcInvoice,DOC} from './invoice.js';
import {buildCombined} from './package.js';
import {shareOrSave} from './backup.js';
import {formatRial} from './money.js';
import {formatJalali} from './jalali.js';
import {setBackTab} from './sales-ui.js';
let C,pending=null;
const FA=s=>String(s).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const checked=()=>[...document.querySelectorAll('.ck:checked')].map(e=>e.dataset.id);
export function initInbox(ctx){C=ctx;const{act}=C;
  act.openInbox=async d=>{setBackTab('inbox');await act.openSale(d);};
  act.approveSel=async()=>{const s=C.auth.currentSession(),ids=checked();if(!ids.length)return C.msg('رکوردی انتخاب نشده');
    for(const id of ids){const r=await get('records',id);
      if(s.role==='admin'){if(r.status==='final')continue;const k='official:sale',n=((await get('meta',k))?.value||0)+1;await put('meta',{key:k,value:n});r.officialNo=n;r.status='final';}
      else r.status='emp_ok';
      r.approvedBy=s.id;r.approvedAt=new Date().toISOString();await saveRecord(s,r);}
    C.home('inbox');};
  act.moveOwn=async()=>{const s=C.auth.currentSession();for(const r of(await all('records')).filter(x=>x.owner===s.id&&x.status==='ready'&&x.type!=='proforma')){r.status='sent';await saveRecord(s,r);}C.home('inbox');};
  act.buildComb=async()=>{pending=await buildCombined(await identity(),C.auth.currentSession(),{withAtt:document.getElementById('wa2').checked});
    document.getElementById('cb').innerHTML=`<p>${FA(pending.count)} رکورد، حجم حدود ${FA((pending.size/1048576).toFixed(2))} مگابایت</p><button data-act="sendComb">ارسال یا ذخیره‌ی فایل</button>`;};
  act.sendComb=async()=>{const r=await shareOrSave(pending.blob,`nsir-combined-${new Date().toISOString().slice(0,10)}.nsir`);if(r==='cancelled')return;await pending.commit();pending=null;C.home('inbox');};
  act.attView=async()=>{const A=await all('attachments'),R=await all('records');
    document.getElementById('av').innerHTML=A.map(a=>{const r=R.find(x=>x.id===a.recordId),u=URL.createObjectURL(a.blob);
      return`<div class="row">${C.esc(r?.number||'؟')} — ${new Date(a.at).toLocaleString('fa-IR')}<br>${a.kind==='voice'?`<audio controls src="${u}" style="width:100%"></audio>`:a.kind==='pdf'?'PDF':`<img src="${u}" style="max-width:100%">`}</div>`;}).join('')||'<p>ضمیمه‌ای نیست.</p>';};
}
export async function showInbox(s){
  const adm=s.role==='admin',R=await all('records'),P=await all('parties');
  const list=R.filter(r=>DOC[r.type]&&r.type!=='proforma'&&(adm?(r.status==='emp_ok'||(r.owner===s.id&&r.status==='ready')):r.status==='sent')).sort((a,b)=>a.updated.localeCompare(b.updated));
  const own=R.filter(r=>r.owner===s.id&&r.status==='ready'&&r.type!=='proforma').length,ok=R.filter(r=>r.status==='emp_ok').length;
  C.root.innerHTML=`<div class="card"><h3>${adm?'کارتابل حسابدار':'کارتابل کارفرما'} (${FA(list.length)})</h3>${list.map(r=>`<div class="row"><label><input type="checkbox" class="ck" data-id="${r.id}" style="width:auto;min-height:0"> ${C.esc(r.number?FA(r.number):'بدون شماره')} — ${C.esc(P.find(p=>p.id===r.partyId)?.name||'؟')}</label><br>${formatJalali(r.date)} | ${formatRial(calcInvoice(r).total)} ریال | ثبت‌کننده: ${C.esc(r.ownerName||'؟')}<button class="sec" data-act="openInbox" data-id="${r.id}">بررسی و ویرایش</button></div>`).join('')||'<p>کارتابل خالی است.</p>'}<button data-act="approveSel">${adm?'ثبت و تأیید حسابدار':'تأیید'} موارد انتخاب‌شده</button><p id="msg"></p></div>`
  +(s.role==='employer'?`<div class="card"><h3>رکوردهای خودم</h3><p>آماده‌ی بررسی: ${FA(own)}</p><button class="sec" data-act="moveOwn">ارسال به کارتابل کارفرما</button></div><div class="card"><h3>ارسال به حسابدار</h3><p>تأییدشده و منتظر ارسال: ${FA(ok)}</p><label><input type="checkbox" id="wa2" checked style="width:auto;min-height:0"> همراه عکس و ویس</label><button data-act="buildComb">ساخت بسته‌ی ترکیبی</button><div id="cb"></div></div>`:'')
  +(adm?`<div class="card"><h3>فایل‌های پیوست</h3><button class="sec" data-act="attView">نمایش همه‌ی ضمیمه‌ها</button><div id="av"></div></div>`:'');
}
