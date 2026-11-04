import {all,get} from './db.js';
import {stockMap,DOC,calcInvoice} from './invoice.js';
import {formatQty,formatRial} from './money.js';
import {formatJalali,todayIso} from './jalali.js';
let C;
const FA=s=>String(s).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
export function initReports(ctx){C=ctx;
  C.act.kardex=async d=>{const R=(await all('records')).filter(r=>DOC[r.type]&&DOC[r.type].stock&&r.status!=='void'&&(r.lines||[]).some(l=>l.itemId===d.id)).sort((a,b)=>a.date.localeCompare(b.date));
    document.getElementById('kd').innerHTML=`<h4>کاردکس</h4>`+(R.map(r=>{const q=r.lines.filter(l=>l.itemId===d.id).reduce((a,l)=>a+l.qty,0)*DOC[r.type].stock;return`<div class="row">${formatJalali(r.date)} — ${DOC[r.type].t} ${C.esc(r.number||'')} — <b dir="ltr">${q>0?'+':'-'}${formatQty(Math.abs(q))}</b> ${r.status==='final'?'(رسمی)':'(در جریان)'}</div>`;}).join('')||'<p>گردشی نیست.</p>');};
}
export async function showStock(s){
  const items=await all('items'),R=await all('records'),est=s.role==='storekeeper';
  const os=est?await get('meta','officialStock'):null;
  const off=est?(os?.value?.map||{}):stockMap(R,items),pend=est?stockMap(R.filter(r=>r.owner===s.id),items,{pendingOnly:true}):{};
  C.root.innerHTML=`<div class="card"><h3>موجودی کالا</h3>${est?`<p class="bad">موجودی «تخمینی» است: آخرین موجودی رسمی دریافت‌شده${os?` (${new Date(os.value.at).toLocaleDateString('fa-IR')})`:' (هنوز دریافت نشده)'} به‌اضافه‌ی ثبت‌های خودتان.</p>`:''}`
   +items.map(i=>{const q=(off[i.id]||0)+(pend[i.id]||0),low=q<0||(i.minQty&&q<=i.minQty);return`<div class="row" data-act="kardex" data-id="${i.id}"><b>${C.esc(i.name)}</b> — <span class="${low?'bad':''}">${q<0?'-':''}${formatQty(Math.abs(q))} ${C.esc(i.unit||'')}${q<0?' (منفی!)':low?' (کم‌موجود)':''}</span></div>`;}).join('')+'<div id="kd"></div></div>';
}
export async function showDue(s){
  const P=await all('parties'),t=todayIso(),soon=new Date(Date.now()+7*864e5).toLocaleDateString('en-CA',{timeZone:'Asia/Tehran'});
  const R=(await all('records')).filter(r=>(r.type==='sale'||r.type==='purchase')&&r.dueDate&&r.settle!=='settled'&&!['void','draft','converted'].includes(r.status)).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const nm=r=>C.esc(P.find(p=>p.id===r.partyId)?.name||'؟'),row=r=>`<div class="row">${nm(r)} — ${DOC[r.type].t} ${C.esc(r.number||'')}<br>موعد: ${formatJalali(r.dueDate)} | ${formatRial(calcInvoice(r).total)} ریال${r.settle==='partial'?' | تسویه‌ی جزئی':''}</div>`;
  const over=R.filter(r=>r.dueDate<t),near=R.filter(r=>r.dueDate>=t&&r.dueDate<=soon),later=R.filter(r=>r.dueDate>soon);
  const byP={};over.forEach(r=>{byP[nm(r)]=(byP[nm(r)]||0)+calcInvoice(r).total;});
  C.root.innerHTML=`<div class="card"><h3 class="bad">گذشته از موعد (${FA(over.length)})</h3>${over.map(row).join('')||'<p>موردی نیست.</p>'}${Object.keys(byP).length?'<h4>به تفکیک طرف‌حساب</h4>'+Object.entries(byP).map(([k,v])=>`<div class="row">${k}: ${formatRial(v)} ریال</div>`).join(''):''}</div><div class="card"><h3>تا ۷ روز آینده (${FA(near.length)})</h3>${near.map(row).join('')||'<p>موردی نیست.</p>'}</div><div class="card"><h3>بعدتر (${FA(later.length)})</h3>${later.map(row).join('')||'<p>موردی نیست.</p>'}</div>`;
}
import {put as _put} from './db.js';
export async function renderSettings(s){
  if(s.role!=='admin')return;const v=(await get('meta','settings'))?.value||{};
  C.act.saveSettings=async()=>{const g=i=>document.getElementById(i).value.trim();await _put('meta',{key:'settings',value:{name:g('sn'),phone:g('sph'),address:g('sad'),footer:g('sfo')}});C.msg('ذخیره شد (با بسته‌ی اطلاعات پایه به بقیه می‌رسد)',true);};
  C.root.insertAdjacentHTML('beforeend',`<div class="card"><h3>مشخصات مجموعه (روی فاکتور)</h3><label>نام</label><input id="sn" value="${C.esc(v.name||'مجموعه نور و صدای ایرانیان')}"><label>تلفن</label><input id="sph" value="${C.esc(v.phone||'')}"><label>آدرس</label><input id="sad" value="${C.esc(v.address||'')}"><label>متن پایین فاکتور</label><input id="sfo" value="${C.esc(v.footer||'')}"><button data-act="saveSettings">ذخیره</button><p id="msg"></p></div>`);
}
