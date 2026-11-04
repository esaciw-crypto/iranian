export const APP_VERSION='1.0.0-stage1';
export const SCHEMA_VERSION=1;
// هر مرحله‌ی بعد فقط یک تابع به این آرایه اضافه می‌کند؛ داده‌ی قبلی دست نمی‌خورد.
const MIGRATIONS=[
  (db)=>{
    db.createObjectStore('meta',{keyPath:'key'});
    db.createObjectStore('users',{keyPath:'id'}).createIndex('username','username',{unique:true});
    db.createObjectStore('devices',{keyPath:'id'});
    db.createObjectStore('parties',{keyPath:'id'}).createIndex('owner','owner');
    db.createObjectStore('items',{keyPath:'id'}).createIndex('owner','owner');
    const r=db.createObjectStore('records',{keyPath:'id'});r.createIndex('type','type');r.createIndex('owner','owner');r.createIndex('status','status');
    db.createObjectStore('attachments',{keyPath:'id'}).createIndex('recordId','recordId');
    db.createObjectStore('logs',{keyPath:'id',autoIncrement:true}).createIndex('ts','ts');
    db.createObjectStore('imports',{keyPath:'packageId'});
  }
];
let _db;
export function openDb(name='nsir-db'){
  if(_db&&name==='nsir-db')return Promise.resolve(_db);
  return new Promise((res,rej)=>{
    const rq=indexedDB.open(name,MIGRATIONS.length);
    rq.onupgradeneeded=e=>{for(let v=e.oldVersion;v<MIGRATIONS.length;v++)MIGRATIONS[v](rq.result);};
    rq.onsuccess=()=>{if(name==='nsir-db')_db=rq.result;res(rq.result);};
    rq.onerror=()=>rej(rq.error);
  });
}
const wrap=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
export async function put(store,obj,db){db=db||await openDb();return wrap(db.transaction(store,'readwrite').objectStore(store).put(obj));}
export async function get(store,key,db){db=db||await openDb();return wrap(db.transaction(store).objectStore(store).get(key));}
export async function all(store,db){db=db||await openDb();return wrap(db.transaction(store).objectStore(store).getAll());}
export const uuid=()=>crypto.randomUUID();
export async function requestPersist(){
  if(!navigator.storage||!navigator.storage.persist)return{supported:false,persisted:false};
  const persisted=(await navigator.storage.persisted())||(await navigator.storage.persist());
  return{supported:true,persisted};
}
