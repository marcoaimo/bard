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
const SAMPLES=__SONGS__;
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

/*__STORE__*/
/*__CLOUD__*/
/*__EDITOR__*/
/*__MOCK__*/
$('#backupIn').addEventListener('change',ev=>{const f=ev.target.files[0];ev.target.value='';if(f)importBackup(f);});
$('#sbEdit').addEventListener('click',()=>{if(SM.raw)edOpen(SM.raw);});
uiToggles();curIdx=S.inst==='pipes'?1:0;render();
Cloud.start();
if(window.FIATI_STANDALONE&&'serviceWorker' in navigator&&location.protocol!=='file:')
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));

})();
