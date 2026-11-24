/* ---------- Beffa crudele: insulti da bardo, con filtri, preferiti, editor e ba-dum-tss ---------- */
const BEFFE=__BEFFE__;
const MK_LABEL={
  cat:{any:'Chiunque',umanoidi:'Guerrieri e banditi',goblin:'Goblin e coboldi',maghi:'Maghi',spettri:'Spettri',nonmorti:'Zombie e scheletri',draghi:'Draghi',demoni:'Demoni',mostri:'Mostruosità',boss:'Boss finale',oggetti:'Oggetti animati',fey:'Fate e Feywild'},
  moment:{any:'Sempre',ingresso:'Appena compare',manca:'Manca un colpo',incantesimo:'Sbaglia una magia',ferito:'Viene ferito',terra:'Cade a terra',curato:'Viene curato',rinforzi:'Arrivano rinforzi',monologo:'Fa il monologo'},
  style:{any:'Sorpresa',standup:'Stand-up',roast:'Roast cattivo',assurdo:'Assurdo',crowd:'Al pubblico',autore:'D’autore'},
  topic:{any:'Qualsiasi',aspetto:'Aspetto',puzza:'Puzza',incompetenza:'Incompetenza',stupidita:'Stupidità',ego:'Ego',famiglia:'Famiglia',morte:'Morte',meta:'Meta e dadi',fortuna:'Sfortuna',atteggiamento:'Atteggiamento',fiabe:'Fiabe e Feywild'}
};
const MK_HEAT=['Pulita','Colorita','Senza filtri'];
if(!S.mk)S.mk={cat:'any',moment:'any',style:'any',topic:'any',heat:1,fav:[],hist:[],tab:'hist'};
const MK=S.mk;MK.fav=MK.fav||[];MK.hist=MK.hist||[];
let mkCurJ=null,mkCache=null;

/* Elenco effettivo: le beffe incluse, sostituite o nascoste dalle tue modifiche, più quelle che hai scritto tu */
const mkJoke=r=>({text:r.text,cat:r.cat||'any',moment:r.moment||'any',style:r.style||'standup',heat:+r.heat||0,topic:r.topic||'any',src:r.src||'',rec:r});
function mkAll(){
  if(mkCache)return mkCache;
  const mine=liveBeffe(),over=new Map();
  mine.forEach(r=>{if(r.base)over.set(r.base,r);});
  const list=[];
  for(const j of BEFFE){const o=over.get(j.text);if(!o)list.push(j);else if(!o.hidden)list.push(mkJoke(o));}
  mine.forEach(r=>{if(!r.base&&!r.hidden)list.push(mkJoke(r));});
  return mkCache=list;
}
function beffaRec(s){
  return{id:s.id||'b'+newId(),kind:'beffa',title:String(s.text||'').slice(0,200),text:String(s.text||'').slice(0,240),
    cat:MK_LABEL.cat[s.cat]?s.cat:'any',moment:MK_LABEL.moment[s.moment]?s.moment:'any',
    style:MK_LABEL.style[s.style]&&s.style!=='any'?s.style:'standup',heat:Math.max(0,Math.min(2,+s.heat||0)),
    topic:MK_LABEL.topic[s.topic]?s.topic:'any',src:String(s.src||'').slice(0,80),base:s.base||undefined,hidden:!!s.hidden};
}
const mkFind=t=>mkAll().find(j=>j.text===t);

/* Sceglie tra le beffe più adatte ai filtri, senza ripetere quelle appena uscite */
function mkScore(j){
  const f=MK;
  if(j.heat>f.heat)return -Infinity;
  if(f.topic!=='any'&&j.topic!==f.topic)return -Infinity;
  if(f.style==='autore'&&j.style!=='autore')return -Infinity;
  if(f.cat!=='any'&&j.cat!=='any'&&j.cat!==f.cat)return -Infinity;
  if(f.moment!=='any'&&j.moment!=='any'&&j.moment!==f.moment)return -Infinity;
  if(f.cat==='any'&&j.cat!=='any')return -Infinity;
  if(f.moment==='any'&&j.moment!=='any')return -Infinity;
  let s=0;
  if(f.cat!=='any'&&j.cat===f.cat)s+=5;
  if(f.moment!=='any'&&j.moment===f.moment)s+=7;
  if(f.style!=='any')s+=j.style===f.style?3.5:-1.5;
  if(f.topic!=='any')s+=1;
  if(f.heat===2&&j.heat===2)s+=1.2;else if(f.heat===1&&j.heat===1)s+=.6;
  if(j.rec)s+=.5; // le tue escono un po' più spesso
  return s;
}
function mkGenerate(){
  const all=mkAll(),sc=all.map(mkScore),best=Math.max(...sc);
  let pool=sc.map((s,i)=>({j:all[i],s})).filter(x=>Number.isFinite(x.s)&&x.s>=best-5);
  if(!pool.length){mkCurJ=null;mkShow(null);return;}
  const recent=new Set(MK.hist.slice(0,Math.min(20,Math.max(2,pool.length-1))));
  const fresh=pool.filter(x=>!recent.has(x.j.text)&&x.j!==mkCurJ);
  if(fresh.length)pool=fresh;
  const w=x=>Math.exp((x.s-best)/3),tot=pool.reduce((a,x)=>a+w(x),0);let r=Math.random()*tot,pick=pool[0];
  for(const x of pool){r-=w(x);if(r<=0){pick=x;break;}}
  mkCurJ=pick.j;const t=pick.j.text;
  MK.hist=[t,...MK.hist.filter(x=>x!==t)].slice(0,30);save();
  mkShow(pick.j);mkRenderList();
}
function mkShow(j){
  const q=$('#mkQuote');q.classList.remove('reveal');void q.offsetWidth;q.classList.add('reveal');
  $('#mkEditBtn').hidden=!j;
  if(!j){q.textContent='Nessuna beffa con questi filtri. Prova ad allargarli o ad alzare la volgarità.';$('#mkSrc').textContent='';$('#mkTags').innerHTML='';mkFavUI();return;}
  q.textContent=j.text;
  $('#mkSrc').textContent=j.src?'— '+j.src:'';
  const tags=[MK_LABEL.style[j.style],j.cat!=='any'?MK_LABEL.cat[j.cat]:null,j.moment!=='any'?MK_LABEL.moment[j.moment]:null,j.topic!=='any'?MK_LABEL.topic[j.topic]:null,MK_HEAT[j.heat],
    j.rec?(j.rec.base?'Modificata da te':'Scritta da te'):null].filter(Boolean);
  $('#mkTags').innerHTML=tags.map(t=>'<span>'+esc(t)+'</span>').join('');
  mkFavUI();
}
const mkCurText=()=>mkCurJ?mkCurJ.text:null;
function mkFavUI(){
  const on=!!mkCurText()&&MK.fav.includes(mkCurText());
  $('#mkFav').setAttribute('aria-pressed',on);$('#mkFav').setAttribute('aria-label',on?'Togli dai preferiti':'Aggiungi ai preferiti');
  $('#mkFavCount').textContent=MK.fav.length?' ('+MK.fav.length+')':'';
  const n=liveBeffe().length;$('#mkMineCount').textContent=n?' ('+n+')':'';
}
function mkToggleFav(t){
  if(!t)return;
  MK.fav=MK.fav.includes(t)?MK.fav.filter(x=>x!==t):[t,...MK.fav];save();mkFavUI();mkRenderList();
}
function mkListItems(){
  if(MK.tab==='fav')return MK.fav;
  if(MK.tab==='mine')return liveBeffe().map(r=>r.text);
  return MK.hist.slice(1);
}
function mkRenderList(){
  document.querySelectorAll('#mkTabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.t===MK.tab));
  $('#mkNew').hidden=MK.tab!=='mine';
  const ul=$('#mkList'),list=mkListItems();
  if(!list.length){
    ul.innerHTML='<li class="mk-empty">'+({fav:'Tocca il cuore su una beffa per tenerla qui, pronta per la prossima sessione.',mine:'Qui trovi le beffe che scrivi tu e quelle che hai modificato. Per modificarne una, tocca la matita sulla beffa in alto.',hist:'Le beffe che generi compaiono qui.'}[MK.tab])+'</li>';
    return;
  }
  const mineRecs=MK.tab==='mine'?liveBeffe():null;
  ul.innerHTML=list.map((t,k)=>{
    const r=mineRecs?mineRecs[k]:null,j=r?mkJoke(r):mkFind(t);
    const note=r?(r.hidden?'Nascosta: non esce più tra le beffe':r.base?'Modificata da te':'Scritta da te'):(j&&j.src?'— '+j.src:'');
    const btns=r?'<button class="mini ghost" data-edit="'+k+'" aria-label="Modifica">'+MK_ICON.edit+'</button>'
      :'<button class="mini ghost" data-say="'+k+'" aria-label="Leggi ad alta voce">'+MK_ICON.say+'</button><button class="mini ghost" data-copy="'+k+'" aria-label="Copia">'+MK_ICON.copy+'</button>'
       +'<button class="mini ghost" data-fav="'+k+'" aria-label="'+(MK.fav.includes(t)?'Togli dai preferiti':'Aggiungi ai preferiti')+'" aria-pressed="'+MK.fav.includes(t)+'">'+MK_ICON.heart+'</button>';
    return '<li'+(r&&r.hidden?' class="mk-hidden"':'')+'><p>'+esc(t)+(note?'<small>'+esc(note)+'</small>':'')+'</p><span class="pair">'+btns+'</span></li>';
  }).join('');
}
/* Dopo una sincronizzazione o un salvataggio: ricalcola l’elenco e aggiorna quello che si vede */
function mkRefresh(){
  mkCache=null;
  if(mkCurJ){const j=mkFind(mkCurJ.text);if(j)mkCurJ=j;}
  if(!mockEl.hidden){if(mkCurJ)mkShow(mkCurJ);mkRenderList();}
  mkCount();
}
const MK_ICON={
  heart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  say:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>'
};
async function mkCopy(t){
  if(!t)return;
  let ok=false;
  try{await navigator.clipboard.writeText(t);ok=true;}catch(_){
    const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
    try{ok=document.execCommand('copy');}catch(__){}ta.remove();}
  mkToast(ok?'Copiata':'Non riesco a copiare qui');
}
/* Voce italiana del dispositivo, quando c'è */
const mkSpeech='speechSynthesis' in window;
function mkSay(t){
  if(!t||!mkSpeech)return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(t);u.lang='it-IT';u.rate=1.02;u.pitch=.95;
  const v=speechSynthesis.getVoices().find(x=>/^it/i.test(x.lang));if(v)u.voice=v;
  speechSynthesis.speak(u);
}
/* Ba-dum-tss con il tamburello */
function mkRimshot(){
  initAudio();
  ensureBank('tamb').then(()=>{
    const t=ctx.currentTime+.02;
    tambHit(.55,'low',t);tambHit(.65,'low',t+.17);tambHit(1.1,'hit',t+.42);tambHit(.9,'fast',t+.47);tambHit(.6,'fast',t+.56);
  }).catch(()=>{});
}
let mkToastT=0;
function mkToast(t){const el=$('#mkToast');el.textContent=t;el.hidden=false;clearTimeout(mkToastT);mkToastT=setTimeout(()=>{el.hidden=true;},1600);}

/* ---------- Editor delle beffe ---------- */
const mkEdit=$('#mkEdit'),mkScrim=$('#mkScrim');
const MKE={j:null,heat:1};
function mkEditOpen(j){
  MKE.j=j||null;const r=j&&j.rec;
  $('#mkEditTitle').textContent=j?'Modifica beffa':'Nuova beffa';
  $('#mkEText').value=j?j.text:'';
  $('#mkECat').value=j?j.cat:(MK.cat||'any');$('#mkEMoment').value=j?j.moment:(MK.moment||'any');
  $('#mkEStyle').value=j?j.style:(MK.style!=='any'?MK.style:'standup');$('#mkETopic').value=j?j.topic:(MK.topic||'any');
  $('#mkESrc').value=j?j.src||'':'';
  MKE.heat=j?j.heat:Math.min(1,MK.heat);mkEHeatUI();
  const del=$('#mkEDel'),alt=$('#mkEAlt');
  alt.hidden=true;del.hidden=false;
  if(!j)del.hidden=true;
  else if(!r){del.textContent='Nascondi questa beffa';}
  else if(r.base){del.textContent='Ripristina l’originale';alt.hidden=false;alt.textContent=r.hidden?'Mostrala di nuovo':'Nascondila';}
  else del.textContent='Elimina questa beffa';
  if(r&&r.hidden&&!r.base){alt.hidden=false;alt.textContent='Mostrala di nuovo';}
  $('#mkENote').textContent=!j?'Scrivila come la diresti al tavolo: la battuta migliore va in fondo.'
    :!r?'Questa beffa è inclusa nell’app: salvando, la tua versione prende il suo posto.'
    :r.base?'È la tua versione di una beffa inclusa nell’app.':'';
  mkECount();
  mkEdit.hidden=false;mkScrim.hidden=false;$('#mkEText').focus();
}
function mkEditClose(){mkEdit.hidden=true;mkScrim.hidden=true;}
function mkEHeatUI(){document.querySelectorAll('#mkEHeat button').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.h===MKE.heat));}
function mkECount(){const n=$('#mkEText').value.length;$('#mkECount').textContent=n+' / 240';}
function mkRenameRefs(from,to){
  if(!from||from===to)return;
  MK.fav=MK.fav.map(t=>t===from?to:t);MK.hist=MK.hist.map(t=>t===from?to:t);save();
}
async function mkEditSave(){
  const text=$('#mkEText').value.replace(/\s+/g,' ').trim();
  if(!text){$('#mkENote').textContent='Scrivi il testo della beffa prima di salvare.';$('#mkEText').focus();return;}
  const dup=mkAll().find(x=>x.text===text&&x!==MKE.j);
  if(dup){$('#mkENote').textContent='Esiste già una beffa con questo testo.';return;}
  const j=MKE.j,old=j?j.text:null,r0=j&&j.rec;
  const rec=beffaRec({id:r0?r0.id:undefined,text,cat:$('#mkECat').value,moment:$('#mkEMoment').value,style:$('#mkEStyle').value,
    topic:$('#mkETopic').value,heat:MKE.heat,src:$('#mkESrc').value.trim(),base:r0?r0.base:(j?j.text:undefined),hidden:false});
  if(!(await saveSong(rec)))return;
  mkRenameRefs(old,text);
  mkCache=null;mkCurJ=mkFind(text)||mkJoke(rec);
  mkEditClose();mkShow(mkCurJ);mkRenderList();mkCount();
  mkToast(j?'Beffa salvata':'Beffa aggiunta');
}
async function mkEditDelete(){
  const j=MKE.j;if(!j)return;const r=j.rec;
  if(!r){ // beffa inclusa: la nascondo con un record che la sostituisce
    if(!(await askConfirm('Nascondere questa beffa? Non uscirà più. La ritrovi in «Le mie», da dove puoi mostrarla di nuovo.','Nascondi')))return;
    await saveSong(beffaRec(Object.assign({},j,{base:j.text,hidden:true})));
    mkToast('Beffa nascosta');
  }else if(r.base){
    if(!(await askConfirm('Tornare alla versione originale di questa beffa? Le tue modifiche andranno perse.','Ripristina')))return;
    const orig=BEFFE.find(x=>x.text===r.base);await deleteSong(r.id);
    if(orig)mkRenameRefs(r.text,orig.text);
    mkToast('Originale ripristinato');
  }else{
    if(!(await askConfirm('Eliminare questa beffa? Non si può annullare.','Elimina')))return;
    await deleteSong(r.id);MK.fav=MK.fav.filter(t=>t!==r.text);save();
    mkToast('Beffa eliminata');
  }
  mkEditClose();mkCache=null;
  if(mkCurJ&&mkCurJ.text===j.text){const again=mkFind(r&&r.base?r.base:j.text);mkCurJ=again&&!(again.rec&&again.rec.hidden)?again:null;}
  if(mkCurJ)mkShow(mkCurJ);else mkGenerate();
  mkRenderList();mkCount();
}
async function mkEditAlt(){
  const r=MKE.j&&MKE.j.rec;if(!r)return;
  r.hidden=!r.hidden;await saveSong(r);
  mkEditClose();mkRefresh();mkToast(r.hidden?'Beffa nascosta':'Di nuovo tra le beffe');
}

function mkFillSelects(){
  [['mkCat','cat'],['mkMoment','moment'],['mkStyle','style'],['mkTopic','topic']].forEach(([id,k])=>{
    const sel=$('#'+id);sel.innerHTML=Object.entries(MK_LABEL[k]).map(([v,l])=>'<option value="'+v+'">'+esc(l)+'</option>').join('');sel.value=MK[k];
    sel.addEventListener('change',()=>{MK[k]=sel.value;save();mkGenerate();});
  });
  [['mkECat','cat'],['mkEMoment','moment'],['mkEStyle','style'],['mkETopic','topic']].forEach(([id,k])=>{
    $('#'+id).innerHTML=Object.entries(MK_LABEL[k]).filter(([v])=>!(k==='style'&&v==='any'))
      .map(([v,l])=>'<option value="'+v+'">'+esc(k==='topic'&&v==='any'?'Generica':l)+'</option>').join('');
  });
  document.querySelectorAll('#mkHeat button').forEach(b=>b.addEventListener('click',()=>{MK.heat=+b.dataset.h;save();mkHeatUI();mkGenerate();}));
  document.querySelectorAll('#mkEHeat button').forEach(b=>b.addEventListener('click',()=>{MKE.heat=+b.dataset.h;mkEHeatUI();}));
  mkHeatUI();mkCount();
}
function mkCount(){
  const mine=liveBeffe().filter(r=>!r.base&&!r.hidden).length;
  $('#mkCount').textContent=BEFFE.length+' beffe incluse, di cui '+BEFFE.filter(j=>j.style==='autore').length+' d’autore da Shakespeare, Dante e Rabelais'
    +(mine?', più '+mine+(mine===1?' scritta da te':' scritte da te'):'')+'. Funzionano anche offline.';
}
function mkHeatUI(){document.querySelectorAll('#mkHeat button').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.h===MK.heat));}
const mockEl=$('#mock');
function openMock(){
  closeSongs();if(!sheet.hidden)closeSheet();
  mockEl.hidden=false;document.documentElement.classList.add('mocking');
  storeReady.then(()=>{mkCache=null;if(mkCurJ==null)mkGenerate();else{mkShow(mkCurJ);mkRenderList();}mkCount();});
  $('#mkGo').focus();
}
function closeMock(){if(mockEl.hidden)return;mkEditClose();mockEl.hidden=true;document.documentElement.classList.remove('mocking');if(mkSpeech)speechSynthesis.cancel();$('#mockBtn').focus();}
mkFillSelects();
if(!mkSpeech){$('#mkSay').hidden=true;}
$('#mockBtn').addEventListener('click',openMock);
$('#mkClose').addEventListener('click',closeMock);
$('#mkGo').addEventListener('click',mkGenerate);
$('#mkFav').addEventListener('click',()=>mkToggleFav(mkCurText()));
$('#mkCopy').addEventListener('click',()=>mkCopy(mkCurText()));
$('#mkSay').addEventListener('click',()=>mkSay(mkCurText()));
$('#mkDrum').addEventListener('click',mkRimshot);
$('#mkEditBtn').addEventListener('click',()=>{if(mkCurJ)mkEditOpen(mkCurJ);});
$('#mkNew').addEventListener('click',()=>mkEditOpen(null));
$('#mkEditSave').addEventListener('click',mkEditSave);
$('#mkECancel').addEventListener('click',mkEditClose);
$('#mkEDel').addEventListener('click',mkEditDelete);
$('#mkEAlt').addEventListener('click',mkEditAlt);
$('#mkEText').addEventListener('input',mkECount);
mkScrim.addEventListener('click',mkEditClose);
document.querySelectorAll('#mkTabs button').forEach(b=>b.addEventListener('click',()=>{MK.tab=b.dataset.t;save();mkRenderList();}));
$('#mkList').addEventListener('click',ev=>{
  const b=ev.target.closest('button');if(!b)return;
  const list=mkListItems();
  if(b.dataset.copy!=null)mkCopy(list[+b.dataset.copy]);
  else if(b.dataset.say!=null)mkSay(list[+b.dataset.say]);
  else if(b.dataset.fav!=null)mkToggleFav(list[+b.dataset.fav]);
  else if(b.dataset.edit!=null){const r=liveBeffe()[+b.dataset.edit];if(r)mkEditOpen(mkJoke(r));}
});
document.addEventListener('keydown',ev=>{
  if(mockEl.hidden)return;
  ev.stopPropagation();
  if(!$('#ask').hidden){if(ev.key==='Escape')$('#askNo').click();return;}
  if(ev.key==='Escape'){if(!mkEdit.hidden)mkEditClose();else closeMock();return;}
  if(!mkEdit.hidden||/^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName))return;
  if(ev.target.tagName==='BUTTON'&&ev.key===' ')return;
  if(ev.key===' '){mkGenerate();ev.preventDefault();}
  else if(ev.key==='c'||ev.key==='C'){mkCopy(mkCurText());}
  else if(ev.key==='f'||ev.key==='F'){mkToggleFav(mkCurText());}
  else if(ev.key==='e'||ev.key==='E'){if(mkCurJ)mkEditOpen(mkCurJ);ev.preventDefault();}
},true);
