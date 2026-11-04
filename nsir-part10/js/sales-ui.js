import {all,get,put,uuid} from './db.js';
import {can,filterRecords,canWriteRecord} from './roles.js';
import {parseRial,formatRial,parseQty,formatQty,normDigits} from './money.js';
import {jalaliToIso,formatJalali,todayIso} from './jalali.js';
import {calcInvoice,DOC,newDraft,saveRecord,markReady,voidRecord} from './invoice.js';
import {invoiceHtml,showPreview,closePreview,previewPng} from './print.js';
import {shareOrSave} from './backup.js';
import {compressImage,startRecording,saveAttachment,listAttachments} from './attach.js';
const ST={draft:'پیش‌نویس',ready:'آماده‌ی ارسال',sent:'ارسال‌شده',emp_ok:'تأییدشده توسط کارفرما',acc_sent:'ارسال‌شده به حسابدار',final:'تأییدشده توسط حسابداری',converted:'تبدیل‌شده',void:'باطل'};
let backTab='sales';export const setBackTab=t=>{backTab=t;};
const FA=s=>String(s).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
let C,ed=null,parties=[],items=[],rec=null,pendingVoice=null,MAXV=120;
const norm=s=>String(s||'').replace(/[يى]/g,'ی').replace(/ك/g,'ک').toLowerCase();
const optP=(q,sel)=>{const k=norm(q);return'<option value="">انتخاب کنید</option>'+parties.filter(p=>(DOC[ed.type].side==='c'?p.type!=='supplier':p.type!=='customer')&&(p.id===sel||!k||norm(p.name+' '+(p.phone||'')).includes(k))).map(p=>`<option value="${p.id}" ${p.id===sel?'selected':''}>${C.esc(p.name)}</option>`).join('');};
const optI=(q,sel)=>{const k=norm(q);return'<option value="">کالا</option>'+items.filter(x=>x.active!==false&&(x.id===sel||!k||norm(x.name+' '+(x.brand||'')).includes(k))).map(x=>`<option value="${x.id}" ${x.id===sel?'selected':''}>${C.esc(x.name)}</option>`).join('');};
async function openPreview(){const s=C.auth.currentSession(),st=(await get('meta','settings'))?.value,official=['employer','admin'].includes(s.role)&&['emp_ok','acc_sent','final'].includes(ed.status);
  showPreview(invoiceHtml({rec:ed,party:parties.find(p=>p.id===ed.partyId),items,settings:st,official,showDue:can(s.role,'settlement_due')}));}
export function initSales(ctx){
  C=ctx;const{act}=C;
  document.addEventListener('input',e=>{const t=e.target;if(!t.dataset||!t.dataset.search)return;
    if(t.dataset.search==='pa'){const s=document.getElementById('pa');s.innerHTML=optP(t.value,s.value);}
    else{const s=document.querySelector('[data-chg=pickItem][data-i="'+t.dataset.i+'"]');s.innerHTML=optI(t.value,s.value);}});
  act.printDoc=async()=>{collect();await openPreview();};act.pvClose=async()=>closePreview();act.pvPrint=async()=>{window.print();};
  act.pvImg=async()=>{const m=document.getElementById('pvm');m.textContent='در حال ساخت تصویر…';try{await shareOrSave(await previewPng(),'invoice.png');m.textContent='';}catch(e){m.textContent=e.message;}};
  document.addEventListener('change',e=>{
    if(e.target.dataset.chg==='pickItem'){collect();const l=ed.lines[+e.target.dataset.i],it=items.find(x=>x.id===e.target.value);l.itemId=e.target.value;if(it){l.price=DOC[ed.type].side==='s'?(it.buyPrice||0):it.sell;l.unit=it.unit;}draw();}
    else if(e.target.closest('#ed')&&!e.target.dataset.chg){collect();totals();}
  });
  act.newSale=async()=>{const s=C.auth.currentSession();await load();ed=newDraft(s,document.getElementById('ntype')?.value||'sale',todayIso());draw();};
  act.toInvoice=async()=>{collect();const s=C.auth.currentSession(),p=ed;const n={...newDraft(s,'sale',p.date),partyId:p.partyId,lines:p.lines.map(l=>({...l})),discount:p.discount,shipping:p.shipping,vat:p.vat,vatRate:p.vatRate,payTerms:p.payTerms,notes:p.notes,fromProforma:p.id};p.status='converted';await saveRecord(s,p);ed=n;await saveRecord(s,ed);draw();};
  act.openSale=async d=>{await load();ed=await get('records',d.id);draw();};
  act.addLine=async()=>{collect();ed.lines.push({itemId:'',qty:1000,price:0,discount:0,unit:''});draw();};
  act.delLine=async d=>{collect();ed.lines.splice(+d.i,1);draw();};
  act.saveDraft=async()=>{collect();if(!ed.date)return C.msg('تاریخ نامعتبر است');await saveRecord(C.auth.currentSession(),ed);await draw();C.msg('ذخیره شد',true);};
  act.markReady=async()=>{collect();await markReady(C.auth.currentSession(),ed);C.home('sales');};
  act.voidSale=async()=>{const r=prompt('دلیل ابطال؟');if(!r)return;await voidRecord(C.auth.currentSession(),ed,r);C.home('sales');};
  act.showHist=async()=>{const h=ed.history||[],st=[...h.map(x=>x.before),ed],L={date:'تاریخ',partyId:'طرف‌حساب',discount:'تخفیف کل',shipping:'حمل',vat:'مالیات',vatRate:'درصد مالیات',payTerms:'شرایط پرداخت',dueDate:'موعد تسویه',notes:'توضیحات',status:'وضعیت'};
    const nm=id=>parties.find(p=>p.id===id)?.name||'—',val=(k,v)=>k==='partyId'?nm(v):(k==='date'||k==='dueDate')?(v?formatJalali(v):'—'):k==='vat'?(v?'بله':'خیر'):k==='status'?(ST[v]||v):(k==='discount'||k==='shipping')?formatRial(v||0):(v||'—');
    const ln=x=>JSON.stringify((x.lines||[]).map(l=>[l.itemId,l.qty,l.price,l.discount]));
    document.getElementById('hist').innerHTML=h.map((x,i)=>{const a=st[i],b=st[i+1],ch=Object.keys(L).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>`${L[k]}: قبل ${C.esc(val(k,a[k]))} | بعد ${C.esc(val(k,b[k]))}`);
      if(ln(a)!==ln(b))ch.push(`ردیف‌ها: مبلغ نهایی قبل ${formatRial(calcInvoice(a).total)} | بعد ${formatRial(calcInvoice(b).total)}`);
      return`<div class="row"><b>${C.esc(x.byName||'کاربر')}</b> — ${new Date(x.at).toLocaleString('fa-IR')}<br>${ch.join('<br>')||'بدون تغییر در فیلدهای اصلی'}</div>`;}).join('');};
  act.backSales=async()=>{ed=null;const b=backTab;backTab='sales';C.home(b);};
  act.addPhoto=async()=>{const fs=[...document.getElementById('ph').files];if(!fs.length)return C.msg('عکس را انتخاب کنید');const s=C.auth.currentSession();
    for(const f of fs)await saveAttachment(s,ed.id,await compressImage(f),f.type==='application/pdf'?'pdf':'image');collect();draw();};
  act.recStart=async()=>{try{rec=await startRecording(MAXV,b=>{pendingVoice=b;rec=null;drawVoice();});drawVoice();}catch(e){C.msg('دسترسی به میکروفون ممکن نشد. می‌توانید فایل صوتی انتخاب کنید.');}};
  act.recStop=async()=>{rec&&rec.stop();};
  act.voiceSave=async()=>{if(!pendingVoice)return;await saveAttachment(C.auth.currentSession(),ed.id,pendingVoice,'voice');pendingVoice=null;collect();draw();};
  act.voiceDrop=async()=>{pendingVoice=null;drawVoice();};
  act.addAudioFile=async()=>{const f=document.getElementById('af').files[0];if(!f)return C.msg('فایل صوتی را انتخاب کنید');await saveAttachment(C.auth.currentSession(),ed.id,f,'voice');collect();draw();};
}
async function load(){parties=await all('parties');items=await all('items');pendingVoice=null;}
export async function showSales(s){
  const list=filterRecords(s,(await all('records')).filter(r=>DOC[r.type])).sort((a,b)=>b.created.localeCompare(a.created)),P=await all('parties');
  C.root.innerHTML=`<div class="card"><label>نوع سند</label><select id="ntype">${Object.entries(DOC).filter(([k])=>k!=='proforma'||can(s.role,'proforma')).map(([k,v])=>`<option value="${k}">${v.t}</option>`).join('')}</select><button data-act="newSale">سند جدید</button></div><div class="card"><h3>اسناد</h3><input data-rows placeholder="جستجو (شماره، طرف‌حساب، نوع)…">${list.map(r=>`<div class="row" data-act="openSale" data-id="${r.id}"><b>${DOC[r.type].t} ${C.esc(r.number?FA(r.number):'بدون شماره')}</b> — ${C.esc(P.find(p=>p.id===r.partyId)?.name||'؟')}<br>${formatJalali(r.date)} | ${formatRial(calcInvoice(r).total)} ریال | ${ST[r.status]}</div>`).join('')||'<p>موردی نیست.</p>'}</div>`;
}
function collect(){
  if(!ed||!document.getElementById('ed'))return;const g=id=>document.getElementById(id);if(!g('d'))return;
  const [y,m,d]=normDigits(g('d').value).split('/').map(Number);ed.date=jalaliToIso(y,m,d);
  ed.partyId=g('pa').value;ed.discount=parseRial(g('dis').value||'0')||0;ed.shipping=parseRial(g('sh').value||'0')||0;
  ed.vat=g('vat').checked;ed.vatRate=Number(normDigits(g('vr').value||'0'))||0;ed.payTerms=g('pt').value;ed.notes=g('nt').value;
  if(g('due')){const dd=normDigits(g('due').value).split('/').map(Number);ed.dueDate=g('due').value.trim()?jalaliToIso(dd[0],dd[1],dd[2]):null;ed.settle=g('stl').value;}
  ed.lines.forEach((l,i)=>{l.qty=parseQty(g('q'+i).value)??0;l.price=parseRial(g('pr'+i).value)??0;l.discount=parseRial(g('ld'+i).value||'0')||0;});
}
function totals(){const t=calcInvoice(ed),e=document.getElementById('tot');if(e)e.innerHTML=`جمع: ${formatRial(t.sub)} | تخفیف: ${formatRial(t.discount)} | حمل: ${formatRial(t.shipping)} | مالیات: ${formatRial(t.vat)}<br><b>مبلغ نهایی: ${formatRial(t.total)} ریال</b>`;}
function drawVoice(){const e=document.getElementById('vz');if(!e)return;
  e.innerHTML=rec?`<p class="bad">در حال ضبط… (حداکثر ${FA(MAXV)} ثانیه)</p><button data-act="recStop">توقف</button>`:pendingVoice?`<audio controls src="${URL.createObjectURL(pendingVoice)}" style="width:100%"></audio><button data-act="voiceSave">ذخیره‌ی ویس</button><button class="sec" data-act="voiceDrop">حذف</button>`:`<button class="sec" data-act="recStart">ضبط ویس</button>`;}
async function draw(){
  const s=C.auth.currentSession(),w=canWriteRecord(s,ed)||!(await get('records',ed.id)),t=calcInvoice(ed),at=await listAttachments(ed.id);
  const j=ed.date?formatJalali(ed.date).replace(/\//g,'/'):'',due=ed.dueDate?formatJalali(ed.dueDate):'',dis=w?'':'disabled';
  const att=at.map(a=>a.kind==='voice'?`<audio controls src="${URL.createObjectURL(a.blob)}" style="width:100%"></audio>`:a.kind==='pdf'?`<div class="row">فایل PDF (${FA(Math.round(a.size/1024))} کیلوبایت)</div>`:`<img src="${URL.createObjectURL(a.blob)}" style="max-width:100%;border-radius:8px;margin-top:6px">`).join('');
  C.nav.hidden=true;
  C.root.innerHTML=`<div class="card" id="ed"><h3>${DOC[ed.type]?.t||'سند'} ${ed.number?FA(ed.number):'(پیش‌نویس)'}${ed.officialNo?' — شماره‌ی رسمی '+FA(ed.officialNo):''} — ${ST[ed.status]}</h3>${(ed.history||[]).length?`<p>${FA(ed.history.length)} ویرایش ثبت شده (آخرین: ${C.esc((ed.history.at(-1)).by===ed.owner?'صاحب رکورد':'کارفرما/مدیر')})</p>`:''}${ed.ownerName?`<p>ثبت‌کننده: ${C.esc(ed.ownerName)}</p>`:''}
  <label>تاریخ شمسی (مثلاً ۱۴۰۵/۰۱/۱۵)</label><input id="d" value="${j}" ${dis}>
  <label>طرف‌حساب</label>${w?'<input data-search="pa" placeholder="جستجوی طرف‌حساب (نام یا تلفن)">':''}<select id="pa" ${dis}>${optP('',ed.partyId)}</select>
  <h4>ردیف‌ها</h4>${ed.lines.map((l,i)=>`<div class="row">${w?`<input data-search="it" data-i="${i}" placeholder="جستجوی کالا (نام یا برند)">`:''}<select data-chg="pickItem" data-i="${i}" ${dis}>${optI('',l.itemId)}</select>
  <label>تعداد (${C.esc(l.unit||'')})</label><input id="q${i}" inputmode="decimal" value="${formatQty(l.qty)}" ${dis}><label>قیمت واحد (ریال)</label><input id="pr${i}" inputmode="numeric" value="${formatRial(l.price)}" ${dis}><label>تخفیف ردیف (ریال)</label><input id="ld${i}" inputmode="numeric" value="${formatRial(l.discount||0)}" ${dis}>${w?`<button class="sec" data-act="delLine" data-i="${i}">حذف ردیف</button>`:''}</div>`).join('')}
  ${w?'<button class="sec" data-act="addLine">افزودن ردیف</button>':''}
  <label>تخفیف کل (ریال)</label><input id="dis" inputmode="numeric" value="${formatRial(ed.discount)}" ${dis}><label>هزینه‌ی حمل و اضافات (ریال)</label><input id="sh" inputmode="numeric" value="${formatRial(ed.shipping)}" ${dis}>
  <label><input type="checkbox" id="vat" ${ed.vat?'checked':''} ${dis} style="width:auto;min-height:0"> مالیات ارزش‌افزوده</label><label>درصد مالیات</label><input id="vr" inputmode="numeric" value="${FA(ed.vatRate)}" ${dis}>
  <label>شرایط پرداخت</label><select id="pt" ${dis}>${[['cash','نقد'],['credit','نسیه'],['cheque','چک']].map(([k,n])=>`<option value="${k}" ${ed.payTerms===k?'selected':''}>${n}</option>`).join('')}</select>
  ${can(s.role,'settlement_due')?`<label>موعد تسویه (اختیاری)</label><input id="due" value="${due}" ${dis}><label>وضعیت تسویه</label><select id="stl" ${dis}>${[['unsettled','تسویه‌نشده'],['partial','جزئی'],['settled','تسویه‌شده']].map(([k,n])=>`<option value="${k}" ${ed.settle===k?'selected':''}>${n}</option>`).join('')}</select>`:''}<label>توضیحات</label><textarea id="nt" ${dis}>${C.esc(ed.notes)}</textarea>
  <div id="tot" class="card"></div></div>
  <div class="card"><h4>ضمیمه‌ها</h4>${att||'<p>ضمیمه‌ای نیست.</p>'}${w?`<label>عکس یا PDF (چندتایی)</label><input id="ph" type="file" accept="image/*,application/pdf" multiple><button class="sec" data-act="addPhoto">افزودن</button><div id="vz"></div><label>یا فایل صوتی</label><input id="af" type="file" accept="audio/*"><button class="sec" data-act="addAudioFile">افزودن فایل صوتی</button>`:''}</div>
  <div class="card">${w?`<button data-act="saveDraft">ذخیره</button>${ed.status==='draft'?'<button data-act="markReady">آماده‌ی ارسال</button>':''}`:''}${(ed.type==='proforma'&&w&&!['converted','void'].includes(ed.status)&&await get('records',ed.id))?'<button data-act="toInvoice">تبدیل به فاکتور فروش</button>':''}${(ed.status!=='void'&&await get('records',ed.id)&&w)?'<button class="sec" data-act="voidSale">ابطال با ثبت دلیل</button>':''}${(ed.history||[]).length?'<button class="sec" data-act="showHist">تاریخچه‌ی ویرایش</button><div id="hist"></div>':''}${await get('records',ed.id)?'<button class="sec" data-act="printDoc">چاپ / PDF / تصویر</button>':''}<button class="sec" data-act="backSales">بازگشت</button><p id="msg"></p></div>`;
  totals();drawVoice();
}
