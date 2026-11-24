/* ---------- Archivio degli spartiti: IndexedDB, con il localStorage come riserva ---------- */
const Store=(()=>{
  let mode=null,dbp=null;
  const LSK='fiati-songs';
  const lsAll=()=>{try{return JSON.parse(localStorage.getItem(LSK)||'[]');}catch(_){return [];}};
  const lsSave=a=>{try{localStorage.setItem(LSK,JSON.stringify(a));}catch(_){throw new Error('spazio');}};
  function open(){
    if(dbp)return dbp;
    dbp=new Promise((res,rej)=>{
      let r;try{r=indexedDB.open('fiati',1);}catch(e){rej(e);return;}
      r.onupgradeneeded=()=>{const db=r.result;
        if(!db.objectStoreNames.contains('songs'))db.createObjectStore('songs',{keyPath:'id'});
        if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta');};
      r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);r.onblocked=()=>rej(new Error('blocked'));
    });
    return dbp;
  }
  function tx(store,rw,fn){
    return open().then(db=>new Promise((res,rej)=>{
      const t=db.transaction(store,rw?'readwrite':'readonly'),s=t.objectStore(store);let out;
      const r=fn(s);if(r)r.onsuccess=()=>{out=r.result;};
      t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error||new Error('abort'));
    }));
  }
  async function init(){
    try{
      if(!window.indexedDB)throw new Error('noidb');
      await open();mode='idb';
      const legacy=lsAll();
      if(legacy.length&&!(await tx('meta',false,s=>s.get('migrated')))){
        const now=Date.now();
        await tx('songs',true,s=>{legacy.forEach((r,k)=>s.put(Object.assign({updatedAt:now-k,deleted:false,dirty:true},r)));});
        await tx('meta',true,s=>s.put(true,'migrated'));
        try{localStorage.removeItem(LSK);}catch(_){}
      }
      return await tx('songs',false,s=>s.getAll())||[];
    }catch(_){
      mode='ls';
      return lsAll().map(r=>Object.assign({updatedAt:0,deleted:false},r));
    }
  }
  const meta={};
  return{
    init,
    get mode(){return mode;},
    putMany(recs){
      if(mode==='idb')return tx('songs',true,s=>{recs.forEach(r=>s.put(r));});
      const all=lsAll(),ids=new Map(all.map((r,k)=>[r.id,k]));
      recs.forEach(r=>{if(ids.has(r.id))all[ids.get(r.id)]=r;else all.push(r);});
      lsSave(all.filter(r=>!r.deleted||r.dirty));return Promise.resolve();
    },
    getMeta(k){
      if(mode==='idb')return tx('meta',false,s=>s.get(k)).catch(()=>undefined);
      try{const v=localStorage.getItem('fiati-meta-'+k);return Promise.resolve(v==null?undefined:JSON.parse(v));}catch(_){return Promise.resolve(meta[k]);}
    },
    setMeta(k,v){
      if(mode==='idb')return tx('meta',true,s=>s.put(v,k)).catch(()=>{});
      try{localStorage.setItem('fiati-meta-'+k,JSON.stringify(v));}catch(_){meta[k]=v;}return Promise.resolve();
    }
  };
})();

/* Elenco in memoria: tutti i record, compresi gli spartiti eliminati in attesa di sincronizzazione */
let allRecs=[];
/* Spartiti e beffe (kind: 'beffa') convivono nell’archivio del dispositivo; nel cloud vanno in due tabelle separate */
const liveSongs=()=>allRecs.filter(r=>!r.deleted&&r.kind!=='beffa').sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
const liveBeffe=()=>allRecs.filter(r=>!r.deleted&&r.kind==='beffa').sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
const newId=()=>'u'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
function upsertMem(rec){const k=allRecs.findIndex(r=>r.id===rec.id);if(k>=0)allRecs[k]=rec;else allRecs.push(rec);}
async function saveSongs(recs){
  const now=Date.now();
  recs.forEach((r,k)=>{r.updatedAt=now-k;r.dirty=true;r.deleted=false;upsertMem(r);});
  try{await Store.putMany(recs);}catch(_){hintFlash('Non riesco a salvare: lo spazio del browser è pieno. Elimina qualche spartito o esporta un backup.');return false;}
  Cloud.schedule();return true;
}
const saveSong=rec=>saveSongs([rec]);
async function deleteSong(id){
  const r=allRecs.find(x=>x.id===id);if(!r)return;
  const tomb={id:r.id,title:r.title,deleted:true,updatedAt:Date.now(),dirty:true};
  if(r.kind)tomb.kind=r.kind; // così l’eliminazione va nella tabella giusta
  upsertMem(tomb);
  try{await Store.putMany([tomb]);}catch(_){}
  Cloud.schedule();
}
const storeReady=Store.init().then(recs=>{allRecs=recs;}).catch(()=>{allRecs=[];});

/* Backup: un file JSON con tutti gli spartiti, da esportare e reimportare */
function exportBackup(){
  const songs=liveSongs().map(r=>({id:r.id,title:r.title,by:r.by,bpm:r.bpm,meter:r.meter,ev:r.ev,perc:r.perc,updatedAt:r.updatedAt}));
  const beffe=liveBeffe().map(r=>Object.assign(recPayload(r),{id:r.id,title:r.title,updatedAt:r.updatedAt}));
  if(!songs.length&&!beffe.length){songsMsg('Non ci sono ancora spartiti o beffe tuoi da esportare.');return;}
  const json=JSON.stringify({app:'fiati-tascabili',version:2,exported:new Date().toISOString(),songs,beffe});
  const filename='fiati-backup-'+new Date().toISOString().slice(0,10)+'.json';
  const n=(k,one,many)=>k===1?'1 '+one:k+' '+many;
  const done=()=>songsMsg('Esportati '+[songs.length?n(songs.length,'spartito','spartiti'):'',beffe.length?n(beffe.length,'beffa','beffe'):''].filter(Boolean).join(' e ')+'.');
  if(window.FIATI_DOWNLOADS){ // dentro claude.ai: il file passa dal salvataggio della piattaforma
    window.FIATI_DOWNLOADS.save({filename,data:json}).then(done,e=>{
      if(e&&e.code!=='declined')songsMsg('Qui non posso salvare file: apri l’app dal sito pubblicato per esportare il backup.');});
    return;
  }
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));
  a.download=filename;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);done();
}
async function importBackup(file){
  let data;
  try{data=JSON.parse(await file.text());}catch(_){songsMsg('Questo file non è un backup di Fiati tascabili.');return;}
  if(!data||data.app!=='fiati-tascabili'||(!Array.isArray(data.songs)&&!Array.isArray(data.beffe))){songsMsg('Questo file non è un backup di Fiati tascabili.');return;}
  const take=[];let skipped=0,nb=0;
  for(const s of data.beffe||[]){
    if(!s||!s.id||typeof s.text!=='string'||!s.text.trim())continue;
    const cur=allRecs.find(r=>r.id===s.id);
    if(cur&&!cur.deleted&&(cur.updatedAt||0)>=(s.updatedAt||0)){skipped++;continue;}
    take.push(beffaRec(Object.assign({},s,{id:String(s.id)})));nb++;
  }
  for(const s of data.songs||[]){
    if(!s||!s.id||!Array.isArray(s.ev)||!s.ev.length)continue;
    const cur=allRecs.find(r=>r.id===s.id);
    if(cur&&!cur.deleted&&(cur.updatedAt||0)>=(s.updatedAt||0)){skipped++;continue;}
    take.push({id:String(s.id),title:String(s.title||'Senza titolo').slice(0,120),by:s.by||'dal backup',bpm:+s.bpm||100,meter:Array.isArray(s.meter)?s.meter:[4,4],ev:s.ev,perc:Array.isArray(s.perc)?s.perc:undefined});
  }
  if(take.length&&!(await saveSongs(take)))return;
  renderSongList();
  const msg=[];
  const ns=take.length-nb;
  msg.push('Importati '+ns+(ns===1?' spartito':' spartiti')+(nb?' e '+nb+(nb===1?' beffa':' beffe'):'')+'.');
  if(skipped)msg.push(skipped===1?'1 era già aggiornato.':skipped+' erano già aggiornati.');
  songsMsg(msg.join(' '));
}

/* Conferma in-app: funziona anche dove i dialoghi del browser sono bloccati */
function askConfirm(text,okLabel){
  return new Promise(res=>{
    const box=$('#ask');$('#askText').textContent=text;$('#askOk').textContent=okLabel||'Conferma';
    box.hidden=false;$('#askOk').focus();
    const done=v=>{box.hidden=true;$('#askOk').onclick=$('#askNo').onclick=null;res(v);};
    $('#askOk').onclick=()=>done(true);$('#askNo').onclick=()=>done(false);
  });
}

/* Su claude.ai i file si salvano con la capacità downloads; altrove resta il link classico */
if(window.claude&&typeof window.claude.use==='function'&&!window.FIATI_STANDALONE)
  window.claude.use('downloads').then(d=>{window.FIATI_DOWNLOADS=d||null;}).catch(()=>{});
