import {put,all,get,uuid} from './db.js';
export async function compressImage(file,max=1280,q=0.7){
  if(file.type==='application/pdf')return file;
  const bmp=await createImageBitmap(file),k=Math.min(1,max/Math.max(bmp.width,bmp.height));
  const c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);
  c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
  return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('فشرده‌سازی عکس ناموفق بود')),'image/jpeg',q));
}
export const pickMime=()=>['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'].find(m=>window.MediaRecorder&&MediaRecorder.isTypeSupported(m))||'';
export async function startRecording(maxSec,onStop){
  const st=await navigator.mediaDevices.getUserMedia({audio:true}),mime=pickMime(),mr=new MediaRecorder(st,mime?{mimeType:mime}:undefined),ch=[];let t;
  mr.ondataavailable=e=>e.data.size&&ch.push(e.data);
  mr.onstop=()=>{clearTimeout(t);st.getTracks().forEach(x=>x.stop());onStop(new Blob(ch,{type:mr.mimeType||mime||'audio/webm'}));};
  mr.start();t=setTimeout(()=>mr.state!=='inactive'&&mr.stop(),maxSec*1000);
  return{stop:()=>mr.state!=='inactive'&&mr.stop()};
}
export async function saveAttachment(s,recordId,blob,kind){
  const a={id:uuid(),recordId,kind,mime:blob.type,size:blob.size,blob,by:s.id,at:new Date().toISOString()};await put('attachments',a);return a;
}
export async function listAttachments(recordId){return(await all('attachments')).filter(a=>a.recordId===recordId);}
