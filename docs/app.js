(function(){
const $=s=>document.querySelector(s);
const root=document.documentElement;
const DEF={inst:'flute',vol:.8,rev:.35,key:60,scale:'maj',vib:.5,breath:.5,vibOn:true,cont:true,grace:true,drones:true,pnotes:'dia',ptune:'nat',autoDef:true,hinted:false};
let S=Object.assign({},DEF);
try{const s=JSON.parse(localStorage.getItem('fiati-v1')||'null');if(s)Object.assign(S,s);}catch(e){}
if(!['flute','rec','pipes','tamb'].includes(S.inst))S.inst='flute';
function save(){try{localStorage.setItem('fiati-v1',JSON.stringify(S));}catch(e){}}

const NOTE_IT=['Do','Do♯','Re','Re♯','Mi','Fa','Fa♯','Sol','Sol♯','La','La♯','Si'];
const EN=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const SARGAM=['Sa','re komal','Re','ga komal','Ga','Ma','Ma tivra','Pa','dha komal','Dha','ni komal','Ni'];
const SCALES={maj:[0,2,4,5,7,9,11,12],min:[0,2,3,5,7,8,10,12],pmaj:[0,2,4,7,9,12],pmin:[0,3,5,7,10,12],chr:[0,1,2,3,4,5,6,7,8,9,10,11,12]};
const DIATONIC=[0,2,4,5,7,9,11,12];
const PIPE_DIA=[65,67,69,71,72,74,76,77,79],PIPE_ALL=[65,67,69,70,71,72,73,74,75,76,77,78,79],PIPE_ACC=[70,73,75,78];
const pc=m=>((m%12)+12)%12,oct=m=>Math.floor(m/12)-1;

function notes(){
  if(S.inst==='tamb')return [];
  if(S.inst==='pipes')return (S.pnotes==='all'?PIPE_ALL:PIPE_DIA).map(m=>({midi:m,label:NOTE_IT[pc(m)],sub:EN[pc(m)]+oct(m),acc:PIPE_ACC.includes(m)}));
  const base=+S.key+(S.inst==='rec'?12:0);
  return SCALES[S.scale].map(st=>({midi:base+st,label:NOTE_IT[pc(base+st)],sub:S.inst==='flute'?(st===12?'Ṡa':SARGAM[st]):EN[pc(base+st)],acc:!DIATONIC.includes(st)}));
}
const mtof=m=>440*Math.pow(2,(m-69)/12);
let overblow=false,curIdx=0;
const noteMidi=i=>notes()[i].midi+(overblow&&S.inst!=='pipes'?12:0);

/* ---------- Audio di base ---------- */
let ctx,bus,dryG,wetG,master,noiseBuf;
function initAudio(){
  if(ctx){if(ctx.state!=='running')ctx.resume();return;}
  try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch(e){}
  const AC=window.AudioContext||window.webkitAudioContext;
  try{ctx=new AC({latencyHint:'interactive'});}catch(e){ctx=new AC();}
  const comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;comp.attack.value=.004;comp.release.value=.2;
  master=gainN(S.vol);comp.connect(master);master.connect(ctx.destination);
  bus=gainN(1);dryG=gainN(1);wetG=gainN(0);
  const conv=ctx.createConvolver();conv.buffer=makeIR(2.4);
  bus.connect(dryG);dryG.connect(comp);bus.connect(conv);conv.connect(wetG);wetG.connect(comp);
  setRev();
  const len=ctx.sampleRate*2;noiseBuf=ctx.createBuffer(1,len,ctx.sampleRate);
  const d=noiseBuf.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
  if(ctx.state!=='running')ctx.resume();
}
function gainN(v){const g=ctx.createGain();g.gain.value=v;return g;}
function biq(t,f,q){const b=ctx.createBiquadFilter();b.type=t;b.frequency.value=f;if(q!=null)b.Q.value=q;return b;}
function chain(...n){for(let i=0;i<n.length-1;i++)n[i].connect(n[i+1]);}
function noiseSrc(){const s=ctx.createBufferSource();s.buffer=noiseBuf;s.loop=true;s.start();return s;}
function hold(p,t){const v=p.value;p.cancelScheduledValues(t);p.setValueAtTime(v,t);}
function makeIR(dur){
  const sr=ctx.sampleRate,len=Math.floor(sr*dur),b=ctx.createBuffer(2,len,sr);
  for(let c=0;c<2;c++){const a=b.getChannelData(c);let y=0;
    for(let i=0;i<len;i++){const t=i/len,x=(Math.random()*2-1)*Math.pow(1-t,3),k=.85-.7*t;y+=k*(x-y);a[i]=i<sr*.012?0:y;}}
  return b;
}
function setRev(){if(!ctx)return;const t=ctx.currentTime;wetG.gain.setTargetAtTime(S.rev*.9,t,.05);dryG.gain.setTargetAtTime(1-S.rev*.35,t,.05);}
function setVol(){if(master)master.gain.setTargetAtTime(S.vol,ctx.currentTime,.05);}

/* ---------- Banchi di campioni ---------- */
const BANK={};
function b64buf(b){const s=atob(b),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u.buffer;}
function decode(ab){return new Promise((res,rej)=>{const p=ctx.decodeAudioData(ab,res,rej);if(p&&p.then)p.then(res,rej);});}
function loadItems(arr){return Promise.all(arr.map(it=>decode(b64buf(it.b)).then(buf=>({key:it.key,cents:it.cents,ls:it.ls,le:it.le,gain:it.gain||1,buf}))));}
const BANK_OF={flute:'oca',rec:'rec',pipes:'pipes',tamb:'tamb'};
function ensureBank(inst){
  const name=BANK_OF[inst]||inst;
  if(BANK[name])return BANK[name].p;
  initAudio();
  const el=document.getElementById('snd-'+name);
  const B={ready:false};BANK[name]=B;
  B.p=(el?Promise.resolve(JSON.parse(el.textContent)):fetch('sounds/'+name+'.json').then(r=>{if(!r.ok)throw new Error('http');return r.json();})).then(data=>{
  if(name==='tamb')return Promise.all([loadItems(data.hits),loadItems(data.fast),loadItems(data.low)]).then(([h,f,l])=>{B.hits=h;B.fast=f;B.low=l;B.ready=true;});
  if(name!=='pipes')return loadItems(data).then(l=>{B.list=l;B.ready=true;});
  return Promise.all([loadItems(data.chanter),loadItems(data.drones)]).then(([c,d])=>{
    B.chanter=c;B.drones=d;
    const g=c.find(x=>x.key===67);B.nat=-g.cents+d[0].cents;B.ready=true;});
  });
  B.p.catch(()=>{delete BANK[name];hint('Non riesco a caricare i suoni. Ricarica la pagina e riprova.');});
  return B.p;
}
const ready=n=>{const b=BANK[BANK_OF[n]||n];return !!(b&&b.ready);};
function pick(list,m){let best=list[0];for(const it of list)if(Math.abs(it.key-m)<Math.abs(best.key-m))best=it;return best;}
const rateOf=(it,m,det)=>Math.pow(2,(m-it.key)/12+det/1200);

function startVoice(it,rate,o){
  const t=o.at,src=ctx.createBufferSource();
  src.buffer=it.buf;src.loop=true;src.loopStart=it.ls;src.loopEnd=it.le;
  src.playbackRate.setValueAtTime(rate,t);
  const g=ctx.createGain();g.gain.value=0;g.gain.setValueAtTime(0,t);
  if(o.fade>0)g.gain.setTargetAtTime(o.peak,t,o.fade);else g.gain.setValueAtTime(o.peak,t);
  src.connect(g);g.connect(o.dest);src.start(t,o.offset||0);
  return{src,g,it,rate};
}
function stopVoice(v,t,tau){
  if(!v)return;
  if(t<=ctx.currentTime+.002){t=ctx.currentTime;hold(v.g.gain,t);}
  v.g.gain.setTargetAtTime(0,t,tau);
  try{v.src.stop(t+tau*8+.05);}catch(e){}
  if(v.vg)setTimeout(()=>{try{v.vg.disconnect();}catch(e){}},(t-ctx.currentTime+tau*8+.3)*1000);
}

/* ---------- Bambù (campioni di ocarina) e flauto dolce: una voce per dito ---------- */
const W={};
function windShared(){if(W.out)return;W.out=gainN(.85);W.out.connect(bus);W.lfo=ctx.createOscillator();W.lfo.frequency.value=5;W.lfo.start();}
function windVoice(bank,m,old){
  windShared();
  const t=ctx.currentTime,it=pick(BANK[bank].list,m),r=rateOf(it,m,-it.cents);let v;
  if(old){v=startVoice(it,r,{at:t,offset:it.ls,fade:.018,peak:1,dest:W.out});stopVoice(old,t,.025);}
  else v=startVoice(it,r,{at:t,offset:0,fade:0,peak:1,dest:W.out});
  const vv=S.vibOn?S.vib:0;
  if(vv>0){const vg=ctx.createGain();vg.gain.value=0;vg.gain.setValueAtTime(0,t);vg.gain.linearRampToValueAtTime(0,t+.3);vg.gain.linearRampToValueAtTime(r*.009*vv,t+.9);
    W.lfo.connect(vg);vg.connect(v.src.playbackRate);v.vg=vg;}
  return v;
}
const windEng=bank=>({start(m){return windVoice(bank,m,null);},move(h,m){return windVoice(bank,m,h);},stop(h){stopVoice(h,ctx.currentTime,.08);}});
const ENG={flute:windEng('oca'),rec:windEng('rec')};

/* ---------- Cornamusa (campioni) ---------- */
const P={dr:[],bag:false};
function pipesOut(){if(!P.out){P.out=gainN(.8);P.out.connect(bus);P.drG=gainN(S.drones?1:0);P.drG.connect(P.out);P.chG=gainN(1);P.chG.connect(P.out);}}
const chDet=it=>S.ptune==='nat'?BANK.pipes.nat:-it.cents;
const drDet=it=>S.ptune==='nat'?0:-it.cents;
function inflate(){
  pipesOut();const t=ctx.currentTime;P.bag=true;P.played=false;
  P.dr=BANK.pipes.drones.map(it=>{const r=rateOf(it,it.key,drDet(it));
    const v=startVoice(it,r*.94,{at:t,offset:0,fade:.06,peak:it.gain,dest:P.drG});
    v.src.playbackRate.setTargetAtTime(r,t+.04,.2);return v;});
  wake();uiBag();
}
function pv(m,o){
  pipesOut();P.played=true;const it=pick(BANK.pipes.chanter,m);
  const v=startVoice(it,rateOf(it,m,chDet(it)),{at:o.at,offset:o.attack?0:it.ls,fade:o.attack?0:(o.fade||.006),peak:1,dest:P.chG});
  v.m=m;return v;
}
function pipesGrace(old,m){
  const t=ctx.currentTime,gm=m===79?76:79,gv=pv(gm,{at:t,fade:.003});
  old.forEach(o=>stopVoice(o,t,.006));stopVoice(gv,t+.036,.006);
  return pv(m,{at:t+.034,fade:.004});
}
function deflate(quick){
  if(!P.bag)return;const t=ctx.currentTime;
  const all=[...P.dr,...latched.map(e=>e.h),...[...touches.values()].filter(e=>S.inst==='pipes').map(e=>e.h)].filter(Boolean);
  all.forEach(v=>{const pr=v.src.playbackRate,cur=pr.value;hold(pr,t);
    pr.setTargetAtTime(cur*(quick?.9:.965),t+(quick?0:.12),quick?.05:.7);stopVoice(v,t+(quick?0:.05),quick?.03:.32);});
  touches.forEach(e=>{if(S.inst==='pipes')e.h=null;});
  latched=[];P.dr=[];P.bag=false;uiBag();
}
function retune(){
  if(!ctx||!ready('pipes'))return;const t=ctx.currentTime;
  P.dr.forEach(v=>v.src.playbackRate.setTargetAtTime(rateOf(v.it,v.it.key,drDet(v.it)),t,.03));
  [...latched,...touches.values()].forEach(e=>{const v=e.h;if(v&&v.m!=null)v.src.playbackRate.setTargetAtTime(rateOf(v.it,v.m,chDet(v.it)),t,.03);});
}

/* ---------- Tocchi: una voce per dito ---------- */
const play=$('#play'),bandsEl=$('#bands'),readoutEl=$('#readout'),hintEl=$('#hint'),hintText=$('#hintText');
let bandEls=[];
const touches=new Map();   // dito -> {i, m, h, t}
let latched=[];            // cornamusa: note che restano dopo aver alzato le dita
let order=0;

function render(){
  root.dataset.inst=S.inst;
  $('#instSel').value=S.inst;
  const ns=notes(),n=ns.length;
  bandsEl.innerHTML='';
  for(let b=0;b<n;b++){
    const i=n-1-b,nt=ns[i],d=document.createElement('div');
    d.className='band'+(nt.acc?' acc':'');d.dataset.i=i;
    d.innerHTML='<span class="nm"></span><span class="hole"></span><span class="sub"></span>';
    d.children[0].textContent=nt.label;d.children[2].textContent=nt.sub;
    bandsEl.appendChild(d);
  }
  bandEls=[...bandsEl.children];
  if(curIdx>=n)curIdx=0;
  layout();refresh();uiBag();songOnRender();
}
function layout(){const n=bandEls.length||1;root.style.setProperty('--bh',(bandsEl.clientHeight/n)+'px');}
new ResizeObserver(layout).observe(bandsEl);
function idxAt(y){
  const r=bandsEl.getBoundingClientRect(),n=bandEls.length;
  let b=Math.floor((y-r.top)/(r.height/n));b=Math.max(0,Math.min(n-1,b));
  return n-1-b;
}

/* Volume per voce: con più note insieme ognuna suona un po’ più piano */
function level(){
  if(!ctx)return;const t=ctx.currentTime;
  const n=soundingEntries().length;
  const k=Math.pow(Math.max(1,n),-.38);
  if(W.out)W.out.gain.setTargetAtTime(.85*k,t,.03);
  if(P.chG)P.chG.gain.setTargetAtTime(k,t,.03);
}

function startTouch(e,fresh){
  const inst=S.inst;e.m=noteMidi(e.i);curIdx=e.i;
  if(inst!=='pipes'){e.h=ENG[inst].start(e.m);wake();return;}
  const t=ctx.currentTime;
  if(!P.bag){inflate();e.h=pv(e.m,{at:t,attack:true});latched=[];return;}
  const others=[...touches.values()].filter(x=>x!==e&&x.h).length;
  if(fresh&&others===0){
    const old=latched.map(x=>x.h).filter(Boolean);latched=[];
    if(old.length&&S.grace)e.h=pipesGrace(old,e.m);
    else{old.forEach(o=>stopVoice(o,t,.008));e.h=pv(e.m,{at:t,attack:old.length===0});}
  }else e.h=pv(e.m,{at:t,attack:false,fade:.01});
}
function moveTouch(e,i){
  e.i=i;curIdx=i;const m=noteMidi(i);
  if(!e.h){e.m=m;return;}
  if(S.inst!=='pipes'){e.h=ENG[S.inst].move(e.h,m);e.m=m;return;}
  const t=ctx.currentTime;
  if(S.grace&&touches.size===1)e.h=pipesGrace([e.h],m);
  else{stopVoice(e.h,t,.008);e.h=pv(m,{at:t,fade:.006});}
  e.m=m;
}
function endTouch(e){
  if(!e.h)return;
  if(S.inst==='pipes')stopVoice(e.h,ctx.currentTime,.045);else ENG[S.inst].stop(e.h);
  e.h=null;
}

function down(id,i){
  initAudio();
  const e={i,m:null,h:null,t:++order,inst:S.inst};
  const fresh=touches.size===0;touches.set(id,e);
  if(!ready(S.inst)){
    whenReady(()=>{touches.forEach(x=>{if(!x.h){startTouch(x,true);songHit(x.m);if(ED.on)edInput(x.m);}});refresh();});
    refresh();return;
  }
  startTouch(e,fresh);songHit(e.m);if(ED.on)edInput(e.m);
  if(navigator.vibrate)try{navigator.vibrate(6);}catch(_){}
  hideHint();refresh();
}
function moved(id,i){
  const e=touches.get(id);if(!e||e.i===i)return;
  moveTouch(e,i);if(e.h)songHit(e.m);refresh();
}
function up(id){
  const e=touches.get(id);if(!e)return;
  touches.delete(id);endTouch(e);refresh();
}

play.addEventListener('pointerdown',ev=>{if(S.inst==='tamb'){tambDown(ev);return;}ev.preventDefault();try{play.setPointerCapture(ev.pointerId);}catch(_){}down(ev.pointerId,idxAt(ev.clientY));});
play.addEventListener('pointermove',ev=>{if(S.inst==='tamb'){tambMove(ev);return;}if(touches.has(ev.pointerId))moved(ev.pointerId,idxAt(ev.clientY));});
play.addEventListener('pointerup',ev=>{if(S.inst==='tamb')tambUp(ev);up(ev.pointerId);});
play.addEventListener('pointercancel',ev=>{if(S.inst==='tamb')tambUp(ev);up(ev.pointerId);});
play.addEventListener('contextmenu',ev=>ev.preventDefault());

/* Evidenziazione e lettura delle note, con il nome dell’accordo */
const CHORDS=[['0,4,7','maggiore'],['0,3,7','minore'],['0,3,6','diminuito'],['0,4,8','aumentato'],['0,2,7','sus2'],['0,5,7','sus4'],
  ['0,4,7,10','settima'],['0,4,7,11','settima maggiore'],['0,3,7,10','minore settima'],['0,3,6,10','semidiminuito'],['0,7','quinta vuota']];
function chordName(ms){
  const pcs=[];ms.slice().sort((a,b)=>a-b).forEach(m=>{if(!pcs.includes(pc(m)))pcs.push(pc(m));});
  if(pcs.length<2)return '';
  for(const r of pcs){const iv=pcs.map(p=>(p-r+12)%12).sort((a,b)=>a-b).join();
    for(const [k,name] of CHORDS)if(k===iv)return NOTE_IT[r]+' '+name;}
  return '';
}
function soundingEntries(){return [...touches.values(),...latched,...SM.auto].filter(e=>e.h);}
/* Sgonfia la sacca mezzo secondo dopo l’ultima nota, se l’opzione è attiva */
let adTimer=0;
function autoDeflate(){
  const idle=S.inst==='pipes'&&S.autoDef&&P.bag&&P.played&&!SM.playing&&!soundingEntries().length&&![...touches.values()].length;
  if(!idle){clearTimeout(adTimer);adTimer=0;return;}
  if(!adTimer)adTimer=setTimeout(()=>{adTimer=0;
    if(S.inst==='pipes'&&S.autoDef&&P.bag&&P.played&&!SM.playing&&!soundingEntries().length&&!touches.size){deflate(false);refresh();}},500);
}
function refresh(){
  autoDeflate();
  const held=new Set([...touches.values(),...SM.auto].map(e=>e.i)),kept=new Set(latched.map(e=>e.i));
  ob.classList.toggle('auto',SM.auto.some(a=>a.ob));
  bandEls.forEach(el=>{const i=+el.dataset.i;el.classList.toggle('on',held.has(i));el.classList.toggle('ring',!held.has(i)&&kept.has(i));});
  level();
  const rn=readoutEl.querySelector('.rn'),rs=readoutEl.querySelector('.rs');
  const ms=[...new Set(soundingEntries().map(e=>e.m))].sort((a,b)=>a-b);
  if(!ms.length){readoutEl.classList.add('idle');readoutEl.classList.remove('multi');rn.textContent='–';rs.innerHTML='&nbsp;';return;}
  readoutEl.classList.remove('idle');
  if(ms.length===1){
    readoutEl.classList.remove('multi');
    const m=ms[0],e=soundingEntries().find(x=>x.m===m),nt=notes()[e.i];
    rn.textContent=NOTE_IT[pc(m)];const sup=document.createElement('sup');sup.textContent=oct(m);rn.appendChild(sup);
    rs.textContent=nt?nt.sub:'';
  }else{
    readoutEl.classList.add('multi');
    rn.textContent=ms.map(m=>NOTE_IT[pc(m)]).join(' ');
    rs.textContent=chordName(ms)||'più note insieme';
  }
}

let hintTimer;
function hint(msg){clearTimeout(hintTimer);hintEl.hidden=false;hintEl.style.opacity=1;hintText.textContent=msg;}
function hintFlash(msg){hint(msg);hintTimer=setTimeout(()=>{hintEl.style.opacity=0;hintTimer=setTimeout(()=>{hintEl.hidden=true;},500);},5000);}
function hideHint(){if(!S.hinted){S.hinted=true;save();}hintEl.style.opacity=0;hintTimer=setTimeout(()=>{hintEl.hidden=true;},500);}
if(S.hinted)hintEl.hidden=true;
function whenReady(cb){
  const inst=S.inst;
  if(ready(inst))return true;
  hint('Carico i suoni…');
  ensureBank(inst).then(()=>{if(S.inst!==inst)return;hideHint();cb();});
  return false;
}

/* Soffio forte: sposta di un’ottava tutte le note tenute */
const ob=$('#ob');
function setOverblow(v){
  if(overblow===v)return;overblow=v;ob.classList.toggle('on',v);
  if(S.inst!=='pipes'&&ctx)touches.forEach(e=>{if(e.h){e.m=noteMidi(e.i);e.h=ENG[S.inst].move(e.h,e.m);}});
  touches.forEach(e=>{if(e.h)songHit(e.m);});
  refresh();
}
ob.addEventListener('pointerdown',ev=>{ev.preventDefault();initAudio();ensureBank(S.inst);try{ob.setPointerCapture(ev.pointerId);}catch(_){}setOverblow(true);});
['pointerup','pointercancel'].forEach(n=>ob.addEventListener(n,()=>setOverblow(false)));
ob.addEventListener('contextmenu',ev=>ev.preventDefault());
$('#vibBtn').addEventListener('click',()=>{S.vibOn=!S.vibOn;save();uiToggles();});

/* Sacca, bordoni, abbellimenti */
const bagBtn=$('#bagBtn');
function uiBag(){
  bagBtn.classList.toggle('on',P.bag);
  bagBtn.querySelector('b').textContent=P.bag?'Sgonfia la sacca':'Gonfia la sacca';
  bagBtn.querySelector('small').textContent=P.bag?'tocca per fermare tutto':(S.drones?'accende i bordoni':'pronta a suonare');
}
function bagToggle(){
  initAudio();
  if(!whenReady(bagToggle))return;
  if(P.bag)deflate(false);
  else inflate();
  refresh();
}
bagBtn.addEventListener('click',bagToggle);
$('#drBtn').addEventListener('click',()=>{S.drones=!S.drones;save();uiToggles();uiBag();
  if(P.drG){const t=ctx.currentTime;hold(P.drG.gain,t);P.drG.gain.setTargetAtTime(S.drones?1:0,t,.12);}});
$('#grBtn').addEventListener('click',()=>{S.grace=!S.grace;save();uiToggles();});
function uiToggles(){
  $('#vibBtn').setAttribute('aria-pressed',S.vibOn);
  $('#drBtn').setAttribute('aria-pressed',S.drones);
  $('#grBtn').setAttribute('aria-pressed',S.grace);
}

/* Silenzio e cambio strumento */
function silence(quick){
  rollStop();TB.ptr.clear();
  if(SM.playing||SM.auto.length)stopListen();
  overblow=false;ob.classList.remove('on');
  if(ctx){
    if(P.bag)deflate(quick);
    touches.forEach(e=>{if(e.h&&e.inst!=='pipes')ENG[e.inst].stop(e.h);});
    latched.forEach(e=>{if(e.h)stopVoice(e.h,ctx.currentTime,.03);});
  }
  touches.clear();latched=[];refresh();
}
$('#instSel').addEventListener('change',ev=>{
  const inst=ev.target.value;if(S.inst===inst)return;
  silence(true);S.inst=inst;curIdx=inst==='pipes'?1:0;save();render();
  if(SM.raw){refitSong(true);SM.pos=0;SM.done=false;SM.beat=Math.max(0,SM.ev[0].t-.5);updateSongUI();}
  else if(inst==='tamb')hintFlash('Tocca il centro per un colpo basso e il bordo per i sonagli. Trascina il dito per scuoterlo, tieni premuto Rullo per un tremolo.');
  initAudio();ensureBank(inst);
});

/* Impostazioni */
const sheet=$('#sheet'),scrim=$('#scrim');
function openSheet(){sheet.hidden=false;scrim.hidden=false;$('#done').focus();}
function closeSheet(){sheet.hidden=true;scrim.hidden=true;$('#gear').focus();}
$('#gear').addEventListener('click',openSheet);$('#done').addEventListener('click',closeSheet);scrim.addEventListener('click',()=>{if(!sheet.hidden)closeSheet();else if(!$('#edMore').hidden)closeEdMore();else closeSongs();});
const ctl={vol:$('#vol'),rev:$('#rev'),key:$('#key'),scale:$('#scale'),vib:$('#vib'),pnotes:$('#pnotes'),ptune:$('#ptune')};
ctl.vol.value=S.vol;ctl.rev.value=S.rev;ctl.key.value=S.key;ctl.scale.value=S.scale;ctl.vib.value=S.vib;
ctl.pnotes.value=S.pnotes;ctl.ptune.value=S.ptune;$('#autoDef').checked=S.autoDef;
$('#autoDef').addEventListener('change',ev=>{S.autoDef=ev.target.checked;save();refresh();});
ctl.vol.addEventListener('input',()=>{S.vol=+ctl.vol.value;setVol();save();});
ctl.rev.addEventListener('input',()=>{S.rev=+ctl.rev.value;setRev();save();});
ctl.vib.addEventListener('input',()=>{S.vib=+ctl.vib.value;save();});
ctl.key.addEventListener('change',()=>{S.key=+ctl.key.value;silence(true);save();render();});
ctl.scale.addEventListener('change',()=>{S.scale=ctl.scale.value;silence(true);curIdx=0;save();render();});
ctl.pnotes.addEventListener('change',()=>{S.pnotes=ctl.pnotes.value;silence(true);curIdx=1;save();render();});
ctl.ptune.addEventListener('change',()=>{S.ptune=ctl.ptune.value;save();retune();});
document.addEventListener('keydown',ev=>{if(ev.key!=='Escape')return;if(!$('#ask').hidden)$('#askNo').click();else if(!sheet.hidden)closeSheet();else if(!$('#edMore').hidden)closeEdMore();else if(!songsSheet.hidden)closeSongs();});

/* Tastiera fisica: 1-9, 0, Q, W, E dal basso (anche insieme); Maiusc = ottava sopra; Spazio = sacca */
const KEYS='1234567890qwe';
document.addEventListener('keydown',ev=>{
  if(!sheet.hidden||!songsSheet.hidden||!$('#edMore').hidden||!$('#ask').hidden||!$('#mock').hidden||ev.repeat||ev.metaKey||ev.ctrlKey||/^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName))return;
  const k=ev.key.toLowerCase(),i=KEYS.indexOf(k);
  if(S.inst==='tamb'){
    if(i>=0){ev.preventDefault();if(!tambLoading()){tambStrike(i===0?.1:.65);songHit(-1);}}
    else if(ev.key==='Shift'||ev.key===' '){ev.preventDefault();rollStart();}
    return;
  }
  if(i>=0&&i<bandEls.length){down('k'+k,i);ev.preventDefault();}
  else if(ev.key==='Shift'&&S.inst!=='pipes'){initAudio();setOverblow(true);}
  else if(ev.key===' '&&S.inst==='pipes'){bagToggle();ev.preventDefault();}
});
document.addEventListener('keyup',ev=>{
  const k=ev.key.toLowerCase();
  if(S.inst==='tamb'&&(ev.key==='Shift'||ev.key===' ')){rollStop();return;}
  if(touches.has('k'+k))up('k'+k);
  else if(ev.key==='Shift')setOverblow(false);
});

/* Precarica i suoni al primo tocco; schermo acceso mentre si suona; silenzio in background */
document.addEventListener('pointerdown',()=>{initAudio();ensureBank(S.inst);},{once:true,capture:true});
let lock=null;
async function wake(){try{if(!lock&&navigator.wakeLock){lock=await navigator.wakeLock.request('screen');lock.addEventListener('release',()=>{lock=null;});}}catch(_){}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)silence(true);});

/* ---------- Tamburello ---------- */
const TB={out:null,last:-1,fi:0,roll:0,rollNext:0,rollStep:0,motion:false,got:false,lastShake:0,ptr:new Map()};
const tambEl=$('#tamb'),tambSvg=$('#tambSvg'),tgroup=$('#tgroup'),rollBtn=$('#rollBtn'),shakeBtn=$('#shakeBtn');
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
(function buildJingles(){
  const NS='http://www.w3.org/2000/svg';let s='';
  for(let k=0;k<8;k++){const a=k*45+22.5;
    s+='<g transform="rotate('+a+') translate(0 -96)"><rect x="-13" y="-6.5" width="26" height="13" rx="3" fill="#2A170A" opacity=".75"/>'
      +'<g class="zil"><ellipse cx="-5" cy="0" rx="8.5" ry="8" fill="url(#zil)" stroke="#5E646C" stroke-width=".8"/><circle cx="-5" cy="0" r="1.6" fill="#5E646C"/></g>'
      +'<g class="zil"><ellipse cx="5" cy="0" rx="8.5" ry="8" fill="url(#zil)" stroke="#5E646C" stroke-width=".8"/><circle cx="5" cy="0" r="1.6" fill="#5E646C"/></g></g>';}
  $('#jingles').innerHTML=s;
})();
function tambHit(vel,kind,at){
  if(!ready('tamb'))return;
  if(!TB.out){TB.out=gainN(1.35);TB.out.connect(bus);}
  const B=BANK.tamb,list=kind==='fast'?B.fast:kind==='low'?B.low:B.hits;let k;
  if(kind==='fast')k=TB.fi++%list.length;
  else{const lk=kind==='low'?'lastLow':'last';do{k=Math.floor(Math.random()*list.length);}while(k===TB[lk]&&list.length>1);TB[lk]=k;}
  const it=list[k],t=at||ctx.currentTime,src=ctx.createBufferSource();
  src.buffer=it.buf;src.playbackRate.value=1+(Math.random()-.5)*.05;
  const g=gainN(Math.max(.05,Math.min(1.2,vel))*it.gain);src.connect(g);g.connect(TB.out);src.start(t);
  setTimeout(()=>tambAnim(vel),Math.max(0,(t-ctx.currentTime)*1000));
}
function tambAnim(vel){
  if(reduceMotion||S.inst!=='tamb')return;
  tgroup.animate([{transform:'scale(1)'},{transform:'scale('+(1-.035*vel)+')'},{transform:'scale(1)'}],{duration:140,easing:'ease-out'});
  document.querySelectorAll('#jingles .zil').forEach(z=>z.animate([{transform:'rotate(0deg)'},{transform:'rotate('+((Math.random()-.5)*36*vel)+'deg)'},{transform:'rotate(0deg)'}],{duration:160+Math.random()*90}));
}
function ripple(ev){
  if(reduceMotion)return;
  const pt=tambSvg.createSVGPoint();pt.x=ev.clientX;pt.y=ev.clientY;const p=pt.matrixTransform(tambSvg.getScreenCTM().inverse());
  const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
  c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.setAttribute('r',22);c.setAttribute('class','ripple');tgroup.appendChild(c);
  c.animate([{transform:'scale(.2)',opacity:.6},{transform:'scale(1.5)',opacity:0}],{duration:450,easing:'ease-out'}).onfinish=()=>c.remove();
}
/* Colpo in base al punto: al centro la pelle risuona bassa, verso il bordo restano i sonagli */
function tambStrike(d){
  if(d>.84){tambHit(.8,'fast');return;}
  const inner=.55;
  if(d<inner){const k=d/inner;tambHit(1-.35*k,'low');tambHit(.35+.25*k,'hit');}
  else{tambHit(1-.4*d,'hit');const b=Math.max(0,(.7-d)/.15);if(b>0)tambHit(.35*b,'low');}
}
/* Traccia del tamburello scritta nell'editor: colpo basso, colpo e sonagli */
const PERC_NAME={low:'Colpo basso',hit:'Colpo',fast:'Sonagli'};
const percOf=raw=>raw&&Array.isArray(raw.perc)?raw.perc:[];
function percHit(k,v){
  if(!ready('tamb'))return;
  if(k==='low'){tambHit(v,'low');tambHit(.3*v,'hit');}else if(k==='fast')tambHit(.8*v,'fast');else tambHit(.85*v,'hit');
}
const accompanying=()=>!!(SM.raw&&S.inst!=='tamb'&&S.accomp!==false&&percOf(SM.raw).length);
function tambDist(ev){
  const r=tambSvg.getBoundingClientRect(),R=Math.min(r.width,r.height)*106/224;
  return Math.hypot(ev.clientX-(r.left+r.width/2),ev.clientY-(r.top+r.height/2))/R;
}
function tambLoading(){initAudio();if(ready('tamb'))return false;whenReady(()=>{});return true;}
function tambDown(ev){
  ev.preventDefault();if(tambLoading())return;
  const d=tambDist(ev);if(d>1.15)return;
  try{play.setPointerCapture(ev.pointerId);}catch(_){}
  TB.ptr.set(ev.pointerId,{x:ev.clientX,y:ev.clientY,t:performance.now()});
  tambStrike(d);
  ripple(ev);hideHint();songHit(-1);
  if(navigator.vibrate)try{navigator.vibrate(8);}catch(_){}
}
function tambMove(ev){
  const p=TB.ptr.get(ev.pointerId);if(!p)return;
  const now=performance.now(),dist=Math.hypot(ev.clientX-p.x,ev.clientY-p.y);
  if(dist>26&&now-p.t>45){tambHit(Math.min(1,.35+dist/(now-p.t)*.6),'fast');p.x=ev.clientX;p.y=ev.clientY;p.t=now;}
}
function tambUp(ev){TB.ptr.delete(ev.pointerId);}

/* Rullo: colpi rapidi programmati in anticipo, con un leggero ondeggiare di intensità */
function rollTick(){
  const ahead=ctx.currentTime+.1;
  while(TB.rollNext<ahead){
    const v=TB.rollStep===0?.95:.5+.22*Math.sin(TB.rollStep*1.3)+Math.random()*.15;
    tambHit(v,'fast',TB.rollNext);TB.rollNext+=.062+Math.random()*.012;TB.rollStep++;
  }
}
function rollStart(){
  if(tambLoading()||TB.roll)return;
  TB.rollNext=ctx.currentTime+.005;TB.rollStep=0;rollTick();TB.roll=setInterval(rollTick,25);
  rollBtn.classList.add('on');hideHint();
}
function rollStop(){if(TB.roll){clearInterval(TB.roll);TB.roll=0;}rollBtn.classList.remove('on');}
rollBtn.addEventListener('pointerdown',ev=>{ev.preventDefault();try{rollBtn.setPointerCapture(ev.pointerId);}catch(_){}rollStart();});
['pointerup','pointercancel'].forEach(n=>rollBtn.addEventListener(n,rollStop));
rollBtn.addEventListener('contextmenu',ev=>ev.preventDefault());

/* Scuoti il telefono */
function onMotion(e){
  let mag=null;const a=e.acceleration;
  if(a&&a.x!=null)mag=Math.hypot(a.x,a.y||0,a.z||0);
  else{const g=e.accelerationIncludingGravity;if(g&&g.x!=null)mag=Math.abs(Math.hypot(g.x,g.y||0,g.z||0)-9.81);}
  if(mag==null)return;TB.got=true;
  if(S.inst!=='tamb'||document.hidden||!ready('tamb'))return;
  const now=performance.now();
  if(mag>5&&now-TB.lastShake>70){TB.lastShake=now;tambHit(Math.min(1.1,.35+(mag-5)/22),mag>18?'hit':'fast');}
}
function motionOff(){TB.motion=false;window.removeEventListener('devicemotion',onMotion);shakeBtn.setAttribute('aria-pressed','false');}
shakeBtn.addEventListener('click',async()=>{
  if(TB.motion){motionOff();return;}
  initAudio();ensureBank('tamb');
  if(typeof DeviceMotionEvent==='undefined'){hintFlash('Questo dispositivo non segnala i movimenti.');return;}
  try{if(typeof DeviceMotionEvent.requestPermission==='function'&&await DeviceMotionEvent.requestPermission()!=='granted'){
    hintFlash('Senza il permesso ai sensori di movimento non posso sentire quando scuoti il telefono.');return;}}
  catch(_){hintFlash('Il browser non ha dato l’accesso ai sensori di movimento.');return;}
  TB.motion=true;TB.got=false;window.addEventListener('devicemotion',onMotion);shakeBtn.setAttribute('aria-pressed','true');
  hintFlash('Scuoti il telefono come un tamburello.');
  setTimeout(()=>{if(TB.motion&&!TB.got){motionOff();hintFlash('Questa pagina non riceve i dati di movimento del dispositivo. Usa il dito o il Rullo.');}},2000);
});

/* ---------- Brani ---------- */
const SAMPLES=[{"title":"Inno alla gioia","by":"Beethoven","bpm":100,"meter":[4,4],"ev":[{"t":0,"d":1,"m":[64]},{"t":1,"d":1,"m":[64]},{"t":2,"d":1,"m":[65]},{"t":3,"d":1,"m":[67]},{"t":4,"d":1,"m":[67]},{"t":5,"d":1,"m":[65]},{"t":6,"d":1,"m":[64]},{"t":7,"d":1,"m":[62]},{"t":8,"d":1,"m":[60]},{"t":9,"d":1,"m":[60]},{"t":10,"d":1,"m":[62]},{"t":11,"d":1,"m":[64]},{"t":12,"d":1.5,"m":[64]},{"t":13.5,"d":0.5,"m":[62]},{"t":14,"d":2,"m":[62]},{"t":16,"d":1,"m":[64]},{"t":17,"d":1,"m":[64]},{"t":18,"d":1,"m":[65]},{"t":19,"d":1,"m":[67]},{"t":20,"d":1,"m":[67]},{"t":21,"d":1,"m":[65]},{"t":22,"d":1,"m":[64]},{"t":23,"d":1,"m":[62]},{"t":24,"d":1,"m":[60]},{"t":25,"d":1,"m":[60]},{"t":26,"d":1,"m":[62]},{"t":27,"d":1,"m":[64]},{"t":28,"d":1.5,"m":[62]},{"t":29.5,"d":0.5,"m":[60]},{"t":30,"d":2,"m":[60]},{"t":32,"d":1,"m":[62]},{"t":33,"d":1,"m":[62]},{"t":34,"d":1,"m":[64]},{"t":35,"d":1,"m":[60]},{"t":36,"d":1,"m":[62]},{"t":37,"d":0.5,"m":[64]},{"t":37.5,"d":0.5,"m":[65]},{"t":38,"d":1,"m":[64]},{"t":39,"d":1,"m":[60]},{"t":40,"d":1,"m":[62]},{"t":41,"d":0.5,"m":[64]},{"t":41.5,"d":0.5,"m":[65]},{"t":42,"d":1,"m":[64]},{"t":43,"d":1,"m":[62]},{"t":44,"d":1,"m":[60]},{"t":45,"d":1,"m":[62]},{"t":46,"d":2,"m":[55]},{"t":48,"d":1,"m":[64]},{"t":49,"d":1,"m":[64]},{"t":50,"d":1,"m":[65]},{"t":51,"d":1,"m":[67]},{"t":52,"d":1,"m":[67]},{"t":53,"d":1,"m":[65]},{"t":54,"d":1,"m":[64]},{"t":55,"d":1,"m":[62]},{"t":56,"d":1,"m":[60]},{"t":57,"d":1,"m":[60]},{"t":58,"d":1,"m":[62]},{"t":59,"d":1,"m":[64]},{"t":60,"d":1.5,"m":[62]},{"t":61.5,"d":0.5,"m":[60]},{"t":62,"d":2,"m":[60]}]},{"title":"Fra Martino","by":"tradizionale","bpm":110,"meter":[4,4],"ev":[{"t":0,"d":1,"m":[60]},{"t":1,"d":1,"m":[62]},{"t":2,"d":1,"m":[64]},{"t":3,"d":1,"m":[60]},{"t":4,"d":1,"m":[60]},{"t":5,"d":1,"m":[62]},{"t":6,"d":1,"m":[64]},{"t":7,"d":1,"m":[60]},{"t":8,"d":1,"m":[64]},{"t":9,"d":1,"m":[65]},{"t":10,"d":2,"m":[67]},{"t":12,"d":1,"m":[64]},{"t":13,"d":1,"m":[65]},{"t":14,"d":2,"m":[67]},{"t":16,"d":0.5,"m":[67]},{"t":16.5,"d":0.5,"m":[69]},{"t":17,"d":0.5,"m":[67]},{"t":17.5,"d":0.5,"m":[65]},{"t":18,"d":1,"m":[64]},{"t":19,"d":1,"m":[60]},{"t":20,"d":0.5,"m":[67]},{"t":20.5,"d":0.5,"m":[69]},{"t":21,"d":0.5,"m":[67]},{"t":21.5,"d":0.5,"m":[65]},{"t":22,"d":1,"m":[64]},{"t":23,"d":1,"m":[60]},{"t":24,"d":1,"m":[60]},{"t":25,"d":1,"m":[55]},{"t":26,"d":2,"m":[60]},{"t":28,"d":1,"m":[60]},{"t":29,"d":1,"m":[55]},{"t":30,"d":2,"m":[60]}]},{"title":"Brilla brilla la stellina","by":"tradizionale","bpm":100,"meter":[4,4],"ev":[{"t":0,"d":1,"m":[60]},{"t":1,"d":1,"m":[60]},{"t":2,"d":1,"m":[67]},{"t":3,"d":1,"m":[67]},{"t":4,"d":1,"m":[69]},{"t":5,"d":1,"m":[69]},{"t":6,"d":2,"m":[67]},{"t":8,"d":1,"m":[65]},{"t":9,"d":1,"m":[65]},{"t":10,"d":1,"m":[64]},{"t":11,"d":1,"m":[64]},{"t":12,"d":1,"m":[62]},{"t":13,"d":1,"m":[62]},{"t":14,"d":2,"m":[60]},{"t":16,"d":1,"m":[67]},{"t":17,"d":1,"m":[67]},{"t":18,"d":1,"m":[65]},{"t":19,"d":1,"m":[65]},{"t":20,"d":1,"m":[64]},{"t":21,"d":1,"m":[64]},{"t":22,"d":2,"m":[62]},{"t":24,"d":1,"m":[67]},{"t":25,"d":1,"m":[67]},{"t":26,"d":1,"m":[65]},{"t":27,"d":1,"m":[65]},{"t":28,"d":1,"m":[64]},{"t":29,"d":1,"m":[64]},{"t":30,"d":2,"m":[62]},{"t":32,"d":1,"m":[60]},{"t":33,"d":1,"m":[60]},{"t":34,"d":1,"m":[67]},{"t":35,"d":1,"m":[67]},{"t":36,"d":1,"m":[69]},{"t":37,"d":1,"m":[69]},{"t":38,"d":2,"m":[67]},{"t":40,"d":1,"m":[65]},{"t":41,"d":1,"m":[65]},{"t":42,"d":1,"m":[64]},{"t":43,"d":1,"m":[64]},{"t":44,"d":1,"m":[62]},{"t":45,"d":1,"m":[62]},{"t":46,"d":2,"m":[60]}]},{"title":"Amazing Grace","by":"tradizionale","bpm":80,"meter":[3,4],"ev":[{"t":0,"d":1,"m":[62]},{"t":1,"d":2,"m":[67]},{"t":3,"d":0.5,"m":[71]},{"t":3.5,"d":0.5,"m":[67]},{"t":4,"d":2,"m":[71]},{"t":6,"d":1,"m":[69]},{"t":7,"d":2,"m":[67]},{"t":9,"d":1,"m":[64]},{"t":10,"d":2,"m":[62]},{"t":12,"d":1,"m":[62]},{"t":13,"d":2,"m":[67]},{"t":15,"d":0.5,"m":[71]},{"t":15.5,"d":0.5,"m":[67]},{"t":16,"d":2,"m":[71]},{"t":18,"d":0.5,"m":[69]},{"t":18.5,"d":0.5,"m":[71]},{"t":19,"d":5,"m":[74]},{"t":24,"d":0.5,"m":[71]},{"t":24.5,"d":0.5,"m":[74]},{"t":25,"d":2,"m":[74]},{"t":27,"d":0.5,"m":[71]},{"t":27.5,"d":0.5,"m":[67]},{"t":28,"d":2,"m":[71]},{"t":30,"d":1,"m":[69]},{"t":31,"d":2,"m":[67]},{"t":33,"d":1,"m":[64]},{"t":34,"d":2,"m":[62]},{"t":36,"d":1,"m":[62]},{"t":37,"d":2,"m":[67]},{"t":39,"d":0.5,"m":[71]},{"t":39.5,"d":0.5,"m":[67]},{"t":40,"d":2,"m":[71]},{"t":42,"d":1,"m":[69]},{"t":43,"d":5,"m":[67]}]},{"title":"Auld Lang Syne","by":"tradizionale scozzese","bpm":84,"meter":[4,4],"ev":[{"t":0,"d":1,"m":[60]},{"t":1,"d":1.5,"m":[65]},{"t":2.5,"d":0.5,"m":[65]},{"t":3,"d":1,"m":[65]},{"t":4,"d":1,"m":[69]},{"t":5,"d":1.5,"m":[67]},{"t":6.5,"d":0.5,"m":[65]},{"t":7,"d":1,"m":[67]},{"t":8,"d":1,"m":[69]},{"t":9,"d":1.5,"m":[65]},{"t":10.5,"d":0.5,"m":[65]},{"t":11,"d":1,"m":[69]},{"t":12,"d":1,"m":[72]},{"t":13,"d":3,"m":[74]},{"t":16,"d":1,"m":[74]},{"t":17,"d":1.5,"m":[72]},{"t":18.5,"d":0.5,"m":[69]},{"t":19,"d":1,"m":[69]},{"t":20,"d":1,"m":[65]},{"t":21,"d":1.5,"m":[67]},{"t":22.5,"d":0.5,"m":[65]},{"t":23,"d":1,"m":[67]},{"t":24,"d":1,"m":[69]},{"t":25,"d":1.5,"m":[65]},{"t":26.5,"d":0.5,"m":[62]},{"t":27,"d":1,"m":[62]},{"t":28,"d":1,"m":[60]},{"t":29,"d":3,"m":[65]}]},{"title":"Greensleeves","by":"tradizionale inglese","bpm":84,"meter":[6,8],"ev":[{"t":0,"d":0.5,"m":[69]},{"t":0.5,"d":1,"m":[72]},{"t":1.5,"d":0.5,"m":[74]},{"t":2,"d":0.75,"m":[76]},{"t":2.75,"d":0.25,"m":[77]},{"t":3,"d":0.5,"m":[76]},{"t":3.5,"d":1,"m":[74]},{"t":4.5,"d":0.5,"m":[71]},{"t":5,"d":0.75,"m":[67]},{"t":5.75,"d":0.25,"m":[69]},{"t":6,"d":0.5,"m":[71]},{"t":6.5,"d":1,"m":[72]},{"t":7.5,"d":0.5,"m":[69]},{"t":8,"d":0.75,"m":[69]},{"t":8.75,"d":0.25,"m":[68]},{"t":9,"d":0.5,"m":[69]},{"t":9.5,"d":1,"m":[71]},{"t":10.5,"d":0.5,"m":[68]},{"t":11,"d":1,"m":[64]},{"t":12,"d":0.5,"m":[69]},{"t":12.5,"d":1,"m":[72]},{"t":13.5,"d":0.5,"m":[74]},{"t":14,"d":0.75,"m":[76]},{"t":14.75,"d":0.25,"m":[77]},{"t":15,"d":0.5,"m":[76]},{"t":15.5,"d":1,"m":[74]},{"t":16.5,"d":0.5,"m":[71]},{"t":17,"d":0.75,"m":[67]},{"t":17.75,"d":0.25,"m":[69]},{"t":18,"d":0.5,"m":[71]},{"t":18.5,"d":0.75,"m":[72]},{"t":19.25,"d":0.25,"m":[71]},{"t":19.5,"d":0.5,"m":[69]},{"t":20,"d":0.75,"m":[68]},{"t":20.75,"d":0.25,"m":[66]},{"t":21,"d":0.5,"m":[68]},{"t":21.5,"d":1.5,"m":[69]},{"t":23,"d":1,"m":[69]}]},{"title":"Sakura Sakura","by":"tradizionale giapponese","bpm":72,"meter":[4,4],"ev":[{"t":0,"d":1,"m":[69]},{"t":1,"d":1,"m":[69]},{"t":2,"d":2,"m":[71]},{"t":4,"d":1,"m":[69]},{"t":5,"d":1,"m":[69]},{"t":6,"d":2,"m":[71]},{"t":8,"d":1,"m":[69]},{"t":9,"d":1,"m":[71]},{"t":10,"d":1,"m":[72]},{"t":11,"d":1,"m":[71]},{"t":12,"d":1,"m":[69]},{"t":13,"d":0.5,"m":[71]},{"t":13.5,"d":0.5,"m":[69]},{"t":14,"d":2,"m":[65]},{"t":16,"d":1,"m":[64]},{"t":17,"d":1,"m":[60]},{"t":18,"d":1,"m":[64]},{"t":19,"d":1,"m":[65]},{"t":20,"d":1,"m":[64]},{"t":21,"d":0.5,"m":[64]},{"t":21.5,"d":0.5,"m":[60]},{"t":22,"d":2,"m":[59]},{"t":24,"d":1,"m":[69]},{"t":25,"d":1,"m":[71]},{"t":26,"d":1,"m":[72]},{"t":27,"d":1,"m":[71]},{"t":28,"d":1,"m":[69]},{"t":29,"d":0.5,"m":[71]},{"t":29.5,"d":0.5,"m":[69]},{"t":30,"d":2,"m":[65]},{"t":32,"d":1,"m":[64]},{"t":33,"d":1,"m":[60]},{"t":34,"d":1,"m":[64]},{"t":35,"d":1,"m":[65]},{"t":36,"d":1,"m":[64]},{"t":37,"d":0.5,"m":[64]},{"t":37.5,"d":0.5,"m":[60]},{"t":38,"d":2,"m":[59]},{"t":40,"d":1,"m":[69]},{"t":41,"d":1,"m":[69]},{"t":42,"d":2,"m":[71]},{"t":44,"d":1,"m":[69]},{"t":45,"d":1,"m":[69]},{"t":46,"d":2,"m":[71]},{"t":48,"d":1,"m":[64]},{"t":49,"d":1,"m":[65]},{"t":50,"d":0.5,"m":[71]},{"t":50.5,"d":0.5,"m":[69]},{"t":51,"d":1,"m":[65]},{"t":52,"d":4,"m":[64]}]},{"title":"When the Saints Go Marching In","by":"tradizionale","bpm":120,"meter":[4,4],"ev":[{"t":1,"d":1,"m":[60]},{"t":2,"d":1,"m":[64]},{"t":3,"d":1,"m":[65]},{"t":4,"d":4,"m":[67]},{"t":9,"d":1,"m":[60]},{"t":10,"d":1,"m":[64]},{"t":11,"d":1,"m":[65]},{"t":12,"d":4,"m":[67]},{"t":17,"d":1,"m":[60]},{"t":18,"d":1,"m":[64]},{"t":19,"d":1,"m":[65]},{"t":20,"d":2,"m":[67]},{"t":22,"d":2,"m":[64]},{"t":24,"d":2,"m":[60]},{"t":26,"d":2,"m":[64]},{"t":28,"d":4,"m":[62]},{"t":33,"d":1,"m":[64]},{"t":34,"d":1,"m":[64]},{"t":35,"d":1,"m":[62]},{"t":36,"d":3,"m":[60]},{"t":39,"d":1,"m":[60]},{"t":40,"d":2,"m":[64]},{"t":42,"d":2,"m":[67]},{"t":44,"d":2,"m":[67]},{"t":46,"d":4,"m":[65]},{"t":50,"d":1,"m":[64]},{"t":51,"d":1,"m":[65]},{"t":52,"d":2,"m":[67]},{"t":54,"d":2,"m":[64]},{"t":56,"d":2,"m":[60]},{"t":58,"d":2,"m":[62]},{"t":60,"d":4,"m":[60]}]},{"title":"Scotland the Brave","by":"tradizionale scozzese","bpm":96,"meter":[2,4],"ev":[{"t":0,"d":1,"m":[67]},{"t":1,"d":0.75,"m":[67]},{"t":1.75,"d":0.25,"m":[69]},{"t":2,"d":0.5,"m":[71]},{"t":2.5,"d":0.5,"m":[67]},{"t":3,"d":0.5,"m":[71]},{"t":3.5,"d":0.5,"m":[74]},{"t":4,"d":1,"m":[79]},{"t":5,"d":0.75,"m":[79]},{"t":5.75,"d":0.25,"m":[78]},{"t":6,"d":0.5,"m":[79]},{"t":6.5,"d":0.5,"m":[74]},{"t":7,"d":0.5,"m":[71]},{"t":7.5,"d":0.5,"m":[67]},{"t":8,"d":1,"m":[72]},{"t":9,"d":0.75,"m":[76]},{"t":9.75,"d":0.25,"m":[72]},{"t":10,"d":0.5,"m":[71]},{"t":10.5,"d":0.5,"m":[74]},{"t":11,"d":0.5,"m":[71]},{"t":11.5,"d":0.5,"m":[67]},{"t":12,"d":1,"m":[69]},{"t":13,"d":0.75,"m":[74]},{"t":13.75,"d":0.25,"m":[76]},{"t":14,"d":0.5,"m":[74]},{"t":14.5,"d":0.5,"m":[72]},{"t":15,"d":0.5,"m":[71]},{"t":15.5,"d":0.5,"m":[69]},{"t":16,"d":1,"m":[67]},{"t":17,"d":0.75,"m":[67]},{"t":17.75,"d":0.25,"m":[69]},{"t":18,"d":0.5,"m":[71]},{"t":18.5,"d":0.5,"m":[67]},{"t":19,"d":0.5,"m":[71]},{"t":19.5,"d":0.5,"m":[74]},{"t":20,"d":1,"m":[79]},{"t":21,"d":0.75,"m":[79]},{"t":21.75,"d":0.25,"m":[78]},{"t":22,"d":0.5,"m":[79]},{"t":22.5,"d":0.5,"m":[74]},{"t":23,"d":0.5,"m":[71]},{"t":23.5,"d":0.5,"m":[67]},{"t":24,"d":1,"m":[72]},{"t":25,"d":0.5,"m":[76]},{"t":25.5,"d":0.5,"m":[72]},{"t":26,"d":0.25,"m":[71]},{"t":26.25,"d":0.75,"m":[74]},{"t":27,"d":0.5,"m":[71]},{"t":27.5,"d":0.5,"m":[67]},{"t":28,"d":1,"m":[69]},{"t":29,"d":0.75,"m":[67]},{"t":29.75,"d":0.25,"m":[69]},{"t":30,"d":1,"m":[67]},{"t":31,"d":0.25,"m":[74]},{"t":31.25,"d":0.25,"m":[76]},{"t":31.5,"d":0.25,"m":[78]},{"t":31.75,"d":0.25,"m":[79]},{"t":32,"d":1,"m":[81]},{"t":33,"d":0.75,"m":[81]},{"t":33.75,"d":0.25,"m":[83]},{"t":34,"d":0.5,"m":[81]},{"t":34.5,"d":0.5,"m":[78]},{"t":35,"d":1,"m":[74]},{"t":36,"d":1,"m":[79]},{"t":37,"d":0.75,"m":[83]},{"t":37.75,"d":0.25,"m":[81]},{"t":38,"d":0.5,"m":[79]},{"t":38.5,"d":0.5,"m":[76]},{"t":39,"d":1,"m":[74]},{"t":40,"d":1,"m":[79]},{"t":41,"d":0.5,"m":[81]},{"t":41.5,"d":0.5,"m":[79]},{"t":42,"d":1,"m":[78]},{"t":43,"d":0.5,"m":[79]},{"t":43.5,"d":0.5,"m":[78]},{"t":44,"d":0.5,"m":[74]},{"t":44.5,"d":0.5,"m":[79]},{"t":45,"d":0.5,"m":[78]},{"t":45.5,"d":0.5,"m":[76]},{"t":46,"d":0.5,"m":[74]},{"t":46.5,"d":0.5,"m":[72]},{"t":47,"d":0.5,"m":[71]},{"t":47.5,"d":0.5,"m":[69]},{"t":48,"d":1,"m":[67]},{"t":49,"d":0.75,"m":[67]},{"t":49.75,"d":0.25,"m":[69]},{"t":50,"d":0.5,"m":[71]},{"t":50.5,"d":0.5,"m":[67]},{"t":51,"d":0.5,"m":[71]},{"t":51.5,"d":0.5,"m":[74]},{"t":52,"d":1,"m":[79]},{"t":53,"d":0.75,"m":[79]},{"t":53.75,"d":0.25,"m":[78]},{"t":54,"d":0.5,"m":[79]},{"t":54.5,"d":0.5,"m":[74]},{"t":55,"d":0.5,"m":[71]},{"t":55.5,"d":0.5,"m":[67]},{"t":56,"d":1,"m":[72]},{"t":57,"d":0.5,"m":[76]},{"t":57.5,"d":0.5,"m":[72]},{"t":58,"d":0.25,"m":[71]},{"t":58.25,"d":0.75,"m":[74]},{"t":59,"d":0.5,"m":[71]},{"t":59.5,"d":0.5,"m":[67]},{"t":60,"d":1,"m":[69]},{"t":61,"d":0.75,"m":[67]},{"t":61.75,"d":0.25,"m":[69]},{"t":62,"d":1.5,"m":[67]}]},{"title":"Korobeiniki","by":"canzone popolare russa, il tema di Tetris","bpm":140,"meter":[4,4],"ev":[{"t":0,"d":1,"m":[76]},{"t":1,"d":0.5,"m":[71]},{"t":1.5,"d":0.5,"m":[72]},{"t":2,"d":1,"m":[74]},{"t":3,"d":0.5,"m":[72]},{"t":3.5,"d":0.5,"m":[71]},{"t":4,"d":1,"m":[69]},{"t":5,"d":0.5,"m":[69]},{"t":5.5,"d":0.5,"m":[72]},{"t":6,"d":1,"m":[76]},{"t":7,"d":0.5,"m":[74]},{"t":7.5,"d":0.5,"m":[72]},{"t":8,"d":1.5,"m":[71]},{"t":9.5,"d":0.5,"m":[72]},{"t":10,"d":1,"m":[74]},{"t":11,"d":1,"m":[76]},{"t":12,"d":1,"m":[72]},{"t":13,"d":1,"m":[69]},{"t":14,"d":2,"m":[69]},{"t":16.5,"d":1,"m":[74]},{"t":17.5,"d":0.5,"m":[77]},{"t":18,"d":1,"m":[81]},{"t":19,"d":0.5,"m":[79]},{"t":19.5,"d":0.5,"m":[77]},{"t":20,"d":1.5,"m":[76]},{"t":21.5,"d":0.5,"m":[72]},{"t":22,"d":1,"m":[76]},{"t":23,"d":0.5,"m":[74]},{"t":23.5,"d":0.5,"m":[72]},{"t":24,"d":1,"m":[71]},{"t":25,"d":0.5,"m":[71]},{"t":25.5,"d":0.5,"m":[72]},{"t":26,"d":1,"m":[74]},{"t":27,"d":1,"m":[76]},{"t":28,"d":1,"m":[72]},{"t":29,"d":1,"m":[69]},{"t":30,"d":2,"m":[69]},{"t":32,"d":1,"m":[76]},{"t":33,"d":0.5,"m":[71]},{"t":33.5,"d":0.5,"m":[72]},{"t":34,"d":1,"m":[74]},{"t":35,"d":0.5,"m":[72]},{"t":35.5,"d":0.5,"m":[71]},{"t":36,"d":1,"m":[69]},{"t":37,"d":0.5,"m":[69]},{"t":37.5,"d":0.5,"m":[72]},{"t":38,"d":1,"m":[76]},{"t":39,"d":0.5,"m":[74]},{"t":39.5,"d":0.5,"m":[72]},{"t":40,"d":1.5,"m":[71]},{"t":41.5,"d":0.5,"m":[72]},{"t":42,"d":1,"m":[74]},{"t":43,"d":1,"m":[76]},{"t":44,"d":1,"m":[72]},{"t":45,"d":1,"m":[69]},{"t":46,"d":2,"m":[69]},{"t":48.5,"d":1,"m":[74]},{"t":49.5,"d":0.5,"m":[77]},{"t":50,"d":1,"m":[81]},{"t":51,"d":0.5,"m":[79]},{"t":51.5,"d":0.5,"m":[77]},{"t":52,"d":1.5,"m":[76]},{"t":53.5,"d":0.5,"m":[72]},{"t":54,"d":1,"m":[76]},{"t":55,"d":0.5,"m":[74]},{"t":55.5,"d":0.5,"m":[72]},{"t":56,"d":1,"m":[71]},{"t":57,"d":0.5,"m":[71]},{"t":57.5,"d":0.5,"m":[72]},{"t":58,"d":1,"m":[74]},{"t":59,"d":1,"m":[76]},{"t":60,"d":1,"m":[72]},{"t":61,"d":1,"m":[69]},{"t":62,"d":2,"m":[69]}]},{"title":"Nell’antro del re della montagna","by":"Grieg, da Peer Gynt","bpm":120,"meter":[4,4],"ev":[{"t":0,"d":0.5,"m":[69]},{"t":0.5,"d":0.5,"m":[71]},{"t":1,"d":0.5,"m":[72]},{"t":1.5,"d":0.5,"m":[74]},{"t":2,"d":0.5,"m":[76]},{"t":2.5,"d":0.5,"m":[72]},{"t":3,"d":1,"m":[76]},{"t":4,"d":0.5,"m":[75]},{"t":4.5,"d":0.5,"m":[71]},{"t":5,"d":1,"m":[75]},{"t":6,"d":0.5,"m":[74]},{"t":6.5,"d":0.5,"m":[70]},{"t":7,"d":1,"m":[74]},{"t":8,"d":0.5,"m":[69]},{"t":8.5,"d":0.5,"m":[71]},{"t":9,"d":0.5,"m":[72]},{"t":9.5,"d":0.5,"m":[74]},{"t":10,"d":0.5,"m":[76]},{"t":10.5,"d":0.5,"m":[72]},{"t":11,"d":0.5,"m":[76]},{"t":11.5,"d":0.5,"m":[81]},{"t":12,"d":0.5,"m":[79]},{"t":12.5,"d":0.5,"m":[76]},{"t":13,"d":0.5,"m":[72]},{"t":13.5,"d":0.5,"m":[76]},{"t":14,"d":2,"m":[79]},{"t":16,"d":0.5,"m":[69]},{"t":16.5,"d":0.5,"m":[71]},{"t":17,"d":0.5,"m":[72]},{"t":17.5,"d":0.5,"m":[74]},{"t":18,"d":0.5,"m":[76]},{"t":18.5,"d":0.5,"m":[72]},{"t":19,"d":1,"m":[76]},{"t":20,"d":0.5,"m":[75]},{"t":20.5,"d":0.5,"m":[71]},{"t":21,"d":1,"m":[75]},{"t":22,"d":0.5,"m":[74]},{"t":22.5,"d":0.5,"m":[70]},{"t":23,"d":1,"m":[74]},{"t":24,"d":0.5,"m":[69]},{"t":24.5,"d":0.5,"m":[71]},{"t":25,"d":0.5,"m":[72]},{"t":25.5,"d":0.5,"m":[74]},{"t":26,"d":0.5,"m":[76]},{"t":26.5,"d":0.5,"m":[72]},{"t":27,"d":0.5,"m":[76]},{"t":27.5,"d":0.5,"m":[81]},{"t":28,"d":0.5,"m":[79]},{"t":28.5,"d":0.5,"m":[76]},{"t":29,"d":0.5,"m":[72]},{"t":29.5,"d":0.5,"m":[76]},{"t":30,"d":2,"m":[79]}]},{"title":"Drunken Sailor","by":"canto marinaresco tradizionale","bpm":110,"meter":[4,4],"ev":[{"t":0,"d":1,"m":[69]},{"t":1,"d":0.5,"m":[69]},{"t":1.5,"d":0.5,"m":[69]},{"t":2,"d":1,"m":[69]},{"t":3,"d":0.5,"m":[69]},{"t":3.5,"d":0.5,"m":[69]},{"t":4,"d":1,"m":[69]},{"t":5,"d":1,"m":[62]},{"t":6,"d":1,"m":[65]},{"t":7,"d":1,"m":[69]},{"t":8,"d":1,"m":[67]},{"t":9,"d":0.5,"m":[67]},{"t":9.5,"d":0.5,"m":[67]},{"t":10,"d":1,"m":[67]},{"t":11,"d":0.5,"m":[67]},{"t":11.5,"d":0.5,"m":[67]},{"t":12,"d":1,"m":[67]},{"t":13,"d":1,"m":[60]},{"t":14,"d":1,"m":[64]},{"t":15,"d":1,"m":[67]},{"t":16,"d":1,"m":[69]},{"t":17,"d":0.5,"m":[69]},{"t":17.5,"d":0.5,"m":[69]},{"t":18,"d":1,"m":[69]},{"t":19,"d":0.5,"m":[69]},{"t":19.5,"d":0.5,"m":[69]},{"t":20,"d":1,"m":[69]},{"t":21,"d":1,"m":[71]},{"t":22,"d":1,"m":[72]},{"t":23,"d":1,"m":[74]},{"t":24,"d":1,"m":[72]},{"t":25,"d":1,"m":[69]},{"t":26,"d":1,"m":[67]},{"t":27,"d":1,"m":[64]},{"t":28,"d":2,"m":[62]},{"t":30,"d":2,"m":[62]},{"t":32,"d":2,"m":[69]},{"t":34,"d":2,"m":[69]},{"t":36,"d":1,"m":[69]},{"t":37,"d":1,"m":[62]},{"t":38,"d":1,"m":[65]},{"t":39,"d":1,"m":[69]},{"t":40,"d":2,"m":[67]},{"t":42,"d":2,"m":[67]},{"t":44,"d":1,"m":[67]},{"t":45,"d":1,"m":[60]},{"t":46,"d":1,"m":[64]},{"t":47,"d":1,"m":[67]},{"t":48,"d":2,"m":[69]},{"t":50,"d":2,"m":[69]},{"t":52,"d":1,"m":[69]},{"t":53,"d":1,"m":[71]},{"t":54,"d":1,"m":[72]},{"t":55,"d":1,"m":[74]},{"t":56,"d":1,"m":[72]},{"t":57,"d":1,"m":[69]},{"t":58,"d":1,"m":[67]},{"t":59,"d":1,"m":[64]},{"t":60,"d":2,"m":[62]},{"t":62,"d":2,"m":[62]}]},{"title":"Skye Boat Song","by":"tradizionale scozzese, da cui nasce la sigla di Outlander","bpm":100,"meter":[3,4],"ev":[{"t":0,"d":1.5,"m":[62]},{"t":1.5,"d":0.5,"m":[64]},{"t":2,"d":1,"m":[62]},{"t":3,"d":2,"m":[67]},{"t":5,"d":1,"m":[67]},{"t":6,"d":1.5,"m":[69]},{"t":7.5,"d":0.5,"m":[71]},{"t":8,"d":1,"m":[69]},{"t":9,"d":3,"m":[74]},{"t":12,"d":1.5,"m":[71]},{"t":13.5,"d":0.5,"m":[69]},{"t":14,"d":1,"m":[71]},{"t":15,"d":2,"m":[64]},{"t":17,"d":0.5,"m":[66]},{"t":17.5,"d":0.5,"m":[64]},{"t":18,"d":6,"m":[62]},{"t":24,"d":1.5,"m":[62]},{"t":25.5,"d":0.5,"m":[64]},{"t":26,"d":1,"m":[62]},{"t":27,"d":2,"m":[67]},{"t":29,"d":1,"m":[67]},{"t":30,"d":1.5,"m":[69]},{"t":31.5,"d":0.5,"m":[71]},{"t":32,"d":1,"m":[69]},{"t":33,"d":3,"m":[74]},{"t":36,"d":1.5,"m":[71]},{"t":37.5,"d":0.5,"m":[69]},{"t":38,"d":1,"m":[71]},{"t":39,"d":2,"m":[64]},{"t":41,"d":0.5,"m":[66]},{"t":41.5,"d":0.5,"m":[64]},{"t":42,"d":6,"m":[62]}]},{"title":"Per Elisa","by":"Beethoven","bpm":75,"meter":[3,8],"ev":[{"t":0,"d":0.25,"m":[76]},{"t":0.25,"d":0.25,"m":[75]},{"t":0.5,"d":0.25,"m":[76]},{"t":0.75,"d":0.25,"m":[75]},{"t":1,"d":0.25,"m":[76]},{"t":1.25,"d":0.25,"m":[71]},{"t":1.5,"d":0.25,"m":[74]},{"t":1.75,"d":0.25,"m":[72]},{"t":2,"d":0.5,"m":[69]},{"t":2.75,"d":0.25,"m":[60]},{"t":3,"d":0.25,"m":[64]},{"t":3.25,"d":0.25,"m":[69]},{"t":3.5,"d":0.5,"m":[71]},{"t":4.25,"d":0.25,"m":[64]},{"t":4.5,"d":0.25,"m":[68]},{"t":4.75,"d":0.25,"m":[71]},{"t":5,"d":0.5,"m":[72]},{"t":5.75,"d":0.25,"m":[64]},{"t":6,"d":0.25,"m":[76]},{"t":6.25,"d":0.25,"m":[75]},{"t":6.5,"d":0.25,"m":[76]},{"t":6.75,"d":0.25,"m":[75]},{"t":7,"d":0.25,"m":[76]},{"t":7.25,"d":0.25,"m":[71]},{"t":7.5,"d":0.25,"m":[74]},{"t":7.75,"d":0.25,"m":[72]},{"t":8,"d":0.5,"m":[69]},{"t":8.75,"d":0.25,"m":[60]},{"t":9,"d":0.25,"m":[64]},{"t":9.25,"d":0.25,"m":[69]},{"t":9.5,"d":0.5,"m":[71]},{"t":10.25,"d":0.25,"m":[64]},{"t":10.5,"d":0.25,"m":[72]},{"t":10.75,"d":0.25,"m":[71]},{"t":11,"d":1,"m":[69]}]}];
const SM={raw:null,ev:[],sh:0,mode:'listen',playing:false,beat:0,idx:0,pos:0,vb:0,auto:[],done:false,raf:0,folded:0,cache:''};
if(!S.sview)S.sview='notes';if(!S.stempo)S.stempo=1;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SCALE_IT={maj:'maggiore',min:'minore',pmaj:'pentatonica maggiore',pmin:'pentatonica minore',chr:'cromatica'};

/* Adatta il brano allo strumento: trasposizione, tonalità e scala che richiedono meno compromessi */
function fitSong(raw){
  if(S.inst==='tamb')return{sh:0,cost:0};
  const ms=[...new Set(raw.ev.flatMap(e=>e.m))];let best=null;
  const take=c=>{if(!best||c.cost<best.cost)best=c;};
  for(let sh=-24;sh<=24;sh++){
    const T=ms.map(m=>m+sh),shc=(sh%12?10:0)+Math.abs(sh)/12;
    if(S.inst==='pipes'){
      for(const pn of ['dia','all']){const L=pn==='all'?PIPE_ALL:PIPE_DIA,out=T.filter(m=>!L.includes(m)).length;
        take({sh,pnotes:pn,out,ob:0,cost:out*1000+(pn==='all'?50:0)+shc});}
    }else{
      const base=S.inst==='rec'?12:0;
      for(const key of [60,62,64,65,67,69])for(const sc of Object.keys(SCALES)){
        const L=SCALES[sc].map(x=>x+key+base);let out=0,ob=0;
        for(const m of T){if(L.includes(m))continue;if(L.includes(m-12)){ob++;continue;}out++;}
        take({sh,key,scale:sc,out,ob,cost:out*1000+(ob?100+ob:0)+(sc==='chr'?50:0)+shc-(key===+S.key&&sc===S.scale?.5:0)});
      }
    }
  }
  return best;
}
function layoutMap(){
  const map=new Map(),ns=notes();
  ns.forEach((n,i)=>{if(!map.has(n.midi))map.set(n.midi,{i,ob:false});});
  if(S.inst!=='pipes')ns.forEach((n,i)=>{if(!map.has(n.midi+12))map.set(n.midi+12,{i,ob:true});});
  return map;
}
function mapSong(){
  if(S.inst==='tamb'){const bar=SM.raw.meter?SM.raw.meter[0]*4/SM.raw.meter[1]:4,pc=percOf(SM.raw);
    if(pc.length)SM.ev=pc.map((h,k)=>{const nx=pc.slice(k+1).find(x=>x.t>h.t+1e-6);return{t:h.t,d:nx?Math.min(1,nx.t-h.t):.5,acc:h.k==='low',k:h.k,p:[{m:-1,i:-1,ob:false,k:h.k}]};})
      .filter((e,k,a)=>!k||Math.abs(a[k-1].t-e.t)>1e-6||a[k-1].k!==e.k);
    else SM.ev=SM.raw.ev.map(e=>({t:e.t,d:e.d,acc:Math.abs(e.t/bar-Math.round(e.t/bar))<.01,p:[{m:-1,i:-1,ob:false}]}));
    SM.folded=0;return;}
  const map=layoutMap(),keys=[...map.keys()];let folded=0;
  SM.ev=SM.raw.ev.map(e=>{const p=[];
    for(const m0 of e.m){let m=m0+SM.sh;
      if(!map.has(m)){folded++;let c=null;for(const k of [12,-12,24,-24])if(map.has(m+k)){c=m+k;break;}
        if(c==null)c=keys.reduce((a,b)=>Math.abs(b-m)<Math.abs(a-m)?b:a);m=c;}
      const x=map.get(m);if(!p.some(q=>q.m===m))p.push({m,i:x.i,ob:x.ob});}
    return{t:e.t,d:e.d,p};});
  SM.folded=folded;
}
function refitSong(announce){
  const f=fitSong(SM.raw);SM.sh=f.sh;
  if(S.inst==='pipes'){S.pnotes=f.pnotes;ctl.pnotes.value=f.pnotes;}
  else if(S.inst!=='tamb'){S.key=f.key;S.scale=f.scale;ctl.key.value=f.key;ctl.scale.value=f.scale;}
  save();render();
  if(!announce)return;
  const msg=[S.inst==='tamb'?(percOf(SM.raw).length?'Il tamburello suona la sua traccia: colpo basso, colpo e sonagli':'Il tamburello suona il ritmo della melodia, con un accento sul primo tempo'):S.inst==='pipes'?(S.pnotes==='all'?'Chanter con tutte le note':'Chanter nella scala di Sol'):'Flauto in '+NOTE_IT[S.key%12]+', scala '+SCALE_IT[S.scale]];
  if(SM.sh%12){const n=Math.abs(SM.sh);msg.push('brano trasposto di '+n+(n===1?' semitono':' semitoni'));}
  if(SM.ev.some(e=>e.p.some(q=>q.ob)))msg.push('le note più acute si suonano con Soffio forte');
  if(SM.folded)msg.push(SM.folded===1?'1 nota fuori estensione spostata di ottava':SM.folded+' note fuori estensione spostate di ottava');
  hintFlash(msg.join('; ')+'.');
}

/* Caricamento di un brano */
const songbar=$('#songbar');
function loadSong(raw){
  stopListen();SM.raw=raw;SM.mode=SM.mode||'listen';SM.done=false;
  refitSong(true);
  SM.pos=0;SM.beat=Math.max(0,SM.ev[0].t-.5);SM.vb=SM.mode==='along'?SM.ev[0].t:SM.beat;SM.idx=0;SM.cache='';
  songbar.hidden=false;$('#sbTitle').textContent=raw.title;
  updateSongUI();if(!SM.raf)SM.raf=requestAnimationFrame(tick);
}
function closeSong(){
  stopListen();SM.raw=null;SM.ev=[];songbar.hidden=true;
  if(SM.raf)cancelAnimationFrame(SM.raf);SM.raf=0;markTargets();refresh();
}
function songOnRender(){if(SM.raw)mapSong();markTargets();}

/* Ascolta */
const spb=()=>60/(SM.raw.bpm*S.stempo);
const songEnd=()=>{const l=SM.ev[SM.ev.length-1];return l?l.t+l.d:0;};
function startListen(){
  initAudio();
  if(!whenReady(startListen))return;
  if(SM.done||SM.beat>=songEnd()){SM.beat=Math.max(0,SM.ev[0].t-.5);SM.done=false;}
  if(accompanying()&&!ready('tamb')){hint('Carico i suoni…');ensureBank('tamb').then(()=>{hideHint();startListen();});return;}
  SM.idx=SM.ev.findIndex(e=>e.t>=SM.beat-1e-6);if(SM.idx<0)SM.idx=SM.ev.length;
  const pc=percOf(SM.raw);SM.pidx=pc.findIndex(h=>h.t>=SM.beat-1e-6);if(SM.pidx<0)SM.pidx=pc.length;
  SM.playing=true;SM.t0=ctx.currentTime-SM.beat*spb();wake();updateSongUI();
}
function stopListen(){
  SM.playing=false;
  if(ctx)SM.auto.slice().forEach(stopAuto);SM.auto=[];
  if(SM.raw)updateSongUI();refresh();
}
function stopAuto(a){
  SM.auto=SM.auto.filter(x=>x!==a);
  if(!a.h)return;
  if(a.inst==='pipes')stopVoice(a.h,ctx.currentTime,.045);else ENG[a.inst].stop(a.h);
}
function startEvent(e){
  if(S.inst==='tamb'){if(e.k)percHit(e.k,1);else if(e.acc)tambStrike(.1);else tambHit(.7,'hit');return;}
  const t=ctx.currentTime,inst=S.inst;
  for(const q of e.p){
    let h;
    if(inst==='pipes'){
      if(!P.bag)inflate();
      const ending=SM.auto.filter(a=>a.end<=e.t+.02);ending.forEach(a=>{SM.auto=SM.auto.filter(x=>x!==a);});
      const sounding=ending.length||SM.auto.length||[...touches.values()].some(x=>x.h);
      if(S.grace&&ending.length&&e.p.length===1)h=pipesGrace(ending.map(a=>a.h).filter(Boolean),q.m);
      else{ending.forEach(a=>a.h&&stopVoice(a.h,t,.03));h=pv(q.m,{at:t,attack:!sounding,fade:.006});}
    }else h=ENG[inst].start(q.m);
    SM.auto.push({i:q.i,m:q.m,ob:q.ob,h,inst,end:e.t+(inst==='pipes'?e.d:Math.max(e.d*.9,e.d-.25))});
  }
}
function stepListen(){
  SM.beat=(ctx.currentTime-SM.t0)/spb();
  let changed=false;
  while(SM.idx<SM.ev.length&&SM.ev[SM.idx].t<=SM.beat){startEvent(SM.ev[SM.idx]);SM.idx++;changed=true;}
  const pc=accompanying()?percOf(SM.raw):[];
  while(SM.pidx<pc.length&&pc[SM.pidx].t<=SM.beat){percHit(pc[SM.pidx].k,.75);SM.pidx++;}
  for(const a of SM.auto.slice())if(SM.beat>=a.end){stopAuto(a);changed=true;}
  if(SM.idx>=SM.ev.length&&!SM.auto.length&&SM.pidx>=pc.length){
    SM.playing=false;SM.done=true;
    if(S.inst==='pipes'&&P.bag&&![...touches.values()].some(x=>x.h))deflate(false);
    updateSongUI();changed=true;
  }
  if(changed)refresh();
}

/* Suona con me */
function songHit(m){
  if(!SM.raw||SM.mode!=='along'||SM.done)return;
  const e=SM.ev[SM.pos];if(!e)return;
  if(S.inst!=='tamb'){
    const need=e.p.map(q=>q.m);if(!need.includes(m))return;
    const held=new Set([...touches.values()].filter(x=>x.h).map(x=>x.m));
    if(!need.every(x=>held.has(x)))return;
  }else if(m!==-1)return;
  SM.pos++;
  if(SM.pos>=SM.ev.length){SM.pos=SM.ev.length-1;SM.done=true;hintFlash('Brano completato! Premi Ricomincia per suonarlo di nuovo.');}
  markTargets();updateSongUI();
}
function markTargets(){
  bandEls.forEach(el=>el.classList.remove('target'));ob.classList.remove('target');tambEl.classList.remove('target');
  if(!SM.raw||SM.mode!=='along'||SM.done)return;
  const e=SM.ev[SM.pos];if(!e)return;
  if(S.inst==='tamb'){tambEl.classList.add('target');return;}
  e.p.forEach(q=>{const el=bandEls.find(b=>+b.dataset.i===q.i);if(el)el.classList.add('target');if(q.ob)ob.classList.add('target');});
}

/* Barra del brano */
const ICON={play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>',
  pause:'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  again:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12a7 7 0 1 0 2.1-5"/><path d="M5 4v4h4"/></svg>'};
const sbPlay=$('#sbPlay'),sbTempo=$('#sbTempo'),sbView=$('#sbView'),sbFollow=$('#sbFollow'),staffEl=$('#sbStaff');
function updateSongUI(){
  if(!SM.raw)return;
  const along=SM.mode==='along';
  sbPlay.innerHTML=along?ICON.again:(SM.playing?ICON.pause:ICON.play);
  sbPlay.setAttribute('aria-label',along?'Ricomincia':(SM.playing?'Pausa':'Ascolta il brano'));
  document.querySelectorAll('#sbMode button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m===SM.mode));
  $('#sbPerc').hidden=!(percOf(SM.raw).length&&S.inst!=='tamb');$('#sbPerc').setAttribute('aria-pressed',S.accomp!==false);
  sbTempo.hidden=along;$('#sbRestart').hidden=along;sbTempo.textContent='Velocità '+Math.round(S.stempo*100)+'%';
  sbView.setAttribute('aria-pressed',S.sview==='staff');sbFollow.dataset.view=S.sview;
  markTargets();SM.cache='';
}
$('#sbRestart').addEventListener('click',()=>{
  if(!SM.raw)return;
  stopListen();SM.done=false;SM.beat=Math.max(0,SM.ev[0].t-.5);SM.idx=0;SM.cache='';
  startListen();
});
sbPlay.addEventListener('click',()=>{
  if(!SM.raw)return;
  if(SM.mode==='along'){initAudio();ensureBank(S.inst);SM.pos=0;SM.done=false;updateSongUI();return;}
  if(SM.playing)stopListen();else startListen();
});
document.querySelectorAll('#sbMode button').forEach(b=>b.addEventListener('click',()=>{
  if(SM.mode===b.dataset.m)return;
  stopListen();SM.mode=b.dataset.m;SM.pos=0;SM.done=false;SM.beat=Math.max(0,SM.ev[0].t-.5);
  if(SM.mode==='along'){initAudio();ensureBank(S.inst);}
  updateSongUI();
}));
sbTempo.addEventListener('click',()=>{
  const steps=[.5,.75,1,1.25,1.5,1.75,2],k=(steps.indexOf(S.stempo)+1)%steps.length;
  const b=SM.beat;S.stempo=steps[k<0?2:k];save();
  if(SM.playing)SM.t0=ctx.currentTime-b*spb();updateSongUI();
});
$('#sbPerc').addEventListener('click',()=>{
  S.accomp=S.accomp===false;save();updateSongUI();
  if(SM.playing){const pc=percOf(SM.raw);SM.pidx=pc.findIndex(h=>h.t>=SM.beat-1e-6);if(SM.pidx<0)SM.pidx=pc.length;if(accompanying())ensureBank('tamb');}
  hintFlash(S.accomp===false?'Tamburello di accompagnamento spento.':'Il tamburello accompagna la melodia.');
});
sbView.addEventListener('click',()=>{S.sview=S.sview==='staff'?'notes':'staff';save();updateSongUI();});
$('#sbClose').addEventListener('click',closeSong);

/* Ciclo di disegno: avanza l’ascolto, anima il pentagramma, aggiorna le prossime note */
function tick(){
  if(!SM.raw){SM.raf=0;return;}
  if(SM.playing&&ctx)stepListen();
  const along=SM.mode==='along';
  const target=along?(SM.ev[SM.pos]?SM.ev[SM.pos].t:0):SM.beat;
  SM.vb=along?SM.vb+(target-SM.vb)*.18:target;
  if(S.sview==='staff')drawStaff(SM.vb);
  drawNotes();
  SM.raf=requestAnimationFrame(tick);
}
const label=e=>e?e.p.map(q=>q.m<0?(q.k?PERC_NAME[q.k]:e.acc?'Colpo forte':'Colpo'):NOTE_IT[pc(q.m)]+'<sup>'+oct(q.m)+'</sup>').join(' '):'';
function curK(){return SM.mode==='along'?SM.pos:Math.max(0,SM.idx-1);}
function drawNotes(){
  const n=SM.ev.length;let k,now,nx1,nx2,frac;
  if(SM.mode==='along'){k=SM.pos;frac=SM.done?1:k/n;}
  else{const playingNow=SM.auto.length>0;k=playingNow?SM.idx-1:SM.idx;if(k>=n)k=n-1;const end=songEnd();frac=SM.done?1:Math.min(1,SM.beat/end);}
  now=SM.ev[k];nx1=SM.ev[k+1];nx2=SM.ev[k+2];
  $('#sbBar').style.width=(frac*100).toFixed(1)+'%';
  const key=k+'|'+SM.done+'|'+SM.mode+'|'+n;
  if(key===SM.cache)return;SM.cache=key;
  $('#sbCount').textContent=SM.done?'completato':(Math.min(k+1,n)+' di '+n);
  $('#sbNow').innerHTML=label(now);
  $('#sbNext').innerHTML=(nx1?'<span>poi '+label(nx1)+'</span>':'')+(nx2?'<span>'+label(nx2)+'</span>':'');
  $('#sbOb').hidden=!(now&&now.p.some(q=>q.ob));
}
const STEP=[0,0,1,1,2,3,3,4,4,5,5,6],SHARP=[1,3,6,8,10];
function drawStaff(nb){
  const W=staffEl.clientWidth||300,ppb=52,ph=64,lo=nb-ph/ppb-1,hi=nb+(W-ph)/ppb,ck=curK();
  const yOf=st=>43-(st-30)*3.5;
  let s='';
  for(let k=0;k<5;k++){const y=15+k*7;s+='<line class="sl" x1="0" x2="'+W+'" y1="'+y+'" y2="'+y+'"/>';}
  for(let k=0;k<SM.ev.length;k++){
    const e=SM.ev[k];if(e.t+e.d<lo)continue;if(e.t>hi)break;
    const x=ph+(e.t-nb)*ppb,cls=SM.done?'past':k<ck?'past':k===ck?'cur':'fut';
    for(const q of e.p){
      const dm=q.m-(S.inst==='rec'?12:0),st=q.m<0?(q.k==='low'?31:q.k==='fast'?37:34):Math.floor(dm/12-1)*7+STEP[pc(dm)],y=yOf(st);
      for(let L=28;L>=st;L-=2)s+='<line class="sl" x1="'+(x-8)+'" x2="'+(x+8)+'" y1="'+yOf(L)+'" y2="'+yOf(L)+'"/>';
      for(let L=40;L<=st;L+=2)s+='<line class="sl" x1="'+(x-8)+'" x2="'+(x+8)+'" y1="'+yOf(L)+'" y2="'+yOf(L)+'"/>';
      s+='<rect class="dur '+cls+'" x="'+(x+3)+'" y="'+(y-1)+'" width="'+Math.max(0,e.d*ppb-8)+'" height="2" rx="1"/>';
      s+='<ellipse class="hd '+cls+'" cx="'+x+'" cy="'+y+'" rx="5.3" ry="3.9" transform="rotate(-20 '+x+' '+y+')"/>';
      if(SHARP.includes(pc(dm)))s+='<text class="acc '+cls+'" x="'+(x-12)+'" y="'+(y+3.5)+'">♯</text>';
    }
  }
  s+='<line class="ph" x1="'+ph+'" x2="'+ph+'" y1="3" y2="55"/>';
  staffEl.setAttribute('viewBox','0 0 '+W+' 58');staffEl.innerHTML=s;
}

/* Elenco dei brani */
const songsSheet=$('#songsSheet');
function renderSongList(){
  $('#sampleList').innerHTML=SAMPLES.map((s,k)=>'<li><button class="song" data-s="'+k+'"><b>'+esc(s.title)+'</b><small>'+esc(s.by)+'</small></button></li>').join('');
  const mine=liveSongs();
  $('#userList').innerHTML=mine.length?mine.map(s=>'<li><button class="song" data-u="'+esc(s.id)+'"><b>'+esc(s.title)+'</b><small>'+esc(s.by||'')+(s.dirty&&Cloud.user?', da sincronizzare':'')+'</small></button><button class="del" data-ed="'+esc(s.id)+'">Modifica</button><button class="del" data-del="'+esc(s.id)+'">Elimina</button></li>').join('')
    :'<li class="empty">Scrivi un brano con l’editor o carica un file MIDI, MusicXML o ABC: resterà qui anche la prossima volta.</li>';
}
function openSongs(){storeReady.then(renderSongList);renderSongList();uiCloud();songsMsg('');songsSheet.hidden=false;scrim.hidden=false;$('#songsDone').focus();}
function closeSongs(){if(songsSheet.hidden)return;songsSheet.hidden=true;scrim.hidden=true;$('#songsBtn').focus();}
function songsMsg(t){$('#songsMsg').textContent=t;$('#songsMsg').hidden=!t;}
$('#songsBtn').addEventListener('click',openSongs);$('#songsDone').addEventListener('click',closeSongs);
songsSheet.addEventListener('click',ev=>{
  const b=ev.target.closest('button');if(!b)return;
  if(b.dataset.s!=null){closeSongs();loadSong(SAMPLES[+b.dataset.s]);}
  else if(b.dataset.u){const s=allRecs.find(x=>x.id===b.dataset.u);if(s){closeSongs();loadSong(s);}}
  else if(b.dataset.ed){const s=allRecs.find(x=>x.id===b.dataset.ed);if(s)edOpen(s);}
  else if(b.dataset.del){const s=allRecs.find(x=>x.id===b.dataset.del);
    if(s)askConfirm('Eliminare «'+s.title+'»? Non si può annullare.','Elimina').then(async ok=>{if(!ok)return;
      if(SM.raw===s)closeSong();await deleteSong(s.id);renderSongList();});}
  else if(b.id==='newSong')edOpen(null);
  else if(b.id==='exportBtn')exportBackup();
});

/* Lettura degli spartiti */
function group(notes){
  notes=notes.filter(n=>n.e-n.s>=1/32).sort((a,b)=>a.s-b.s||b.m-a.m);
  const ev=[];
  for(const n of notes){
    const t=Math.round(n.s*24)/24,d=Math.max(1/8,Math.round((n.e-n.s)*24)/24),last=ev[ev.length-1];
    if(last&&Math.abs(last.t-t)<1e-6){if(!last.m.includes(n.m)&&last.m.length<3)last.m.push(n.m);last.d=Math.max(last.d,d);}
    else ev.push({t,d,m:[n.m]});
    if(ev.length>3000)break;
  }
  const t0=ev.length?Math.floor(ev[0].t):0;ev.forEach(e=>e.t-=t0);
  return ev;
}
/* Da un arrangiamento a più voci tiene la linea più acuta: la melodia */
function skyline(notes){
  notes=notes.filter(n=>n.e-n.s>=1/32).sort((a,b)=>a.s-b.s||b.m-a.m);
  const out=[];
  for(const n of notes){
    const last=out[out.length-1];
    if(last&&Math.abs(last.s-n.s)<1/48)continue;
    if(last&&last.e>n.s+1/48){if(n.m<last.m&&last.e-n.s>.25)continue;last.e=n.s;}
    out.push({s:n.s,e:n.e,m:n.m});
  }
  return out.filter((n,i)=>{const w=out.slice(Math.max(0,i-6),i+7).map(x=>x.m).sort((a,b)=>a-b);return n.m>=w[w.length>>1]-12;});
}
function parseMidi(buf,name){
  const d=new DataView(buf);let p=0;
  const id=()=>String.fromCharCode(d.getUint8(p),d.getUint8(p+1),d.getUint8(p+2),d.getUint8(p+3));
  const vlq=()=>{let v=0,b;do{b=d.getUint8(p++);v=(v<<7)|(b&127);}while(b&128);return v;};
  if(id()!=='MThd')throw new Error('formato');
  const hl=d.getUint32(4),nt=d.getUint16(10),div=d.getUint16(12);p=8+hl;
  if(div&0x8000)throw new Error('smpte');
  const tempos=[],notes=[],names={};let meter=null;
  for(let k=0;k<nt&&p+8<=d.byteLength;k++){
    const tag=id(),len=d.getUint32(p+4);p+=8;const end=Math.min(p+len,d.byteLength);
    if(tag!=='MTrk'){p=end;continue;}
    let tick=0,rs=0;const open={};
    while(p<end){
      tick+=vlq();let st=d.getUint8(p);
      if(st===0xFF){p++;const type=d.getUint8(p++),l=vlq();
        if(type===0x51)tempos.push({tick,us:(d.getUint8(p)<<16)|(d.getUint8(p+1)<<8)|d.getUint8(p+2)});
        else if(type===0x58&&!meter)meter=[d.getUint8(p),Math.pow(2,d.getUint8(p+1))];
        else if(type===0x03)names[k]=new TextDecoder().decode(new Uint8Array(buf,p,l)).trim();
        p+=l;continue;}
      if(st===0xF0||st===0xF7){p++;p+=vlq();continue;}
      if(st&0x80){rs=st;p++;}else st=rs;
      const type=st&0xF0,ch=st&15,one=type===0xC0||type===0xD0,a=d.getUint8(p),b=one?0:d.getUint8(p+1);p+=one?1:2;
      const key=ch*128+a;
      if(type===0x90&&b>0)(open[key]||(open[key]=[])).push(tick);
      else if(type===0x80||(type===0x90&&b===0)){const q=open[key];if(q&&q.length)notes.push({trk:k,ch,m:a,s:q.shift(),e:tick});}
    }
    p=end;
  }
  tempos.sort((x,y)=>x.tick-y.tick);if(!tempos.length||tempos[0].tick>0)tempos.unshift({tick:0,us:500000});
  const sec=t=>{let s=0;for(let i=0;i<tempos.length;i++){const a=tempos[i];if(a.tick>=t)break;const nx=tempos[i+1],e=nx?Math.min(nx.tick,t):t;s+=(e-a.tick)*a.us/1e6/div;}return s;};
  const tStart=tempos.filter(x=>x.tick===tempos[0].tick).pop(),bpm=60e6/tStart.us,beats=t=>sec(t)*bpm/60;
  const groups={};notes.forEach(n=>{if(n.ch===9)return;const g=n.trk+':'+n.ch;(groups[g]||(groups[g]=[])).push(n);});
  const gs=Object.values(groups);if(!gs.length)throw new Error('vuoto');
  const max=Math.max(...gs.map(g=>g.length));
  const cand=gs.filter(g=>g.length>=Math.min(max,Math.max(8,max*.15)));
  const mel=cand.sort((x,y)=>y.reduce((s,n)=>s+n.m,0)/y.length-x.reduce((s,n)=>s+n.m,0)/x.length)[0];
  return{title:names[0]||name,bpm:Math.round(bpm),meter:meter||[4,4],
    ev:group(skyline(mel.map(n=>({s:beats(n.s),e:beats(n.e),m:n.m}))))};
}
async function mxlText(buf){
  if(typeof DecompressionStream==='undefined')throw new Error('mxl');
  const d=new DataView(buf);let e=buf.byteLength-22;
  while(e>=0&&d.getUint32(e,true)!==0x06054b50)e--;
  if(e<0)throw new Error('formato');
  const n=d.getUint16(e+10,true);let p=d.getUint32(e+16,true);const files={};
  for(let i=0;i<n&&d.getUint32(p,true)===0x02014b50;i++){
    const method=d.getUint16(p+10,true),csize=d.getUint32(p+20,true),nl=d.getUint16(p+28,true),el=d.getUint16(p+30,true),cl=d.getUint16(p+32,true),off=d.getUint32(p+42,true);
    files[new TextDecoder().decode(new Uint8Array(buf,p+46,nl))]={method,csize,off};p+=46+nl+el+cl;
  }
  const read=async nm=>{const f=files[nm];const l=f.off,data=new Uint8Array(buf,l+30+d.getUint16(l+26,true)+d.getUint16(l+28,true),f.csize);
    if(f.method===0)return new TextDecoder().decode(data);
    return await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();};
  let root=null;
  if(files['META-INF/container.xml']){const c=await read('META-INF/container.xml');const m=c.match(/full-path="([^"]+)"/);if(m&&files[m[1]])root=m[1];}
  if(!root)root=Object.keys(files).find(k=>!k.startsWith('META-INF')&&/\.(xml|musicxml)$/i.test(k));
  if(!root)throw new Error('formato');
  return read(root);
}
function parseMusicXML(text,name){
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.querySelector('parsererror'))throw new Error('formato');
  if(!doc.querySelector('score-partwise'))throw new Error('timewise');
  const title=(doc.querySelector('work-title')||doc.querySelector('movement-title')||{}).textContent||name;
  const SN={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  const parts=[...doc.querySelectorAll('score-partwise > part')];
  const part=parts.find(pt=>pt.querySelector('note pitch'))||parts[0];if(!part)throw new Error('vuoto');
  let div=1,pos=0,last=0,bpm=null,meter=null,voice0=null;const notes=[];
  const txt=(el,s)=>{const x=el.querySelector(s);return x?x.textContent.trim():null;};
  for(const meas of part.querySelectorAll(':scope > measure'))for(const el of meas.children){
    const tag=el.tagName;
    if(tag==='attributes'){const dv=txt(el,'divisions');if(dv)div=+dv;const b=txt(el,'time beats'),bt=txt(el,'time beat-type');if(b&&bt&&!meter)meter=[+b,+bt];}
    else if(tag==='direction'||tag==='sound'){const snd=tag==='sound'?el:el.querySelector('sound');
      if(snd&&snd.getAttribute('tempo')&&!bpm)bpm=+snd.getAttribute('tempo');
      const pm=el.querySelector&&el.querySelector('metronome per-minute');if(pm&&!bpm){const u=txt(el,'metronome beat-unit'),dot=el.querySelector('metronome beat-unit-dot');
        const f={whole:4,half:2,quarter:1,eighth:.5,'16th':.25}[u]||1;bpm=+pm.textContent*f*(dot?1.5:1);}}
    else if(tag==='backup')pos-=(+txt(el,'duration')||0)/div;
    else if(tag==='forward')pos+=(+txt(el,'duration')||0)/div;
    else if(tag==='note'){
      if(el.querySelector('grace'))continue;
      const v=txt(el,'voice')||'1';if(voice0==null)voice0=v;
      const dur=(+txt(el,'duration')||0)/div,chord=!!el.querySelector('chord');
      const start=chord?last:pos;if(!chord){last=pos;pos+=dur;}
      if(v!==voice0||el.querySelector('rest'))continue;
      const pt=el.querySelector('pitch');if(!pt)continue;
      const m=(+txt(pt,'octave')+1)*12+SN[txt(pt,'step')]+Math.round(+(txt(pt,'alter')||0));
      const ties=[...el.querySelectorAll('tie')].map(x=>x.getAttribute('type'));
      if(ties.includes('stop')){const prev=[...notes].reverse().find(n=>n.m===m&&Math.abs(n.e-start)<1e-3);if(prev){prev.e=start+dur;continue;}}
      notes.push({s:start,e:start+dur,m});
    }
  }
  return{title,bpm:Math.round(bpm||100),meter:meter||[4,4],ev:group(notes)};
}
let abcjsP=null;
function loadAbcjs(){
  if(window.ABCJS)return Promise.resolve(window.ABCJS);
  if(!abcjsP)abcjsP=new Promise((res,rej)=>{const s=document.createElement('script');
    s.src=window.FIATI_ABCJS||'https://cdn.jsdelivr.net/npm/abcjs@6.4.4/dist/abcjs-basic-min.js';
    s.onload=()=>window.ABCJS?res(window.ABCJS):rej(new Error('abcjs'));s.onerror=()=>{abcjsP=null;rej(new Error('abcjs'));};document.head.appendChild(s);});
  return abcjsP;
}
async function parseABC(text,name){
  const A=await loadAbcjs();
  const t=A.parseOnly(text).find(x=>x.lines&&x.lines.length);if(!t)throw new Error('vuoto');
  const a=t.setUpAudio(),tr=a.tracks.find(x=>x.some(e=>e.cmd==='note'));if(!tr)throw new Error('vuoto');
  const mt=t.metaText&&t.metaText.tempo;
  const bpm=mt&&mt.bpm&&mt.duration?mt.bpm*mt.duration.reduce((x,y)=>x+y,0)*4:100;
  const mf=t.getMeterFraction?t.getMeterFraction():{num:4,den:4};
  return{title:(t.metaText&&t.metaText.title)||name,bpm:Math.round(bpm),meter:[mf.num,mf.den],
    ev:group(tr.filter(e=>e.cmd==='note').map(n=>({s:n.start*4,e:(n.start+n.duration)*4,m:n.pitch})))};
}
const ERR={formato:'Non riconosco questo file. Carica un MIDI (.mid), un MusicXML (.musicxml o .mxl) o un ABC (.abc).',
  smpte:'Questo MIDI usa una temporizzazione video che non posso leggere. Esportalo di nuovo come MIDI standard.',
  timewise:'Questo MusicXML è nel formato «timewise». Esportalo di nuovo da MuseScore come MusicXML standard.',
  mxl:'Questo browser non apre i file .mxl compressi. Esporta lo spartito come .musicxml non compresso.',
  vuoto:'Non ho trovato note in questo spartito.',
  abcjs:'Non riesco a caricare il lettore ABC. Controlla la connessione e riprova.'};
if(S.trim30==null)S.trim30=true;
$('#trim30').checked=S.trim30;
$('#trim30').addEventListener('change',ev=>{S.trim30=ev.target.checked;save();});
async function readScore(f){
  const buf=await f.arrayBuffer(),u=new Uint8Array(buf),name=f.name.replace(/\.[^.]+$/,'').replace(/[_]+/g,' ').replace(/\s+/g,' ').trim();let song;
  if(u[0]===0x4D&&u[1]===0x54&&u[2]===0x68&&u[3]===0x64)song=parseMidi(buf,name);
  else if(u[0]===0x50&&u[1]===0x4B)song=parseMusicXML(await mxlText(buf),name);
  else{const text=new TextDecoder().decode(u);
    if(/<score-(partwise|timewise)/.test(text))song=parseMusicXML(text,name);
    else if(/^\s*K:/m.test(text))song=await parseABC(text,name);
    else throw new Error('formato');}
  if(S.trim30){const lim=30*song.bpm/60;song.ev=song.ev.filter(e=>e.t<lim).map(e=>({t:e.t,d:Math.min(e.d,lim-e.t),m:e.m}));}
  if(!song.ev.length)throw new Error('vuoto');
  return song;
}
$('#fileIn').addEventListener('change',async ev=>{
  const files=[...ev.target.files];ev.target.value='';if(!files.length)return;
  await storeReady;const ok=[],bad=[];let full=false;
  for(let k=0;k<files.length;k++){
    const f=files[k];songsMsg(files.length>1?'Leggo '+(k+1)+' di '+files.length+': «'+f.name+'»…':'Leggo «'+f.name+'»…');
    try{
      const song=await readScore(f);song.id='u'+Date.now()+'-'+k;song.by='caricato da te';
      ok.push(song);
    }catch(err){bad.push(f.name+': '+(ERR[err&&err.message]||'non riesco a leggerlo.'));}
  }
  if(ok.length&&!(await saveSongs(ok.slice().reverse())))full=true;
  if(ok.length===1&&!bad.length&&!full){closeSongs();loadSong(ok[0]);return;}
  renderSongList();
  const msg=[];
  if(ok.length)msg.push(ok.length===1?'Caricato 1 spartito.':'Caricati '+ok.length+' spartiti.');
  if(full)msg.push('Non c’è più spazio per salvarli: elimina qualche spartito o esporta un backup.');
  if(bad.length)msg.push((bad.length===1?'Questo non è entrato. ':'Questi non sono entrati. ')+bad.join(' '));
  songsMsg(msg.join(' '));
});

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

/* ---------- Editor: si scrive toccando i fori, si ritocca sul pentagramma ---------- */
const ED={tab:'mel',perc:[],pStep:.5,pBars:1,on:false,src:null,isUser:false,seq:[],cur:-1,mode:'insert',dur:1,dot:false,meter:[4,4],undo:[],changed:false,lastT:0,playing:false,timers:[],voices:[]};
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

function edSnap(){ED.undo.push(JSON.stringify({seq:ED.seq,cur:ED.cur,perc:ED.perc,pBars:ED.pBars}));if(ED.undo.length>120)ED.undo.shift();ED.changed=true;}
function curDur(){return ED.dur*(ED.dot?1.5:1);}
const editable=()=>ED.on&&S.inst!=='tamb'&&ED.tab==='mel';

function edOpen(src){
  closeSongs();closeSong();
  let sh=0;
  if(src&&src.ev&&src.ev.length&&S.inst!=='tamb'){
    const f=fitSong(src);sh=f.sh;
    if(S.inst==='pipes'){S.pnotes=f.pnotes;ctl.pnotes.value=f.pnotes;}
    else{S.key=f.key;S.scale=f.scale;ctl.key.value=f.key;ctl.scale.value=f.scale;}
    save();render();
  }
  Object.assign(ED,{on:true,src:src||null,isUser:!!(src&&allRecs.includes(src)),seq:src?toSeq(src.ev||[],sh):[],
    meter:src&&src.meter?src.meter.slice():[4,4],undo:[],changed:false,mode:'insert',dot:false});
  ED.cur=ED.seq.length-1;
  ED.perc=percOf(src).map(h=>({t:h.t,k:h.k}));ED.pStep=ED.perc.some(h=>Math.abs(h.t*2-Math.round(h.t*2))>1e-6)?.25:.5;
  ED.pBars=Math.max(1,Math.ceil((Math.max(edMelEnd(),...ED.perc.map(h=>h.t+.01))-1e-6)/edBar()));
  edTab(S.inst==='tamb'?'perc':'mel');
  $('#edTitle').value=src?src.title:'Nuovo brano';$('#edBpm').value=src?Math.round(src.bpm):100;
  editorEl.hidden=false;root.classList.add('editing');
  requestAnimationFrame(()=>{layout();edDraw(true);});edUI();
  if(sh%12)hintFlash('Ho trasposto lo spartito di '+Math.abs(sh)+(Math.abs(sh)===1?' semitono':' semitoni')+' per farlo stare sui fori. Se lo salvi resta in questa tonalità.');
  else if(!src&&S.inst==='tamb')hintFlash('Scrivi qui la traccia del tamburello. Per la melodia passa a un fiato dal menu in alto.');
  else if(!src)hintFlash('Scegli la durata qui sopra, poi tocca i fori per scrivere le note. Più fori insieme fanno un accordo.');
}
function edEnd(){edStop();ED.on=false;editorEl.hidden=true;root.classList.remove('editing');requestAnimationFrame(layout);}
async function edClose(){
  if(ED.changed&&!(await askConfirm('Uscire senza salvare le modifiche a questo spartito?','Esci senza salvare')))return;
  edEnd();
}
async function edSave(){
  const ev=fromSeq();
  if(!ev.length){hintFlash(ED.perc.length?'Serve almeno una nota di melodia: il tamburello la accompagna. Scegli un fiato e scrivila in «Melodia».':'Scrivi almeno una nota prima di salvare.');return;}
  const perc=ED.perc.slice().sort((a,b)=>a.t-b.t||a.k.localeCompare(b.k)).map(h=>({t:Math.round(h.t*48)/48,k:h.k}));
  const title=$('#edTitle').value.trim()||'Senza titolo',bpm=Math.max(30,Math.min(300,Math.round(+$('#edBpm').value||100)));
  let rec;
  if(ED.isUser){rec=ED.src;Object.assign(rec,{title,bpm,meter:ED.meter,ev,perc:perc.length?perc:undefined});if(!perc.length)delete rec.perc;}
  else{rec={id:newId(),title,by:ED.src?'modificato da te':'scritto da te',bpm,meter:ED.meter,ev};if(perc.length)rec.perc=perc;}
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
  const o=JSON.parse(s);ED.seq=o.seq;ED.cur=o.cur;if(o.perc){ED.perc=o.perc;ED.pBars=o.pBars||ED.pBars;}ED.mode='edit';edDraw(true);edUI();pcDraw();
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
  if(typeof pcRaf!=='undefined'){cancelAnimationFrame(pcRaf);const h=$('#pcHead');if(h)h.hidden=true;}
  if(ED.on&&ED.tab==='perc')pcDraw();
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
$('#edMeter').addEventListener('change',ev=>{edSnap();ED.meter=ev.target.value.split('/').map(Number);edDraw();pcDraw();});

/* ---------- Traccia del tamburello: griglia a tre righe ---------- */
const PC_ROWS=['low','hit','fast'];
const edBar=()=>ED.meter[0]*4/ED.meter[1];
function edMelEnd(){let t=0;ED.seq.forEach(it=>{t+=it.d;});return t;}
function edTab(tab){
  ED.tab=tab;
  document.querySelectorAll('#edTabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===tab));
  $('#edMel').hidden=tab!=='mel';$('#edPerc').hidden=tab!=='perc';
  edStop();
  if(tab==='perc')requestAnimationFrame(()=>{layout();pcDraw();});else requestAnimationFrame(()=>{layout();edDraw(true);});
}
const pcHas=(t0,k)=>ED.perc.some(h=>h.k===k&&h.t>=t0-1e-6&&h.t<t0+ED.pStep-1e-6);
function pcDraw(){
  if(!ED.on)return;
  const bar=edBar(),steps=Math.round(ED.pBars*bar/ED.pStep),per=Math.round(1/ED.pStep);
  const g=$('#pcGrid');g.style.gridTemplateColumns='repeat('+steps+',var(--pcw))';
  let h='';
  for(let s=0;s<steps;s++){const t=s*ED.pStep,isBar=Math.abs(t/bar-Math.round(t/bar))<1e-6;
    h+='<span class="pc-num'+(isBar?' bar':'')+'">'+(isBar?(Math.round(t/bar)+1):(s%per===0?'·':''))+'</span>';}
  PC_ROWS.forEach((k,r)=>{
    for(let s=0;s<steps;s++){const t=s*ED.pStep,isBar=Math.abs(t/bar-Math.round(t/bar))<1e-6,isBeat=s%per===0,on=pcHas(t,k);
      h+='<button class="pc-cell'+(isBar?' bar':isBeat?' beat':'')+'" data-s="'+s+'" data-k="'+k+'" aria-pressed="'+on+'" aria-label="Battuta '+(Math.floor(t/bar)+1)+', tempo '+(Math.floor(t%bar)+1)+(isBeat?'':' e mezzo')+': '+PERC_NAME[k]+'"></button>';}
  });
  g.innerHTML=h;
  $('#pcStep').textContent=ED.pStep===.5?'Ottavi':'Sedicesimi';
  $('#pcLess').disabled=ED.pBars<=1;$('#pcUndo').disabled=!ED.undo.length;
  $('#pcPlay').innerHTML=ED.playing?ICON.pause:ICON.play;$('#pcPlay').setAttribute('aria-label',ED.playing?'Ferma':'Ascolta');
}
$('#pcGrid').addEventListener('click',ev=>{
  const b=ev.target.closest('.pc-cell');if(!b)return;
  const t=+b.dataset.s*ED.pStep,k=b.dataset.k;
  edSnap();
  if(pcHas(t,k))ED.perc=ED.perc.filter(h=>!(h.k===k&&h.t>=t-1e-6&&h.t<t+ED.pStep-1e-6));
  else{ED.perc.push({t,k});initAudio();ensureBank('tamb').then(()=>percHit(k,1));}
  pcDraw();
});
document.querySelectorAll('#edTabs button').forEach(b=>b.addEventListener('click',()=>edTab(b.dataset.tab)));
$('#pcStep').addEventListener('click',()=>{ED.pStep=ED.pStep===.5?.25:.5;pcDraw();});
$('#pcFill').addEventListener('click',()=>{
  const ev=fromSeq();if(!ev.length){edStatusFlash('');hintFlash('Prima scrivi la melodia: la traccia segue il suo ritmo.');return;}
  edSnap();const bar=edBar();
  ED.perc=ev.map(e=>({t:e.t,k:Math.abs(e.t/bar-Math.round(e.t/bar))<1e-6?'low':Math.abs(e.t-Math.round(e.t))<1e-6?'hit':'fast'}));
  ED.pStep=ED.perc.some(h=>Math.abs(h.t*2-Math.round(h.t*2))>1e-6)?.25:.5;
  ED.pBars=Math.max(ED.pBars,Math.ceil((edMelEnd()-1e-6)/bar));pcDraw();
  hintFlash('Traccia creata dal ritmo della melodia: colpo basso in battere, colpo sui tempi, sonagli in mezzo.');
});
$('#pcMore').addEventListener('click',()=>{edSnap();ED.pBars++;pcDraw();const w=$('#pcWrap');w.scrollLeft=w.scrollWidth;});
$('#pcLess').addEventListener('click',()=>{
  if(ED.pBars<=1)return;edSnap();ED.pBars--;const end=ED.pBars*edBar();ED.perc=ED.perc.filter(h=>h.t<end-1e-6);pcDraw();
});
$('#pcUndo').addEventListener('click',edUndo);
/* Ascolto della traccia, con la melodia se lo strumento è un fiato */
let pcRaf=0;
function pcPlay(){
  if(ED.playing){edStop();return;}
  if(!ED.perc.length&&!ED.seq.some(it=>it.m.length)){hintFlash('La griglia è vuota: tocca le caselle per aggiungere i colpi.');return;}
  initAudio();
  const banks=[ensureBank('tamb')];if(S.inst!=='tamb')banks.push(ensureBank(S.inst));
  Promise.all(banks).then(()=>{
    if(ED.playing)return;
    const spb=60/Math.max(30,+$('#edBpm').value||100),end=Math.max(ED.pBars*edBar(),edMelEnd());
    ED.playing=true;pcDraw();
    ED.perc.forEach(h=>ED.timers.push(setTimeout(()=>percHit(h.k,1),h.t*spb*1000)));
    if(S.inst!=='tamb'){let t=0;ED.seq.forEach(it=>{const at=t,len=it.d;
      if(it.m.length)ED.timers.push(setTimeout(()=>{const vs=it.m.map(edVoiceOn);ED.voices.push(...vs);
        ED.timers.push(setTimeout(()=>{vs.forEach(edVoiceOff);ED.voices=ED.voices.filter(v=>!vs.includes(v));},Math.max(60,len*spb*920)));},at*spb*1000));
      t+=it.d;});}
    const head=$('#pcHead'),t0=performance.now(),w=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pcw'))||26;
    head.hidden=false;
    const step=()=>{if(!ED.playing){head.hidden=true;return;}
      const beat=(performance.now()-t0)/1000/spb,x=beat/ED.pStep*w;head.style.transform='translateX('+x+'px)';
      const wrap=$('#pcWrap');if(x>wrap.scrollLeft+wrap.clientWidth-40||x<wrap.scrollLeft)wrap.scrollLeft=Math.max(0,x-40);
      pcRaf=requestAnimationFrame(step);};
    pcRaf=requestAnimationFrame(step);
    ED.timers.push(setTimeout(()=>{ED.playing=false;cancelAnimationFrame(pcRaf);head.hidden=true;pcDraw();edUI();refresh();},end*spb*1000+120));
  });
}
$('#pcPlay').addEventListener('click',pcPlay);

/* Scorciatoie da tastiera nell’editor */
document.addEventListener('keydown',ev=>{
  if(!ED.on||ED.tab!=='mel'||/^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName)||!sheet.hidden||!edMore.hidden||!$('#mock').hidden)return;
  const k=ev.key;
  if(k==='ArrowLeft'){edMove(-1);ev.preventDefault();}
  else if(k==='ArrowRight'){edMove(1);ev.preventDefault();}
  else if(k==='ArrowUp'){edPitch(1);ev.preventDefault();}
  else if(k==='ArrowDown'){edPitch(-1);ev.preventDefault();}
  else if(k==='Backspace'||k==='Delete'){edDelete();ev.preventDefault();}
  else if((ev.metaKey||ev.ctrlKey)&&k.toLowerCase()==='z'){edUndo();ev.preventDefault();}
  else if(k==='r'||k==='R'){edRest();ev.preventDefault();}
},true);

/* ---------- Beffa crudele: insulti da bardo, con filtri, preferiti, editor e ba-dum-tss ---------- */
const BEFFE=[{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"aspetto","text":"Hai una faccia da quadro. Di quelli che nei castelli girano verso il muro."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"aspetto","text":"Ti hanno disegnato su una mappa: è il punto dove c'è scritto «qui ci sono i mostri»."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"aspetto","text":"Lo specchio magico ti ha visto e ha chiesto di essere declassato a finestra."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"aspetto","text":"Non sei brutto. Sei solo il motivo per cui i paladini portano l'elmo chiuso."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"aspetto","text":"Con quella faccia potresti fare il guardiano di un dungeon. Anche senza trappole."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"aspetto","text":"Guardatelo bene, gente: ecco cosa succede quando un mimic prova a imitare una persona."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"aspetto","text":"Una medusa ti ha guardato negli occhi e si è pietrificata lei. Pur di non rivederti."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"aspetto","text":"Hai la faccia come il culo. Ma il culo almeno lo tieni coperto."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"aspetto","text":"I bardi cantano di te. Soprattutto per far piangere i bambini cattivi."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"aspetto","text":"Hai un viso che non si dimentica. Purtroppo."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"aspetto","text":"Se la bellezza fosse un incantesimo, tu saresti un trucchetto lanciato male."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"aspetto","text":"Bel mantello. L'hai preso a un cadavere o te l'ha regalato lui per non vederti più?"},{"cat":"any","moment":"any","style":"roast","heat":0,"topic":"aspetto","text":"Il tuo ritrattista ha chiesto un supplemento per danni morali."},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"aspetto","text":"Qualcuno ha una pozione di cura? No, non per lui: per chi lo deve guardare."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"aspetto","text":"Hai l'eleganza di un orsogufo sui pattini."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"aspetto","text":"Sei così brutto che gli specchi, per gentilezza, mostrano qualcun altro."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"aspetto","text":"Hai il fisico di uno che ha messo tutto in Saggezza. E ha perso anche quella."},{"cat":"any","moment":"any","style":"assurdo","heat":1,"topic":"aspetto","text":"Il tuo barbiere usa un'ascia bipenne. E si vede."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"aspetto","text":"Con quella faccia da stronzo non ti serve nemmeno un incantesimo di paura."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"aspetto","text":"Fate largo, fate largo: passa il manuale illustrato delle cose da non diventare."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"puzza","text":"Puzzi come un troll che si è rigenerato dentro una fogna."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"puzza","text":"Persino le mosche ti girano attorno a distanza di sicurezza."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"puzza","text":"Il tuo odore ha l'iniziativa più alta del tavolo: arriva sempre prima di te."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"puzza","text":"L'ultima volta che ti sei lavato, l'oceano era ancora nuovo."},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"puzza","text":"Qualcuno apra una finestra. O un portale. Qualsiasi cosa che porti lontano da qui."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"puzza","text":"Ho conosciuto zombie più profumati. E loro almeno avevano una scusa."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"puzza","text":"Un otyugh ti ha annusato e ha chiesto di cambiare discarica."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"puzza","text":"Puzzi così tanto di merda che i goblin ti chiedono la ricetta."},{"cat":"any","moment":"any","style":"standup","heat":1,"topic":"puzza","text":"Il tuo alito ha il tiro salvezza su Costituzione incorporato."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"puzza","text":"Quando passi, i fiori appassiscono e i non-morti si girano: pensano che tu sia dei loro."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"puzza","text":"Per seguire le tue tracce non servono i segugi. Basta seguire i segugi che scappano."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"puzza","text":"Respirate con la bocca, ragazzi. Ah no, così si sente anche il sapore."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"puzza","text":"Ti ho sentito arrivare. Con il naso, purtroppo."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"puzza","text":"Faresti vomitare un cubo gelatinoso, e quello si mangia anche gli stivali."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"puzza","text":"Persino un drago verde, che sputa veleno, ti ha chiesto di metterti sottovento."},{"cat":"any","moment":"any","style":"standup","heat":1,"topic":"puzza","text":"Le terme ti hanno dato il divieto d'ingresso a vita. Con targa commemorativa."},{"cat":"any","moment":"any","style":"roast","heat":0,"topic":"puzza","text":"Non ti lavi da un'era intera. E si vede. Anzi, si sente."},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"puzza","text":"Il bardo canterebbe le tue gesta, ma ha il naso tappato. Scusate la voce nasale."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"puzza","text":"Hai un odore così forte che ha un suo turno in combattimento."},{"cat":"any","moment":"any","style":"assurdo","heat":1,"topic":"puzza","text":"Il tuo bagno annuale è una leggenda. Come i draghi buoni e i paladini simpatici."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"incompetenza","text":"Il tuo maestro d'armi oggi fa il pescatore. Dice che i pesci almeno imparano."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"incompetenza","text":"Combatti come un contadino. Anzi no: i contadini contro le cavallette vincono."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"incompetenza","text":"Hai la mira di un ciclope che ha perso anche l'occhio buono."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"incompetenza","text":"Nei contratti di gilda c'è scritto «nessuna esperienza richiesta». Tu l'hai preso come una sfida."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"incompetenza","text":"Complimenti: hai trasformato ogni tuo talento in un'abilità passiva. Molto passiva."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"incompetenza","text":"Votiamo: chi pensa che riuscirà a colpire qualcosa entro stasera? Nessuno? Neanche lui."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"incompetenza","text":"Se fossi un'arma, saresti un cucchiaio di legno con la maledizione del meno uno."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"incompetenza","text":"Hai sbagliato mestiere. E anche quello di riserva. E quello di riserva della riserva."},{"cat":"any","moment":"any","style":"standup","heat":1,"topic":"incompetenza","text":"Ti pagano a giornata o a fallimento? Perché nel secondo caso saresti ricchissimo."},{"cat":"any","moment":"any","style":"roast","heat":0,"topic":"incompetenza","text":"Un pugnale +1? A te servirebbe un pugnale che chieda scusa al posto tuo."},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"incompetenza","text":"Un applauso al nostro amico, che sta reinventando il concetto di colpo mancato."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"incompetenza","text":"Sei così incapace che persino i tuoi fallimenti critici fanno un lavoro di merda."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"incompetenza","text":"Il tuo addestramento militare è durato un pomeriggio. Pausa pranzo compresa."},{"cat":"any","moment":"any","style":"assurdo","heat":1,"topic":"incompetenza","text":"La competenza in armi sulla tua scheda è un errore di stampa."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"incompetenza","text":"Hai più cicatrici prese scappando che combattendo."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"incompetenza","text":"Al villaggio eri il migliore. Poi qualcuno ha contato quanti eravate: due."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"incompetenza","text":"Ehi, gruppo: chi aveva scommesso che inciampava, ritiri pure la vincita."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"incompetenza","text":"Impugni la spada come un ombrello che ti hanno prestato."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"incompetenza","text":"Combatti come una merda di cavallo: fumi tanto e non fai male a nessuno."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"incompetenza","text":"Hai l'esperienza di un veterano. Di un veterano delle ritirate."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"stupidita","text":"Hai Intelligenza 3. E il 3 te l'hanno prestato."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"stupidita","text":"Pensi così piano che i tuoi pensieri arrivano già vecchi."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"stupidita","text":"Se le idee fossero monete, potresti comprarti mezzo stuzzicadenti."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"stupidita","text":"Ogni volta che parli, da qualche parte un mago dimentica un incantesimo."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"stupidita","text":"Hai l'acume di un portone. Chiuso. Con il chiavistello."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"stupidita","text":"Qualcuno gli spieghi il piano. Piano. Più piano. Ancora più piano."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"stupidita","text":"Il tuo cervello è come una borsa conservante: ci metti dentro di tutto e non trovi mai niente."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"stupidita","text":"Sei così scemo che ti fregherebbe anche un coboldo ubriaco."},{"cat":"any","moment":"any","style":"standup","heat":1,"topic":"stupidita","text":"La tua testa è perfetta per un elmo. Dentro c'è un sacco di spazio."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"stupidita","text":"Un divoratore di menti ti ha assaggiato il cervello e ha chiesto il menù per bambini."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"stupidita","text":"Non sei il coltello più affilato dell'armeria. Sei il manico."},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"stupidita","text":"Ragazzi, ha appena avuto un'idea. Fermiamoci a guardarla: non capita spesso."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"stupidita","text":"Hai la saggezza di una falena davanti a una palla di fuoco."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"stupidita","text":"Se pensassi ad alta voce, sentiremmo l'eco."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"stupidita","text":"Sei scemo come un secchio di piscio, e il secchio almeno serve a qualcosa."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"stupidita","text":"Hai provato a leggere una pergamena al contrario. Era una pergamena di Comprensione dei Linguaggi."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"stupidita","text":"La tua Intelligenza e la tua Classe Armatura hanno lo stesso numero. Ed è basso anche per una Classe Armatura."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"stupidita","text":"Diamogli un applauso: è arrivato fin qui senza mangiare nessun fungo strano. Forse."},{"cat":"any","moment":"any","style":"assurdo","heat":1,"topic":"stupidita","text":"Il tuo pensiero più profondo è annegato in una pozzanghera."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"stupidita","text":"Hai un cervello nuovo di zecca. Mai usato."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"ego","text":"Ti presenti con sei titoli nobiliari. Tre li hai inventati, gli altri tre te li hanno tolti."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"ego","text":"Parli di te in terza persona perché neanche la prima vuole averti."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"ego","text":"Il tuo ego occupa due caselle sulla griglia. Tu mezza."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"ego","text":"Hai un'altissima opinione di te. Peccato che sia l'unica opinione che hai."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"ego","text":"Sei convinto di essere l'eroe di questa storia. Sei il goblin che muore nella prima scena."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"ego","text":"Alzi la mano chi ha mai sentito parlare di lui. Visto? Anch'io ho dovuto chiedere."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"ego","text":"Ti credi il re del mondo, ma sei solo il buco del culo di una contea minore."},{"cat":"any","moment":"any","style":"standup","heat":1,"topic":"ego","text":"Ti sei scritto da solo la tua ballata. Si sente: fai rimare «io» con «io»."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"ego","text":"Il tuo stemma è uno specchio in campo d'oro. Il motto: «E basta»."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"ego","text":"Dici di valere il tuo peso in oro. Va bene, ma sulla bilancia di un coboldo."},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"ego","text":"Qualcuno lo avverta: la gente non lo fissa per ammirazione. Cerca di capire cos'è."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"ego","text":"Ti dai un sacco di arie. Tutte viziate."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"ego","text":"Ti piace il suono della tua voce. Sei l'unico."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"ego","text":"Hai così tanta autostima che i tuoi specchi hanno chiesto le ferie."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"ego","text":"Ti sei fatto da solo. E si vede: niente garanzia, niente libretto di istruzioni."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"ego","text":"Sei la persona più importante della tua vita. Purtroppo anche l'unica."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"famiglia","text":"Tuo padre ti ha insegnato a combattere. Poi si è fatto sostituire dal cane, che spiegava meglio."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"famiglia","text":"Tua madre ti ha dato il nome di una malattia. La malattia ha fatto causa."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"famiglia","text":"Il tuo albero genealogico è un cespuglio. Spinoso, e senza un fiore."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"famiglia","text":"I tuoi antenati ti guardano dall'aldilà. Girati dall'altra parte."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"famiglia","text":"Nella tua famiglia vi chiamate per numero: con tutti quei fallimenti è più comodo."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"famiglia","text":"Un applauso a sua madre, che lo aspetta ancora a casa. Chissà perché ha cambiato la serratura."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"famiglia","text":"Tua nonna ha venduto l'anima a un diavolo. Il diavolo voleva restituire te come resto."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"famiglia","text":"Quando sei nato, tua madre ha guardato il chierico e ha chiesto se si poteva annullare."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"famiglia","text":"Sei la pecora nera della famiglia. E la tua famiglia alleva lupi mannari."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"famiglia","text":"I tuoi genitori ti volevano tanto bene. Poi hai imparato a parlare."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"famiglia","text":"Lo stemma di famiglia raffigura un cucchiaio. Rovesciato."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"famiglia","text":"A casa tua le cene sono silenziosissime: tutti fingono di non conoscersi."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"famiglia","text":"Tuo padre era un orco e tua madre un troll, e tu sei riuscito a essere peggio di tutti e due, cazzo."},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"famiglia","text":"Chi vuole conoscere la sua famiglia? Nessuno, giustamente. Neanche lui li vede da anni."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"famiglia","text":"Il motto di famiglia è «Ci abbiamo provato». Sotto, più piccolo: «Tranne lui»."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"famiglia","text":"Tuo fratello è quello intelligente. E tuo fratello è un pollo."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"famiglia","text":"Il tuo albero genealogico l'hanno bruciato i druidi, per salvare il bosco."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"morte","text":"Muori pure in pace. Nessuno noterà la differenza."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"morte","text":"Il tuo necrologio è già pronto: due righe, e una è un refuso."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"morte","text":"La Regina Corvo ha messo la tua anima in lista d'attesa."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"morte","text":"Tre tiri salvezza contro la morte? Fatica sprecata: la morte ha già perso interesse."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"morte","text":"Quando morirai, il tuo fantasma infesterà solo se stesso."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"morte","text":"Prenotiamo il becchino adesso: con lui conviene il pacchetto completo."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"morte","text":"Il traghettatore ti chiederà due monete. Una per il viaggio, una per non doverti parlare."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"morte","text":"Morirai da solo, puzzolente, e nessuno si ricorderà il tuo nome di merda."},{"cat":"any","moment":"any","style":"standup","heat":1,"topic":"morte","text":"Ti seppelliranno con i tuoi tesori: un sasso e un'opinione sbagliata."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"morte","text":"La morte non ti fa paura? Tranquillo: neanche tu fai paura a lei."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"morte","text":"Il tuo testamento si legge in un minuto. Il funerale in trenta secondi."},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"morte","text":"Raccogliamo i soldi per la sua lapide! Abbiamo due rame e la scritta: «Peccato. Ma neanche tanto»."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"morte","text":"Prima di morire la vita ti passerà davanti agli occhi. Tranquillo, sarà breve e noiosa."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"morte","text":"Il tuo sacrificio non sarà dimenticato. Per dimenticarlo bisognerebbe prima notarlo."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"meta","text":"Alla nascita hai tirato un 1 naturale e nessuno ti ha fatto ritirare."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"meta","text":"Il master ti ha creato in trenta secondi. E si vede."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"meta","text":"Sulla tua scheda hanno scritto tutto a matita: nessuno pensava che saresti durato."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"meta","text":"Sei un incontro casuale. Di quelli che il master tira quando si annoia."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"meta","text":"Hai la Classe Armatura di un plico di carta bagnata."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"meta","text":"Quando tiri i dadi, i dadi si mettono d'accordo per perdere."},{"cat":"any","moment":"any","style":"standup","heat":1,"topic":"meta","text":"Vivi di tiri con svantaggio. È la tua dieta."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"meta","text":"Sei così poco importante che il master non ti ha dato un nome. Sulla scheda c'è scritto «il tizio»."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"meta","text":"La tua miniatura è un tappo di bottiglia. E ti sta larga."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"meta","text":"Hai i punti ferita minimi. Non per sfortuna: per realismo."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"meta","text":"Sei il PNG più di merda che il master abbia mai improvvisato, e una volta ha inventato una capra parlante."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"meta","text":"Si accettano scommesse: quanti round prima che il master si dimentichi di te dietro un albero?"},{"cat":"any","moment":"any","style":"assurdo","heat":1,"topic":"meta","text":"Il tuo allineamento è caotico irritante."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"meta","text":"Ogni tuo turno dura un'eternità. E alla fine dici «attacco»."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"meta","text":"Hai il carisma della tabella dei prezzi nel Manuale del Giocatore."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"meta","text":"Il tuo personaggio è stato creato con il metodo «tira 3d6 e piangi»."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"meta","text":"Quanti di voi hanno già dimenticato il suo nome? Bene, siamo in tanti. Anche lui."},{"cat":"any","moment":"any","style":"standup","heat":1,"topic":"meta","text":"Il master tiene lo schermo davanti per un motivo: non doverti guardare."},{"cat":"any","moment":"any","style":"roast","heat":0,"topic":"meta","text":"Il tuo bonus di competenza è negativo. Come la tua compagnia."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"meta","text":"Non sei un mostro. Sei il segnalino che tiene il posto al mostro vero."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"meta","text":"Hai l'aria di una missione secondaria scritta di fretta."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"meta","text":"Sei così noioso che il master ha fatto un tiro di Intuizione per capire se eri vivo."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"meta","text":"Se fossi un oggetto magico, saresti la Borsa delle Cianfrusaglie. Senza il tiro di dado."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"fortuna","text":"Hai più sfortuna di un gatto nero che passa sotto una scala davanti a un drago."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"fortuna","text":"La dea della fortuna ti ha bloccato su tutti i piani d'esistenza."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"fortuna","text":"Il tuo quadrifoglio è un trifoglio con una foglia disegnata male."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"fortuna","text":"Se piovesse oro, a te arriverebbe la grandine."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"fortuna","text":"La sfortuna ti segue ovunque. Secondo me è innamorata."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"fortuna","text":"Qualcuno tocchi ferro. Anzi no, lo tocchi lui: la spada, magari dalla parte giusta."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"fortuna","text":"Il tuo segno zodiacale è «lavori in corso»."},{"cat":"any","moment":"any","style":"standup","heat":1,"topic":"fortuna","text":"Sei così sfortunato che ogni forziere che trovi è un mimic."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"fortuna","text":"I tuoi dadi sono maledetti. Purtroppo vale anche per le tue scelte."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"fortuna","text":"Hai perso a testa o croce con una moneta a due teste."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"fortuna","text":"Hai una sfiga così grande che i corvi ti cagano in testa anche al chiuso."},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"fortuna","text":"Scommettete contro di lui, gente: è l'unico investimento sicuro del regno."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"fortuna","text":"Anche il tuo quadrifoglio portafortuna ha chiesto il trasferimento."},{"cat":"any","moment":"any","style":"assurdo","heat":1,"topic":"fortuna","text":"Il tuo oroscopo di oggi dice: «Cambia avversario»."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"atteggiamento","text":"Mi piace la tua sicurezza. È commovente, come un bambino che sfida un'onda."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"atteggiamento","text":"Hai l'atteggiamento del boss finale e il curriculum del ratto in cantina."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"atteggiamento","text":"Ti muovi come se avessi una colonna sonora. È una marcia funebre."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"atteggiamento","text":"Ti atteggi a minaccia. Al massimo sei l'avvertenza sul retro di una pozione."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"atteggiamento","text":"Fai il duro, ma hai la grinta di un budino lasciato al sole."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"atteggiamento","text":"Guardate come gonfia il petto! Qualcuno lo avvisi che non è un tacchino. O forse sì."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"atteggiamento","text":"La tua aria minacciosa spaventa solo le galline. E solo quelle anziane."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"atteggiamento","text":"Fai tanto il duro, ma sei solo uno stronzo con la cotta di maglia."},{"cat":"any","moment":"any","style":"standup","heat":1,"topic":"atteggiamento","text":"Hai la sicurezza di chi non ha ancora capito cosa sta per succedergli."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"atteggiamento","text":"Hai lo sguardo del falco. Di un falco impagliato."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"atteggiamento","text":"Ti credi un lupo solitario. Sei un cane che si è perso."},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"atteggiamento","text":"Fategli spazio: gli serve posto per l'entrata epica e per l'uscita di corsa."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"atteggiamento","text":"Le tue minacce di morte suonano come un invito a cena di cui non mi fido."},{"cat":"any","moment":"any","style":"assurdo","heat":1,"topic":"atteggiamento","text":"Sei arrogante come un gatto e utile come un gatto. Ma molto meno carino."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"any","text":"Ti rispetterei, se non ti conoscessi."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"any","text":"Sei come un sassolino nello stivale: piccolo, inutile e insopportabile."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"Se fossi un incantesimo, saresti Prestidigitazione: un po' di polvere e nessuno si ricorda di te."},{"cat":"any","moment":"any","style":"standup","heat":1,"topic":"any","text":"Non ti odio. Odiarti richiederebbe uno sforzo che non meriti."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"any","text":"Hai il fascino di un esattore delle tasse a un funerale."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"any","text":"Gente, un applauso: è riuscito a deludermi senza nemmeno provarci."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"Sei l'ombra di te stesso. E l'ombra ha chiesto la separazione."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"any","text":"Sei un pezzo di merda così perfetto che dovrebbero esporti in un museo."},{"cat":"goblin","moment":"any","style":"standup","heat":0,"topic":"any","text":"Ah, un goblin. Al villaggio devono aver finito i topi da mandare in avanscoperta."},{"cat":"goblin","moment":"any","style":"roast","heat":1,"topic":"incompetenza","text":"Sei un goblin scarso anche per i goblin. E i goblin si mangiano gli stivali."},{"cat":"goblin","moment":"any","style":"assurdo","heat":0,"topic":"aspetto","text":"Hai un naso così lungo che entra in combattimento un turno prima di te."},{"cat":"goblin","moment":"any","style":"crowd","heat":0,"topic":"any","text":"Contatelo bene, gente: sono tre goblin sotto un mantello, e nessuno dei tre sa combattere."},{"cat":"goblin","moment":"any","style":"standup","heat":0,"topic":"famiglia","text":"Tua madre ti ha venduto per tre noci. Il compratore vuole ancora il resto."},{"cat":"goblin","moment":"any","style":"roast","heat":2,"topic":"puzza","text":"Puzzi come la latrina di un goblin, e sei un goblin: sei riuscito a peggiorare la tua specie."},{"cat":"goblin","moment":"any","style":"assurdo","heat":0,"topic":"stupidita","text":"Coboldo, il tuo drago ti ha mandato qui perché non sopportava più le tue domande."},{"cat":"goblin","moment":"any","style":"standup","heat":1,"topic":"ego","text":"Ti sei proclamato re dei goblin. Re di sei goblin e una capra. La capra non ha votato."},{"cat":"goblin","moment":"any","style":"roast","heat":1,"topic":"fortuna","text":"Persino le trappole che costruisci tu preferiscono te come vittima."},{"cat":"goblin","moment":"any","style":"crowd","heat":1,"topic":"aspetto","text":"Guardate quel coboldo: la cosa più minacciosa che abbia mai visto in una scatola di biscotti."},{"cat":"goblin","moment":"any","style":"assurdo","heat":0,"topic":"incompetenza","text":"La tua trappola è così brutta che il bersaglio si è fermato a darti dei consigli."},{"cat":"goblin","moment":"any","style":"standup","heat":0,"topic":"any","text":"Sei piccolo e cattivo, come un sassolino nella scarpa. Di quelli che si tolgono."},{"cat":"goblin","moment":"any","style":"roast","heat":1,"topic":"atteggiamento","text":"Strilli tanto, per un coboldo. Del tuo drago hai preso la voce, e nient'altro."},{"cat":"goblin","moment":"any","style":"assurdo","heat":1,"topic":"any","text":"Sei il motivo per cui i goblin non vengono mai invitati alle feste. Dagli altri goblin."},{"cat":"goblin","moment":"any","style":"roast","heat":2,"topic":"any","text":"Un goblin di merda come te dovrebbe pagare l'affitto alla fogna."},{"cat":"goblin","moment":"any","style":"crowd","heat":0,"topic":"meta","text":"Gente, è un incontro di livello 1. E per lui è comunque troppo."},{"cat":"maghi","moment":"any","style":"standup","heat":0,"topic":"incompetenza","text":"Vent'anni in una torre a studiare, e hai imparato solo a scendere le scale. Lentamente."},{"cat":"maghi","moment":"any","style":"roast","heat":1,"topic":"ego","text":"Hai il cappello a punta. Il resto di te è perfettamente ottuso."},{"cat":"maghi","moment":"any","style":"assurdo","heat":0,"topic":"stupidita","text":"Il tuo libro degli incantesimi ha più orecchie di un coniglio e meno senso."},{"cat":"maghi","moment":"any","style":"standup","heat":0,"topic":"incompetenza","text":"Saprai anche lanciare Palla di Fuoco, ma la tua conversazione resta tiepida."},{"cat":"maghi","moment":"any","style":"roast","heat":1,"topic":"any","text":"La tua barba è più lunga del tuo curriculum. E puzza uguale."},{"cat":"maghi","moment":"any","style":"crowd","heat":0,"topic":"incompetenza","text":"Qualcuno chieda al mago che accademia ha frequentato. Così la evitiamo."},{"cat":"maghi","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"Il tuo famiglio è un gatto che ti guarda con disprezzo. Ha ragione lui."},{"cat":"maghi","moment":"any","style":"standup","heat":1,"topic":"stupidita","text":"Conosci mille lingue. Peccato che in nessuna tu abbia qualcosa da dire."},{"cat":"maghi","moment":"any","style":"roast","heat":1,"topic":"incompetenza","text":"L'accademia ti ha dato il diploma solo per farti uscire dall'edificio."},{"cat":"maghi","moment":"any","style":"assurdo","heat":0,"topic":"incompetenza","text":"Hai lanciato Invisibilità e nessuno se n'è accorto. Era così anche prima."},{"cat":"maghi","moment":"any","style":"standup","heat":0,"topic":"stupidita","text":"Componenti verbali, somatiche e materiali. Ti mancano solo quelle mentali."},{"cat":"maghi","moment":"any","style":"roast","heat":2,"topic":"incompetenza","text":"Sei un mago di merda: l'unica cosa che fai sparire sono gli amici."},{"cat":"maghi","moment":"any","style":"crowd","heat":1,"topic":"any","text":"Un applauso al grande arcimago, signore e signori! Non si sa di cosa, ma è grande."},{"cat":"maghi","moment":"any","style":"assurdo","heat":1,"topic":"ego","text":"Il tuo bastone è più alto di te. Compensa qualcosa, ma non chiedermi cosa."},{"cat":"maghi","moment":"any","style":"roast","heat":1,"topic":"aspetto","text":"Sei pallido come una pergamena e interessante allo stesso modo."},{"cat":"maghi","moment":"any","style":"standup","heat":0,"topic":"meta","text":"Prepari otto incantesimi al giorno e li sbagli tutti e otto, con grande puntualità."},{"cat":"spettri","moment":"any","style":"standup","heat":0,"topic":"any","text":"Un fantasma! Che paura… di annoiarmi a morte un'altra volta."},{"cat":"spettri","moment":"any","style":"roast","heat":1,"topic":"any","text":"Sei morto e sei rimasto qui. Neanche l'aldilà ti ha voluto."},{"cat":"spettri","moment":"any","style":"assurdo","heat":0,"topic":"aspetto","text":"Sei trasparente, eppure nessuno vuole guardarti attraverso."},{"cat":"spettri","moment":"any","style":"standup","heat":0,"topic":"atteggiamento","text":"Fai «buuh» da trecento anni. Mai pensato di cambiare battuta?"},{"cat":"spettri","moment":"any","style":"roast","heat":1,"topic":"incompetenza","text":"Secoli a infestare un castello, e non riesci ancora a spaventare il gatto."},{"cat":"spettri","moment":"any","style":"crowd","heat":0,"topic":"any","text":"Gente, guardiamo il lato positivo: è l'unico fantasma che fa ridere i bambini."},{"cat":"spettri","moment":"any","style":"assurdo","heat":0,"topic":"famiglia","text":"Trascini catene da secoli. Erano i debiti di gioco di tuo nonno, e te li sei presi tu."},{"cat":"spettri","moment":"any","style":"standup","heat":1,"topic":"morte","text":"Sei morto da secoli e non hai ancora superato la fase del lutto."},{"cat":"spettri","moment":"any","style":"roast","heat":1,"topic":"ego","text":"Sei l'eco di quello che eri. E quello che eri faceva già schifo."},{"cat":"spettri","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"Ti ho attraversato con la mano e mi è venuta la tristezza. Non il freddo: la tristezza."},{"cat":"spettri","moment":"any","style":"standup","heat":0,"topic":"any","text":"I fantasmi veri hanno conti in sospeso. Tu hai solo un conto all'osteria."},{"cat":"spettri","moment":"any","style":"roast","heat":2,"topic":"any","text":"Sei uno spettro del cazzo: neanche da morto riesci a fare paura."},{"cat":"spettri","moment":"any","style":"crowd","heat":1,"topic":"any","text":"Qualcuno chiami un chierico. Non per esorcizzarlo: per fargli un po' di compagnia, poverino."},{"cat":"spettri","moment":"any","style":"assurdo","heat":1,"topic":"any","text":"Il tuo lamento spettrale sembra un mulo raffreddato."},{"cat":"spettri","moment":"any","style":"roast","heat":1,"topic":"any","text":"Mi passi attraverso e sento un gran vuoto. Ah no, è il tuo carattere."},{"cat":"spettri","moment":"any","style":"standup","heat":0,"topic":"meta","text":"Hai resistenza ai danni non magici. E a ogni forma di simpatia."},{"cat":"nonmorti","moment":"any","style":"standup","heat":0,"topic":"any","text":"Se il necromante ti ha riportato in vita, vorrei parlare con il suo ufficio reclami."},{"cat":"nonmorti","moment":"any","style":"roast","heat":1,"topic":"aspetto","text":"Sei uno scheletro, e non hai nemmeno il buon gusto di avere delle belle ossa."},{"cat":"nonmorti","moment":"any","style":"crowd","heat":0,"topic":"stupidita","text":"Uno zombie! Finalmente qualcuno con meno cervello del nostro guerriero."},{"cat":"nonmorti","moment":"any","style":"standup","heat":0,"topic":"puzza","text":"Sei morto, va bene. Ma era proprio necessario marcire in pubblico?"},{"cat":"nonmorti","moment":"any","style":"roast","heat":1,"topic":"any","text":"Ti scricchiolano più le ossa delle scuse."},{"cat":"nonmorti","moment":"any","style":"assurdo","heat":0,"topic":"incompetenza","text":"Ti è caduto un braccio. Raccoglilo: ti serve per combattere. O almeno per salutare."},{"cat":"nonmorti","moment":"any","style":"crowd","heat":0,"topic":"any","text":"Un applauso allo scheletro: ha già perso tutto e continua a provarci."},{"cat":"nonmorti","moment":"any","style":"standup","heat":1,"topic":"stupidita","text":"Uno zombie che cerca cervelli. Capisco: si cerca sempre quello che non si ha."},{"cat":"nonmorti","moment":"any","style":"roast","heat":2,"topic":"puzza","text":"Puzzi di carne marcia e di culo, e il culo l'hai perso tre settimane fa."},{"cat":"nonmorti","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"Hai il sorriso di uno scheletro. Ah, già: è l'unica espressione che ti resta."},{"cat":"nonmorti","moment":"any","style":"standup","heat":0,"topic":"morte","text":"Sei già morto. Ti sto solo aiutando a ricordartelo."},{"cat":"nonmorti","moment":"any","style":"roast","heat":1,"topic":"incompetenza","text":"Il necromante ti ha rianimato per sbaglio. Voleva il cane."},{"cat":"nonmorti","moment":"any","style":"assurdo","heat":1,"topic":"aspetto","text":"Sei così magro che il vento ti usa come flauto."},{"cat":"nonmorti","moment":"any","style":"crowd","heat":1,"topic":"morte","text":"Qualcuno porti una pala: questo va rispedito a casa."},{"cat":"nonmorti","moment":"any","style":"standup","heat":0,"topic":"any","text":"Muori di nuovo, ma stavolta con un po' di stile."},{"cat":"nonmorti","moment":"any","style":"roast","heat":1,"topic":"any","text":"Hai il fascino di un lunedì mattina in una cripta."},{"cat":"draghi","moment":"any","style":"standup","heat":0,"topic":"ego","text":"Grande drago, grande tesoro, grande ego. E un cervello piccolo, piccolissimo."},{"cat":"draghi","moment":"any","style":"roast","heat":1,"topic":"any","text":"Dormi su un mucchio d'oro come un pensionato sul materasso."},{"cat":"draghi","moment":"any","style":"assurdo","heat":0,"topic":"puzza","text":"Il tuo soffio? L'avevo sentito tre regni fa, molto prima che lo usassi."},{"cat":"draghi","moment":"any","style":"standup","heat":0,"topic":"any","text":"Mille anni di vita e non hai ancora imparato a chiedere permesso."},{"cat":"draghi","moment":"any","style":"roast","heat":1,"topic":"ego","text":"Ti chiamano «il Terrore dei Cieli». L'hai scritto tu sulle nuvole?"},{"cat":"draghi","moment":"any","style":"crowd","heat":0,"topic":"any","text":"Gente, è un drago. Lo so, sembra un geco con problemi di gestione della rabbia."},{"cat":"draghi","moment":"any","style":"assurdo","heat":0,"topic":"famiglia","text":"Tua madre ha covato un uovo bellissimo. Poi sei nato tu."},{"cat":"draghi","moment":"any","style":"standup","heat":1,"topic":"fortuna","text":"Tutto quell'oro e nessuno che ti voglia bene."},{"cat":"draghi","moment":"any","style":"roast","heat":1,"topic":"aspetto","text":"Le tue scaglie hanno la forfora."},{"cat":"draghi","moment":"any","style":"assurdo","heat":0,"topic":"incompetenza","text":"Mille anni di vita e ti fai ancora fregare dagli halfling."},{"cat":"draghi","moment":"any","style":"standup","heat":0,"topic":"any","text":"Se sei così potente, perché vivi in una grotta umida come un rospo?"},{"cat":"draghi","moment":"any","style":"roast","heat":2,"topic":"any","text":"Sei solo una lucertola del cazzo con un problema di accumulo compulsivo."},{"cat":"draghi","moment":"any","style":"crowd","heat":1,"topic":"puzza","text":"Inchinatevi davanti al grande drago! O meglio, abbassatevi: l'alito arriva ad altezza naso."},{"cat":"draghi","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"Il tuo tesoro è così grande che ti serve un ragioniere. Il ragioniere ha chiesto di cambiare caverna."},{"cat":"draghi","moment":"any","style":"roast","heat":1,"topic":"meta","text":"Sei un drago antico. Antico come le tue battute."},{"cat":"draghi","moment":"any","style":"standup","heat":0,"topic":"atteggiamento","text":"Fai la voce grossa, ma sei solo un tesoro con le ali che ha paura dei ladri."},{"cat":"demoni","moment":"any","style":"standup","heat":0,"topic":"any","text":"Vieni dagli Inferi? E perché non ci sei rimasto?"},{"cat":"demoni","moment":"any","style":"roast","heat":1,"topic":"any","text":"Commerci in anime da secoli, e la tua non l'ha ancora voluta nessuno."},{"cat":"demoni","moment":"any","style":"assurdo","heat":0,"topic":"aspetto","text":"Le tue corna non fanno paura. Sembrano un attaccapanni con ambizioni."},{"cat":"demoni","moment":"any","style":"standup","heat":0,"topic":"ego","text":"Ti credi il re dell'Abisso. L'Abisso ti considera un inquilino moroso."},{"cat":"demoni","moment":"any","style":"roast","heat":1,"topic":"puzza","text":"Puzzi di zolfo e di occasioni mancate."},{"cat":"demoni","moment":"any","style":"crowd","heat":0,"topic":"any","text":"Signore e signori, un demone! Mostrategli l'uscita: è la stessa da cui è entrato."},{"cat":"demoni","moment":"any","style":"assurdo","heat":0,"topic":"incompetenza","text":"All'Inferno ti hanno messo all'accoglienza perché non sapevano cos'altro farti fare."},{"cat":"demoni","moment":"any","style":"standup","heat":1,"topic":"any","text":"All'Inferno fa caldo, lo so. Ma era proprio necessario portarsi dietro anche l'antipatia?"},{"cat":"demoni","moment":"any","style":"roast","heat":1,"topic":"ego","text":"Ti fai chiamare Principe dei Demoni. Il titolo te l'ha dato tua madre."},{"cat":"demoni","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"La tua frusta di fuoco sembra una cintura in saldo."},{"cat":"demoni","moment":"any","style":"standup","heat":0,"topic":"incompetenza","text":"Tentatore di anime, eh? Al massimo potresti tentare un bambino con un sasso."},{"cat":"demoni","moment":"any","style":"roast","heat":2,"topic":"any","text":"Sei un diavolo di merda: anche all'Inferno ti chiamano «quello lì»."},{"cat":"demoni","moment":"any","style":"crowd","heat":1,"topic":"any","text":"Tranquilli, ragazzi: questo demone non ruba anime. Ruba solo tempo."},{"cat":"demoni","moment":"any","style":"assurdo","heat":1,"topic":"any","text":"Dicono che l'inferno siano gli altri. Il nostro sei tu."},{"cat":"demoni","moment":"any","style":"roast","heat":1,"topic":"any","text":"Ti hanno dato le ali per farti volare lontano. Non ha funzionato."},{"cat":"demoni","moment":"any","style":"standup","heat":0,"topic":"meta","text":"Grado di Sfida altissimo, simpatia sottozero."},{"cat":"mostri","moment":"any","style":"standup","heat":0,"topic":"aspetto","text":"Quanti tentacoli! E nessuno che voglia stringerti la mano."},{"cat":"mostri","moment":"any","style":"roast","heat":1,"topic":"any","text":"Sei un abominio. E non nel senso artistico."},{"cat":"mostri","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"Il tuo creatore ti ha visto e ha cambiato hobby."},{"cat":"mostri","moment":"any","style":"standup","heat":0,"topic":"any","text":"Metà leone e metà aquila. Peccato che le due metà non si parlino."},{"cat":"mostri","moment":"any","style":"roast","heat":1,"topic":"aspetto","text":"Hai sette occhi e nessuno sa dove guardare per trovare un po' di dignità."},{"cat":"mostri","moment":"any","style":"crowd","heat":0,"topic":"any","text":"Gente, un mostro! Tranquilli, ha più paura lui di noi. Anche di se stesso."},{"cat":"mostri","moment":"any","style":"assurdo","heat":0,"topic":"stupidita","text":"Un orsogufo: la forza di un orso e il cervello di un gufo impagliato."},{"cat":"mostri","moment":"any","style":"standup","heat":1,"topic":"any","text":"Sei il risultato di un esperimento magico andato male. E ti hanno pure dato un nome."},{"cat":"mostri","moment":"any","style":"roast","heat":1,"topic":"incompetenza","text":"Mostro leggendario, eh? Leggendario per quanto è facile da ammazzare."},{"cat":"mostri","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"Sei così strano che il bestiario ti ha messo in appendice."},{"cat":"mostri","moment":"any","style":"standup","heat":0,"topic":"famiglia","text":"Nei bestiari ti descrivono come temibile. Il bestiario l'ha scritto tua madre."},{"cat":"mostri","moment":"any","style":"roast","heat":2,"topic":"aspetto","text":"Sei brutto come la merda anche per essere un mostro."},{"cat":"mostri","moment":"any","style":"crowd","heat":1,"topic":"any","text":"Qualcuno sa cos'è? No? Neanche lui."},{"cat":"mostri","moment":"any","style":"assurdo","heat":1,"topic":"any","text":"Sei un mimic travestito da forziere, e nessuno ha voglia di aprirti."},{"cat":"mostri","moment":"any","style":"roast","heat":1,"topic":"any","text":"Ti chiamano «l'orrore della palude». La palude ha chiesto di cambiare nome."},{"cat":"mostri","moment":"any","style":"standup","heat":0,"topic":"meta","text":"Hai la scheda più lunga del bestiario e sei durato due round."},{"cat":"umanoidi","moment":"any","style":"standup","heat":0,"topic":"incompetenza","text":"Bella spada. Peccato che sia l'unica parte di te affilata."},{"cat":"umanoidi","moment":"any","style":"roast","heat":1,"topic":"any","text":"Hai l'armatura completa e la personalità di un elmo vuoto."},{"cat":"umanoidi","moment":"any","style":"assurdo","heat":0,"topic":"incompetenza","text":"Combatti come un contadino che ha visto una spada solo in un dipinto."},{"cat":"umanoidi","moment":"any","style":"standup","heat":0,"topic":"any","text":"Sei la guardia più fedele del castello: nessuno ti ha mai visto vincere."},{"cat":"umanoidi","moment":"any","style":"roast","heat":1,"topic":"atteggiamento","text":"Fai il bandito duro, ma sei solo un tizio con un coltello e problemi di autostima."},{"cat":"umanoidi","moment":"any","style":"crowd","heat":0,"topic":"incompetenza","text":"Gente, un mercenario! Lo pagano a giornata. Speriamo per lui che oggi sia mezza."},{"cat":"umanoidi","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"Il tuo scudo ha più ammaccature che idee. Poche anche quelle."},{"cat":"umanoidi","moment":"any","style":"standup","heat":1,"topic":"any","text":"Hai giurato di proteggere il re. Speriamo che il re sappia correre."},{"cat":"umanoidi","moment":"any","style":"roast","heat":1,"topic":"ego","text":"Ti chiamano «il Macellaio»? Al massimo affetti il salame."},{"cat":"umanoidi","moment":"any","style":"assurdo","heat":0,"topic":"fortuna","text":"Nel tuo elmo vive una famiglia di ratti. Ti hanno lasciato lo sfratto."},{"cat":"umanoidi","moment":"any","style":"standup","heat":0,"topic":"any","text":"Cavaliere senza macchia e senza paura. Ma anche senza un perché."},{"cat":"umanoidi","moment":"any","style":"roast","heat":2,"topic":"incompetenza","text":"Sei un soldato di merda: anche i tuoi stivali ti abbandonerebbero in battaglia."},{"cat":"umanoidi","moment":"any","style":"crowd","heat":1,"topic":"any","text":"Un applauso al campione del torneo locale! Eravate in due, giusto?"},{"cat":"umanoidi","moment":"any","style":"assurdo","heat":1,"topic":"any","text":"Il tuo cavallo ti porta in battaglia solo perché con te in groppa si scappa prima."},{"cat":"umanoidi","moment":"any","style":"roast","heat":1,"topic":"aspetto","text":"Con quell'armatura sembri una pentola con una crisi d'identità."},{"cat":"umanoidi","moment":"any","style":"standup","heat":0,"topic":"meta","text":"Sei un bandito di livello 1. Ed è l'unico livello che vedrai."},{"cat":"boss","moment":"any","style":"standup","heat":0,"topic":"any","text":"Un trono, una fortezza, un esercito. E nessuno che ti ascolti fino alla fine."},{"cat":"boss","moment":"any","style":"roast","heat":1,"topic":"ego","text":"Hai un piano per conquistare il mondo e nessun piano per farti voler bene."},{"cat":"boss","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"Il tuo covo segreto ha l'insegna luminosa e il parcheggio per i draghi."},{"cat":"boss","moment":"any","style":"standup","heat":0,"topic":"atteggiamento","text":"Ridi come il cattivo di un'operetta. Ti pagano o lo fai per passione?"},{"cat":"boss","moment":"any","style":"roast","heat":1,"topic":"any","text":"Sei il boss finale di un dungeon che nessuno ricorderà."},{"cat":"boss","moment":"any","style":"crowd","heat":0,"topic":"any","text":"Ragazzi, il boss finale! Mi aspettavo di più. Credo anche lui."},{"cat":"boss","moment":"any","style":"assurdo","heat":0,"topic":"incompetenza","text":"I tuoi scagnozzi ti obbediscono solo perché il contratto ha una penale."},{"cat":"boss","moment":"any","style":"standup","heat":1,"topic":"ego","text":"Il tuo ritratto nella sala del trono è più grande del tuo regno."},{"cat":"boss","moment":"any","style":"roast","heat":1,"topic":"any","text":"Il tuo esercito di non-morti ti segue senza lamentarsi. Non hanno più la bocca."},{"cat":"boss","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"Il tuo mantello nero è così lungo che inciampi nelle tue stesse minacce."},{"cat":"boss","moment":"any","style":"standup","heat":0,"topic":"any","text":"Hai aspettato cento anni questo momento. Ne valeva la pena? Spoiler: no."},{"cat":"boss","moment":"any","style":"roast","heat":2,"topic":"ego","text":"Sei un signore oscuro di merda: castello, armata e nemmeno un amico."},{"cat":"boss","moment":"any","style":"crowd","heat":1,"topic":"any","text":"Ve lo dico io come finisce, gente: lui fa il monologo, noi lo picchiamo, titoli di coda."},{"cat":"boss","moment":"any","style":"assurdo","heat":1,"topic":"any","text":"Un bardo ha registrato la tua risata malvagia. La usano come ninna nanna."},{"cat":"boss","moment":"any","style":"roast","heat":1,"topic":"incompetenza","text":"Un piano malvagio perfetto, e hai dimenticato di chiudere la porta sul retro."},{"cat":"boss","moment":"any","style":"standup","heat":0,"topic":"meta","text":"Hai le azioni leggendarie. L'unica cosa leggendaria qui è la noia."},{"cat":"oggetti","moment":"any","style":"standup","heat":0,"topic":"any","text":"Un'armatura animata, senza nessuno dentro. Proprio come i tuoi ragionamenti."},{"cat":"oggetti","moment":"any","style":"roast","heat":1,"topic":"any","text":"Sei una scopa animata. Spazza via almeno la tua dignità."},{"cat":"oggetti","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"Sei un forziere mimic, e l'unica cosa preziosa che hai dentro è la polvere."},{"cat":"oggetti","moment":"any","style":"standup","heat":0,"topic":"any","text":"Un tappeto volante che attacca: finalmente qualcosa di più fastidioso di un tappeto normale."},{"cat":"oggetti","moment":"any","style":"roast","heat":1,"topic":"incompetenza","text":"Sei una spada volante che non sa dove andare. Come il tuo vecchio padrone."},{"cat":"oggetti","moment":"any","style":"crowd","heat":0,"topic":"any","text":"Gente, l'arredamento si è ribellato! Qualcuno chiami un rigattiere."},{"cat":"oggetti","moment":"any","style":"assurdo","heat":0,"topic":"ego","text":"Ti credi una reliquia preziosa. Sei un soprammobile con le convulsioni."},{"cat":"oggetti","moment":"any","style":"standup","heat":1,"topic":"any","text":"Sei una statua animata. Stavi benissimo ferma: chi te l'ha fatto fare?"},{"cat":"oggetti","moment":"any","style":"roast","heat":1,"topic":"any","text":"Ti si sente arrivare dallo scricchiolio. Come una sedia che vuole litigare."},{"cat":"oggetti","moment":"any","style":"assurdo","heat":0,"topic":"meta","text":"Sei un oggetto magico non comune. In bottega ti metterebbero nel cesto delle offerte."},{"cat":"oggetti","moment":"any","style":"standup","heat":0,"topic":"any","text":"Sei un oggetto animato. Il resto della stanza ha preferito non partecipare."},{"cat":"oggetti","moment":"any","style":"roast","heat":2,"topic":"any","text":"Sei un cazzo di soprammobile con manie di grandezza."},{"cat":"oggetti","moment":"any","style":"crowd","heat":1,"topic":"any","text":"Facciamo un'asta! Chi offre due rame per questa armatura vuota e arrabbiata?"},{"cat":"oggetti","moment":"any","style":"assurdo","heat":1,"topic":"any","text":"Sei un comodino che combatte con il carattere di un esattore delle tasse."},{"cat":"oggetti","moment":"any","style":"roast","heat":1,"topic":"aspetto","text":"Sei così malridotto che persino una scopa si rifiuta di pulirti."},{"cat":"oggetti","moment":"any","style":"standup","heat":0,"topic":"meta","text":"Immune a quasi tutto, tranne che al ridicolo."},{"cat":"fey","moment":"any","style":"standup","heat":0,"topic":"fiabe","text":"Una fata! Che magia. Ah no, sono solo i tuoi brillantini nei miei occhi."},{"cat":"fey","moment":"any","style":"roast","heat":1,"topic":"fiabe","text":"Sei il motivo per cui nei patti fatati servirebbe il diritto di recesso."},{"cat":"fey","moment":"any","style":"assurdo","heat":0,"topic":"fiabe","text":"Hai le ali di una farfalla e il carattere di una vespa con il mal di denti."},{"cat":"fey","moment":"any","style":"standup","heat":0,"topic":"fiabe","text":"Vieni dal Feywild? Che coincidenza: anche il mio mal di testa."},{"cat":"fey","moment":"any","style":"roast","heat":1,"topic":"fiabe","text":"Sei bella come un sogno. Di quelli da cui ti svegli sudato."},{"cat":"fey","moment":"any","style":"crowd","heat":0,"topic":"fiabe","text":"Gente, una fata! Applaudite, altrimenti muore. Anzi, aspettate un attimo prima di applaudire."},{"cat":"fey","moment":"any","style":"assurdo","heat":0,"topic":"fiabe","text":"La tua magia fatata funziona solo nelle notti di luna piena. E anche in quelle sei inutile."},{"cat":"fey","moment":"any","style":"standup","heat":1,"topic":"fiabe","text":"Fai patti eterni con i mortali. Peccato che non ne rispetti neanche uno."},{"cat":"fey","moment":"any","style":"roast","heat":1,"topic":"fiabe","text":"Saresti un folletto della corte d'estate? Sembri più che altro una zanzara di agosto."},{"cat":"fey","moment":"any","style":"assurdo","heat":0,"topic":"fiabe","text":"Il tuo vero nome ha un grande potere. Quello finto fa solo ridere."},{"cat":"fey","moment":"any","style":"standup","heat":0,"topic":"fiabe","text":"Un satiro: metà uomo, metà capra, interamente insopportabile."},{"cat":"fey","moment":"any","style":"roast","heat":1,"topic":"fiabe","text":"La regina delle fate ti ha affidato una missione solo per toglierti dalla corte."},{"cat":"fey","moment":"any","style":"crowd","heat":0,"topic":"fiabe","text":"Qualcuno ha del ferro freddo? Niente di grave: voglio solo vederlo scappare."},{"cat":"fey","moment":"any","style":"assurdo","heat":0,"topic":"fiabe","text":"Le tue ali brillano al sole. Anche le mosche sulla torta."},{"cat":"fey","moment":"any","style":"standup","heat":0,"topic":"fiabe","text":"Le fate rapiscono i bambini. Tu invece li annoi finché non tornano a casa da soli."},{"cat":"fey","moment":"any","style":"roast","heat":2,"topic":"fiabe","text":"Sei una fata del cazzo: persino il tuo cerchio fatato è fatto di funghi velenosi."},{"cat":"fey","moment":"any","style":"assurdo","heat":1,"topic":"fiabe","text":"Un folletto dispettoso? Sei un sassolino nella scarpa, con le ali."},{"cat":"fey","moment":"any","style":"standup","heat":0,"topic":"fiabe","text":"Dicono che le fate non possano mentire. Allora dimmi: sai fare qualcosa di utile?"},{"cat":"fey","moment":"any","style":"roast","heat":1,"topic":"fiabe","text":"La tua bellezza ultraterrena è un'illusione. E pure di bassa qualità."},{"cat":"fey","moment":"any","style":"crowd","heat":1,"topic":"fiabe","text":"Signore e signori, una ninfa! Il suo canto incanta tutti, tranne chi ha le orecchie."},{"cat":"fey","moment":"any","style":"assurdo","heat":0,"topic":"fiabe","text":"Il tuo cerchio di funghi è così brutto che anche gli gnomi tirano dritto."},{"cat":"fey","moment":"any","style":"standup","heat":1,"topic":"fiabe","text":"Vivi per sempre nel Feywild perché nel mondo normale ti avrebbero già cacciata."},{"cat":"fey","moment":"any","style":"roast","heat":1,"topic":"fiabe","text":"Sei una megera vestita da fata. Il trucco si vede."},{"cat":"fey","moment":"any","style":"assurdo","heat":0,"topic":"meta","text":"Sei un incontro casuale del Feywild: incantevole all'inizio, un disastro per tutti dopo."},{"cat":"any","moment":"ingresso","style":"standup","heat":0,"topic":"any","text":"Oh, finalmente! Il motivo per cui avevamo abbassato le aspettative."},{"cat":"any","moment":"ingresso","style":"roast","heat":1,"topic":"any","text":"È arrivato il pericolo. Ah no, ha mandato il sostituto."},{"cat":"any","moment":"ingresso","style":"assurdo","heat":0,"topic":"any","text":"La porta si è aperta e il buon gusto è scappato dalla finestra."},{"cat":"any","moment":"ingresso","style":"crowd","heat":0,"topic":"any","text":"Fate largo, gente: è arrivato il nemico. O almeno, così dice lui."},{"cat":"any","moment":"ingresso","style":"standup","heat":0,"topic":"atteggiamento","text":"Bella entrata. Adesso fanne una uguale, ma uscendo. Più veloce."},{"cat":"any","moment":"ingresso","style":"roast","heat":1,"topic":"aspetto","text":"Che entrata d'effetto. Peccato che poi sia entrato anche tu."},{"cat":"any","moment":"ingresso","style":"assurdo","heat":0,"topic":"any","text":"Ti hanno annunciato con le trombe. Le trombe hanno chiesto scusa."},{"cat":"any","moment":"ingresso","style":"standup","heat":1,"topic":"any","text":"Ti aspettavamo. Non con ansia: con rassegnazione."},{"cat":"any","moment":"ingresso","style":"crowd","heat":1,"topic":"any","text":"Tutti in piedi! No, non per rispetto: per scappare."},{"cat":"any","moment":"ingresso","style":"roast","heat":2,"topic":"any","text":"Ecco il coglione di turno, puntuale come la peste."},{"cat":"any","moment":"ingresso","style":"assurdo","heat":0,"topic":"meta","text":"Il master ha tirato sulla tabella degli incontri ed è uscito il tuo nome. Gli dispiace."},{"cat":"any","moment":"ingresso","style":"standup","heat":0,"topic":"ego","text":"Entri come se fosse il tuo palazzo. È una caverna, e non paghi nemmeno l'affitto."},{"cat":"any","moment":"manca","style":"standup","heat":0,"topic":"incompetenza","text":"Hai mancato. Non me: l'intera idea di colpire."},{"cat":"any","moment":"manca","style":"roast","heat":1,"topic":"incompetenza","text":"Complimenti: hai ferito l'aria. Sta piangendo."},{"cat":"any","moment":"manca","style":"assurdo","heat":0,"topic":"incompetenza","text":"Il muro dietro di me ti ringrazia per le attenzioni."},{"cat":"any","moment":"manca","style":"crowd","heat":0,"topic":"incompetenza","text":"Qualcuno dia un premio al muro! È l'unico in pericolo qui."},{"cat":"any","moment":"manca","style":"standup","heat":0,"topic":"any","text":"Tranquillo, capita a tutti di sbagliare. A te capita per professione."},{"cat":"any","moment":"manca","style":"roast","heat":1,"topic":"incompetenza","text":"Con quella mira non colpiresti un drago nemmeno se ti si sedesse in braccio."},{"cat":"any","moment":"manca","style":"assurdo","heat":0,"topic":"meta","text":"Hai tirato un 1? Guardandoti, direi che è il dado ad aver tirato te."},{"cat":"any","moment":"manca","style":"standup","heat":1,"topic":"incompetenza","text":"Bel colpo! A chi l'hai dedicato? Al vento?"},{"cat":"any","moment":"manca","style":"crowd","heat":1,"topic":"incompetenza","text":"Avete visto che finta? Ah no, non era una finta. Era il suo attacco migliore."},{"cat":"any","moment":"manca","style":"roast","heat":2,"topic":"incompetenza","text":"Hai mancato di nuovo, coglione: prova con il pavimento, che è grande."},{"cat":"any","moment":"manca","style":"assurdo","heat":0,"topic":"incompetenza","text":"Il tuo colpo è passato così lontano che è finito in un'altra campagna."},{"cat":"any","moment":"manca","style":"standup","heat":0,"topic":"fortuna","text":"Tranquillo, la prossima volta andrà meglio. Te lo dico per pietà, ovviamente."},{"cat":"any","moment":"incantesimo","style":"standup","heat":0,"topic":"incompetenza","text":"Era un incantesimo o stavi starnutendo con le mani?"},{"cat":"any","moment":"incantesimo","style":"roast","heat":1,"topic":"incompetenza","text":"Hai sbagliato la formula. O forse il mestiere."},{"cat":"any","moment":"incantesimo","style":"assurdo","heat":0,"topic":"any","text":"Volevi lanciare Palla di Fuoco e ti è uscito un fiammifero bagnato."},{"cat":"any","moment":"incantesimo","style":"crowd","heat":0,"topic":"incompetenza","text":"Gente, che spettacolo pirotecnico! Una scintilla e tanta vergogna."},{"cat":"any","moment":"incantesimo","style":"standup","heat":0,"topic":"any","text":"Gli incantesimi richiedono concentrazione. Capisco il problema."},{"cat":"any","moment":"incantesimo","style":"roast","heat":1,"topic":"stupidita","text":"Hai sbagliato una parola magica. Strano: di solito sbagli frasi intere."},{"cat":"any","moment":"incantesimo","style":"assurdo","heat":0,"topic":"meta","text":"Hai sprecato uno slot incantesimo. Come la tua istruzione."},{"cat":"any","moment":"incantesimo","style":"standup","heat":1,"topic":"incompetenza","text":"Lo so, la magia è difficile. Soprattutto per chi non ha talento."},{"cat":"any","moment":"incantesimo","style":"crowd","heat":1,"topic":"incompetenza","text":"Applausi! Ha appena inventato un nuovo incantesimo: Nulla di Fatto."},{"cat":"any","moment":"incantesimo","style":"roast","heat":2,"topic":"incompetenza","text":"Hai lanciato un incantesimo di merda: ha riso perfino il mio cappello."},{"cat":"any","moment":"incantesimo","style":"assurdo","heat":0,"topic":"any","text":"La tua magia ha fatto «puf». Non come un'esplosione: come un sospiro."},{"cat":"any","moment":"incantesimo","style":"standup","heat":0,"topic":"ego","text":"Grande mago, piccola scintilla. Di sicuro è colpa del bastone."},{"cat":"any","moment":"ferito","style":"standup","heat":0,"topic":"any","text":"Ti fa male? Bene. È la prima cosa sensata che senti oggi."},{"cat":"any","moment":"ferito","style":"roast","heat":1,"topic":"any","text":"Perdi sangue come una botte bucata, e servi a uguale."},{"cat":"any","moment":"ferito","style":"assurdo","heat":0,"topic":"any","text":"Ops, ti è caduto qualcosa. Ah no, era un pezzo di te."},{"cat":"any","moment":"ferito","style":"crowd","heat":0,"topic":"any","text":"Guardate, gente: anche lui sanguina. Quindi è umano. Più o meno."},{"cat":"any","moment":"ferito","style":"standup","heat":0,"topic":"atteggiamento","text":"Non piangere: le lacrime non curano le ferite. Né la vergogna."},{"cat":"any","moment":"ferito","style":"roast","heat":1,"topic":"incompetenza","text":"Ti hanno colpito di nuovo? Dovresti farti pagare a colpo."},{"cat":"any","moment":"ferito","style":"assurdo","heat":0,"topic":"meta","text":"Ti restano pochi punti ferita. E ancora meno punti stile."},{"cat":"any","moment":"ferito","style":"standup","heat":1,"topic":"any","text":"Fa male l'orgoglio, eh? Aspetta che arrivi la spada."},{"cat":"any","moment":"ferito","style":"crowd","heat":1,"topic":"any","text":"Chi aveva scommesso che avrebbe sanguinato prima di pranzo? Offre da bere."},{"cat":"any","moment":"ferito","style":"roast","heat":2,"topic":"any","text":"Sanguini come un maiale, e strilli pure uguale."},{"cat":"any","moment":"ferito","style":"assurdo","heat":0,"topic":"any","text":"Quel graffio guarirà. Il tuo amor proprio, invece, è da buttare."},{"cat":"any","moment":"ferito","style":"standup","heat":0,"topic":"morte","text":"Coraggio, non è una ferita mortale. Dagli tempo."},{"cat":"any","moment":"terra","style":"standup","heat":0,"topic":"any","text":"Così sei finito a terra. Almeno lì sei al tuo livello."},{"cat":"any","moment":"terra","style":"roast","heat":1,"topic":"any","text":"Resta lì. Il pavimento ha più dignità di te in piedi."},{"cat":"any","moment":"terra","style":"assurdo","heat":0,"topic":"any","text":"La gravità ti ha scelto come esempio per le sue lezioni."},{"cat":"any","moment":"terra","style":"crowd","heat":0,"topic":"any","text":"Facciamo un ritratto! Il nemico a terra, momento storico. Breve, ma storico."},{"cat":"any","moment":"terra","style":"standup","heat":0,"topic":"atteggiamento","text":"Non alzarti per me. Anzi, non alzarti proprio."},{"cat":"any","moment":"terra","style":"roast","heat":1,"topic":"incompetenza","text":"Sei caduto con una grazia che neanche un sacco di patate."},{"cat":"any","moment":"terra","style":"assurdo","heat":0,"topic":"meta","text":"Sei prono: svantaggio agli attacchi. Non che prima cambiasse molto."},{"cat":"any","moment":"terra","style":"standup","heat":1,"topic":"any","text":"Ti aiuterei a rialzarti, ma il pavimento finalmente ti apprezza."},{"cat":"any","moment":"terra","style":"crowd","heat":1,"topic":"any","text":"Qualcuno gli porti un cuscino: già che ci sta così bene, almeno che stia comodo."},{"cat":"any","moment":"terra","style":"roast","heat":2,"topic":"any","text":"Stai giù, stronzo: il fango ti dona."},{"cat":"any","moment":"terra","style":"assurdo","heat":0,"topic":"any","text":"Il pavimento ti cercava. Diceva che sentiva la tua mancanza."},{"cat":"any","moment":"terra","style":"standup","heat":0,"topic":"ego","text":"Inginocchiarsi è un gesto nobile. Tu ci sei arrivato di faccia."},{"cat":"any","moment":"curato","style":"standup","heat":0,"topic":"any","text":"Ti hanno curato? Peccato, stavi migliorando."},{"cat":"any","moment":"curato","style":"roast","heat":1,"topic":"any","text":"Una pozione di cura su di te è uno spreco di risorse naturali."},{"cat":"any","moment":"curato","style":"assurdo","heat":0,"topic":"any","text":"Il chierico ti ha guarito e ha chiesto di poter guarire anche dalla tua compagnia."},{"cat":"any","moment":"curato","style":"crowd","heat":0,"topic":"any","text":"Qualcuno controlli la scadenza di quella pozione. Speriamo sia scaduta."},{"cat":"any","moment":"curato","style":"standup","heat":0,"topic":"incompetenza","text":"Ti rimettono in piedi solo per vederti cadere di nuovo. È intrattenimento."},{"cat":"any","moment":"curato","style":"roast","heat":1,"topic":"stupidita","text":"Puoi curare le ferite, ma non la stupidità: anche la magia ha dei limiti."},{"cat":"any","moment":"curato","style":"assurdo","heat":0,"topic":"meta","text":"Hai recuperato punti ferita. Purtroppo non quelli di simpatia."},{"cat":"any","moment":"curato","style":"standup","heat":1,"topic":"any","text":"Curare te è come dare una mano di vernice a una catapecchia."},{"cat":"any","moment":"curato","style":"crowd","heat":1,"topic":"any","text":"Un applauso al guaritore! Ha rimesso insieme l'idiota. Bel lavoro, ma perché?"},{"cat":"any","moment":"curato","style":"roast","heat":2,"topic":"any","text":"Ti hanno rimesso in sesto: ora sei uno stronzo nuovo di zecca."},{"cat":"any","moment":"curato","style":"assurdo","heat":0,"topic":"any","text":"Ti hanno curato con tanto amore. Si vede che non ti conoscono."},{"cat":"any","moment":"curato","style":"standup","heat":0,"topic":"atteggiamento","text":"Ti senti meglio? Bene: così la prossima botta la senti tutta."},{"cat":"any","moment":"rinforzi","style":"standup","heat":0,"topic":"any","text":"Ah, i rinforzi. Perché sbagliare da soli quando si può sbagliare in compagnia?"},{"cat":"any","moment":"rinforzi","style":"roast","heat":1,"topic":"any","text":"Hai chiamato aiuto? Allora il tuo orgoglio è già morto."},{"cat":"any","moment":"rinforzi","style":"assurdo","heat":0,"topic":"any","text":"Più nemici, più bersagli. Ho portato un sacco grande per le vostre scuse."},{"cat":"any","moment":"rinforzi","style":"crowd","heat":0,"topic":"any","text":"Tranquilli, gente: sono arrivati i rinforzi. È il cugino scemo."},{"cat":"any","moment":"rinforzi","style":"standup","heat":0,"topic":"incompetenza","text":"Ti servono altri dieci come te? Allora siete in undici a non valere niente."},{"cat":"any","moment":"rinforzi","style":"roast","heat":1,"topic":"stupidita","text":"Avete trovato il coraggio in gruppo. Peccato che con il cervello non funzioni così."},{"cat":"any","moment":"rinforzi","style":"assurdo","heat":0,"topic":"meta","text":"Il master ha aggiunto altri nemici per pietà. Non per voi: per noi, che ci annoiavamo."},{"cat":"any","moment":"rinforzi","style":"standup","heat":1,"topic":"any","text":"Più siete, più ci divertiamo. E più tempo ci vuole per contare i cadaveri."},{"cat":"any","moment":"rinforzi","style":"crowd","heat":1,"topic":"any","text":"Venite, venite, nella fossa c'è posto per tutti!"},{"cat":"any","moment":"rinforzi","style":"roast","heat":2,"topic":"any","text":"Siete tanti e tutti coglioni: una vera festa di paese."},{"cat":"any","moment":"rinforzi","style":"assurdo","heat":0,"topic":"any","text":"Avete portato gli amici. Peccato: ora vi vedranno perdere in tanti."},{"cat":"any","moment":"rinforzi","style":"standup","heat":0,"topic":"ego","text":"Hai chiamato i rinforzi? Ammetti che da solo non vali niente."},{"cat":"any","moment":"monologo","style":"standup","heat":0,"topic":"any","text":"Interessante monologo. Dove si chiede il rimborso del biglietto?"},{"cat":"any","moment":"monologo","style":"roast","heat":1,"topic":"ego","text":"Ti piace così tanto parlare di te che dovresti sposare il tuo specchio."},{"cat":"any","moment":"monologo","style":"assurdo","heat":0,"topic":"any","text":"Il tuo piano malvagio ha più capitoli di un almanacco e meno colpi di scena."},{"cat":"any","moment":"monologo","style":"crowd","heat":0,"topic":"any","text":"Mettetevi comodi, ragazzi: il cattivo sta per spiegarci tutto. Due volte."},{"cat":"any","moment":"monologo","style":"standup","heat":0,"topic":"atteggiamento","text":"Stai facendo il monologo. Lo sai che è proprio adesso che perdi?"},{"cat":"any","moment":"monologo","style":"roast","heat":1,"topic":"any","text":"Il tuo discorso è così lungo che le guardie si sono sedute."},{"cat":"any","moment":"monologo","style":"assurdo","heat":0,"topic":"meta","text":"Il master sta leggendo il tuo monologo da tre pagine. Si è commosso solo lui."},{"cat":"any","moment":"monologo","style":"standup","heat":1,"topic":"any","text":"Questo discorso l'hai provato davanti allo specchio? Lo specchio ti ha chiesto di smettere."},{"cat":"any","moment":"monologo","style":"crowd","heat":1,"topic":"any","text":"Svegliatemi quando arriva al punto. Se ci arriva."},{"cat":"any","moment":"monologo","style":"roast","heat":2,"topic":"any","text":"Chiudi quella cazzo di bocca, ci stai annoiando a morte."},{"cat":"any","moment":"monologo","style":"assurdo","heat":0,"topic":"any","text":"Più parli, più il tuo piano malvagio sembra la lista della spesa."},{"cat":"any","moment":"monologo","style":"standup","heat":0,"topic":"ego","text":"Hai un piano geniale? Allora sbrigati a usarlo: noi abbiamo un'ascia."},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"aspetto","text":"Sei un foruncolo, una piaga della peste.","src":"Shakespeare, Re Lear"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"atteggiamento","text":"In te non c'è più lealtà che in una prugna cotta.","src":"Shakespeare, Enrico IV, parte I"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"stupidita","text":"Il tuo cervello è secco come l'ultimo biscotto rimasto dopo un lungo viaggio per mare.","src":"Shakespeare, Come vi piace"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"puzza","text":"Ti picchierei, ma mi infetterei le mani.","src":"Shakespeare, Timone d'Atene"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"stupidita","text":"Ancora un po' di conversazione con te e mi si infetta il cervello.","src":"Shakespeare, Coriolano"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"aspetto","text":"Via di qui, sciocco alto tre pollici!","src":"Shakespeare, La bisbetica domata"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"stupidita","text":"Il tuo ingegno è denso come la senape di Tewkesbury.","src":"Shakespeare, Enrico IV, parte II"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"aspetto","text":"La tua faccia non vale nemmeno la fatica di abbronzarla.","src":"Shakespeare, Enrico V"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"aspetto","text":"L'acidità della tua faccia farebbe inacidire l'uva matura.","src":"Shakespeare, La commedia degli errori"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"morte","text":"Non sei adatto a nessun posto, se non all'inferno.","src":"Shakespeare, Riccardo III"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"aspetto","text":"Tu, babbeo dalla faccia color panna!","src":"Shakespeare, Macbeth"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"aspetto","text":"Grumo di laida deformità!","src":"Shakespeare, Riccardo III"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"stupidita","text":"Signore dal cervello bollito, hai meno cervello di quanto io ne abbia nei gomiti.","src":"Shakespeare, Troilo e Cressida"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"atteggiamento","text":"La tua lingua è più velenosa di tutti i serpenti del Nilo.","src":"Shakespeare, Cimbelino"},{"cat":"any","moment":"any","style":"autore","heat":1,"topic":"puzza","text":"Vorrei che tu fossi abbastanza pulito da poterti sputare addosso.","src":"Shakespeare, Timone d'Atene"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"any","text":"Possa tu scoppiare!","src":"Shakespeare, Timone d'Atene"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"morte","text":"Sei come una candela: migliori quando ti sei consumato.","src":"Shakespeare, Enrico IV, parte II"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"aspetto","text":"Fuori dalla mia vista! Mi infetti gli occhi.","src":"Shakespeare, Riccardo III"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"aspetto","text":"Hai una faccia da febbraio: tutta gelo, tempesta e nuvole.","src":"Shakespeare, Molto rumore per nulla"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"puzza","text":"Il più infame miscuglio di puzze che abbia mai offeso un naso.","src":"Shakespeare, Le allegre comari di Windsor"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"any","text":"Sei un'offesa universale, e chiunque dovrebbe prenderti a botte.","src":"Shakespeare, Tutto è bene quel che finisce bene"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"incompetenza","text":"Codardo matricolato, bugiardo senza fine, mancatore di promesse a ogni ora, privo di una sola buona qualità.","src":"Shakespeare, Tutto è bene quel che finisce bene"},{"cat":"any","moment":"any","style":"autore","heat":1,"topic":"aspetto","text":"Maiale che grufola, segnato dagli elfi, nato a metà!","src":"Shakespeare, Riccardo III"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"aspetto","text":"Te lo dico all'orecchio, da amico: vendi finché puoi, non sei merce per tutti i mercati.","src":"Shakespeare, Come vi piace"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"aspetto","text":"Mi sento male quando ti guardo.","src":"Shakespeare, Sogno di una notte di mezza estate"},{"cat":"any","moment":"any","style":"autore","heat":1,"topic":"any","text":"Zeta bastarda, lettera inutile!","src":"Shakespeare, Re Lear"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"ego","text":"Non ragioniam di lui, ma guarda e passa.","src":"Dante, Inferno III (adattato)"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"any","text":"Ahi, vituperio de le genti!","src":"Dante, Inferno XXXIII"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"incompetenza","text":"Tu sei di quelli che visser sanza 'nfamia e sanza lodo.","src":"Dante, Inferno III (adattato)"},{"cat":"any","moment":"any","style":"autore","heat":1,"topic":"any","text":"Chiacchierone, ghiottone, rognoso, cacasotto, ubriacone, fannullone e leccapiatti!","src":"alla maniera di Rabelais, Gargantua"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"stupidita","text":"Babbeo da fiera, tonto di bosco, zuccone di cavolo e acchiappamosche patentato!","src":"alla maniera di Rabelais, Gargantua"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"incompetenza","text":"Cacadubbi, mangiapane a tradimento, ciondolone e sbadiglione!","src":"alla maniera di Rabelais, Gargantua"},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"any","text":"Gente, ditemi la verità: anche voi lo pensavate più alto, quando ne parlavano male?"},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"incompetenza","text":"Alzi la mano chi ha mai perso contro di lui. Nessuno? Neanche sua madre a carte?"},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"aspetto","text":"Chi gli ha fatto i capelli? Ditemelo, così non ci vado."},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"puzza","text":"Prima fila, mi dispiace: per voi c'era scritto «posti sottovento» sul biglietto."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"ego","text":"Facciamogli un applauso, ragazzi. Uno solo: non abituiamolo male."},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"stupidita","text":"Qualcuno ha portato un disegno? Perché a parole non ci arriva."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"meta","text":"Domanda al pubblico: lo uccidiamo adesso o aspettiamo che si annoi da solo?"},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"famiglia","text":"Sua madre è qui stasera? No? Strano, di solito viene a chiedere scusa."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"fortuna","text":"Tutti a fare le corna, gente: parla lui, la sfiga è contagiosa."},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"morte","text":"Chi organizza il funerale? Serve qualcuno che sappia fare i discorsi brevi."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"atteggiamento","text":"Guardatelo: si crede pericoloso. È commovente, no?"},{"cat":"any","moment":"any","style":"crowd","heat":2,"topic":"any","text":"Ragazzi, un bel coro per lui: tre, due, uno… «stronzo»!"},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"any","text":"Chi è d'accordo che non vale nemmeno un incantesimo di primo livello dica «io»."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"incompetenza","text":"Qualcuno gli tenga la spada mentre si allaccia le scarpe. Sono venti minuti che ci prova."},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"aspetto","text":"Fate silenzio, per favore: il nostro ospite sta cercando di sembrare minaccioso."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"any","text":"Una domanda per voi, amici: conviene ucciderlo o metterlo in una gabbia e farlo vedere alle fiere?"},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"any","text":"Sei una merda d'uomo, e sto offendendo la merda."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"stupidita","text":"Hai il cervello piccolo come il cazzo di un coboldo, e con meno iniziativa."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"aspetto","text":"Sei così brutto che tua madre ti allattava con la fionda."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"incompetenza","text":"Combatti di merda, parli di merda e probabilmente cucini anche di merda."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"ego","text":"Ti credi un dio, ma sei solo un coglione con una buona illuminazione."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"famiglia","text":"Tuo padre ha preso a calci la cicogna quando ti ha portato. E aveva ragione."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"atteggiamento","text":"Fai il gradasso, ma ti cachi addosso appena qualcuno alza la voce."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"fortuna","text":"Hai una sfiga così nera che ti cade la merda sulla testa anche quando piove."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"meta","text":"Hai tirato così di merda che i dadi hanno chiesto il trasferimento a un altro tavolo."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"morte","text":"Quando crepi, ti seppelliscono a faccia in giù, così anche i vermi evitano di guardarti."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"any","text":"Ti direi di andare al diavolo, ma il diavolo mi ha chiesto un favore."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"any","text":"Sei una persona unica. Lo dicono tutti con un certo sollievo."},{"cat":"any","moment":"any","style":"standup","heat":1,"topic":"any","text":"Ho conosciuto dei sassi con più conversazione. E alcuni rispondevano pure."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"incompetenza","text":"Hai una grande carriera davanti. Peccato che tu la stia guardando dal fondo."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"stupidita","text":"Sei sveglio come una lumaca dopo il pranzo di Natale."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"ego","text":"Hai un fan club di una persona. E lo presiedi tu."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"famiglia","text":"La tua famiglia ti ha cresciuto con amore. Poi è finito."},{"cat":"any","moment":"any","style":"standup","heat":1,"topic":"morte","text":"La tua vita è un capolavoro. Di quelli che si capiscono solo dopo la morte, e neanche."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"fortuna","text":"Hai trovato una lampada magica. Il genio ha chiesto tre desideri a te."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"atteggiamento","text":"Ti comporti come il protagonista. Ma sei la comparsa che chiede indicazioni."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"meta","text":"Se la tua vita fosse una campagna, il gruppo avrebbe già cambiato master."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"Sei come un temporale in un ufficio: rumoroso, inutile e alla fine bagni solo i fogli."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"incompetenza","text":"Hai la stessa utilità di una scala in una nave che affonda."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"stupidita","text":"Le tue idee sono come i draghi: tutti ne parlano, nessuno le ha mai viste."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"aspetto","text":"Le gargoyle della cattedrale ti hanno chiesto di non posare vicino a loro: si sentono belle per contrasto."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"ego","text":"Se il tuo ego fosse un incantesimo, richiederebbe concentrazione. E tu non ne hai."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"famiglia","text":"Il tuo albero genealogico ha un solo ramo. Ed è secco."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"morte","text":"La tua lapide avrà scritto «Ci ha provato». E sotto un asterisco."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"fortuna","text":"Se cadessi in un pozzo dei desideri, il pozzo esprimerebbe il desiderio di sputarti fuori."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"atteggiamento","text":"La tua aura di minaccia è così debole che una lucciola fa più paura."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"meta","text":"Il tuo personaggio è stato tirato fuori da un sacchetto di dadi dimenticato in cantina."},{"cat":"any","moment":"any","style":"assurdo","heat":1,"topic":"any","text":"Se fossi una birra, saresti quella lasciata aperta da ieri sera."},{"cat":"any","moment":"any","style":"assurdo","heat":1,"topic":"puzza","text":"Il tuo odore ha un suo allineamento: caotico disgustoso."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"any","text":"Sei come il vino della taverna più economica: chi ti assaggia si pente subito."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"incompetenza","text":"Ti avrei sconfitto prima, ma volevo vedere fino a che punto arrivava la tua incompetenza."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"stupidita","text":"Hai un'intelligenza da coboldo. Senza offesa per i coboldi."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"aspetto","text":"Ti hanno fatto il ritratto e il pittore ha chiesto di essere pagato in giorni di vacanza."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"ego","text":"Ti chiami da solo «il Magnifico». Gli altri ti chiamano «quello là»."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"famiglia","text":"I tuoi parenti ti invitano alle feste per avere qualcuno da criticare."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"morte","text":"Morirai con dignità? Sarebbe la prima volta."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"fortuna","text":"Persino la tua ombra ha provato a staccarsi da te."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"atteggiamento","text":"Hai lo sguardo da duro di un gattino bagnato."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"meta","text":"Il master ti ha dato un nome solo per sbaglio. Doveva scriverlo sulla lista della spesa."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"puzza","text":"Hai fatto il bagno? Sì, ma solo nel fango."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"puzza","text":"Sei il motivo per cui i nani non si tolgono mai l'elmo."},{"cat":"any","moment":"any","style":"standup","heat":1,"topic":"aspetto","text":"Sei un incanto. Peccato che sia una maledizione."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"aspetto","text":"Hai una bellezza che viene da dentro. E lì dentro dovrebbe restare."},{"cat":"any","moment":"any","style":"crowd","heat":1,"topic":"any","text":"Allora, oste: un giro per tutti, tranne che per lui. Lui ha già bevuto abbastanza dell'acqua del vaso."},{"cat":"any","moment":"any","style":"standup","heat":0,"topic":"any","text":"Bevi come un nano e combatti come un nano. Un nano ubriaco, intendo."},{"cat":"any","moment":"any","style":"roast","heat":1,"topic":"any","text":"Hai la stessa simpatia della locanda che ci ha fatto pagare la stanza con le cimici."},{"cat":"any","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"Ti ho incontrato in una taverna e ho subito chiesto all'oste se si accettavano reclami."},{"cat":"any","moment":"any","style":"standup","heat":1,"topic":"any","text":"Sei l'unica cosa più acida della birra di questa locanda."},{"cat":"any","moment":"any","style":"roast","heat":2,"topic":"any","text":"Sei il tipo di cliente per cui l'oste piscia nella birra. E ha ragione."},{"cat":"any","moment":"any","style":"crowd","heat":0,"topic":"any","text":"Ragazzi, offriamogli un boccale: magari ubriaco diventa simpatico. Magari."},{"cat":"any","moment":"any","style":"assurdo","heat":1,"topic":"any","text":"Se le birre parlassero, tu saresti la schiuma: tanto rumore e poi più niente."},{"cat":"goblin","moment":"any","style":"standup","heat":0,"topic":"stupidita","text":"Sei un coboldo intelligente. Sai contare fino a tre, a volte anche in ordine."},{"cat":"goblin","moment":"any","style":"roast","heat":1,"topic":"aspetto","text":"Ti hanno disegnato su un cartello «Attenti al goblin»: la gente ride invece di scappare."},{"cat":"goblin","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"Hai rubato solo calzini spaiati. Anche il tuo bottino è triste."},{"cat":"maghi","moment":"any","style":"roast","heat":1,"topic":"incompetenza","text":"Hai sbagliato l'incantesimo così tante volte che il tuo libro ti chiama per nome. Il cognome è «di nuovo»."},{"cat":"maghi","moment":"any","style":"assurdo","heat":0,"topic":"stupidita","text":"La tua sfera di cristallo vede il futuro. Nessuno dei futuri ti vede vincente."},{"cat":"maghi","moment":"any","style":"standup","heat":0,"topic":"ego","text":"Ti sei fatto fare un mantello con le stelle. Le stelle hanno chiesto di essere rimosse."},{"cat":"draghi","moment":"any","style":"standup","heat":0,"topic":"famiglia","text":"I draghi vivono mille anni. Tua madre ne ha passati novecento a chiedersi dove avesse sbagliato."},{"cat":"draghi","moment":"any","style":"assurdo","heat":0,"topic":"any","text":"Hai il soffio di un drago e la personalità di una stufa."},{"cat":"demoni","moment":"any","style":"standup","heat":0,"topic":"any","text":"Sei così malvagio che ti hanno cacciato dall'Inferno per eccesso di zelo. Scherzo: era per antipatia."},{"cat":"demoni","moment":"any","style":"assurdo","heat":0,"topic":"meta","text":"Il tuo nome vero ha potere su di te. Il mio soprannome per te ha potere su tutti: «Il Noioso»."},{"cat":"fey","moment":"any","style":"standup","heat":0,"topic":"fiabe","text":"Una fata del bosco! Bello. Il bosco ti cerca, vuole restituirti."},{"cat":"fey","moment":"any","style":"assurdo","heat":0,"topic":"fiabe","text":"Hai rubato un bambino e l'hai riportato il giorno dopo. Persino lui si annoiava."},{"cat":"fey","moment":"any","style":"roast","heat":1,"topic":"fiabe","text":"Sei così inaffidabile che anche le tue promesse fatate hanno un'etichetta «non garantito»."},{"cat":"fey","moment":"any","style":"crowd","heat":1,"topic":"fiabe","text":"Gente, attenti: se accettate un suo regalo, vi tocca sentirla parlare per cento anni."},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"any","text":"Mi auguro che si possa diventare estranei migliori.","src":"Shakespeare, Come vi piace"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"aspetto","text":"Non vali la polvere che il vento ti soffia in faccia.","src":"Shakespeare, Re Lear"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"morte","text":"Va', e occupa un'altra stanza all'inferno.","src":"Shakespeare, Riccardo II"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"stupidita","text":"Sei il re di tutti i pazzi viventi.","src":"Shakespeare, Timone d'Atene"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"aspetto","text":"Formaggio di Banbury!","src":"Shakespeare, Le allegre comari di Windsor"},{"cat":"any","moment":"any","style":"autore","heat":1,"topic":"puzza","text":"Via di qui, mascalzone ammuffito, via!","src":"Shakespeare, Enrico IV, parte II"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"stupidita","text":"Ceppi! Sassi! Peggio che cose senza sensi!","src":"Shakespeare, Giulio Cesare"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"atteggiamento","text":"Taci, maledetto lupo! consuma dentro te con la tua rabbia.","src":"Dante, Inferno VII"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"any","text":"Via costà con li altri cani!","src":"Dante, Inferno VIII"},{"cat":"any","moment":"any","style":"autore","heat":1,"topic":"puzza","text":"Ed elli avea del cul fatto trombetta.","src":"Dante, Inferno XXI"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"aspetto","text":"Vita bestial ti piacque e non umana, sì come a mul che fosti.","src":"Dante, Inferno XXIV (adattato)"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"atteggiamento","text":"Tu non sei nato con un cuor di leone.","src":"Manzoni, I promessi sposi, cap. I (adattato)"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"fortuna","text":"Sei come un vaso di terra cotta, costretto a viaggiare in compagnia di molti vasi di ferro.","src":"Manzoni, I promessi sposi, cap. I (adattato)"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"ego","text":"Carneade! Chi era costui?","src":"Manzoni, I promessi sposi, cap. VIII"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"atteggiamento","text":"Il coraggio, uno non se lo può dare.","src":"Manzoni, I promessi sposi, cap. XXV"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"stupidita","text":"Sei un burattino e, quel che è peggio, hai la testa di legno.","src":"Collodi, Le avventure di Pinocchio, cap. IV (adattato)"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"atteggiamento","text":"Vi sono le bugie che hanno le gambe corte, e le bugie che hanno il naso lungo. La tua ce l'ha lunghissimo.","src":"Collodi, Le avventure di Pinocchio, cap. XVII (adattato)"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"stupidita","text":"Il tuo senno è sulla Luna, accanto a quello di Orlando. Nell'ampolla più piccola.","src":"alla maniera di Ariosto, Orlando furioso"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"stupidita","text":"Sei più credulone di Calandrino con la pietra elitropia.","src":"alla maniera di Boccaccio, Decameron"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"stupidita","text":"Ma che diavolo andava a fare su quella galera?","src":"Molière, Le furberie di Scapino"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"stupidita","text":"Ignorantus, ignoranta, ignorantum!","src":"Molière, Il malato immaginario"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"famiglia","text":"Perdere un genitore può considerarsi una disgrazia; perderli entrambi sembra trascuratezza.","src":"Wilde, L'importanza di chiamarsi Ernesto"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"stupidita","text":"Non approvo nulla che alteri l'ignoranza naturale. L'ignoranza è come un delicato frutto esotico: lo tocchi e il fiore svanisce.","src":"Wilde, L'importanza di chiamarsi Ernesto"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"atteggiamento","text":"Hai una natura assolutamente frivola.","src":"Wilde, L'importanza di chiamarsi Ernesto"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"aspetto","text":"Ho conosciuto diversi come te, e tutti, senza eccezione, erano brutti più del solito.","src":"Wilde, L'importanza di chiamarsi Ernesto (adattato)"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"aspetto","text":"Passabile, ma non abbastanza bello da tentarmi.","src":"Austen, Orgoglio e pregiudizio (adattato)"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"incompetenza","text":"Ci hai deliziato abbastanza.","src":"Austen, Orgoglio e pregiudizio"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"any","text":"Non ti conoscevo da un mese e già sentivo che eri l'ultimo uomo al mondo che avrei mai accettato di sposare.","src":"Austen, Orgoglio e pregiudizio"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"atteggiamento","text":"Vecchio peccatore avaro, che spreme, strappa, afferra, raschia e artiglia!","src":"Dickens, Canto di Natale"},{"cat":"any","moment":"any","style":"autore","heat":1,"topic":"any","text":"Ogni idiota che va in giro con «Buon Natale» sulle labbra dovrebbe essere bollito insieme al suo budino.","src":"Dickens, Canto di Natale"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"any","text":"L'uomo è l'unico animale che arrossisce. O che ne ha bisogno.","src":"Mark Twain, Seguendo l'equatore"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"any","text":"Noioso, sostantivo: persona che parla quando vorresti che ascoltasse.","src":"Bierce, Dizionario del diavolo"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"ego","text":"Egoista, sostantivo: persona di gusti volgari, più interessata a se stessa che a me.","src":"Bierce, Dizionario del diavolo"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"stupidita","text":"Convinto, aggettivo: in errore, a pieni polmoni.","src":"Bierce, Dizionario del diavolo"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"any","text":"Conoscente, sostantivo: persona che conosciamo abbastanza da chiederle un prestito, ma non abbastanza da prestarle qualcosa.","src":"Bierce, Dizionario del diavolo"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"stupidita","text":"Filosofia, sostantivo: una strada dalle molte vie che portano dal nulla al niente.","src":"Bierce, Dizionario del diavolo"},{"cat":"any","moment":"any","style":"autore","heat":0,"topic":"fortuna","text":"Anno, sostantivo: un periodo di trecentosessantacinque delusioni.","src":"Bierce, Dizionario del diavolo"},{"cat":"spettri","moment":"any","style":"autore","heat":0,"topic":"any","text":"Sei più indigestione che apparizione, qualunque cosa tu sia!","src":"Dickens, Canto di Natale (adattato)"},{"cat":"boss","moment":"any","style":"autore","heat":0,"topic":"any","text":"I re sono quasi tutti dei mascalzoni, per quanto ne so io.","src":"Mark Twain, Le avventure di Huckleberry Finn"},{"cat":"any","moment":"rinforzi","style":"autore","heat":0,"topic":"atteggiamento","text":"Non fuggite, codardi e vili creature: è un solo cavaliere quello che vi assale.","src":"Cervantes, Don Chisciotte, cap. VIII"},{"cat":"any","moment":"monologo","style":"autore","heat":0,"topic":"any","text":"Fama di loro il mondo esser non lassa: non ragioniam di lor, ma guarda e passa.","src":"Dante, Inferno III"}];
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
    ul.innerHTML='<li class="mk-empty">'+({fav:'Tocca il cuore su una beffa per tenerla qui, pronta per la prossima sessione.',mine:'Qui trovi le beffe che scrivi tu e quelle che hai modificato. Per modificarne una, tocca la matita sulla beffa in alto.',hist:'Le beffe che generi compaiono qui. Toccane una per riportarla in alto.'}[MK.tab])+'</li>';
    return;
  }
  const mineRecs=MK.tab==='mine'?liveBeffe():null;
  ul.innerHTML=list.map((t,k)=>{
    const r=mineRecs?mineRecs[k]:null,j=r?mkJoke(r):mkFind(t);
    const note=r?(r.hidden?'Nascosta: non esce più tra le beffe':r.base?'Modificata da te':'Scritta da te'):(j&&j.src?'— '+j.src:'');
    const btns=r?'<button class="mini ghost" data-edit="'+k+'" aria-label="Modifica">'+MK_ICON.edit+'</button>'
      :'<button class="mini ghost" data-say="'+k+'" aria-label="Leggi ad alta voce">'+MK_ICON.say+'</button><button class="mini ghost" data-copy="'+k+'" aria-label="Copia">'+MK_ICON.copy+'</button>'
       +'<button class="mini ghost" data-fav="'+k+'" aria-label="'+(MK.fav.includes(t)?'Togli dai preferiti':'Aggiungi ai preferiti')+'" aria-pressed="'+MK.fav.includes(t)+'">'+MK_ICON.heart+'</button>';
    const pick=r&&r.hidden?'Modifica la beffa nascosta':'Mostra in alto';
    return '<li'+(r&&r.hidden?' class="mk-hidden"':'')+'><button class="mk-pick" data-show="'+k+'" aria-label="'+pick+': '+esc(t)+'"><p>'+esc(t)+(note?'<small>'+esc(note)+'</small>':'')+'</p></button><span class="pair">'+btns+'</span></li>';
  }).join('');
}
/* Riporta nel riquadro principale una beffa scelta da un elenco */
function mkRecall(k){
  let j;
  if(MK.tab==='mine'){const r=liveBeffe()[k];if(!r)return;if(r.hidden){mkEditOpen(mkJoke(r));return;}j=mkFind(r.text)||mkJoke(r);}
  else{const t=mkListItems()[k];if(!t)return;j=mkFind(t)||{text:t,cat:'any',moment:'any'};}
  mkCurJ=j;
  if(MK.tab==='hist'){MK.hist=[j.text,...MK.hist.filter(x=>x!==j.text)].slice(0,30);save();}
  mkShow(j);mkRenderList();
  const card=document.querySelector('.mk-card');
  mockEl.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  card.classList.remove('flash');void card.offsetWidth;card.classList.add('flash');
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
  $('#mkCount').textContent=BEFFE.length+' beffe incluse, di cui '+BEFFE.filter(j=>j.style==='autore').length+' d’autore da Shakespeare, Dante, Manzoni, Wilde e altri classici'
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
  else if(b.dataset.show!=null)mkRecall(+b.dataset.show);
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

$('#backupIn').addEventListener('change',ev=>{const f=ev.target.files[0];ev.target.value='';if(f)importBackup(f);});
$('#sbEdit').addEventListener('click',()=>{if(SM.raw)edOpen(SM.raw);});
uiToggles();curIdx=S.inst==='pipes'?1:0;render();
Cloud.start();
if(window.FIATI_STANDALONE&&'serviceWorker' in navigator&&location.protocol!=='file:')
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));

})();
