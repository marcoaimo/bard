/* ---------- Sincronizzazione con Supabase (facoltativa: attiva solo se config.js ha URL e chiave) ---------- */
const Cloud={
  sb:null,user:null,busy:false,again:false,timer:0,email:'',err:'',
  enabled(){const c=window.FIATI_CLOUD;return !!(c&&c.url&&c.key);},
  async client(){
    if(this.sb)return this.sb;
    const m=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    const c=window.FIATI_CLOUD;
    this.sb=m.createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'fiati-auth'}});
    this.sb.auth.onAuthStateChange((ev,session)=>{
      const was=this.user&&this.user.id;this.user=session?session.user:null;uiCloud();
      if(this.user&&this.user.id!==was)this.sync();
    });
    this.err='';
    const {data}=await this.sb.auth.getSession();
    this.user=data&&data.session?data.session.user:null;
    return this.sb;
  },
  async start(){
    if(!this.enabled())return;
    $('#cloudBox').hidden=false;uiCloud();
    try{await this.client();uiCloud();if(this.user)this.sync();}
    catch(_){this.err='Il servizio di sincronizzazione non è raggiungibile adesso. Gli spartiti restano salvati su questo dispositivo.';uiCloud();}
    window.addEventListener('online',()=>this.schedule(300));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.schedule(300);});
  },
  async sendCode(email){
    const sb=await this.client();
    const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:location.origin+location.pathname}});
    if(error)throw error;this.email=email;
  },
  async verify(token){
    const sb=await this.client();
    const {error}=await sb.auth.verifyOtp({email:this.email,token,type:'email'});
    if(error)throw error;
  },
  async signOut(){
    const sb=await this.client();await sb.auth.signOut();
    this.user=null;await Store.setMeta('lastPull',null);await Store.setMeta('lastPull_mockeries',null);uiCloud();
  },
  schedule(ms){
    if(!this.user)return;
    clearTimeout(this.timer);this.timer=setTimeout(()=>this.sync(),ms==null?1500:ms);
  },
  /* Due tabelle: «songs» per gli spartiti e «mockeries» per le beffe crudeli. Ognuna si sincronizza da sola. */
  async syncTable(sb,uid,table){
    const isBeffe=table==='mockeries',mine=r=>(r.kind==='beffa')===isBeffe,metaKey=isBeffe?'lastPull_mockeries':'lastPull';
    const lp=await Store.getMeta(metaKey),since=lp&&lp.uid===uid?lp.at:'1970-01-01T00:00:00Z';
    /* 1. Scarico quello che è cambiato altrove: vince la modifica più recente */
    const {data,error}=await sb.from(table).select('id,title,data,deleted,updated_at,synced_at').gt('synced_at',since).order('synced_at');
    if(error)throw error;
    let max=since;const changed=[],moved=[];
    if(isBeffe&&!(lp&&lp.uid===uid)){ // primo giro con la tabella delle beffe: ci porto quelle che avevo già
      allRecs.filter(r=>r.kind==='beffa').forEach(r=>{r.dirty=true;r.fromSongs=true;});
    }
    for(const row of data||[]){
      if(row.synced_at>max)max=row.synced_at;
      const ts=Date.parse(row.updated_at),loc=allRecs.find(r=>r.id===row.id);
      const strayBeffa=!isBeffe&&row.data&&row.data.kind==='beffa'; // beffe salvate per errore tra gli spartiti
      if(!isBeffe&&loc&&loc.kind==='beffa'&&(row.deleted||strayBeffa)){if(strayBeffa&&!loc.fromSongs){loc.fromSongs=true;loc.dirty=true;changed.push(loc);}continue;}
      if(loc&&loc.dirty&&(loc.updatedAt||0)>ts)continue;
      let rec;
      if(row.deleted||!row.data)rec={id:row.id,title:row.title,deleted:true,updatedAt:ts,dirty:false};
      else rec=Object.assign({},row.data,{id:row.id,title:row.title,deleted:false,updatedAt:ts,dirty:false});
      if(isBeffe)rec.kind='beffa';
      if(strayBeffa)Object.assign(rec,{kind:'beffa',dirty:true,fromSongs:true}); // la porto nella tabella delle beffe
      changed.push(rec);upsertMem(rec);
    }
    if(changed.length)await Store.putMany(changed);
    /* 2. Invio le modifiche fatte su questo dispositivo */
    const dirty=allRecs.filter(r=>r.dirty&&mine(r));
    const rows=dirty.map(r=>({user_id:uid,id:r.id,title:String(r.title||'').slice(0,200),deleted:!!r.deleted,
      data:r.deleted?null:recPayload(r,isBeffe),updated_at:new Date(r.updatedAt||Date.now()).toISOString()}));
    if(rows.length){const {error:e2}=await sb.from(table).upsert(rows,{onConflict:'user_id,id'});if(e2)throw e2;}
    if(isBeffe)dirty.forEach(r=>{if(r.fromSongs){moved.push(r.id);delete r.fromSongs;}}); // solo ora che sono al sicuro nella loro tabella
    if(moved.length){ // tolgo dagli spartiti le beffe che ora stanno nella loro tabella
      const now=new Date().toISOString();
      const {error:e3}=await sb.from('songs').upsert(moved.map(id=>({user_id:uid,id,title:'',deleted:true,data:null,updated_at:now})),{onConflict:'user_id,id'});
      if(e3)throw e3;
    }
    if(dirty.length){
      dirty.forEach(r=>{r.dirty=false;});
      const gone=dirty.filter(r=>r.deleted);allRecs=allRecs.filter(r=>!gone.includes(r));
      await Store.putMany(dirty);
    }
    await Store.setMeta(metaKey,{uid,at:max});
  },
  async sync(){
    if(!this.user||!navigator.onLine)return;
    if(this.busy){this.again=true;return;}
    this.busy=true;uiCloud('Sincronizzo…');
    const errs=[];
    try{
      await storeReady;
      const sb=await this.client(),uid=this.user.id;
      for(const table of ['songs','mockeries']){
        try{await this.syncTable(sb,uid,table);}catch(e){errs.push([table,String(e&&e.message||e)]);}
      }
      if(errs.length<2)await Store.setMeta('lastSync',Date.now());
      if(!songsSheet.hidden)renderSongList();
      if(typeof mkRefresh==='function')mkRefresh();
    }catch(e){errs.push(['',String(e&&e.message||e)]);}
    finally{
      this.busy=false;
      if(!errs.length)uiCloud();
      else{
        const [table,m]=errs[0];
        uiCloud(/fetch|network|Failed/i.test(m)?'Il cloud non risponde: riprovo più tardi. Spartiti e beffe restano salvati qui.'
          :/row-level security|permission denied/i.test(m)?'Questo account non è abilitato alla sincronizzazione.'
          :/relation|schema|does not exist|Could not find/i.test(m)?(table==='mockeries'
            ?'Gli spartiti sono sincronizzati, ma nel progetto Supabase manca la tabella delle beffe: esegui lo script supabase/mockeries.sql.'
            :'Nel progetto Supabase manca la tabella degli spartiti: esegui lo script supabase/schema.sql.')
          :'Sincronizzazione non riuscita: '+m);
      }
      if(this.again){this.again=false;this.schedule(500);}
    }
  }

};
/* Contenuto di un record da salvare nel cloud: tutto tranne i campi di servizio */
function recPayload(r,dropKind){const o={};for(const k in r)if(!['id','title','deleted','dirty','updatedAt','fromSongs'].includes(k)&&!(dropKind&&k==='kind'))o[k]=r[k];return o;}
function cloudMsg(t){const el=$('#cloudMsg');el.textContent=t||'';el.hidden=!t;}
async function uiCloud(status){
  if(!Cloud.enabled())return;
  const inn=!!Cloud.user,waiting=!inn&&!!Cloud.email;
  $('#cloudOut').hidden=inn||waiting;$('#cloudCode').hidden=!waiting;$('#cloudIn').hidden=!inn;
  if(inn)$('#cloudEmail').textContent=Cloud.user.email||'';
  if(status!==undefined){cloudMsg(status);return;}
  if(inn){
    const last=await Store.getMeta('lastSync'),pend=allRecs.filter(r=>r.dirty).length;
    cloudMsg((last?'Ultima sincronizzazione alle '+new Date(last).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})+'.':'Non ancora sincronizzato.')
      +(pend?' '+(pend===1?'1 modifica in attesa.':pend+' modifiche in attesa.'):''));
  }else if(!waiting)cloudMsg(Cloud.err);
}
$('#cloudSend').addEventListener('click',async()=>{
  const email=$('#cloudMail').value.trim();
  if(!/^\S+@\S+\.\S+$/.test(email)){cloudMsg('Scrivi un indirizzo email valido.');return;}
  $('#cloudSend').disabled=true;cloudMsg('Invio il codice…');
  try{await Cloud.sendCode(email);uiCloud();cloudMsg('Ti ho mandato un’email: scrivi qui il codice, oppure apri il link dallo stesso dispositivo.');$('#cloudOtp').focus();}
  catch(e){const m=String(e&&e.message||e);cloudMsg(/database error|non abilitata|signups? not allowed|not allowed/i.test(m)?'Questa email non è abilitata alla sincronizzazione.':'Non riesco a mandare il codice: '+m);}
  finally{$('#cloudSend').disabled=false;}
});
$('#cloudVerify').addEventListener('click',async()=>{
  const code=$('#cloudOtp').value.replace(/\D/g,'');
  if(code.length<6){cloudMsg('Il codice è di almeno 6 cifre.');return;}
  $('#cloudVerify').disabled=true;cloudMsg('Controllo il codice…');
  try{await Cloud.verify(code);Cloud.email='';$('#cloudOtp').value='';uiCloud();}
  catch(e){cloudMsg('Codice non valido o scaduto. Controlla l’email o chiedine un altro.');}
  finally{$('#cloudVerify').disabled=false;}
});
$('#cloudBack').addEventListener('click',()=>{Cloud.email='';uiCloud();cloudMsg('');});
$('#cloudNow').addEventListener('click',()=>Cloud.sync());
$('#cloudExit').addEventListener('click',async()=>{
  if(await askConfirm('Uscire dall’account? Gli spartiti restano su questo dispositivo.','Esci'))Cloud.signOut();
});
