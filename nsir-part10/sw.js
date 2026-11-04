const V='nsir-v9';
const FILES=['./','index.html','tests.html','manifest.webmanifest','js/app.js','js/db.js','js/jalali.js','js/money.js','js/roles.js','js/crypto.js','js/auth.js','js/csv.js','js/importer.js','js/backup.js','js/invoice.js','js/attach.js','js/sales-ui.js','js/package.js','js/package-ui.js','js/inbox-ui.js','js/reports-ui.js','js/print.js','libs/html-to-image.js','libs/xlsx.full.min.js','theme/theme.css','ui/ui.css','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(FILES)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});
