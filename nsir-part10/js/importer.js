import {parseRial,parseQty,normDigits} from './money.js';
export const TEMPLATES={
  parties:{head:['نام','نوع','تلفن','مانده اول دوره'],sample:['شرکت نمونه','مشتری','09120000000','0']},
  items:{head:['نام','برند','واحد','قیمت فروش','قیمت خرید','موجودی اول دوره','حداقل موجودی'],sample:['بلندگوی نمونه','برند','عدد','12000000','9000000','5','2']}
};
const TYPES={'مشتری':'customer','تأمین‌کننده':'supplier','تامین‌کننده':'supplier','تامین کننده':'supplier','هر دو':'both'};
// ورودی: ردیف‌ها (ردیف اول عنوان). خروجی: {ok:[رکورد], errors:[{row,msg}]}. هیچ‌چیز ثبت نمی‌شود.
export function validate(kind,rows,existingNames=[]){
  const head=TEMPLATES[kind].head,ok=[],errors=[],seen=new Set(existingNames.map(n=>n.trim()));
  if(!rows.length||head.some((h,i)=>String(rows[0][i]||'').trim()!==h))return{ok,errors:[{row:1,msg:'عنوان ستون‌ها با قالب یکی نیست. قالب را دانلود کنید.'}]};
  rows.slice(1).forEach((r,k)=>{const n=k+2,c=r.map(x=>String(x??'').trim()),name=c[0];
    if(!name)return errors.push({row:n,msg:'نام خالی است'});
    if(seen.has(name))return errors.push({row:n,msg:'نام تکراری است: '+name});
    if(kind==='parties'){const type=TYPES[c[1]],o=parseRial(c[3]||'0');
      if(!type)return errors.push({row:n,msg:'نوع باید مشتری، تأمین‌کننده یا هر دو باشد'});
      if(o===null)return errors.push({row:n,msg:'مانده باید عدد صحیح (ریال) باشد'});
      ok.push({name,type,phone:normDigits(c[2]),opening:o});}
    else{const oq=parseQty(c[5]||'0'),mq=parseQty(c[6]||'0');if(oq===null||mq===null)return errors.push({row:n,msg:'موجودی باید عدد (حداکثر ۳ رقم اعشار) باشد'});
      const sell=parseRial(c[3]),buy=parseRial(c[4]);
      if(sell===null||buy===null)return errors.push({row:n,msg:'قیمت‌ها باید عدد صحیح (ریال) باشند'});
      ok.push({name,brand:c[1],unit:c[2]||'عدد',sell,buyPrice:buy,openingQty:oq,minQty:mq,active:true});}
    seen.add(name);});
  return{ok,errors};
}
