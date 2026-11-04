const enc=new TextEncoder(),dec=new TextDecoder();
export const b64u=(buf)=>{const u=new Uint8Array(buf);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
export const unb64u=(s)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
export const jsonB64=(o)=>b64u(enc.encode(JSON.stringify(o)));
export const unJsonB64=(s)=>JSON.parse(dec.decode(unb64u(s)));
const ITER=150000;
export async function hashPassword(pw,saltB64){
  const salt=saltB64?unb64u(saltB64):crypto.getRandomValues(new Uint8Array(16));
  const k=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITER},k,256);
  return{salt:b64u(salt),hash:b64u(bits),iter:ITER};
}
export async function verifyPassword(pw,rec){return(await hashPassword(pw,rec.salt)).hash===rec.hash;}
const ALG={name:'ECDSA',namedCurve:'P-256'},SIG={name:'ECDSA',hash:'SHA-256'};
// کلید خصوصی non-extractable است و فقط روی دستگاه مدیر در IndexedDB می‌ماند.
export const makeAdminKeys=async()=>{const p=await crypto.subtle.generateKey(ALG,false,['sign','verify']);return{privateKey:p.privateKey,publicJwk:await crypto.subtle.exportKey('jwk',p.publicKey)};};
export const signText=async(priv,text)=>b64u(await crypto.subtle.sign(SIG,priv,enc.encode(text)));
export async function verifyText(pubJwk,text,sigB64){const pub=await crypto.subtle.importKey('jwk',pubJwk,ALG,false,['verify']);return crypto.subtle.verify(SIG,pub,unb64u(sigB64),enc.encode(text));}
export async function fingerprint(pubJwk){const d=await crypto.subtle.digest('SHA-256',enc.encode(pubJwk.x+pubJwk.y));return[...new Uint8Array(d).slice(0,6)].map(b=>b.toString(16).padStart(2,'0')).join('-');}

async function aesKey(pw,salt){const k=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITER},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function encryptText(pw,text,kind='backup'){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await aesKey(pw,salt),enc.encode(text));return JSON.stringify({app:'nsir',kind,v:1,salt:b64u(salt),iv:b64u(iv),ct:b64u(ct)});}
export async function decryptText(pw,s){let o;try{o=JSON.parse(s);}catch{throw new Error('فایل معتبر نیست');}if(o.app!=='nsir')throw new Error('این فایل مال این برنامه نیست');try{return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64u(o.iv)},await aesKey(pw,unb64u(o.salt)),unb64u(o.ct)));}catch{throw new Error('رمز اشتباه است یا فایل خراب/دست‌کاری شده');}}

export const randomKey=()=>b64u(crypto.getRandomValues(new Uint8Array(32)));
export const sha256=async bytes=>b64u(await crypto.subtle.digest('SHA-256',bytes));
const netAes=n=>crypto.subtle.importKey('raw',unb64u(n),'AES-GCM',false,['encrypt','decrypt']);
export async function encBytes(net,bytes){const iv=crypto.getRandomValues(new Uint8Array(12));return{iv:b64u(iv),ct:new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await netAes(net),bytes))};}
export async function decBytes(net,iv,ct){try{return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64u(iv)},await netAes(net),ct));}catch{throw new Error('فایل با کلید این مجموعه ساخته نشده یا خراب است');}}
