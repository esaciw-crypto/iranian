import {get,put,all,uuid} from './db.js';
import {canWriteRecord} from './roles.js';
// همه‌ی محاسبات عدد صحیح‌اند: مبلغ به ریال، تعداد به هزارم.
export function calcInvoice(inv){
  const lines=(inv.lines||[]).map(l=>({...l,total:Math.max(0,Math.round(l.qty*l.price/1000)-(l.discount||0))}));
  const sub=lines.reduce((a,l)=>a+l.total,0),discount=Math.min(inv.discount||0,sub),shipping=inv.shipping||0;
  const taxable=sub-discount+shipping,vat=inv.vat?Math.round(taxable*(inv.vatRate||0)/100):0;
  return{lines,sub,discount,shipping,vat,total:taxable+vat};
}
export const DOC={sale:{t:'فاکتور فروش',sign:1,stock:-1,side:'c'},purchase:{t:'فاکتور خرید',sign:-1,stock:1,side:'s'},sale_return:{t:'برگشت از فروش',sign:-1,stock:1,side:'c'},purchase_return:{t:'برگشت از خرید',sign:1,stock:-1,side:'s'},proforma:{t:'پیش‌فاکتور',sign:0,stock:0,side:'c'}};
const PEND=['ready','sent','emp_ok','acc_sent'];
// موجودی (هزارم واحد): رسمی = موجودی اول دوره + اسناد «تأییدشده‌ی حسابداری». pendingOnly برای برآورد انباردار (اسناد در جریان).
export function stockMap(records,items,{pendingOnly=false}={}){
  const m={};if(!pendingOnly)items.forEach(i=>{m[i.id]=i.openingQty||0;});
  for(const r of records){const d=DOC[r.type];if(!d||!d.stock)continue;if(pendingOnly?!PEND.includes(r.status):r.status!=='final')continue;
    for(const l of r.lines||[])m[l.itemId]=(m[l.itemId]||0)+d.stock*l.qty;}
  return m;
}
export function newDraft(s,type='sale',date){
  const now=new Date().toISOString();
  return{id:uuid(),type,owner:s.id,ownerRole:s.role,ownerName:s.username,status:'draft',number:null,date,partyId:'',lines:[],discount:0,shipping:0,vat:false,vatRate:0,payTerms:'cash',dueDate:null,settle:'unsettled',notes:'',created:now,updated:now,updatedBy:s.id,v:1,history:[]};
}
// شماره‌ی موقت هر کاربر با پیشوند خودش؛ هنگام «آماده‌ی ارسال» داده می‌شود تا شماره جا نیفتد.
export async function nextNumber(s){
  const u=await get('users',s.id),prefix=u.prefix||[...u.username][0],k='seq:'+s.id;
  const seq=((await get('meta',k))?.value||0)+1;await put('meta',{key:k,value:seq});
  return `${prefix}-${String(seq).padStart(4,'0')}`;
}
export async function saveRecord(s,rec){
  const old=await get('records',rec.id);
  if(old&&!canWriteRecord(s,old))throw new Error('اجازه‌ی ویرایش ندارید');
  if(old&&(old.owner!==s.id||old.status!=='draft')){const{history,...before}=old;rec.history=[...(old.history||[]),{by:s.id,byName:s.username,at:new Date().toISOString(),before}];}
  rec.updated=new Date().toISOString();rec.updatedBy=s.id;rec.v=(old?.v||0)+1;
  await put('records',rec);return rec;
}
export async function markReady(s,rec){
  if(!rec.partyId)throw new Error('طرف‌حساب را انتخاب کنید');
  if(!rec.lines.length)throw new Error('حداقل یک ردیف لازم است');
  if(rec.lines.some(l=>!l.itemId||l.qty<=0))throw new Error('کالا و تعداد همه‌ی ردیف‌ها را کامل کنید');
  if(!rec.date)throw new Error('تاریخ نامعتبر است');
  if(!rec.number)rec.number=await nextNumber(s);rec.status='ready';return saveRecord(s,rec);
}
export async function voidRecord(s,rec,reason){
  if(!reason)throw new Error('دلیل ابطال لازم است');
  rec.status='void';rec.voidReason=reason;rec.voidBy=s.id;rec.voidAt=new Date().toISOString();return saveRecord(s,rec);
}

// مانده‌ی طرف‌حساب (ریال): مانده‌ی اول دوره + فاکتورهای فروش «ثبت‌شده‌ی حسابداری». مثبت = بدهکار به ما. دریافت‌ها و برگشتی‌ها در مرحله‌های بعد اضافه می‌شوند.
export function partyBalance(party,records){
  return(party.opening||0)+records.filter(r=>r.partyId===party.id&&DOC[r.type]&&r.status==='final').reduce((a,r)=>a+DOC[r.type].sign*calcInvoice(r).total,0);
}
