/* ---------- Editor: si scrive toccando i fori, si ritocca sul pentagramma ---------- */
const ED={on:false,src:null,isUser:false,seq:[],cur:-1,mode:'insert',dur:1,dot:false,meter:[4,4],undo:[],changed:false,lastT:0,playing:false,timers:[],voices:[]};
const editorEl=$('#editor'),edWrap=$('#edWrap'),edSvg=$('#edStaff');
const DUR_NAMES={4:'semibreve',2:'minima',1:'semiminima',.5:'croma',.25:'semicroma'};
const DOTTED=[6,3,1.5,.75,.375];
const isDotted=d=>DOTTED.some(x=>Math.abs(x-d)<1e-3);
const baseDur=d=>isDotted(d)?d/1.5:d;
function durName(d){
  const b=baseDur(d),k=Object.keys(DUR_NAMES).map(Number).find(x=>Math.abs(x-b)<1e-3);
  if(k==null)return (Math.round(d*100)/100)+' tempi';
  return DUR_NAMES[k]+(isDotted(d)?' puntata':'');
}
function noteIcon(d){
  const hollow=d>=2,stem=d<4,flags=d<=.25?2:d<=.5?1:0;
  let s='<svg viewBox="0 0 22 22" aria-hidden="true"><ellipse cx="8" cy="16" rx="4.6" ry="3.4" transform="rotate(-20 8 16)" '+(hollow?'fill="none" stroke="currentColor" stroke-width="1.6"':'fill="currentColor"')+'/>';
  if(stem)s+='<path d="M12.2 15V3" stroke="currentColor" stroke-width="1.5"/>';
  for(let f=0;f<flags;f++)s+='<path d="M12.2 '+(3+f*4.5)+'c2 2 5 3 4.5 7" fill="none" stroke="currentColor" stroke-width="1.5"/>';
  return s+'</svg>';
}
document.querySelectorAll('#edDurs button[data-d]').forEach(b=>{b.innerHTML=noteIcon(+b.dataset.d);});

/* Conversione tra eventi (tempo assoluto) e sequenza (note e pause una dopo l’altra) */
function toSeq(ev,sh){
  const s=[],e=ev.slice().sort((a,b)=>a.t-b.t);let t=e.length?Math.min(0,e[0].t):0;
  for(let k=0;k<e.length;k++){
    const x=e[k],nx=e[k+1];
    if(x.t>t+1e-3)s.push({d:Math.round((x.t-t)*48)/48,m:[]});
    let d=x.d;if(nx&&nx.t>x.t&&nx.t<x.t+d)d=nx.t-x.t;
    d=Math.max(1/16,Math.round(d*48)/48);
    s.push({d,m:x.m.map(m=>m+sh)});t=x.t+d;
  }
  return s;
}
function fromSeq(){
  const ev=[];let t=0;
  for(const it of ED.seq){if(it.m.length)ev.push({t:Math.round(t*48)/48,d:it.d,m:it.m.slice()});t+=it.d;}
  return ev;
}

function edSnap(){ED.undo.push(JSON.stringify({seq:ED.seq,cur:ED.cur}));if(ED.undo.length>120)ED.undo.shift();ED.changed=true;}
function curDur(){return ED.dur*(ED.dot?1.5:1);}
const editable=()=>ED.on&&S.inst!=='tamb';

function edOpen(src){
  if(S.inst==='tamb'){hintFlash('L’editor funziona con i fiati: scegli un flauto o la cornamusa dal menu in alto.');return;}
  closeSongs();closeSong();
  let sh=0;
  if(src&&src.ev&&src.ev.length){
    const f=fitSong(src);sh=f.sh;
    if(S.inst==='pipes'){S.pnotes=f.pnotes;ctl.pnotes.value=f.pnotes;}
    else{S.key=f.key;S.scale=f.scale;ctl.key.value=f.key;ctl.scale.value=f.scale;}
    save();render();
  }
  Object.assign(ED,{on:true,src:src||null,isUser:!!(src&&allRecs.includes(src)),seq:src?toSeq(src.ev||[],sh):[],
    meter:src&&src.meter?src.meter.slice():[4,4],undo:[],changed:false,mode:'insert',dot:false});
  ED.cur=ED.seq.length-1;
  $('#edTitle').value=src?src.title:'Nuovo brano';$('#edBpm').value=src?Math.round(src.bpm):100;
  editorEl.hidden=false;root.classList.add('editing');
  requestAnimationFrame(()=>{layout();edDraw(true);});edUI();
  if(sh%12)hintFlash('Ho trasposto lo spartito di '+Math.abs(sh)+(Math.abs(sh)===1?' semitono':' semitoni')+' per farlo stare sui fori. Se lo salvi resta in questa tonalità.');
  else if(!src)hintFlash('Scegli la durata qui sopra, poi tocca i fori per scrivere le note. Più fori insieme fanno un accordo.');
}
function edEnd(){edStop();ED.on=false;editorEl.hidden=true;root.classList.remove('editing');requestAnimationFrame(layout);}
async function edClose(){
  if(ED.changed&&!(await askConfirm('Uscire senza salvare le modifiche a questo spartito?','Esci senza salvare')))return;
  edEnd();
}
async function edSave(){
  const ev=fromSeq();
  if(!ev.length){hintFlash('Scrivi almeno una nota prima di salvare.');return;}
  const title=$('#edTitle').value.trim()||'Senza titolo',bpm=Math.max(30,Math.min(300,Math.round(+$('#edBpm').value||100)));
  let rec;
  if(ED.isUser){rec=ED.src;Object.assign(rec,{title,bpm,meter:ED.meter,ev});}
  else rec={id:newId(),title,by:ED.src?'modificato da te':'scritto da te',bpm,meter:ED.meter,ev};
  if(!(await saveSong(rec)))return;
  edEnd();loadSong(rec);hintFlash('Spartito salvato.');
}

/* Inserimento dai fori: un tocco aggiunge una nota, più dita insieme fanno un accordo */
function edInput(m){
  if(!editable())return;
  const now=performance.now(),it=ED.seq[ED.cur];
  if(ED.mode==='insert'&&now-ED.lastT<110&&it&&it.m.length){if(!it.m.includes(m))it.m.push(m);it.m.sort((a,b)=>a-b);}
  else{edSnap();ED.seq.splice(ED.cur+1,0,{d:curDur(),m:[m]});ED.cur++;ED.mode='insert';}
  ED.lastT=now;edDraw(true);edUI();
}
function edRest(){edSnap();ED.seq.splice(ED.cur+1,0,{d:curDur(),m:[]});ED.cur++;ED.mode='insert';edDraw(true);edUI();}
function edSetDur(d){
  ED.dur=d;
  const it=ED.seq[ED.cur];
  if(ED.mode==='edit'&&it){edSnap();it.d=d*(isDotted(it.d)?1.5:1);ED.dot=isDotted(it.d);edDraw();}
  edUI();
}
function edToggleDot(){
  const it=ED.seq[ED.cur];
  if(ED.mode==='edit'&&it){edSnap();it.d=isDotted(it.d)?it.d/1.5:it.d*1.5;ED.dot=isDotted(it.d);edDraw();}
  else ED.dot=!ED.dot;
  edUI();
}
function edMove(dir){
  if(!ED.seq.length)return;
  ED.cur=Math.max(-1,Math.min(ED.seq.length-1,ED.cur+dir));ED.mode=ED.cur>=0?'edit':'insert';
  const it=ED.seq[ED.cur];if(it){ED.dur=baseDur(it.d);ED.dot=isDotted(it.d);edAudition(it);}
  edDraw(true);edUI();
}
function edPitch(dir){
  const it=ED.seq[ED.cur];if(!it||!it.m.length)return;
  edSnap();it.m=it.m.map(m=>Math.max(36,Math.min(100,m+dir)));ED.mode='edit';edAudition(it);edDraw();edUI();
}
function edDelete(){
  if(ED.cur<0||!ED.seq.length)return;
  edSnap();ED.seq.splice(ED.cur,1);ED.cur--;
  if(ED.cur<0)ED.mode='insert';
  const it=ED.seq[ED.cur];if(it&&ED.mode==='edit'){ED.dur=baseDur(it.d);ED.dot=isDotted(it.d);}
  edDraw(true);edUI();
}
function edUndo(){
  const s=ED.undo.pop();if(!s)return;
  const o=JSON.parse(s);ED.seq=o.seq;ED.cur=o.cur;ED.mode='edit';edDraw(true);edUI();
}
function edTranspose(n){
  if(!ED.seq.some(it=>it.m.length))return;
  edSnap();ED.seq.forEach(it=>{it.m=it.m.map(m=>Math.max(36,Math.min(100,m+n)));});edDraw();edUI();
  edStatusFlash('Spartito trasposto di '+(n>0?'+':'')+n+(Math.abs(n)===1?' semitono':' semitoni')+'.');
}
function edTrim(side){
  if(ED.cur<0)return;
  edSnap();
  if(side==='before'){ED.seq=ED.seq.slice(ED.cur);ED.cur=0;}else{ED.seq=ED.seq.slice(0,ED.cur+1);}
  edDraw(true);edUI();
}

/* Ascolto: una nota quando la selezioni, tutto il brano da dove sei */
function edVoiceOn(m){
  const inst=S.inst;
  if(inst==='pipes'){if(!P.bag)inflate();return{inst,h:pv(m,{at:ctx.currentTime,attack:true})};}
  return{inst,h:ENG[inst].start(m)};
}
function edVoiceOff(v){if(!v||!v.h)return;if(v.inst==='pipes')stopVoice(v.h,ctx.currentTime,.04);else ENG[v.inst].stop(v.h);v.h=null;}
function edAudition(it){
  if(!it||!it.m.length||ED.playing)return;
  initAudio();if(!ready(S.inst)){ensureBank(S.inst);return;}
  const vs=it.m.map(edVoiceOn);P.played=true;
  setTimeout(()=>{vs.forEach(edVoiceOff);refresh();},Math.min(600,it.d*60000/(+$('#edBpm').value||100)*.9));
}
function edPlay(){
  if(ED.playing){edStop();return;}
  if(!ED.seq.length)return;
  initAudio();if(!whenReady(edPlay))return;
  ED.playing=true;edUI();
  const spb=60/Math.max(30,+$('#edBpm').value||100),start=Math.max(0,ED.mode==='edit'?ED.cur:0);
  let t=0;
  for(let k=start;k<ED.seq.length;k++){
    const it=ED.seq[k],at=t*spb*1000,len=it.d*spb*1000;
    ED.timers.push(setTimeout(()=>{
      ED.cur=k;ED.mode='edit';edDraw(true);
      if(it.m.length){const vs=it.m.map(edVoiceOn);ED.voices.push(...vs);
        ED.timers.push(setTimeout(()=>{vs.forEach(edVoiceOff);ED.voices=ED.voices.filter(v=>!vs.includes(v));},Math.max(60,len*.92)));}
    },at));
    t+=it.d;
  }
  ED.timers.push(setTimeout(()=>{ED.playing=false;edUI();refresh();},t*spb*1000+80));
}
function edStop(){
  ED.timers.forEach(clearTimeout);ED.timers=[];
  if(ctx)ED.voices.forEach(edVoiceOff);ED.voices=[];
  if(ED.playing){ED.playing=false;edUI();}
}

/* Pentagramma dell’editor: spaziatura proporzionale, stanghette di battuta, nota selezionata e cursore */
let edGeo=[];
function edDraw(scroll){
  if(!ED.on)return;
  const H=92,left=34,yOf=st=>62-(st-30)*3.5,bar=ED.meter[0]*4/ED.meter[1],off=S.inst==='rec'?12:0;
  let x=left,t=0,s='',body='';edGeo=[];
  for(let k=0;k<ED.seq.length;k++){
    const it=ED.seq[k],w=Math.max(30,Math.min(150,it.d*34+12));
    if(k>0&&Math.abs(t/bar-Math.round(t/bar))<1e-3)body+='<line class="bar" x1="'+(x-10)+'" x2="'+(x-10)+'" y1="34" y2="62"/>';
    const cx=x+6;edGeo.push({x:cx,w,l:x-8,r:x+w-8});
    if(k===ED.cur)body+='<rect class="sel'+(ED.mode==='insert'?' ins':'')+'" x="'+(x-8)+'" y="2" width="'+(w-4)+'" height="'+(H-4)+'" rx="8"/>';
    if(!it.m.length){
      if(it.d>=2)body+='<rect class="rest" x="'+(cx-6)+'" y="'+(it.d>=4?41:44)+'" width="12" height="4"/>';
      else body+='<path class="rest-l" d="M'+(cx-2)+' 37l5 5l-5 5l5 5"/>';
    }else{
      const sts=it.m.map(m=>{const dm=m-off;return{m,dm,st:Math.floor(dm/12-1)*7+STEP[pc(dm)]};});
      const lo=Math.min(...sts.map(q=>q.st)),hi=Math.max(...sts.map(q=>q.st)),up=(lo+hi)/2<34;
      for(const q of sts){
        const y=yOf(q.st);
        for(let L=28;L>=q.st;L-=2)body+='<line class="sl" x1="'+(cx-9)+'" x2="'+(cx+9)+'" y1="'+yOf(L)+'" y2="'+yOf(L)+'"/>';
        for(let L=40;L<=q.st;L+=2)body+='<line class="sl" x1="'+(cx-9)+'" x2="'+(cx+9)+'" y1="'+yOf(L)+'" y2="'+yOf(L)+'"/>';
        body+='<ellipse class="hd'+(it.d>=2?' open':'')+'" cx="'+cx+'" cy="'+y+'" rx="5.4" ry="4" transform="rotate(-20 '+cx+' '+y+')"/>';
        if(SHARP.includes(pc(q.dm)))body+='<text class="acc" x="'+(cx-15)+'" y="'+(y+4)+'">♯</text>';
        if(isDotted(it.d))body+='<circle class="hd" cx="'+(cx+10)+'" cy="'+(y-2)+'" r="1.6"/>';
      }
      const b=baseDur(it.d);
      if(b<4){
        const sx=up?cx+5:cx-5,y1=up?yOf(lo):yOf(hi),y2=up?yOf(hi)-24:yOf(lo)+24;
        body+='<line class="stem" x1="'+sx+'" x2="'+sx+'" y1="'+y1+'" y2="'+y2+'"/>';
        const fl=b<=.25+1e-3?2:b<=.5+1e-3?1:0;
        for(let f=0;f<fl;f++){const fy=y2+(up?f*5:-f*5);body+='<path class="stem" fill="none" d="M'+sx+' '+fy+'c3 '+(up?3:-3)+' 7 '+(up?5:-5)+' 6 '+(up?11:-11)+'"/>';}
      }
    }
    x+=w;t+=it.d;
  }
  const W=Math.max(edWrap.clientWidth,x+60);
  const cxr=ED.cur>=0&&edGeo[ED.cur]?edGeo[ED.cur].r:left-12;
  if(ED.mode==='insert')body+='<line class="caret" x1="'+cxr+'" x2="'+cxr+'" y1="8" y2="'+(H-8)+'"/>';
  for(let k=0;k<5;k++){const y=34+k*7;s+='<line class="sl" x1="0" x2="'+W+'" y1="'+y+'" y2="'+y+'"/>';}
  s+='<text class="clef" x="4" y="58">𝄞</text>';
  if(!ED.seq.length)s+='<text class="empty" x="'+left+'" y="84">Tocca un foro per scrivere la prima nota</text>';
  edSvg.setAttribute('width',W);edSvg.setAttribute('viewBox','0 0 '+W+' '+H);edSvg.innerHTML=s+body;
  if(scroll){
    const target=ED.cur>=0&&edGeo[ED.cur]?edGeo[ED.cur].x:0,vw=edWrap.clientWidth;
    if(target<edWrap.scrollLeft+40||target>edWrap.scrollLeft+vw-60)edWrap.scrollLeft=Math.max(0,target-vw*.6);
  }
}
edWrap.addEventListener('pointerdown',ev=>{
  if(!ED.on)return;
  const r=edWrap.getBoundingClientRect(),x=ev.clientX-r.left+edWrap.scrollLeft;
  let k=-1;
  for(let i=0;i<edGeo.length;i++)if(x>=edGeo[i].l-4)k=i;
  if(k<0){ED.cur=-1;ED.mode='insert';}
  else if(x>edGeo[k].r+10&&k===edGeo.length-1){ED.cur=k;ED.mode='insert';}
  else{ED.cur=k;ED.mode='edit';const it=ED.seq[k];ED.dur=baseDur(it.d);ED.dot=isDotted(it.d);edAudition(it);}
  edDraw();edUI();
});

let edFlashT=0;
function edStatusFlash(t){clearTimeout(edFlashT);$('#edStatus').textContent=t;edFlashT=setTimeout(edUI,2600);}
function edUI(){
  if(!ED.on)return;
  document.querySelectorAll('#edDurs button[data-d]').forEach(b=>b.setAttribute('aria-pressed',Math.abs(+b.dataset.d-ED.dur)<1e-3));
  $('#edDot').setAttribute('aria-pressed',ED.dot);
  $('#edPlay').innerHTML=ED.playing?ICON.pause:ICON.play;$('#edPlay').setAttribute('aria-label',ED.playing?'Ferma':'Ascolta da qui');
  const it=ED.seq[ED.cur],has=!!it;
  ['edDel','edLeft'].forEach(id=>{$('#'+id).disabled=!has;});
  $('#edRight').disabled=ED.cur>=ED.seq.length-1;
  ['edUp','edDown'].forEach(id=>{$('#'+id).disabled=!(it&&it.m.length);});
  $('#edUndo').disabled=!ED.undo.length;
  let st;
  if(ED.mode==='edit'&&it)st=(it.m.length?it.m.map(m=>NOTE_IT[pc(m)]+oct(m)).join(' ')+', ':'Pausa, ')+durName(it.d);
  else st='Nuove note: '+durName(curDur());
  $('#edStatus').textContent=st;
}

$('#edDone').addEventListener('click',edSave);
$('#edClose').addEventListener('click',edClose);
document.querySelectorAll('#edDurs button[data-d]').forEach(b=>b.addEventListener('click',()=>edSetDur(+b.dataset.d)));
$('#edDot').addEventListener('click',edToggleDot);
$('#edRest').addEventListener('click',edRest);
$('#edLeft').addEventListener('click',()=>edMove(-1));
$('#edRight').addEventListener('click',()=>edMove(1));
$('#edUp').addEventListener('click',()=>edPitch(1));
$('#edDown').addEventListener('click',()=>edPitch(-1));
$('#edDel').addEventListener('click',edDelete);
$('#edUndo').addEventListener('click',edUndo);
$('#edPlay').addEventListener('click',edPlay);
$('#edTitle').addEventListener('input',()=>{ED.changed=true;});
$('#edBpm').addEventListener('input',()=>{ED.changed=true;});

/* Altro: trasposizione, metro, taglio, eliminazione */
const edMore=$('#edMore');
function openEdMore(){
  $('#edMeter').value=ED.meter.join('/');
  $('#edTrimBefore').disabled=$('#edTrimAfter').disabled=ED.cur<0;
  $('#edDeleteSong').hidden=!ED.isUser;
  edMore.hidden=false;scrim.hidden=false;$('#edMoreDone').focus();
}
function closeEdMore(){if(edMore.hidden)return;edMore.hidden=true;scrim.hidden=true;}
$('#edMoreBtn').addEventListener('click',openEdMore);
$('#edMoreDone').addEventListener('click',closeEdMore);
edMore.addEventListener('click',async ev=>{
  const b=ev.target.closest('button');if(!b)return;
  if(b.dataset.tr){edTranspose(+b.dataset.tr);}
  else if(b.id==='edTrimBefore'){edTrim('before');closeEdMore();edStatusFlash('Tolte le note prima della selezionata.');}
  else if(b.id==='edTrimAfter'){edTrim('after');closeEdMore();edStatusFlash('Tolte le note dopo la selezionata.');}
  else if(b.id==='edDeleteSong'){
    closeEdMore();
    if(await askConfirm('Eliminare «'+ED.src.title+'»? Non si può annullare.','Elimina')){const id=ED.src.id;ED.changed=false;edEnd();await deleteSong(id);hintFlash('Spartito eliminato.');}
  }
});
$('#edMeter').addEventListener('change',ev=>{edSnap();ED.meter=ev.target.value.split('/').map(Number);edDraw();});

/* Scorciatoie da tastiera nell’editor */
document.addEventListener('keydown',ev=>{
  if(!ED.on||/^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName)||!sheet.hidden||!edMore.hidden)return;
  const k=ev.key;
  if(k==='ArrowLeft'){edMove(-1);ev.preventDefault();}
  else if(k==='ArrowRight'){edMove(1);ev.preventDefault();}
  else if(k==='ArrowUp'){edPitch(1);ev.preventDefault();}
  else if(k==='ArrowDown'){edPitch(-1);ev.preventDefault();}
  else if(k==='Backspace'||k==='Delete'){edDelete();ev.preventDefault();}
  else if((ev.metaKey||ev.ctrlKey)&&k.toLowerCase()==='z'){edUndo();ev.preventDefault();}
  else if(k==='r'||k==='R'){edRest();ev.preventDefault();}
},true);
