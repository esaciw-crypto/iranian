import {calcInvoice,DOC} from './invoice.js';
import {formatRial,formatQty,rialInWords} from './money.js';
import {formatJalali} from './jalali.js';
const FA=s=>String(s).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PT={cash:'نقد',credit:'نسیه',cheque:'چک'};
// فاکتور همیشه سفید و چاپ‌پسند. official=false → واترمارک «پیش‌نویس — غیررسمی»
export function invoiceHtml({rec,party,items,settings,official,showDue}){
  const t=calcInvoice(rec),S=settings||{},no=rec.officialNo||rec.number;
  const rows=t.lines.map((l,i)=>{const it=items.find(x=>x.id===l.itemId);return`<tr><td>${FA(i+1)}</td><td style="text-align:right">${esc(it?.name||'؟')}</td><td>${formatQty(l.qty)}</td><td>${esc(l.unit||it?.unit||'')}</td><td>${formatRial(l.price)}</td><td>${formatRial(l.discount||0)}</td><td>${formatRial(l.total)}</td></tr>`;}).join('');
  const td='border:1px solid #000;padding:5px;text-align:center';
  return`<div class="inv" dir="rtl" style="position:relative;background:#fff;color:#000;padding:18px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:13px;width:100%;max-width:794px;margin:auto">
  ${official?'':'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:44px;color:rgba(0,0,0,.12);transform:rotate(-25deg);pointer-events:none">پیش‌نویس — غیررسمی</div>'}
  <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:8px"><b style="font-size:18px">${esc(S.name||'مجموعه نور و صدای ایرانیان')}</b><br>${esc(S.phone||'')} ${esc(S.address||'')}</div>
  <h3 style="text-align:center;margin:10px 0">${DOC[rec.type]?.t||'سند'}</h3>
  <table style="width:100%;margin-bottom:8px"><tr><td>شماره: <b>${no?FA(no):'—'}</b></td><td style="text-align:left">تاریخ: <b>${formatJalali(rec.date)}</b></td></tr>
  <tr><td colspan="2">${DOC[rec.type]?.side==='s'?'فروشنده':'خریدار'}: <b>${esc(party?.name||'—')}</b> ${esc(party?.phone||'')}</td></tr></table>
  <table style="width:100%;border-collapse:collapse"><tr style="background:#eee"><th style="${td}">ردیف</th><th style="${td}">کالا</th><th style="${td}">تعداد</th><th style="${td}">واحد</th><th style="${td}">قیمت واحد (ریال)</th><th style="${td}">تخفیف</th><th style="${td}">مبلغ (ریال)</th></tr>${rows.replace(/<td/g,`<td style="${td}"`).replace(/style="text-align:right" style="[^"]*"/g,`style="${td};text-align:right"`)}</table>
  <table style="width:55%;margin:10px 0 0 auto;border-collapse:collapse"><tr><td>جمع اقلام</td><td>${formatRial(t.sub)}</td></tr><tr><td>تخفیف کل</td><td>${formatRial(t.discount)}</td></tr><tr><td>حمل و اضافات</td><td>${formatRial(t.shipping)}</td></tr>${rec.vat?`<tr><td>مالیات ارزش‌افزوده (${FA(rec.vatRate)}٪)</td><td>${formatRial(t.vat)}</td></tr>`:''}<tr style="font-weight:bold;border-top:2px solid #000"><td>مبلغ نهایی (ریال)</td><td>${formatRial(t.total)}</td></tr></table>
  <p>مبلغ به حروف: <b>${esc(rialInWords(t.total))}</b></p>
  <p>شرایط پرداخت: ${PT[rec.payTerms]||''}${showDue&&rec.dueDate?` | موعد تسویه: ${formatJalali(rec.dueDate)}`:''}</p>${rec.notes?`<p>توضیحات: ${esc(rec.notes)}</p>`:''}
  <div style="display:flex;justify-content:space-around;margin-top:30px"><div>مهر و امضای فروشنده</div><div>مهر و امضای خریدار</div></div>
  <p style="text-align:center;margin-top:20px;font-size:11px">${esc(S.footer||'')}</p></div>`;
}
let lib;
const loadLib=()=>lib||(lib=window.htmlToImage?Promise.resolve():new Promise((res,rej)=>{const e=document.createElement('script');e.src='libs/html-to-image.js';e.onload=res;e.onerror=()=>rej(new Error('کتابخانه‌ی ساخت تصویر بارگذاری نشد'));document.head.appendChild(e);}));
export function showPreview(html){closePreview();const d=document.createElement('div');d.id='pv';
  d.innerHTML=`<div class="noprint" style="padding:8px;background:#f6f7f9"><button data-act="pvPrint">چاپ یا ذخیره به‌صورت PDF</button><button class="sec" data-act="pvImg">ساخت تصویر و اشتراک‌گذاری</button><button class="sec" data-act="pvClose">بستن</button><p id="pvm"></p></div><div id="pvb">${html}</div>`;document.body.appendChild(d);}
export const closePreview=()=>document.getElementById('pv')?.remove();
export async function previewPng(){await loadLib();return window.htmlToImage.toBlob(document.querySelector('#pvb .inv'),{pixelRatio:2,backgroundColor:'#ffffff'});}
