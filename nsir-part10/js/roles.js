// نقش‌ها و قانون دیده‌شدن داده — در لایه‌ی داده اعمال می‌شود، نه فقط با پنهان‌کردن منو.
export const ROLES={admin:'مدیر (حسابدار)',employer:'کارفرما',storekeeper:'انباردار و فروش'};
const PERMS={
  admin:['*'],
  employer:['sales','purchase','proforma','returns','payments','cheques','warehouse','employer_inbox','settlement_due','official_pdf','buy_price','parties.manage','items.manage'],
  storekeeper:['sales','purchase','returns','warehouse','attachments','parties.pick','items.pick']
};
export const can=(role,perm)=>!!PERMS[role]&&(PERMS[role].includes('*')||PERMS[role].includes(perm));
// session = {id, role}. هر رکورد: owner (id ایجادکننده) و ownerRole.
export function canReadRecord(session,rec){
  if(!session)return false;
  if(session.role==='admin')return true;
  if(rec.owner===session.id)return true;
  // کارفرما رکوردهای واردشده از انباردارها را می‌بیند؛ انباردار هرگز چیزی از دیگران نمی‌بیند.
  return session.role==='employer'&&rec.ownerRole==='storekeeper';
}
export const filterRecords=(session,list)=>list.filter(r=>canReadRecord(session,r));
export function canWriteRecord(session,rec){
  if(!session)return false;
  if(session.role==='admin')return true;
  if(session.role==='employer')return canReadRecord(session,rec);
  return rec.owner===session.id&&['draft','ready'].includes(rec.status);
}
// حذف فیلدهای ممنوع قبل از ساخت هر فایل بسته برای یک نقش گیرنده.
export function stripForRole(role,item){
  const c={...item};if(!can(role,'buy_price'))delete c.buyPrice;return c;
}
