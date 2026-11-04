// تبدیل شمسی/میلادی با Intl داخلی کروم (بدون اینترنت و بدون کتابخانه). در داده، تاریخ به‌صورت ISO نگه داشته می‌شود.
const F=new Intl.DateTimeFormat('en-u-ca-persian-nu-latn',{timeZone:'UTC',year:'numeric',month:'numeric',day:'numeric'});
const DAY=864e5;
export function isoToJalali(iso){const [y,m,d]=iso.split('-').map(Number);const p=F.formatToParts(new Date(Date.UTC(y,m-1,d,12)));const g=t=>+p.find(x=>x.type===t).value;return{jy:g('year'),jm:g('month'),jd:g('day')};}
const ord=(y,m,d)=>y*372+m*31+d;
export function jalaliToIso(jy,jm,jd){
  let t=Date.UTC(jy+621,2,21,12)+Math.round((jm-1)*30.5+jd-1)*DAY;
  for(let i=0;i<12;i++){
    const iso=new Date(t).toISOString().slice(0,10);const j=isoToJalali(iso);
    const diff=ord(jy,jm,jd)-ord(j.jy,j.jm,j.jd);
    if(diff===0)return iso;
    t+=(diff>0?1:-1)*DAY;
  }
  return null;
}
export const isJalaliLeap=y=>jalaliToIso(y,12,30)!==null;
export function formatJalali(iso){const {jy,jm,jd}=isoToJalali(iso);return `${jy}/${String(jm).padStart(2,'0')}/${String(jd).padStart(2,'0')}`;}
export function todayIso(){return new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tehran'});}
