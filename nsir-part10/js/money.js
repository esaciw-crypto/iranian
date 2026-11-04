// مبلغ: ریال، عدد صحیح. تعداد: هزارم واحد (عدد صحیح).
const FA='۰۱۲۳۴۵۶۷۸۹';
export function normDigits(s){return String(s).replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c));}
export function parseRial(s){const t=normDigits(s).replace(/[,٬،\s]/g,'');return /^\d+$/.test(t)?Number(t):null;}
export function formatRial(n){return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g,'٬').replace(/\d/g,d=>FA[d]);}
export function parseQty(s){const t=normDigits(s).replace(/[٫,،]/g,'.').replace(/\s/g,'');if(!/^\d+(\.\d{1,3})?$/.test(t))return null;const [a,b='']=t.split('.');return Number(a)*1000+Number(b.padEnd(3,'0'));}
export function formatQty(m){const a=Math.floor(m/1000),b=m%1000;const s=String(a).replace(/\B(?=(\d{3})+(?!\d))/g,'٬')+(b?'٫'+String(b).padStart(3,'0').replace(/0+$/,''):'');return s.replace(/\d/g,d=>FA[d]);}
export const lineTotal=(qtyMilli,unitRial)=>Math.round(qtyMilli*unitRial/1000);
const O=['','یک','دو','سه','چهار','پنج','شش','هفت','هشت','نه','ده','یازده','دوازده','سیزده','چهارده','پانزده','شانزده','هفده','هجده','نوزده'];
const T=['','','بیست','سی','چهل','پنجاه','شصت','هفتاد','هشتاد','نود'];
const H=['','یکصد','دویست','سیصد','چهارصد','پانصد','ششصد','هفتصد','هشتصد','نهصد'];
const S=['','هزار','میلیون','میلیارد','تریلیون','کوادریلیون'];
const three=n=>{const p=[],h=Math.floor(n/100),r=n%100;if(h)p.push(H[h]);if(r){if(r<20)p.push(O[r]);else{const t=Math.floor(r/10),o=r%10;p.push(o?T[t]+' و '+O[o]:T[t]);}}return p.join(' و ');};
export function toWords(n){n=Math.trunc(n);if(n===0)return 'صفر';const neg=n<0;n=Math.abs(n);const g=[];while(n>0){g.push(n%1000);n=Math.floor(n/1000);}
  const p=[];for(let k=g.length-1;k>=0;k--)if(g[k])p.push(three(g[k])+(S[k]?' '+S[k]:''));return (neg?'منفی ':'')+p.join(' و ');}
export const rialInWords=n=>toWords(n)+' ریال';
