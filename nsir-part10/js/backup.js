import {openDb} from './db.js';
import {encryptText,decryptText,b64u,unb64u} from './crypto.js';
const STORES=['meta','users','devices','parties','items','records','attachments','logs','imports'];
const SKIP_META=['adminKeys','deviceId']; // کلید خصوصی مدیر قابل استخراج نیست؛ شناسه‌ی دستگاه مال همین گوشی است.
const req=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
export async function makeBackup(password){
  const db=await openDb(),out={v:1,at:new Date().toISOString(),stores:{}};
  for(const s of STORES){let rows=await req(db.transaction(s).objectStore(s).getAll());
    if(s==='meta')rows=rows.filter(r=>!SKIP_META.includes(r.key));
    if(s==='attachments')rows=await Promise.all(rows.map(async r=>r.blob instanceof Blob?{...r,blob:{__b64:b64u(await r.blob.arrayBuffer()),type:r.blob.type}}:r));
    out.stores[s]=rows;}
  const text=await encryptText(password,JSON.stringify(out));
  const db2=await openDb();await new Promise((res,rej)=>{const t=db2.transaction('meta','readwrite');t.objectStore('meta').put({key:'lastBackup',value:Date.now()});t.oncomplete=res;t.onerror=()=>rej(t.error);});
  return new Blob([text],{type:'application/octet-stream'});
}
export async function restoreBackup(password,fileText){
  const data=JSON.parse(await decryptText(password,fileText));
  if(data.v!==1||!data.stores)throw new Error('نسخه‌ی پشتیبان ناشناخته است');
  const db=await openDb(),t=db.transaction(STORES,'readwrite');
  for(const s of STORES){const st=t.objectStore(s);if(s!=='meta')st.clear();
    for(let r of data.stores[s]||[]){if(s==='attachments'&&r.blob&&r.blob.__b64)r={...r,blob:new Blob([unb64u(r.blob.__b64)],{type:r.blob.type})};st.put(r);}}
  await new Promise((res,rej)=>{t.oncomplete=res;t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error);});
}
export async function shareOrSave(blob,name){
  const f=new File([blob],name,{type:blob.type});
  if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:name});return'shared';}catch(e){if(e.name==='AbortError')return'cancelled';}}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),6e4);return'saved';
}
