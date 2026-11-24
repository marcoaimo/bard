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
    this.user=null;await Store.setMeta('lastPull',null);uiCloud();
  },
  schedule(ms){
    if(!this.user)return;
    clearTimeout(this.timer);this.timer=setTimeout(()=>this.sync(),ms==null?1500:ms);
  },
  async sync(){
    if(!this.user||!navigator.onLine)return;
    if(this.busy){this.again=true;return;}
    this.busy=true;uiCloud('Sincronizzo…');
    try{
      await storeReady;
      const sb=await this.client(),uid=this.user.id;
      const lp=await Store.getMeta('lastPull'),since=lp&&lp.uid===uid?lp.at:'1970-01-01T00:00:00Z';
      /* 1. Scarico quello che è cambiato altrove: vince la modifica più recente */
      const {data,error}=await sb.from('songs').select('id,title,data,deleted,updated_at,synced_at').gt('synced_at',since).order('synced_at');
      if(error)throw error;
      let max=since;const changed=[];
      for(const row of data||[]){
        if(row.synced_at>max)max=row.synced_at;
        const ts=Date.parse(row.updated_at),loc=allRecs.find(r=>r.id===row.id);
        if(loc&&loc.dirty&&(loc.updatedAt||0)>ts)continue;
        const rec=row.deleted||!row.data?{id:row.id,title:row.title,deleted:true,updatedAt:ts,dirty:false}
          :{id:row.id,title:row.title,by:row.data.by,bpm:row.data.bpm,meter:row.data.meter,ev:row.data.ev,deleted:false,updatedAt:ts,dirty:false};
        changed.push(rec);upsertMem(rec);
      }
      if(changed.length)await Store.putMany(changed);
      /* 2. Invio le modifiche fatte su questo dispositivo */
      const dirty=allRecs.filter(r=>r.dirty);
      if(dirty.length){
        const rows=dirty.map(r=>({user_id:uid,id:r.id,title:String(r.title||'').slice(0,200),deleted:!!r.deleted,
          data:r.deleted?null:{by:r.by||'',bpm:r.bpm,meter:r.meter||[4,4],ev:r.ev},updated_at:new Date(r.updatedAt||Date.now()).toISOString()}));
        const {error:e2}=await sb.from('songs').upsert(rows,{onConflict:'user_id,id'});
        if(e2)throw e2;
        dirty.forEach(r=>{r.dirty=false;});
        const gone=dirty.filter(r=>r.deleted);allRecs=allRecs.filter(r=>!gone.includes(r));
        await Store.putMany(dirty);
      }
      await Store.setMeta('lastPull',{uid,at:max});await Store.setMeta('lastSync',Date.now());
      if(!songsSheet.hidden)renderSongList();
      uiCloud();
    }catch(e){
      const m=String(e&&e.message||e);
      uiCloud(/fetch|network|Failed/i.test(m)?'Il cloud non risponde: riprovo più tardi. Gli spartiti restano salvati qui.'
        :/relation|schema|does not exist/i.test(m)?'Nel progetto Supabase manca la tabella degli spartiti: esegui lo script supabase/schema.sql.'
        :'Sincronizzazione non riuscita: '+m);
    }finally{
      this.busy=false;
      if(this.again){this.again=false;this.schedule(500);}
    }
  }
};
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
  catch(e){cloudMsg('Non riesco a mandare il codice: '+(e.message||e));}
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
