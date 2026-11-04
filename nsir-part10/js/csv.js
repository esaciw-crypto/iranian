export function parseCsv(text){text=text.replace(/^\uFEFF/,'');const rows=[];let r=[],f='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
    else if(c==='"')q=true;else if(c===','){r.push(f);f='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;r.push(f);f='';rows.push(r);r=[];}else f+=c;}
  if(f!==''||r.length){r.push(f);rows.push(r);}return rows.filter(x=>x.some(y=>String(y).trim()!==''));}
export const toCsv=rows=>'\uFEFF'+rows.map(r=>r.map(c=>/[",\n\r]/.test(c)?'"'+String(c).replace(/"/g,'""')+'"':c).join(',')).join('\r\n');
