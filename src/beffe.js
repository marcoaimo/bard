/* ---------- Beffa crudele: insulti da bardo, con filtri, preferiti e ba-dum-tss ---------- */
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
let mkCur=null;

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
  return s;
}
function mkGenerate(){
  const sc=BEFFE.map(mkScore),best=Math.max(...sc);
  let pool=sc.map((s,i)=>({i,s})).filter(x=>Number.isFinite(x.s)&&x.s>=best-5);
  if(!pool.length){mkShow(null);return;}
  const recent=new Set(MK.hist.slice(0,Math.min(20,Math.max(2,pool.length-1))));
  const fresh=pool.filter(x=>!recent.has(BEFFE[x.i].text)&&x.i!==mkCur);
  if(fresh.length)pool=fresh;
  const tot=pool.reduce((a,x)=>a+Math.exp((x.s-best)/3),0);let r=Math.random()*tot,pick=pool[0];
  for(const x of pool){r-=Math.exp((x.s-best)/3);if(r<=0){pick=x;break;}}
  mkCur=pick.i;const t=BEFFE[pick.i].text;
  MK.hist=[t,...MK.hist.filter(x=>x!==t)].slice(0,30);save();
  mkShow(BEFFE[pick.i]);mkRenderList();
}
function mkShow(j){
  const q=$('#mkQuote');q.classList.remove('reveal');void q.offsetWidth;q.classList.add('reveal');
  if(!j){q.textContent='Nessuna beffa con questi filtri. Prova ad allargarli o ad alzare la volgarità.';$('#mkSrc').textContent='';$('#mkTags').innerHTML='';mkFavUI();return;}
  q.textContent=j.text;
  $('#mkSrc').textContent=j.src?'— '+j.src:'';
  const tags=[MK_LABEL.style[j.style],j.cat!=='any'?MK_LABEL.cat[j.cat]:null,j.moment!=='any'?MK_LABEL.moment[j.moment]:null,j.topic!=='any'?MK_LABEL.topic[j.topic]:null,MK_HEAT[j.heat]].filter(Boolean);
  $('#mkTags').innerHTML=tags.map(t=>'<span>'+esc(t)+'</span>').join('');
  mkFavUI();
}
const mkCurText=()=>mkCur==null?null:BEFFE[mkCur].text;
function mkFavUI(){
  const on=!!mkCurText()&&MK.fav.includes(mkCurText());
  $('#mkFav').setAttribute('aria-pressed',on);$('#mkFav').setAttribute('aria-label',on?'Togli dai preferiti':'Aggiungi ai preferiti');
  $('#mkFavCount').textContent=MK.fav.length?' ('+MK.fav.length+')':'';
}
function mkToggleFav(t){
  if(!t)return;
  MK.fav=MK.fav.includes(t)?MK.fav.filter(x=>x!==t):[t,...MK.fav];save();mkFavUI();mkRenderList();
}
function mkRenderList(){
  const list=MK.tab==='fav'?MK.fav:MK.hist.slice(1);
  document.querySelectorAll('#mkTabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.t===MK.tab));
  const ul=$('#mkList');
  if(!list.length){ul.innerHTML='<li class="mk-empty">'+(MK.tab==='fav'?'Tocca il cuore su una beffa per tenerla qui, pronta per la prossima sessione.':'Le beffe che generi compaiono qui.')+'</li>';return;}
  ul.innerHTML=list.map((t,k)=>{const j=BEFFE.find(x=>x.text===t);
    return '<li><p>'+esc(t)+(j&&j.src?'<small>— '+esc(j.src)+'</small>':'')+'</p><span class="pair"><button class="mini ghost" data-say="'+k+'" aria-label="Leggi ad alta voce">'+MK_ICON.say+'</button><button class="mini ghost" data-copy="'+k+'" aria-label="Copia">'+MK_ICON.copy+'</button>'
      +'<button class="mini ghost" data-fav="'+k+'" aria-label="'+(MK.fav.includes(t)?'Togli dai preferiti':'Aggiungi ai preferiti')+'" aria-pressed="'+MK.fav.includes(t)+'">'+MK_ICON.heart+'</button></span></li>';}).join('');
  ul.dataset.src=MK.tab;
}
const MK_ICON={
  heart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  say:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  drum:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="13" rx="8" ry="3"/><path d="M4 13v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4"/><path d="M8 3l3 7M17 3l-3 7"/></svg>'
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

function mkFillSelects(){
  [['mkCat','cat'],['mkMoment','moment'],['mkStyle','style'],['mkTopic','topic']].forEach(([id,k])=>{
    const sel=$('#'+id);sel.innerHTML=Object.entries(MK_LABEL[k]).map(([v,l])=>'<option value="'+v+'">'+esc(l)+'</option>').join('');sel.value=MK[k];
    sel.addEventListener('change',()=>{MK[k]=sel.value;save();mkGenerate();});
  });
  document.querySelectorAll('#mkHeat button').forEach(b=>b.addEventListener('click',()=>{MK.heat=+b.dataset.h;save();mkHeatUI();mkGenerate();}));
  mkHeatUI();
  $('#mkCount').textContent=BEFFE.length+' beffe in italiano, di cui '+BEFFE.filter(j=>j.style==='autore').length+' d’autore da Shakespeare, Dante e Rabelais. Funzionano anche offline.';
}
function mkHeatUI(){document.querySelectorAll('#mkHeat button').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.h===MK.heat));}
const mockEl=$('#mock');
function openMock(){
  closeSongs();closeSheet&&!sheet.hidden&&closeSheet();
  mockEl.hidden=false;document.documentElement.classList.add('mocking');
  if(mkCur==null)mkGenerate();else{mkShow(BEFFE[mkCur]);mkRenderList();}
  $('#mkGo').focus();
}
function closeMock(){if(mockEl.hidden)return;mockEl.hidden=true;document.documentElement.classList.remove('mocking');if(mkSpeech)speechSynthesis.cancel();$('#mockBtn').focus();}
mkFillSelects();
if(!mkSpeech){$('#mkSay').hidden=true;}
$('#mockBtn').addEventListener('click',openMock);
$('#mkClose').addEventListener('click',closeMock);
$('#mkGo').addEventListener('click',mkGenerate);
$('#mkFav').addEventListener('click',()=>mkToggleFav(mkCurText()));
$('#mkCopy').addEventListener('click',()=>mkCopy(mkCurText()));
$('#mkSay').addEventListener('click',()=>mkSay(mkCurText()));
$('#mkDrum').addEventListener('click',mkRimshot);
document.querySelectorAll('#mkTabs button').forEach(b=>b.addEventListener('click',()=>{MK.tab=b.dataset.t;save();mkRenderList();}));
$('#mkList').addEventListener('click',ev=>{
  const b=ev.target.closest('button');if(!b)return;
  const list=MK.tab==='fav'?MK.fav:MK.hist.slice(1);
  if(b.dataset.copy!=null)mkCopy(list[+b.dataset.copy]);
  else if(b.dataset.say!=null)mkSay(list[+b.dataset.say]);
  else if(b.dataset.fav!=null)mkToggleFav(list[+b.dataset.fav]);
});
document.addEventListener('keydown',ev=>{
  if(mockEl.hidden)return;
  if(ev.key==='Escape'){closeMock();return;}
  if(/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(ev.target.tagName)&&ev.key===' ')return;
  if(ev.key===' '){mkGenerate();ev.preventDefault();}
  else if(ev.key==='c'||ev.key==='C'){mkCopy(mkCurText());}
  else if(ev.key==='f'||ev.key==='F'){mkToggleFav(mkCurText());}
  ev.stopPropagation();
},true);
