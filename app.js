/* ============ CONFIGURACIÓN POR CLIENTE (ver config.js) ============ */
const CFG = window.FIDS_CONFIG;
if(!CFG){ document.body.innerHTML='<h2 style="color:#f87171;font-family:sans-serif;padding:30px">Falta el archivo config.js</h2>'; throw new Error('Falta config.js'); }
const APP_VERSION = window.FIDS_VERSION || 'dev';
const BRAND_FIELDS = ['titulo','subtitulo','subtituloPasajero','rotuloAviso','puntoAbordaje','puntoAbordajePasajero'];
const BASE = {cliente:Object.assign({},CFG.cliente), audioBase:(CFG.audioBase===undefined?'Audio/':CFG.audioBase), suc:{}};
Object.keys(CFG.sucursales).forEach(function(b){ const o={}; BRAND_FIELDS.forEach(function(f){ o[f]=CFG.sucursales[b][f]; }); BASE.suc[b]=o; });
function audioBase(){ return CFG.audioBase===undefined?'Audio/':CFG.audioBase; }
function audioDirOf(b){ const S=CFG.sucursales[b]||{}; return (S.audioDir||b)+'/'; }
function audioDir(){ return audioDirOf(viewSuc()); }
document.title = CFG.cliente.tituloPagina;

/* ============ REGISTRO SERVICE WORKER (PWA) ============ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('sw.js').catch(function(err){ console.warn('PWA SW Registro omitido/falló:', err); });
  });
}

/* ============ CONFIG FIREBASE ============ */
firebase.initializeApp(CFG.firebase);

const db = firebase.database();
const auth = firebase.auth();

/* ============ DETECCIÓN ESTRICTA DE RUTA (WHITELIST SEGURA) ============ */
const href = location.href.toLowerCase();
const rawVista = new URLSearchParams(location.search).get('vista') || '';

const aliasVista = {
  'tvof2': 'tvof2',
  'vistaof2': 'tvof2',
  'tvcentral': 'tvcentral',
  'vistacentral': 'tvcentral',
  'pasajeroof2': 'pasajeroof2',
  'vistapasajeroof2': 'pasajeroof2',
  'pasajerocentral': 'pasajerocentral',
  'vistapasajerocentral': 'pasajerocentral',
  'screen': 'screen'
};
Object.keys(CFG.vistas || {}).forEach(function(k){ if(!aliasVista[k]) aliasVista[k] = k; });

let vista = '';

if (rawVista) {
  const normalized = rawVista.toLowerCase().trim();
  if (aliasVista[normalized]) {
    vista = aliasVista[normalized];
  } else {
    vista = 'invalid';
  }
} else {
  if (href.includes('tvcentral') || href.includes('vistacentral')) vista = 'tvcentral';
  else if (href.includes('pasajerocentral') || href.includes('vistapasajerocentral')) vista = 'pasajerocentral';
  else if (href.includes('tvof2') || href.includes('vistaof2')) vista = 'tvof2';
  else if (href.includes('pasajeroof2') || href.includes('vistapasajeroof2')) vista = 'pasajeroof2';
  else vista = 'screen';
}

if (vista === 'invalid') {
  document.addEventListener('DOMContentLoaded', function() {
    document.body.innerHTML = '<div style="background:#000B18;color:#f87171;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;text-align:center;padding:20px">' +
      '<div style="font-size:50px;margin-bottom:15px">⛔</div>' +
      '<h2 style="font-size:22px;font-weight:900;margin-bottom:10px">ACCESO DENEGADO (403)</h2>' +
      '<p style="font-size:15px;color:#fff;margin-bottom:15px">La vista solicitada no existe o no se encuentra autorizada.</p>' +
      '<p style="font-size:13px;color:var(--muted,#93c5fd)">Verifique la dirección URL o contacte al administrador del sistema.</p>' +
      '</div>';
  });
}

const vistaInfo = (CFG.vistas || {})[vista] || null;
const isGeneral = !!(vistaInfo && vistaInfo.general);
const isAnden = !!(vistaInfo && vistaInfo.anden);
const isPairing = !!(vistaInfo && vistaInfo.pairing);
const isDueno = !!(vistaInfo && vistaInfo.dueno);
const andenN = (function(){ try{ return parseInt(new URLSearchParams(location.search).get('n'),10)||0; }catch(e){ return 0; } })();
const isTV = vista.startsWith('tv') || href.includes('tvof2') || href.includes('tvcentral') || !!(vistaInfo && vistaInfo.anden);
const isPassenger = vista.startsWith('pasajero') || href.includes('pasajero');

const TZ = CFG.zonaHoraria;
const $ = function(id){ return document.getElementById(id); };
const esc = function(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
const pad = function(x){ return String(x).padStart(2,'0'); };

let tvsData = {}, lastPingTs = 0, themeMode = null, themeSeason = null, logData = [], stripNext = null, stripVisible = false, stripIdx = 0, stripHtml = '', stripOn = false, lcActive = false, lcHtml = '', stripCand = [], stripItems = [], stripPos = 0, stripSeen = {}, stripInit = false, stripTimers = [], stripMode = 'line', tickNormalHtml = '', avisosData = {}, brandId = 'transpais', brandPalette = {}, marcaDb = null;
let suc = null, deps = {}, adsData = {}, adsConfig = {force7030:false}, ready = false, srvOff = 0, urgentMsg = '';
let gotServer = false, gotCleared = false, offlineFallback = false, clearedDay = null, fbTimer = null, curMap = {};

if(isPassenger) document.body.classList.add('passenger-mode');
if(isTV) document.body.classList.add('tv-mode');

const viewSuc = function(){
  if (vistaInfo && vistaInfo.suc && CFG.sucursales[vistaInfo.suc]) return vistaInfo.suc;
  if (vista === 'tvcentral' || vista === 'pasajerocentral' || href.includes('central')) return 'central';
  if (isTV || isPassenger || href.includes('of2')) return 'of2';
  return suc || 'of2';
};
const canWrite = function(){ return !isTV&&!isPassenger&&!!auth.currentUser&&!!suc; };
const fail = function(e){ console.error(e.message||e); alert('Error al guardar: '+(e.message||e)); };

/* ============ CIERRE AUTOMÁTICO DE SESIÓN POR INACTIVIDAD (15 MIN) ============ */
let inactivityTimer = null;
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  if (auth.currentUser && !isTV && !isPassenger) {
    inactivityTimer = setTimeout(function() {
      doLogout(true);
    }, CFG.inactividadMin * 60 * 1000);
  }
}
['mousemove', 'keydown', 'click', 'touchstart'].forEach(function(evt) {
  window.addEventListener(evt, resetInactivityTimer, { passive: true });
});

/* FUNCIÓN DE PANTALLA COMPLETA */
function toggleFullscreen(){
  if(!document.fullscreenElement){
    document.documentElement.requestFullscreen().catch(function(e){});
  }else{
    if(document.exitFullscreen) document.exitFullscreen().catch(function(e){});
  }
}

/* INDICADOR EN VIVO ONLINE / OFFLINE */
function updateNetStatus(isOnline){
  const badge = $('net-status-badge'), dot = $('net-dot'), txt = $('net-text');
  if(!badge) return;
  if(isOnline){
    badge.style.background = 'rgba(0,217,116,0.15)';
    badge.style.color = 'var(--ok,#00D974)';
    badge.style.borderColor = 'rgba(0,217,116,0.3)';
    dot.style.background = 'var(--ok,#00D974)';
    txt.textContent = 'ONLINE';
  }else{
    badge.style.background = 'rgba(220,38,38,0.2)';
    badge.style.color = '#f87171';
    badge.style.borderColor = 'rgba(220,38,38,0.4)';
    dot.style.background = '#dc2626';
    txt.textContent = 'DESCONECTADO';
  }
}
window.addEventListener('online', function(){ updateNetStatus(true); });
window.addEventListener('offline', function(){ updateNetStatus(false); });
db.ref('.info/connected').on('value', function(snap){
  updateNetStatus(!!snap.val() && navigator.onLine);
});

const CAT=CFG.sucursales.of2.rutas;
const CAT_CENTRAL=CFG.sucursales.central.rutas;
const catalogFor=function(branch){ if(branch==='central')return CAT_CENTRAL; const S=CFG.sucursales[branch]; return (S&&S.rutas)?S.rutas:CAT; };

/* ============ HORA Y SERVIDOR ============ */
db.ref('.info/serverTimeOffset').on('value',function(s){srvOff=s.val()||0;});

let dtf=null;
try{ dtf=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}); }catch(e){}

function nowParts(){
  const now=new Date(Date.now()+srvOff);
  if(dtf){
    try{
      const p={}; dtf.formatToParts(now).forEach(function(x){p[x.type]=x.value;});
      if(p.year&&p.month&&p.day&&p.hour!==undefined){
        const h=+p.hour%24, m=+p.minute, s=+(p.second||0);
        return {key:p.year+'-'+p.month+'-'+p.day,min:h*60+m,time:pad(h)+':'+pad(m)+':'+pad(s)};
      }
    }catch(e){}
  }
  const y=now.getFullYear(), mo=pad(now.getMonth()+1), da=pad(now.getDate());
  const ho=now.getHours(), mi=now.getMinutes(), se=now.getSeconds();
  return {key:y+'-'+mo+'-'+da,min:ho*60+mi,time:pad(ho)+':'+pad(mi)+':'+pad(se)};
}

function dayShift(key,delta){
  const p=key.split('-').map(Number);
  return new Date(Date.UTC(p[0],p[1]-1,p[2]+delta)).toISOString().slice(0,10);
}

function diffOf(d,n){
  const parts=d.time.split(':').map(Number);
  let x=parts[0]*60+parts[1]-n.min;
  if(x<-1200)x+=1440; if(x>1200)x-=1440;
  return x;
}
const isLive=function(d,n){return d.day===n.key||(n.min<360&&d.day===dayShift(n.key,-1));};

const ULTIMA_CENTRAL=CFG.sucursales.central.estados.ultima, ULTIMA_OF2=CFG.sucursales.of2.estados.ultima;

function stat(d,diff){
  if(d.status==='SALIDO'||diff<0)return'SALIDO';
  /* Las etapas operativas confirmadas prevalecen sobre el horario. */
  if(['ETIQUETANDO PASAJE','EN ABORDAJE','ÚLTIMA LLAMADA'].includes(d.status))return d.status;
  const e=CFG.sucursales[viewSuc()].estados;
  if(diff<=e.ultima)return'ÚLTIMA LLAMADA';
  if(diff<=e.abordaje)return'EN ABORDAJE';
  if(diff<=e.etiquetado)return'ETIQUETANDO PASAJE';
  return d.status||'EN ESPERA';
}

/* ---- Barra inferior: avisos y comunicados / última llamada ---- */
function setTicker(html,title,secs){
  const el=$('ticker-text-content'); if(!el)return;
  el.innerHTML=html; el.style.animationDuration=secs+'s';
  const t=$('ticker-title'); if(t)t.textContent=(voiceOn&&title==='AVISOS')?'🔊 VOCEO':title;
}
function setTickerNormal(){
  const S=CFG.sucursales[viewSuc()], sep=' &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ';
  const parts=[];
  if(themeSeason&&themeSeason.saludo)parts.push((themeSeason.icono||'🎉')+' <strong>'+esc(String(themeSeason.saludo).replace('{nombre}',CFG.cliente.nombreSaludo||CFG.cliente.nombre))+'</strong>');
  activeAvisos().forEach(function(a){ parts.push('📢 <strong>'+esc(a.text)+'</strong>'); });
  parts.push('🧳 <strong>'+S.rotuloAviso+':</strong> Favor de pasar a documentar y etiquetar su equipaje <strong>CON EL EQUIPAJERO</strong> a partir de '+S.estados.etiquetado+' minutos antes de su salida.');
  parts.push('🎒 <strong>CABINA:</strong> Permitido 1 EQUIPAJE DE MANO O MOCHILA.');
  (CFG.consejos||[]).forEach(function(t){ parts.push((t.icono||'ℹ️')+' '+esc(t.es)); });
  const html=parts.join(sep);
  if(html===tickNormalHtml)return;
  tickNormalHtml=html;
  setTicker(html,'AVISOS',Math.max(30,Math.round(html.replace(/<[^>]+>|&nbsp;/g,'').length*0.17)));
  const f=document.querySelector('.ticker-footer'); if(f)f.classList.remove('lc-active');
  lcHtml='';
}
function setTickerLC(txt){
  const one='🔔 <strong>ÚLTIMA LLAMADA</strong> · '+esc(txt)+' &nbsp;&nbsp;|&nbsp;&nbsp; <strong>FINAL CALL</strong> · '+esc(txt);
  const html=one+' &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; '+one;
  if(html===lcHtml)return;
  lcHtml=html; tickNormalHtml=''; setTicker(html,'🔔 ÚLTIMA LLAMADA',18);
  const f=document.querySelector('.ticker-footer'); if(f)f.classList.add('lc-active');
}

function updateHeaderTitles(){
  const c=viewSuc()==='central';
  const S=CFG.sucursales[viewSuc()];
  if($('brand-name'))$('brand-name').textContent=CFG.cliente.marca;
  if($('login-title'))$('login-title').textContent=CFG.cliente.nombre.toUpperCase();
  if($('header-terminal-title'))$('header-terminal-title').textContent=S.titulo;
  if($('header-terminal-sub'))$('header-terminal-sub').textContent=(isPassenger?S.subtituloPasajero:S.subtitulo);
  if(!lcActive)setTickerNormal();
}

/* ============ AUDIO Y VOCEO DINÁMICO CON RUTAS POR SUCURSAL ============ */
let actx=null,muted=localStorage.getItem('transpais_local_muted')==='true';
let currentVoiceAudio=null;

var voiceOn=false;
function setVoiceIndicator(show){
  if(isPassenger)return;
  voiceOn=!!show;
  if(isTV){
    const f=document.querySelector('.ticker-footer'), t=$('ticker-title');
    if(f)f.classList.toggle('speaking',voiceOn);
    if(t&&!lcActive)t.textContent=voiceOn?'🔊 VOCEO':'AVISOS';
    return;
  }
  const vi=$('voice-indicator');
  if(vi)vi.classList.toggle('active',voiceOn);
}

function ctx(){
  if(isPassenger)return null;
  if(!actx){
    const C=window.AudioContext||window.webkitAudioContext;
    if(C)actx=new C();
  }
  if(actx&&actx.state==='suspended')actx.resume();
  return actx;
}

function chime(){
  return new Promise(function(res){
    if(muted||isPassenger)return res();
    try{
      const c=ctx(); if(!c)return res();
      const t=c.currentTime, o1=c.createOscillator(), o2=c.createOscillator(), g=c.createGain();
      o1.frequency.setValueAtTime(587.33,t); o2.frequency.setValueAtTime(880,t+.18);
      g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.35,t+.05); g.gain.exponentialRampToValueAtTime(.0001,t+2);
      o1.connect(g); o2.connect(g); g.connect(c.destination);
      o1.start(t); o2.start(t+.18); o1.stop(t+2); o2.stop(t+2);
      setTimeout(res,1800);
    }catch(e){res();}
  });
}

const aq=[]; let playing=false, epoch=0, stopCurrent=null;

function enqueueAudio(k,m,onResult,bus){
  if(isPassenger){if(onResult)onResult(false);return;}
  aq.push([k,m,onResult||null,bus||'']);
  if(!playing)runQueue();
}

function hardStop(){
  epoch++;
  const cancelled=aq.splice(0,aq.length);
  cancelled.forEach(function(item){if(item&&item[2]){try{item[2](false);}catch(e){}}});
  if(currentVoiceAudio){
    try{ currentVoiceAudio.pause(); currentVoiceAudio.currentTime=0; }catch(e){}
    currentVoiceAudio=null;
  }
  if(stopCurrent){ const f=stopCurrent; stopCurrent=null; f(false); }
}

function playVoiceImmediate(key,mode,bus){
  if(isPassenger)return;
  hardStop();
  aq.push([key,mode,null,bus||'']);
  if(!playing) runQueue();
}

async function runQueue(){
  if(isPassenger||playing)return;
  playing=true;
  setVoiceIndicator(true);
  try{
    while(aq.length){
      const item=aq.shift();
      const my=epoch;
      const ok=await playOne(item[0],item[1]);
      if(ok&&CFG.voz.unidad&&item[3]&&item[1]!=='etiq'){ try{ await playUnit(item[3],my); }catch(e){} }
      if(ok&&item[1]==='ultima'&&CFG.voz.ingles!==false){ try{ await speak(enFinalCall(item[0]),'en-US'); }catch(e){} }
      if(item[2]){try{item[2](!!ok);}catch(e){}}
    }
  }finally{
    playing=false;
    setVoiceIndicator(false);
  }
}

function playOne(key,mode){
  return new Promise(async function(res){
    if(muted||isPassenger)return res();
    const my=epoch;
    let done=false, to=null;
    const end=function(ok){
      if(done)return; done=true; clearTimeout(to);
      if(stopCurrent===end)stopCurrent=null;
      currentVoiceAudio=null;
      res(!!ok);
    };
    stopCurrent=end;
    await chime();
    if(done||my!==epoch)return end(false);
    if(!audioBase())return end(true);   /* marca sin voces: solo el tono de aviso */

    const branchFolder = audioDir();
    const primarySrc = audioBase() + branchFolder + key + '_' + mode + '.mp3';
    const a = new Audio(primarySrc);
    currentVoiceAudio = a;
    to = setTimeout(function(){ end(false); }, 60000);
    a.onended = function(){ end(true); };
    a.onerror = function(){ console.warn('MP3 de ruta no encontrado:', primarySrc); end(false); };
    a.play().catch(function(){ console.warn('No se pudo reproducir el MP3 de ruta:', primarySrc); end(false); });
  });
}

/* ---- Audio de unidad: 0.mp3 a 9.mp3 (un dígito por archivo) + unidad.mp3 opcional ("Unidad número") ---- */
const clipOk=new Map();
function clipExists(src){
  const c=clipOk.get(src);
  if(c&&(c.ok||Date.now()-c.ts<600000))return Promise.resolve(c.ok);
  return fetch(src,{method:'HEAD'}).then(function(r){ clipOk.set(src,{ok:r.ok,ts:Date.now()}); return r.ok; })
    .catch(function(){ clipOk.set(src,{ok:false,ts:Date.now()}); return false; });
}
function playClip(src,my){
  return new Promise(function(res){
    if(muted||isPassenger||my!==epoch)return res(false);
    let done=false,to=null;
    const end=function(ok){
      if(done)return; done=true; clearTimeout(to);
      if(stopCurrent===end)stopCurrent=null;
      currentVoiceAudio=null; res(!!ok);
    };
    stopCurrent=end;
    const a=new Audio(src); currentVoiceAudio=a;
    to=setTimeout(function(){ end(false); },15000);
    a.onended=function(){ end(true); };
    a.onerror=function(){ end(false); };
    a.play().catch(function(){ end(false); });
  });
}
async function playUnit(bus,my){
  const b=String(bus||'').trim();
  if(!/^\d{1,5}$/.test(b)||!audioBase())return;
  const folder=audioBase()+audioDir();
  const digitUrls=b.split('').map(function(d){return folder+d+'.mp3';});
  const introUrl=folder+'unidad.mp3';
  const have=await Promise.all(digitUrls.concat([introUrl]).map(clipExists));
  if(have.slice(0,digitUrls.length).some(function(x){return !x;})){ console.warn('Falta algún dígito para la unidad, se omite:',b); return; }
  const urls=have[have.length-1]?[introUrl].concat(digitUrls):digitUrls;
  for(let i=0;i<urls.length;i++){
    if(my!==epoch)return;
    const ok=await playClip(urls[i],my);
    if(!ok)return;
  }
}

window.unlockAudio=function(){
  const overlay=$('audio-start-overlay');
  if(overlay)overlay.style.display='none';
  try{ctx();}catch(e){}
};

(function initAudioGate(){
  const ov=$('audio-start-overlay'); if(!ov)return;
  if(isPassenger){ ov.style.display='none'; return; }
  if(!isTV)return;
  ov.classList.add('compact');
  try{
    const a=new Audio('data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA==');
    a.volume=0;
    const pr=a.play();
    if(pr&&pr.then)pr.then(function(){
      try{ctx();}catch(e){}
      setTimeout(function(){ if(actx&&actx.state==='running')ov.style.display='none'; },400);
    }).catch(function(){});
  }catch(e){}
  const once=function(){
    window.unlockAudio();
    document.removeEventListener('pointerdown',once);
    document.removeEventListener('keydown',once);
  };
  document.addEventListener('pointerdown',once);
  document.addEventListener('keydown',once);
})();

let lastPanicTs=0, panicMark=0;
function panicStopLocal(){
  panicMark=epoch+1;
  hardStop();
  setVoiceIndicator(false);
}
function panicStop(){
  panicStopLocal();
  if(canWrite()){
    const ts=Date.now()+srvOff;
    lastPanicTs=ts;
    db.ref(suc+'/panic').set({timestamp:ts,by:'taquilla'}).catch(fail);
  }
}

function updateMuteUI(){
  const b=$('btn-mute-local'); if(!b)return;
  const phone=window.innerWidth<=768;
  b.textContent=phone?(muted?'🔇 Voz: apagada':'🔊 Voz: activa'):(muted?'🔇 VOCEO EN TAQUILLA: DESACTIVADO':'🔊 VOCEO EN TAQUILLA: ACTIVADO');
  b.className=muted?'btn btn-dark btn-red':'btn btn-green';
}

/* ============ DATOS Y SINCRONIZACIÓN ============ */
let refs=[];
function attach(s){
  try{
    refs.forEach(function(r){r.off();});
    avisosData={}; marcaDb=null; tvsData={}; deps={}; adsData={}; ready=false; gotServer=false; gotCleared=false; offlineFallback=false; clearedDay=null;
    clearTimeout(fbTimer);

    try{
      const cached=localStorage.getItem('transpais_offline_deps_'+s);
      if(cached){ deps=JSON.parse(cached)||{}; ready=true; }
    }catch(e){ deps={}; }

    fbTimer=setTimeout(function(){
      if(!gotServer){ offlineFallback=true; ready=true; render(); }
    },6000);

    const rd=db.ref(s+'/deps'), rv=db.ref(s+'/voice'), ra=db.ref(s+'/ads'), rc=db.ref(s+'/ads_config'), ru=db.ref(s+'/urgent'), rcl=db.ref(s+'/cleared'), rp=db.ref(s+'/panic');
    refs=[rd,rv,ra,rc,ru,rcl,rp];
    let lastTs=0;

    rd.on('value',function(snap){
      const next={};
      snap.forEach(function(c){
        const v=c.val(); if(v&&typeof v==='object'){v.id=c.key; next[c.key]=v;}
      });
      deps=next; ready=true; gotServer=true;
      try{ localStorage.setItem('transpais_offline_deps_'+s, JSON.stringify(deps)); }catch(e){}
      render(); autoCatalog();
    },function(err){
      console.error('Error Firebase:',err.message);
      offlineFallback=true;
      try{
        const cached=localStorage.getItem('transpais_offline_deps_'+s);
        if(cached){ deps=JSON.parse(cached)||{}; }
      }catch(e){}
      ready=true; render();
    });

    rcl.on('value',function(snap){
      clearedDay=snap.val();
      gotCleared=true;
      render(); autoCatalog();
    });

    if(!isPassenger){
      rp.on('value',function(snap){
        const d=snap.val();
        const ts=d&&Number(d.timestamp||0);
        if(!ts||ts<=lastPanicTs)return;
        lastPanicTs=ts;
        panicStopLocal();
      });
      rv.on('value',function(snap){
        const d=snap.val();
        if(!d||!d.timestamp||d.timestamp<=lastTs||Number(d.timestamp)<=lastPanicTs)return;
        lastTs=d.timestamp;
        if(Date.now()+srvOff-d.timestamp>15000)return;
        playVoiceImmediate(d.key,d.mode,d.bus);
      });

      ra.on('value',function(snap){
        const next={};
        snap.forEach(function(c){
          const v=c.val(); if(v&&typeof v==='object'){v.id=c.key; next[c.key]=v;}
        });
        adsData=next; renderAds();
      });

      rc.on('value',function(snap){
        adsConfig=snap.val()||{force7030:false};
        update7030State();
      });
    }

    ru.on('value',function(snap){
      urgentMsg=snap.val()||'';
      renderUrgentMsg(); speakUrgent();
    });

    const ravs=db.ref(s+'/avisos'); refs.push(ravs);
    ravs.on('value',function(snap){
      avisosData=snap.val()||{}; renderAvisos();
      if(!lcActive)setTickerNormal();
    });

    const rmk=db.ref(s+'/marca'); refs.push(rmk);
    rmk.on('value',function(snap){
      const v=snap.val(); marcaDb=v&&v.id?v.id:null;
      try{ if(marcaDb&&!/[?&]demo/.test(location.search))localStorage.setItem('fids_marca',marcaDb); }catch(e){}
      applyBrand(effectiveBrandId());
    });

    const rchq=db.ref(s+'/chequeo'); refs.push(rchq);
    rchq.on('value',function(snap){ chequeoData=snap.val(); render(); });

    const rth=db.ref(s+'/theme'); refs.push(rth);
    rth.on('value',function(snap){
      const v=snap.val(); themeMode=v&&v.mode?v.mode:null;
      try{ if(themeMode)localStorage.setItem('transpais_theme_mode',themeMode); }catch(e){}
      applyTheme();
    });

    if(isTV){
      const rpg=db.ref(s+'/ping'); refs.push(rpg); let firstPing=true;
      rpg.on('value',function(snap){
        const p=snap.val();
        if(firstPing){ firstPing=false; lastPingTs=p&&p.ts?p.ts:0; return; }
        if(!p||!p.ts||p.ts<=lastPingTs)return;
        lastPingTs=p.ts;
        if(Date.now()+srvOff-p.ts>15000)return;
        showToast('🔊 PRUEBA DE SONIDO'); chime();
      });
    }
    if(!isTV&&!isPassenger){
      const rt=db.ref(s+'/tvs'); refs.push(rt);
      rt.on('value',function(snap){
        const next={}; snap.forEach(function(c){ next[c.key]=c.val(); });
        tvsData=next; renderTvStatus();
      });
    }

    render();
  }catch(e){
    console.error('Error attach:',e);
    offlineFallback=true; ready=true; render();
  }
}

const URGENT_TTL_MIN=CFG.urgenteMin||30;
function urgentInfo(){
  if(!urgentMsg)return {text:'',expired:false};
  if(typeof urgentMsg==='object'){
    const t=String(urgentMsg.text||'').trim();
    let ok=true;
    if(urgentMsg.ts){
      ok=(Date.now()+srvOff-urgentMsg.ts)<=URGENT_TTL_MIN*60000;
    }else if(urgentMsg.day){
      const n=nowParts();
      ok=urgentMsg.day===n.key||(n.min<360&&urgentMsg.day===dayShift(n.key,-1));
    }
    return {text:t,expired:!ok};
  }
  return {text:String(urgentMsg).trim(),expired:false};
}

function renderUrgentMsg(){
  const banner=$('urgent-banner-screen'), txt=$('urgent-text-display'), inp=$('urgent-input');
  const u=urgentInfo();
  if(banner&&txt){
    if(u.text&&!u.expired){
      txt.textContent="⚠️ " + u.text;
      banner.classList.remove('hidden');
    }else{
      banner.classList.add('hidden');
    }
  }
  if(inp&&canWrite()&&document.activeElement!==inp){
    inp.value=u.expired?'':u.text;
  }
}

function setQuickUrgent(msg){
  const inp=$('urgent-input');
  if(inp) inp.value=msg;
  if(canWrite()){
    db.ref(suc+'/urgent').set({text:msg,day:nowParts().key,ts:Date.now()+srvOff}).then(function(){ logAction('Aviso urgente: '+String(msg).slice(0,70)); }).catch(fail);
  }
}

/* ============ CATÁLOGO DEL DÍA ============ */
function virtualDeps(){
  const day=nowParts().key, branch=viewSuc(), catalog=catalogFor(branch), out=[];
  Object.keys(catalog).forEach(function(k){
    const t=catalog[k][0];
    out.push({id:k,presetKey:k,time:t,destination:catalog[k][1],scales:catalog[k][2],bus:'',status:'EN ESPERA',sucursal:branch,day:day,delay:0,_virtual:true});
  });
  return out;
}

function virtualActive(){
  if (!((gotServer && gotCleared) || offlineFallback)) return false;
  const today = nowParts().key;
  if (clearedDay === today) return false;
  return !Object.values(deps).some(function(d){ return d && d.day === today; });
}

const baseIdOf = function(d){ return String(d.id||'').replace(/^old_/,''); };
const isCustom = function(d){ return /^c\d+$/.test(baseIdOf(d)); };
const depKey = function(d){ return isCustom(d) ? baseIdOf(d) : (d.presetKey || (d.destination + '_' + d.time)); };

function buildList(n){
  let base = Object.values(deps);
  if(virtualActive()){
    const existingKeys = new Set(base.filter(function(d){ return d && d.day === n.key; }).map(depKey));
    virtualDeps().forEach(function(vd){
      if(!existingKeys.has(depKey(vd))) base.push(vd);
    });
  }

  const mapByKey = new Map();
  base.forEach(function(d){
    if(!d || !d.time || !isLive(d, n) || diffOf(d, n) <= -15) return;
    const key = depKey(d);
    const existing = mapByKey.get(key);
    if(!existing){ mapByKey.set(key, d); return; }
    const dHoy = d.day === n.key, eHoy = existing.day === n.key;
    if(dHoy !== eHoy){ if(dHoy) mapByKey.set(key, d); return; }
    if((d.status && d.status !== 'EN ESPERA' && existing.status === 'EN ESPERA') || (String(d.id).startsWith('p') && !String(existing.id).startsWith('p'))){
      mapByKey.set(key, d);
    }
  });

  return Array.from(mapByKey.values())
    .map(function(d){
      const o = Object.assign({}, d);
      o._diff = diffOf(d, n);
      o._st = stat(d, o._diff);
      o._eta = (o._st!=='SALIDO' && o._diff>=0 && o._diff<=90) ? o._diff : -1;
      o._needsBus = !!(!o.bus && o.presetKey && !isCustom(o) && o._st!=='SALIDO' && o._diff>=0 && o._diff<=CFG.sucursales[viewSuc()].estados.abordaje);
      o._k = (d.day || '') + '|' + (d.id || d.presetKey || (d.destination + '_' + d.time));
      return o;
    })
    .sort(function(a, b){ return a._diff - b._diff || a.time.localeCompare(b.time); });
}

function ensureMat(){
  return virtualActive()?loadCatalog():Promise.resolve();
}

let autoBusy=false;
async function autoCatalog(){
  if(!canWrite()||!ready||!gotServer||!gotCleared||autoBusy||viewSuc()!==suc||!VK||!vOn(VK.cat))return;
  const today=nowParts().key;
  if(Object.values(deps).some(function(d){return d.day===today;}))return;
  if(clearedDay===today)return;
  autoBusy=true;
  try{ await loadCatalog(); }catch(e){console.warn('Catálogo automático:',e.message);}
  setTimeout(function(){autoBusy=false;},10000);
}

function loadCatalog(){
  const branch = suc || viewSuc();
  const n = nowParts(), day = n.key, o = {}, catalog = catalogFor(branch);
  Object.keys(deps).forEach(function(key){
    const d = deps[key];
    if(!d || !d.time) return;
    const c = Object.assign({}, d); delete c.id; delete c._virtual;
    if(d.day === day){
      o[key] = c;
    } else if(isLive(d,n)){
      const diff = diffOf(d,n), hora = +String(d.time).split(':')[0];
      const salioHacePoco = diff <= 0 && diff > -15;
      const retrasadaDeMadrugada = (d.delay||0) > 0 && hora < 6 && diff > -15;
      if(salioHacePoco || retrasadaDeMadrugada) o['old_' + key.replace(/^old_/, '')] = c;
    }
  });
  Object.keys(catalog).forEach(function(k){
    if(o[k] && o[k].day === day) return;
    const row = catalog[k];
    o[k] = {presetKey: k, time: row[0], destination: row[1], scales: row[2], bus: '', status: 'EN ESPERA', sucursal: branch, day: day, delay: 0};
  });

  deps = {};
  Object.keys(o).forEach(function(k){ deps[k] = Object.assign({id:k}, o[k]); });
  clearedDay = null;
  try{ localStorage.setItem('transpais_offline_deps_' + branch, JSON.stringify(deps)); }catch(e){}
  render();

  return db.ref(branch + '/deps').set(o).then(function(){
    return db.ref(branch + '/cleared').remove();
  });
}

/* ============ GESTOR DE ANUNCIOS Y COMPRESIÓN CANVAS ============ */
let adIdx=0, adTimer=null, adSig=null, autoSplitState=false;

function updateSidebarAspectRatio(activeEl){
  const sidebar=$('ads-sidebar');
  if(!sidebar||!activeEl)return;
  if(activeEl.tagName==='IMG'){
    if(activeEl.naturalWidth&&activeEl.naturalHeight){
      sidebar.style.aspectRatio=activeEl.naturalWidth+' / '+activeEl.naturalHeight;
    }else{
      activeEl.onload=function(){
        sidebar.style.aspectRatio=this.naturalWidth+' / '+this.naturalHeight;
      };
    }
  }else if(activeEl.tagName==='VIDEO'){
    if(activeEl.videoWidth&&activeEl.videoHeight){
      sidebar.style.aspectRatio=activeEl.videoWidth+' / '+activeEl.videoHeight;
    }else{
      activeEl.onloadedmetadata=function(){
        sidebar.style.aspectRatio=this.videoWidth+' / '+this.videoHeight;
      };
    }
  }
}

function playIfVideo(el){
  if(el&&el.tagName==='VIDEO'){
    try{ el.currentTime=0; const p=el.play(); if(p&&p.catch)p.catch(function(){}); }catch(e){}
  }
}

function startAdCycle(){
  clearInterval(adTimer); adIdx=0;
  const c=$('ad-image-container'); if(!c)return;
  const items=c.querySelectorAll('.ad-img-item');
  if(!items.length)return;

  function activate(idx){
    items.forEach(function(item,i){
      if(i===idx){
        item.classList.add('active');
        playIfVideo(item);
        updateSidebarAspectRatio(item);
      }else{
        item.classList.remove('active');
      }
    });
  }

  activate(0);
  if(items.length<2)return;

  adTimer=setInterval(function(){
    adIdx=(adIdx+1)%items.length;
    activate(adIdx);
  },10000);
}

function renderAds(){
  if(isPassenger)return;
  const container=$('ad-image-container'), adminBody=$('admin-ads-body');
  const activeList=Object.values(adsData).filter(function(a){return a.active && a.dataUrl;});
  const sig=activeList.map(function(a){return a.id;}).join(',');

  if(container && sig!==adSig){
    adSig=sig;
    container.innerHTML='';
    activeList.forEach(function(ad,idx){
      let el;
      if(ad.isVideo || (ad.dataUrl && ad.dataUrl.startsWith('data:video'))){
        el = document.createElement('video');
        el.src = ad.dataUrl;
        el.autoplay = true;
        el.loop = true;
        el.muted = true;
        el.playsInline = true;
      } else {
        el = document.createElement('img');
        el.src = ad.dataUrl;
      }
      el.className='ad-img-item '+(idx===0?'active':'');
      el.dataset.index=idx;
      container.appendChild(el);
    });
    startAdCycle();
  }

  if(canWrite()&&adminBody){
    const allList=Object.values(adsData);
    if(allList.length===0){
      adminBody.innerHTML='<tr><td colspan="4" class="c" style="color:#888;font-size:11px">No hay anuncios cargados.</td></tr>';
    }else{
      adminBody.innerHTML=allList.map(function(a){
        const isVid = a.isVideo || (a.dataUrl && a.dataUrl.startsWith('data:video'));
        const src = esc(a.dataUrl||'');
        const preview = isVid
          ? '<video src="'+src+'" style="height:35px;width:35px;border-radius:6px;object-fit:cover;border:1px solid rgba(255,255,255,.2)" muted loop autoplay></video>'
          : '<img src="'+src+'" style="height:35px;width:35px;border-radius:6px;object-fit:cover;border:1px solid rgba(255,255,255,.2)">';
        return '<tr>'+
          '<td>'+preview+'</td>'+
          '<td style="font-size:11px;font-weight:700">'+esc(a.name)+'</td>'+
          '<td class="c"><button class="btn '+(a.active?'btn-green':'btn-dark')+'" data-adact="toggle" data-adid="'+esc(a.id)+'">'+(a.active?'✅ MOSTRANDO':'⏸️ OCULTO')+'</button></td>'+
          '<td class="c"><button class="btn btn-dark btn-red" data-adact="del" data-adid="'+esc(a.id)+'">🗑️ Eliminar</button></td>'+
        '</tr>';
      }).join('');
    }
  }
  update7030State();
}

function update7030State(){
  if(isPassenger)return;
  const wrapper=$('screen-split-container');
  const btn=$('btn-toggle-7030-manual');
  const activeList=Object.values(adsData).filter(function(a){return a.active && a.dataUrl;});
  const isForced=!!adsConfig.force7030;
  const act = (typeof lastList!=='undefined'&&lastList||[]).some(function(d){ return ['ETIQUETANDO PASAJE','EN ABORDAJE','ÚLTIMA LLAMADA'].indexOf(d._st)!==-1; });
  const shouldSplit = activeList.length > 0 && (isForced || (isTV && autoSplitState && !act));

  if(wrapper){
    wrapper.classList.toggle('split-active', shouldSplit);
  }
  if(btn){
    btn.textContent = isForced ? '📺 PUBLICIDAD: FORZADA EN TV' : '📺 FORZAR MODO PUBLICIDAD EN TV';
    btn.className = 'btn ' + (isForced ? 'btn-green' : 'btn-blue');
  }
}

function cycleSplit(){
  if(!isTV)return;
  autoSplitState=true; update7030State();
  setTimeout(function(){ autoSplitState=false; update7030State(); },60000);
}
if(isTV){
  setTimeout(function(){ cycleSplit(); setInterval(cycleSplit,150000); },20000);
}

if($('btn-toggle-7030-manual')){
  $('btn-toggle-7030-manual').onclick=function(){
    if(!canWrite()){
      alert('Debes estar autenticado en el Panel de Taquilla para cambiar el modo de pantalla.');
      return;
    }
    const nextState = !adsConfig.force7030;
    db.ref(suc+'/ads_config').set({force7030:nextState}).then(function(){
      adsConfig.force7030 = nextState;
      update7030State();
    }).catch(fail);
  };
}

if($('admin-ads-body')){
  $('admin-ads-body').addEventListener('click',function(e){
    const b=e.target.closest('[data-adact]'); if(!b||!canWrite())return;
    const id=b.dataset.adid, act=b.dataset.adact;
    if(act==='toggle'&&adsData[id])db.ref(suc+'/ads/'+id).update({active:!adsData[id].active}).catch(fail);
    else if(act==='del'&&confirm('¿Borrar este anuncio de la lista?'))db.ref(suc+'/ads/'+id).remove().catch(fail);
  });
}

if($('btn-upload-ad'))$('btn-upload-ad').onclick=function(){if($('ad-upload-input'))$('ad-upload-input').click();};

if($('ad-upload-input')){
  $('ad-upload-input').onchange=function(e){
    const file=e.target.files[0]; if(!file)return;
    if(!canWrite()){ alert('Inicia sesión en el Panel de Taquilla para subir anuncios.'); e.target.value=''; return; }
    const saveAd=function(dataUrl,isVideo){
      db.ref(suc+'/ads').push().set({name:file.name,dataUrl:dataUrl,isVideo:isVideo,active:true}).then(function(){
        e.target.value='';
      }).catch(fail);
    };
    if(file.type.startsWith('video/')){
      if(file.size > 6.5 * 1024 * 1024){
        alert('El video supera los 6.5 MB. Elige un video más corto o comprímelo.');
        e.target.value='';
        return;
      }
      const reader=new FileReader();
      reader.onload=function(evt){ saveAd(evt.target.result,true); };
      reader.readAsDataURL(file);
    } else if(file.type==='image/gif' && file.size <= 2*1024*1024){
      const reader=new FileReader();
      reader.onload=function(evt){ saveAd(evt.target.result,false); };
      reader.readAsDataURL(file);
    } else {
      const reader=new FileReader();
      reader.onload=function(evt){
        const img=new Image();
        img.onload=function(){
          const canvas=document.createElement('canvas');
          let w=img.width, h=img.height;
          const maxDim=720;
          if(w>maxDim||h>maxDim){
            if(w>h){ h=Math.round((h*maxDim)/w); w=maxDim; }
            else{ w=Math.round((w*maxDim)/h); h=maxDim; }
          }
          canvas.width=w; canvas.height=h;
          const cx=canvas.getContext('2d');
          cx.drawImage(img,0,0,w,h);
          saveAd(canvas.toDataURL('image/jpeg',0.65),false);
        };
        img.onerror=function(){ alert('No se pudo leer la imagen.'); };
        img.src=evt.target.result;
      };
      reader.readAsDataURL(file);
    }
  };
}

if($('btn-save-urgent')){
  $('btn-save-urgent').onclick=function(){
    if(!canWrite())return;
    const v=$('urgent-input').value.trim().slice(0,300);
    (v?db.ref(suc+'/urgent').set({text:v,day:nowParts().key,ts:Date.now()+srvOff}):db.ref(suc+'/urgent').remove()).then(function(){ logAction(v?'Aviso urgente: '+v.slice(0,70):'Quitó el aviso urgente'); }).catch(fail);
  };
}
if($('btn-clear-urgent')){
  $('btn-clear-urgent').onclick=function(){
    if(!canWrite())return;
    $('urgent-input').value='';
    db.ref(suc+'/urgent').remove().then(function(){ logAction('Quitó el aviso urgente'); }).catch(fail);
  };
}

/* ============ VOCEO AUTOMÁTICO EN TV ============ */
function loadFired(){
  try{
    const n=nowParts(), y=dayShift(n.key,-1);
    return new Set(JSON.parse(localStorage.getItem('transpais_fired')||'[]').filter(function(x){
      const dd=String(x).split('|')[2]; return dd===n.key||dd===y;
    }));
  }catch(e){ return new Set(); }
}
const fired=loadFired();
const voicePending=new Set();
const voiceRetryAfter=new Map();

function markFired(k,n){
  fired.add(k);
  const y=dayShift(n.key,-1);
  try{
    localStorage.setItem('transpais_fired',JSON.stringify(Array.from(fired).filter(function(x){
      const dd=x.split('|')[2]; return dd===n.key||dd===y;
    })));
  }catch(e){}
}

function autoVoice(d,diff,n){
  if(!isTV)return; /* el voceo automático es solo de la TV; en taquilla solo suena el voceo manual */
  if(!d.presetKey||isCustom(d))return;
  let mode = null;
  let subKey = '';
  const avisos = CFG.sucursales[viewSuc()].avisos;
  for(let i=0;i<avisos.length;i++){
    if(diff <= avisos[i].desde && diff > avisos[i].hasta){ mode = avisos[i].modo; subKey = avisos[i].id; break; }
  }

  if(!mode)return;
  const baseId=baseIdOf(d);
  const k=baseId+'|'+subKey+'|'+(d.day||n.key)+'|'+d.time;
  if(fired.has(k)||voicePending.has(k))return;
  if(muted){ markFired(k,n); return; }
  const retryAt=voiceRetryAfter.get(k)||0;
  if(Date.now()<retryAt)return;
  voicePending.add(k);
  const ep=epoch;
  enqueueAudio(d.presetKey,mode,function(ok){
    voicePending.delete(k);
    if(!ok){
      if(ep<panicMark){ markFired(k,n); return; }
      voiceRetryAfter.set(k,Date.now()+15000);
      return;
    }
    voiceRetryAfter.delete(k);
    markFired(k,n);
  },d.bus);
}

/* ============ AUTO-SCROLL CON ACUMULADOR DECIMAL (GARANTIZADO 60 FPS) ============ */
(function initTVAutoScroll() {
  let scrollPos = 0;      // Acumulador decimal en memoria JS
  let scrollSpeed = 0.35; // Velocidad de lectura óptima (0.35px por frame)
  let pauseTime = 5000;   // Pausa de 5 segundos arriba y abajo
  let isPaused = false;
  let direction = 1;      // 1 = Bajar, -1 = Subir

  function scrollStep() {
    if (isTV) {
      const container = document.querySelector('.fids-table-wrap');
      if (container) {
        const maxScroll = container.scrollHeight - container.clientHeight;

        if (maxScroll > 15) {
          if (!isPaused) {
            // Sincronizar acumulador si hubo cambio externo o re-render
            if (Math.abs(container.scrollTop - scrollPos) > 10) {
              scrollPos = container.scrollTop;
            }

            if (direction === 1) {
              scrollPos += scrollSpeed;
              container.scrollTop = scrollPos;

              if (container.scrollTop >= maxScroll - 2 || scrollPos >= maxScroll) {
                scrollPos = maxScroll;
                container.scrollTop = maxScroll;
                isPaused = true;
                setTimeout(function() {
                  direction = -1;
                  isPaused = false;
                }, pauseTime);
              }
            } else {
              scrollPos -= scrollSpeed * 1.5; // Regreso suave
              container.scrollTop = scrollPos;

              if (container.scrollTop <= 2 || scrollPos <= 0) {
                scrollPos = 0;
                container.scrollTop = 0;
                isPaused = true;
                setTimeout(function() {
                  direction = 1;
                  isPaused = false;
                }, pauseTime);
              }
            }
          }
        } else {
          scrollPos = 0;
          container.scrollTop = 0;
        }
      }
    }
    requestAnimationFrame(scrollStep);
  }

  if (document.readyState === 'complete') {
    requestAnimationFrame(scrollStep);
  } else {
    window.addEventListener('load', function() {
      requestAnimationFrame(scrollStep);
    });
  }
})();

/* ============ RELOJ Y REINICIO DIARIO (03:00 AM REINICIO 24/7) ============ */
let lastMinute = -1;

function tick(){
  try{
    const n=nowParts();
    if($('clock-time'))$('clock-time').textContent=n.time;
    if($('clock-date'))$('clock-date').textContent=new Date(Date.now()+srvOff).toLocaleDateString('es-MX',{timeZone:TZ,weekday:'long',year:'numeric',month:'long',day:'numeric'});

    if(isTV && n.min>=CFG.reinicioTvMin && n.min<CFG.reinicioTvMin+10){
      try{
        if(localStorage.getItem('transpais_reload_day')!==n.key){
          localStorage.setItem('transpais_reload_day',n.key);
          location.reload();
          return;
        }
      }catch(e){}
    }

    if(ready && (gotServer||offlineFallback)){
      buildList(n).forEach(function(d){
        if(d.status!=='SALIDO')autoVoice(d,d._diff,n);
      });
    }
    if(n.min !== lastMinute){
      lastMinute = n.min;
      applyTheme();
      if(!lcActive)setTickerNormal();
      renderAvisos();
      renderUrgentMsg();
      if(canWrite()&&urgentInfo().expired)db.ref(suc+'/urgent').remove().catch(function(){});
      render();
    }
  }catch(e){console.error('Error tick:',e);}
}
setInterval(tick,1000);
setInterval(autoCatalog,30000);

/* ============ RENDER Y TARJETAS PASAJERO ============ */
const EN_ST={'ETIQUETANDO PASAJE':'BAGGAGE CHECK-IN','EN ABORDAJE':'NOW BOARDING','ÚLTIMA LLAMADA':'FINAL CALL','REPROGRAMADO':'RESCHEDULED','SALIDO':'DEPARTED','EN ESPERA':'SCHEDULED'};
function bil(es,en){
  return (CFG.idioma&&CFG.idioma.bilingue&&(isTV||isPassenger))
    ? '<span class="lang2"><span class="l-es">'+es+'</span><span class="l-en">'+en+'</span></span>' : es;
}
function badge(st){
  let cls='status-espera', lab='EN ESPERA';
  if(st==='ETIQUETANDO PASAJE'){cls='status-etiq';lab=st;}
  else if(st==='EN ABORDAJE'){cls='status-abordaje';lab=st;}
  else if(st==='ÚLTIMA LLAMADA'){cls='status-ultima';lab=st;}
  else if(st&&st.indexOf('REPROGRAMADO')!==-1){cls='status-reprogramado';lab='REPROGRAMADO';}
  else if(st==='SALIDO'){cls='status-salido';lab='SALIDO';}
  return '<span class="badge-status '+cls+'">'+bil(lab,EN_ST[lab])+'</span>';
}
function etaHTML(d){
  if(d._eta==null||d._eta<0)return '';
  const es=d._eta===0?'sale ahora':'sale en '+d._eta+' min', en=d._eta===0?'departing now':'departs in '+d._eta+' min';
  return '<div class="eta'+(d._eta<=5?' hot':'')+'">'+bil(es,en)+'</div>';
}
const cleanScales=function(s){return (s||'').split(',').map(function(x){return x.trim();}).filter(Boolean).join(', ');};

function passengerCardHTML(d, isCentral){
  const sc = cleanScales(d.scales);
  const boardingPoint = d.gate || CFG.sucursales[viewSuc()].puntoAbordajePasajero;
  const isActive = d._st === 'ETIQUETANDO PASAJE' || d._st === 'EN ABORDAJE' || d._st === 'ÚLTIMA LLAMADA';

  const appP = isPassenger && vistaInfo && vistaInfo.app, fol = appP && followKeys().indexOf(d._k) !== -1;
  const cardClass = 'passenger-card ' + (isActive ? 'gold-card-active' : '') + (fol ? ' followed' : '');

  return '<div class="' + cardClass + '">' +
    '<div class="passenger-card-header">' +
      '<span class="passenger-card-time">' + esc(d.time) + '</span>' +
      '<div>' + badge(d._st) + etaHTML(d) + '</div>' +
    '</div>' +
    '<div>' +
      '<div class="passenger-card-dest">' + esc(d.destination) + ' ' + wxChip(d.destination) + '</div>' +
      (sc ? '<div class="passenger-card-scales">Escalas: ' + esc(sc) + '</div>' : '') +
    '</div>' +
    '<div class="passenger-card-details">' +
      '<span>🚌 Bus: ' + esc(d.bus || '---') + '</span>' +
      '<span>📍 ' + esc(boardingPoint) + '</span>' +
    '</div>' +
    (appP ? '<button type="button" class="follow-btn' + (fol ? ' on' : '') + '" data-follow="' + esc(d._k) + '">' + (fol ? '⭐ Siguiendo tu salida' : '🔔 Seguir mi salida') + '</button>' : '') +
    (appP ? paxExtraHTML(d, fol) : '') +
  '</div>';
}

function tvRow(d,c){
  const sc=cleanScales(d.scales);
  const isActive = d._st === 'ETIQUETANDO PASAJE' || d._st === 'EN ABORDAJE' || d._st === 'ÚLTIMA LLAMADA';
  const rowClass = isActive ? 'gold-row-active' : '';

  return '<td style="font-size:24px;font-weight:900;font-family:monospace" class="'+rowClass+'">'+esc(d.time)+'</td>'+
  '<td class="'+rowClass+'"><div style="font-size:20px;font-weight:900">'+esc(d.destination)+' '+wxChip(d.destination)+'</div>'+(sc?'<div style="font-size:12px;color:var(--muted,#93c5fd);margin-top:4px">Escalas: '+esc(sc)+'</div>':'')+'</td>'+
  '<td class="c '+rowClass+'">'+(d.bus?'<span class="bus-badge">'+esc(d.bus)+'</span>':'<span class="bus-none">---</span>')+'</td>'+
  '<td class="c '+rowClass+'" style="font-size:16px;font-weight:800;color:var(--ok,#00D974)">'+esc(d.gate||CFG.sucursales[viewSuc()].puntoAbordaje)+'</td>'+
  '<td class="c '+rowClass+'">'+badge(d._st)+etaHTML(d)+'</td>';
}

function adminRow(d){
  return '<td><strong>'+esc(d.time)+'</strong></td>'+
  '<td><div><strong>'+esc(d.destination)+'</strong></div><div style="font-size:10px;color:var(--muted,#93c5fd)">MP3: '+esc((d.presetKey&&!isCustom(d))?d.presetKey:'Sin audio')+'</div></td>'+
  '<td class="c"><input type="text" class="inline-bus-input" maxlength="10" value="'+esc(d.bus||'')+'" placeholder="---">'+
    '<div style="font-size:9px;color:var(--muted,#93c5fd);margin-top:4px">Punto de abordaje</div>'+
    '<input type="text" class="inline-gate-input" value="'+esc(d.gate||'')+'" placeholder="'+esc(CFG.sucursales[viewSuc()].puntoAbordaje)+'" maxlength="30" style="width:110px;padding:4px;font-size:11px;text-align:center"></td>'+
  '<td class="c">'+badge(d._st)+'</td>'+
  '<td>'+
    '<div class="flex" style="flex-direction:column;gap:2px">'+
      '<div class="flex">'+
        '<button class="btn btn-advance" data-act="time" data-v="-60" title="-1 hora">-1h</button>'+
        '<button class="btn btn-advance" data-act="time" data-v="-30" title="-30 min">-30m</button>'+
        '<button class="btn btn-advance" data-act="time" data-v="-5" title="-5 min">-5m</button>'+
      '</div>'+
      '<div class="flex">'+
        '<button class="btn btn-delay" data-act="time" data-v="5" title="+5 min">+5m</button>'+
        '<button class="btn btn-delay" data-act="time" data-v="30" title="+30 min">+30m</button>'+
        '<button class="btn btn-delay" data-act="time" data-v="60" title="+1 hora">+1h</button>'+
      '</div>'+
    '</div>'+
  '</td>'+
  '<td><div class="flex"><button class="btn btn-blue" data-act="voz" data-m="etiq" title="Vocear Etiquetado">🏷️</button><button class="btn btn-green" data-act="voz" data-m="abord" title="Vocear Abordaje">🚌</button><button class="btn btn-arrive" data-act="voz" data-m="ultima" title="Vocear Última Llamada">📢</button></div></td>'+
  '<td><div class="flex"><button class="btn btn-dark" data-act="edit">✏️</button><button class="btn btn-dark btn-red" data-act="del">🗑️</button></div></td>';
}

function syncRows(tb, list, html){
  const sigOf = function(d){ return JSON.stringify([d.time, d.destination, d.scales, d.bus, d.gate, d._st, d.presetKey, d._eta, d._needsBus]); };
  const existingRows = new Map(Array.from(tb.children).map(function(r){ return [r.dataset.k, r]; }));

  list.forEach(function(d, index){
    let r = existingRows.get(d._k);
    const s = sigOf(d);

    if(!r){
      r = document.createElement('tr');
      r.dataset.k = d._k;
      r.innerHTML = html(d);
      r._s = s; r._st = d._st;
    } else {
      existingRows.delete(d._k);
      if(r._s !== s){
        const f = document.activeElement, typing = f && r.contains(f) && (f.classList.contains('inline-bus-input') || f.classList.contains('inline-gate-input'));
        const tcls = typing && f.classList.contains('inline-gate-input') ? '.inline-gate-input' : '.inline-bus-input';
        const val = typing ? f.value : null, pos = typing ? f.selectionStart : 0;
        const stChanged = r._st !== undefined && r._st !== d._st;
        r.innerHTML = html(d);
        r._s = s; r._st = d._st;
        if(stChanged && tb.id !== 'admin-body'){
          r.classList.remove('flip'); void r.offsetWidth; r.classList.add('flip');
          (function(x){ setTimeout(function(){ x.classList.remove('flip'); },1100); })(r);
        }
        if(typing){
          const ni = r.querySelector(tcls);
          if(ni){ ni.value = val; ni.focus(); ni.setSelectionRange(pos, pos); }
        }
      }
    }

    r.classList.toggle('needs-bus', !!d._needsBus && tb.id==='admin-body');

    if(tb.children[index] !== r){
      tb.insertBefore(r, tb.children[index] || null);
    }
  });

  existingRows.forEach(function(r){ r.remove(); });
}

function render(){
  const c=viewSuc()==='central', fb=$('fids-body'), ab=$('admin-body'), plist=$('passenger-card-list');
  if(!ready){
    if(fb)fb.innerHTML='<tr><td colspan="5" class="c" style="color:var(--muted,#93c5fd);padding:40px">Conectando con el servidor…</td></tr>';
    return;
  }
  const n=nowParts();
  let list=buildList(n);
  curMap={}; list.forEach(function(d){curMap[d._k]=d;});

  if(isPassenger && plist){
    plist.classList.remove('hidden');
    if($('passenger-search-wrap')) $('passenger-search-wrap').classList.remove('hidden');

    const norm = function(x){ return String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); };
    const q = norm($('passenger-search-input') ? $('passenger-search-input').value : '').trim();
    const totalAntes = list.length;
    if(q){
      list = list.filter(function(d){
        return norm(d.destination).includes(q) || norm(d.scales).includes(q);
      });
    }

    if(list.length===0){
      plist.innerHTML = '<div style="text-align:center;padding:30px;color:#888;font-size:13px">' +
        (totalAntes===0 ? 'No hay salidas programadas por ahora.' : 'No se encontraron autobuses para tu búsqueda.') + '</div>';
    }else{
      plist.innerHTML = list.map(function(d){ return passengerCardHTML(d, c); }).join('');
      paxList = list; checkFollowAlerts(list); paxToolsRefresh();
    }
  } else {
    const fixedWrap=$('fixed-departures-wrap'), fixedBody=$('fixed-fids-body');
    const pinned=[];
    const moving=list;   /* la salida en etiquetado ya no se separa: va en la tabla y en la franja de arriba */
    if(fixedWrap&&fixedBody){
      fixedWrap.classList.toggle('hidden',pinned.length===0);
      syncRows(fixedBody,pinned,function(d){return tvRow(d,c);});
      renderPinnedRoute(pinned);
    }
    if(fb)syncRows(fb,moving,function(d){return tvRow(d,c);});
    if(fb&&list.length===0){
      const er=document.createElement('tr'); er.dataset.k='__empty';
      er.innerHTML='<td colspan="5" class="c" style="padding:60px 20px"><div style="font-size:clamp(40px,6vw,96px)">🚌</div><div style="color:#fff;font-size:clamp(18px,2.4vw,40px);font-weight:900;margin-top:10px">'+esc(CFG.cliente.mensajeSinSalidas)+'</div><div style="color:var(--muted,#93c5fd);font-size:clamp(11px,1.1vw,18px);margin-top:8px">'+esc(CFG.cliente.marca)+'</div></td>';
      fb.appendChild(er);
    }
    if(canWrite()&&ab)syncRows(ab,list,adminRow);
    renderExtras(list,c);
  }
}

/* ============ FRANJA DE LA TV: ruta animada, consejos y saludos ============ */
function routeLineHTML(d,S){
  let nodes=[S.origen||''].filter(Boolean);
  const sc=String(d.scales||'').trim();
  if(sc){
    if(/^directo/i.test(sc))nodes.push(sc);
    else nodes=nodes.concat(sc.split(',').map(function(x){return x.trim();}).filter(Boolean).slice(0,6));
  }
  nodes.push(d.destination);
  nodes=nodes.filter(function(n,i){ return i===0||n!==nodes[i-1]; });
  return '<div class="rs-line"><span class="rs-bus">🚌</span>'+nodes.map(function(nm,i){
    const cls=i===nodes.length-1?' rs-end':(i===0?' rs-start':'');
    return (i?'<span class="rs-seg"></span>':'')+'<span class="rs-node'+cls+'"><span class="rs-dot"></span><span class="rs-name">'+esc(nm)+'</span></span>';
  }).join('')+'</div>';
}
function renderPinnedRoute(pinned){
  const el=$('fixed-route'); if(!el)return;
  const html=pinned.length?routeLineHTML(pinned[0],CFG.sucursales[viewSuc()]):'';
  if(el._h!==html){ el.innerHTML=html; el._h=html; }
}
function renderNextRoute(list){
  const el=$('next-route'); if(!el)return;
  if(isTV){ el.classList.add('hidden'); return; }   /* en la TV lo muestra la franja principal */
  const act=list.filter(function(d){ return d._st==='ETIQUETANDO PASAJE'||d._st==='EN ABORDAJE'||d._st==='ÚLTIMA LLAMADA'; });
  const next=list.filter(function(d){ return d._st!=='SALIDO'&&d._diff>=0; })[0];
  if(!isTV||isGeneral||act.length||!next){ el.classList.add('hidden'); el._h=''; return; }
  const eta=next._eta>=0?(next._eta===0?'sale ahora':'sale en '+next._eta+' min'):'', etaEn=next._eta>=0?(next._eta===0?'departing now':'departs in '+next._eta+' min'):'';
  const html='<div class="nr-head"><span class="k">'+bil('PRÓXIMA SALIDA','NEXT DEPARTURE')+'</span><span>'+esc(next.time)+'</span><span>'+esc(next.destination)+'</span>'+
    (eta?'<span class="k">'+bil(eta,etaEn)+'</span>':'')+'</div>'+routeLineHTML(next,CFG.sucursales[viewSuc()]);
  if(el._h!==html){ el.innerHTML=html; el._h=html; }
  el.classList.remove('hidden');
}
function routeHTML(d,S){
  const abord=d._st==='EN ABORDAJE';
  const gate=d.gate||S.puntoAbordaje;
  const eta=d._eta>=0?(d._eta===0?'sale ahora':'sale en '+d._eta+' min'):'';
  const etaEn=d._eta>=0?(d._eta===0?'departing now':'departs in '+d._eta+' min'):'';
  let nodes=[S.origen||''].filter(Boolean);
  const sc=String(d.scales||'').trim();
  if(sc){
    if(/^directo/i.test(sc))nodes.push(sc);
    else nodes=nodes.concat(sc.split(',').map(function(x){return x.trim();}).filter(Boolean).slice(0,6));
  }
  nodes.push(d.destination);
  nodes=nodes.filter(function(n,i){ return i===0||n!==nodes[i-1]; });
  const line=nodes.map(function(nm,i){
    const cls=i===nodes.length-1?' rs-end':(i===0?' rs-start':'');
    return (i?'<span class="rs-seg"></span>':'')+'<span class="rs-node'+cls+'"><span class="rs-dot"></span><span class="rs-name">'+esc(nm)+'</span></span>';
  }).join('');
  const lab=abord?bil('ABORDAJE','NOW BOARDING'):bil('ETIQUETANDO EQUIPAJE','BAGGAGE CHECK-IN');
  return '<div class="rs-head"><span class="k">'+lab+'</span><span>'+esc(d.time)+'</span><span>'+esc(d.destination)+'</span>'+
    (d.bus?'<span>🚌 '+esc(d.bus)+'</span>':'')+'<span class="gate">📍 '+esc(gate)+'</span>'+(eta?'<span class="k">'+bil(eta,etaEn)+'</span>':'')+'</div>'+
    '<div class="rs-line">'+'<span class="rs-bus'+(abord?' fast':'')+'">🚌</span>'+line+'</div>';
}
/* ---- Mapa animado de la ruta (SVG, sin internet) ---- */
function projectNodes(names){
  const L=CFG.lugares||{};
  const pts=names.map(function(n){ const p=L[n]||L[String(n).replace(/^Ciudad /,'')]||L['Ciudad '+n]; return p?{lat:p[0],lon:p[1]}:null; });
  if(pts.filter(Boolean).length<2)return null;
  for(let i=0;i<pts.length;i++){
    if(pts[i])continue;
    let a=i-1,b=i+1; while(a>=0&&!pts[a])a--; while(b<pts.length&&!pts[b])b++;
    if(a<0&&b>=pts.length)return null;
    if(a<0)pts[i]=pts[b]; else if(b>=pts.length)pts[i]=pts[a];
    else{ const t=(i-a)/(b-a); pts[i]={lat:pts[a].lat+(pts[b].lat-pts[a].lat)*t,lon:pts[a].lon+(pts[b].lon-pts[a].lon)*t}; }
  }
  const lats=pts.map(function(p){return p.lat;}), lons=pts.map(function(p){return p.lon;});
  const minLat=Math.min.apply(null,lats), maxLat=Math.max.apply(null,lats), minLon=Math.min.apply(null,lons), maxLon=Math.max.apply(null,lons);
  const k=Math.cos(((minLat+maxLat)/2)*Math.PI/180), w=Math.max((maxLon-minLon)*k,0.01), h=Math.max(maxLat-minLat,0.01);
  const padX=48, padY=26, sc=Math.min((400-2*padX)/w,(220-2*padY)/h), ox=(400-w*sc)/2, oy=(220-h*sc)/2;
  return pts.map(function(p){ return {x:ox+(p.lon-minLon)*k*sc, y:oy+(maxLat-p.lat)*sc}; });
}
function routeMapSVG(d,S,abord){
  let names=[S.origen||''].filter(Boolean);
  const sc=String(d.scales||'').trim();
  if(sc&&!/^directo/i.test(sc))names=names.concat(sc.split(',').map(function(x){return x.trim();}).filter(Boolean).slice(0,7));
  names.push(d.destination);
  names=names.filter(function(n,i){ return i===0||n!==names[i-1]; });
  const pts=projectNodes(names); if(!pts)return '';
  const path=pts.map(function(p,i){return (i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1);}).join(' ');
  const last=pts.length-1, step=4.2/Math.max(1,last);
  /* etiquetas: primero destino y origen, luego las demás; si una choca con otra se prueba del otro lado y, si sigue chocando, se omite */
  const placed=[], labels={};
  const boxOf=function(x,y,txt,fs,anchor){ const w=txt.length*fs*0.58; const x0=anchor==='start'?x:x-w; return {x0:x0-1.5,x1:x0+w+1.5,y0:y-fs,y1:y+3}; };
  const hit=function(b){ return b.x0<2||b.x1>398||placed.some(function(p){ return b.x0<p.x1&&b.x1>p.x0&&b.y0<p.y1&&b.y1>p.y0; }); };
  const order=[last,0].concat(pts.map(function(_,i){return i;}).filter(function(i){return i!==0&&i!==last;}));
  order.forEach(function(i){
    const p=pts[i], fs=i===last?11:9, gap=i===last?9:7;
    const sides=(i%2===0)?['start','end']:['end','start'];
    for(let s=0;s<sides.length;s++){
      const anchor=sides[s], lx=anchor==='start'?p.x+gap:p.x-gap, ly=Math.min(214,Math.max(fs+1,p.y+fs*0.35)), bx=boxOf(lx,ly,names[i],fs,anchor);
      if(!hit(bx)){ placed.push(bx); labels[i]={lx:lx,ly:ly,anchor:anchor}; return; }
    }
  });
  const nodes=pts.map(function(p,i){
    const cls=i===0?' start':(i===last?' end':''), dly=(i*step).toFixed(2)+'s', L=labels[i];
    return '<circle class="rs-pt'+cls+'" cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="'+(i===last?5:3.4)+'" style="animation-delay:'+dly+'"/>'+
      (L?'<text class="rs-lbl'+(i===last?' end':'')+'" x="'+L.lx.toFixed(1)+'" y="'+L.ly.toFixed(1)+'" text-anchor="'+L.anchor+'" style="animation-delay:'+dly+'">'+esc(names[i])+'</text>':'');
  }).join('');
  const dur=abord?'5s':'8s';
  const mover='<circle r="7" fill="'+(abord?'#00D974':'#FFB800')+'" opacity=".28"><animateMotion dur="'+dur+'" repeatCount="indefinite" calcMode="linear"><mpath href="#rsPath"/></animateMotion></circle>'+
    '<text font-size="17" text-anchor="middle" dy="5">🚌<animateMotion dur="'+dur+'" repeatCount="indefinite" calcMode="linear"><mpath href="#rsPath"/></animateMotion></text>'+
    (abord?'':'<text font-size="12" x="'+pts[0].x.toFixed(1)+'" y="'+(pts[0].y-8).toFixed(1)+'" text-anchor="middle">🧳</text>');
  return '<svg class="rs-map" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">'+
    '<defs><pattern id="rsGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="rgba(147,197,253,.10)" stroke-width="1"/></pattern></defs>'+
    '<rect width="400" height="220" fill="url(#rsGrid)"/>'+
    '<path class="rs-trail-bg" d="'+path+'"/><path id="rsPath" class="rs-trail" pathLength="1" d="'+path+'"/>'+nodes+mover+'</svg>';
}
function routeCardHTML(d,S,mode){
  if(mode==='map'){
    const svg=routeMapSVG(d,S,d._st==='EN ABORDAJE');
    if(svg){
      const abord=d._st==='EN ABORDAJE', gate=d.gate||S.puntoAbordaje;
      const eta=d._eta>=0?(d._eta===0?'sale ahora':'sale en '+d._eta+' min'):'', etaEn=d._eta>=0?(d._eta===0?'departing now':'departs in '+d._eta+' min'):'';
      return {map:true,html:'<div class="rs-mapcard"><div class="rs-info"><div class="rs-lab">'+(abord?bil('ABORDAJE','NOW BOARDING'):bil('ETIQUETANDO EQUIPAJE','BAGGAGE CHECK-IN'))+'</div>'+
        '<div class="rs-dest">'+esc(d.destination)+'</div><div class="rs-meta">'+esc(d.time)+(d.bus?' · 🚌 '+esc(d.bus):'')+'</div>'+
        '<div class="rs-gate">📍 '+esc(gate)+'</div>'+(eta?'<div class="rs-eta">'+bil(eta,etaEn)+'</div>':'')+'</div><div class="rs-mapbox">'+svg+'</div></div>'};
    }
  }
  return {map:false,html:routeHTML(d,S)};
}
function renderStrip(){
  const st=$('route-strip'); if(!st)return;
  const d=stripOn?stripCand.find(function(x){return x._k===stripItems[stripPos];}):null;
  if(!isTV||!CFG.franja||CFG.franja.activa===false||!d){ st.classList.add('hidden'); stripHtml=''; return; }
  const abord=d._st==='EN ABORDAJE';
  st.classList.toggle('st-abord',abord); st.classList.toggle('st-etiq',!abord);
  const card=routeCardHTML(d,CFG.sucursales[viewSuc()],stripMode);
  st.classList.toggle('map',card.map);
  const html='<div class="rs-slide">'+card.html+'</div>';
  if(html!==stripHtml){ st.innerHTML=html; stripHtml=html; }
  st.classList.remove('hidden');
}
/* La franja aparece cuando una salida entra a etiquetado o abordaje (y se repite cada minuto mientras siga),
   solo si las salidas caben sin hacer scroll. En última llamada no sale: ahí manda la barra roja. */
function stripShow(){
  const cf=CFG.franja||{}; if(!isTV||cf.activa===false||!stripCand.length||stripOn)return;
  const w=document.querySelector('.fids-table-wrap');
  const free=w?(w.clientHeight-w.scrollHeight):1e9;
  if(cf.mapa!==false&&free>=window.innerHeight*0.30)stripMode='map';
  else if(free>=window.innerHeight*0.12)stripMode='line';
  else return;
  const secs=cf.segundos||15, items=stripCand.slice(0,3), per=Math.max(5,Math.floor(secs/items.length));
  stripItems=items.map(function(d){return d._k;}); stripPos=0; stripOn=true; renderStrip();
  stripTimers=[];
  for(let i=1;i<items.length;i++){ (function(k){ stripTimers.push(setTimeout(function(){ stripPos=k; renderStrip(); },k*per*1000)); })(i); }
  stripTimers.push(setTimeout(function(){ stripOn=false; stripTimers=[]; renderStrip(); },secs*1000));
}
if(CFG.franja&&CFG.franja.activa!==false)setInterval(stripShow,((CFG.franja.repetirCadaSeg)||60)*1000);

function renderExtras(list,c){
  const S=CFG.sucursales[viewSuc()];
  renderNextRoute(list);
  renderIdle(list); if(isAnden)renderAnden(list);
  update7030State();
  stripCand=list.filter(function(d){return d._st==='ETIQUETANDO PASAJE'||d._st==='EN ABORDAJE';}).sort(function(a,b){return a._diff-b._diff;});
  let fresh=false; const seenNow={};
  stripCand.forEach(function(d){ seenNow[d._k]=d._st; if(stripSeen[d._k]!==d._st)fresh=true; });
  stripSeen=seenNow;
  renderStrip();
  if(fresh&&stripInit)stripShow();
  stripInit=true;
  if(isTV){
    const lc=list.filter(function(d){return d._st==='ÚLTIMA LLAMADA';});
    if(lc.length){
      setTickerLC(lc.slice(0,2).map(function(d){return d.destination+' · '+(d.gate||S.puntoAbordaje);}).join('  |  '));
      lcActive=true;
    }else if(lcActive){ lcActive=false; setTickerNormal(); }
  }
  const os=$('ops-summary');
  if(os){
    if(!canWrite()){ os.classList.add('hidden'); return; }
    const up=list.filter(function(d){return d._st!=='SALIDO'&&d._diff>=0;}).slice(0,3);
    const miss=list.filter(function(d){return d._needsBus;});
    const nn=nowParts(), tod=Object.keys(deps).map(function(k){return deps[k];}).filter(function(d){return d&&d.day===nn.key&&d.time;});
    const sal=tod.filter(function(d){return diffOf(d,nn)<0;}), pun=sal.filter(function(d){return !(d.delay>0);});
    let html='<span class="ops-chip">📊 Hoy: '+tod.length+' salidas · '+sal.length+' ya salieron'+(sal.length?' · '+pun.length+' puntuales ('+Math.round(pun.length*100/sal.length)+'%)':'')+'</span>';
    if(!up.length)html+='<span class="ops-chip">Sin salidas pendientes</span>';
    miss.slice(0,2).forEach(function(d){ html+='<span class="ops-chip bad">⚠️ Falta unidad: '+esc(d.time)+' '+esc(d.destination)+' (en '+d._diff+' min)</span>'; });
    os.innerHTML=html; os.classList.remove('hidden');
  }
}

/* ============ ACCIONES DE TAQUILLA ============ */
const dref=function(id){return db.ref(suc+'/deps/'+id);};

if($('admin-body')){
  $('admin-body').addEventListener('click',function(e){
    const b=e.target.closest('[data-act]'); if(!b||!canWrite())return;
    const tr=b.closest('tr'), d=curMap[tr.dataset.k]; if(!d)return;
    const act=b.dataset.act;
    if(act==='voz'){
      if(!d.presetKey||isCustom(d)){ alert('Esta corrida no tiene ruta con audio MP3.'); return; }
      db.ref(suc+'/voice').set({key:d.presetKey||'p01',mode:b.dataset.m,bus:String(d.bus||''),timestamp:firebase.database.ServerValue.TIMESTAMP}).catch(fail);
      logAction('Voceo '+({etiq:'etiquetado',abord:'abordaje',ultima:'última llamada'}[b.dataset.m]||b.dataset.m)+' · '+d.time+' '+d.destination);
    }
    else if(act==='time')ensureMat().then(function(){pushUndoSnap(snapDep(d),'Hora '+(+b.dataset.v>0?'+':'')+b.dataset.v+' min · '+d.time+' '+d.destination);adjustTime(d,+b.dataset.v);}).catch(fail);
    else if(act==='edit')editDeparture(d);
    else if(act==='del'&&confirm('¿Eliminar esta corrida de la pantalla?'))ensureMat().then(function(){logAction('Eliminó salida '+d.time+' '+d.destination);pushUndoDelete(d);return dref(d.id).remove();}).catch(fail);
  });

  $('admin-body').addEventListener('change',function(e){
    const isBus=e.target.classList.contains('inline-bus-input'), isGate=e.target.classList.contains('inline-gate-input');
    if((!isBus&&!isGate)||!canWrite())return;
    const d=curMap[e.target.closest('tr').dataset.k]; if(!d)return;
    const v=e.target.value.trim();
    ensureMat().then(function(){logAction((isGate?'Punto de abordaje "'+(v||'predeterminado')+'"':'Unidad '+(v||'—'))+' · '+d.time+' '+d.destination);return dref(d.id).update(isGate?{gate:v}:{bus:v});}).catch(fail);
  });
}

function adjustTime(d,deltaMinutes){
  const parts=d.time.split(':').map(Number);
  const totalMins=(((parts[0]*60+parts[1]+deltaMinutes)%1440)+1440)%1440;
  const newTime=pad(Math.floor(totalMins/60))+':'+pad(totalMins%60);

  const newDelay=Math.max(0,(d.delay||0)+deltaMinutes);
  const updates={time:newTime,delay:newDelay};

  if(newDelay>=60){
    updates.status='REPROGRAMADO';
  }else if(d.status&&d.status.indexOf('REPROGRAMADO')===0){
    updates.status='EN ESPERA';
  }

  dref(d.id).update(updates).catch(fail);
  autoDelayNotice(d,newTime,deltaMinutes,newDelay);
  logAction('Demora '+(deltaMinutes>0?'+':'')+deltaMinutes+' min · '+d.destination+' → '+newTime);
}

function editDeparture(d){
  $('dep-id').value=d.id; $('dep-preset-key').value=isCustom(d)?'':(d.presetKey||'');
  $('dep-time').value=d.time; $('dep-destination').value=d.destination;
  $('dep-scales').value=d.scales||''; $('dep-bus').value=d.bus||'';
  const sel=$('dep-status'); sel.value=Array.from(sel.options).some(function(o){return o.value===d.status;})?d.status:'REPROGRAMADO';
  openForm();
}

function resetForm(){
  if($('departure-form'))$('departure-form').reset();
  if($('dep-id'))$('dep-id').value='';
  if($('dep-preset-key'))$('dep-preset-key').value='';
  if($('preset-selector'))$('preset-selector').value='';
}

if($('departure-form')){
  $('departure-form').addEventListener('submit',function(e){
    e.preventDefault(); if(!canWrite())return;
    if(!$('dep-preset-key').value&&!$('dep-id').value&&!confirm('Esta corrida no tiene ruta del catálogo, así que NO tendrá voceo con audio. ¿Guardarla así?'))return;
    ensureMat().then(function(){
      const presetKey = $('dep-preset-key').value;
      const id = $('dep-id').value || presetKey || ('c' + Date.now());
      const old = deps[id];
      let status = $('dep-status').value;
      if(status==='REPROGRAMADO'&&old&&old.status&&old.status.indexOf('REPROGRAMADO')===0)status=old.status;
      return dref(id).set({
        presetKey: presetKey || '',
        time: $('dep-time').value,
        destination: $('dep-destination').value.trim(),
        scales: cleanScales($('dep-scales').value),
        bus: $('dep-bus').value.trim(),
        gate: (old&&old.gate)||'',
        status: status,
        sucursal: suc,
        day: (old&&old.day)||nowParts().key,
        delay: (old&&old.delay)||0
      });
    }).then(function(){ logAction('Guardó salida '+$('dep-time').value+' '+$('dep-destination').value.trim()); resetForm(); }).catch(fail);
  });
}

function refreshPresetOptions(){
  const sel=$('preset-selector'); if(!sel)return;
  const catalog=catalogFor(suc||viewSuc()), cur=sel.value;
  const trunc=function(s,n){s=String(s||'');return s.length>n?s.slice(0,n-1)+'…':s;};
  sel.innerHTML='<option value="">-- Seleccionar ruta del catálogo --</option>'+Object.keys(catalog).sort().map(function(k){
    const r=catalog[k];
    return '<option value="'+esc(k)+'">'+esc(r[0]+' - '+r[1]+(r[2]?' ('+trunc(r[2],46)+')':''))+'</option>';
  }).join('');
  sel.value=(cur&&catalog[cur])?cur:'';
}

if($('preset-selector')){
  $('preset-selector').addEventListener('change',function(e){
    const k=e.target.value, catalog=catalogFor(suc||viewSuc()); if(!catalog[k])return;
    const row=catalog[k];
    $('dep-id').value=k;
    $('dep-preset-key').value=k;
    const ex=deps[k]&&deps[k].day===nowParts().key?deps[k]:null;
    $('dep-time').value=ex?ex.time:row[0];
    $('dep-destination').value=row[1];
    $('dep-scales').value=row[2];
    $('dep-status').value=ex&&ex.status&&Array.from($('dep-status').options).some(function(o){return o.value===ex.status;})?ex.status:'EN ESPERA';
    $('dep-bus').value=ex?(ex.bus||''):'';
    $('dep-bus').focus();
  });
}

if($('btn-load-all'))$('btn-load-all').onclick=function(){if(canWrite()&&confirm('¿Agregar las salidas fijas que falten del catálogo? Las que ya están cargadas hoy conservan su unidad y sus ajustes de hora.'))loadCatalog().then(function(){ logAction('Cargó las salidas del catálogo'); }).catch(fail);};
if($('btn-clear-all'))$('btn-clear-all').onclick=function(){
  if(!canWrite())return;
  if(!confirm('ATENCIÓN: esto eliminará TODAS las corridas de esta sucursal. Esta acción no se puede deshacer desde la pantalla. ¿Tienes un respaldo y deseas continuar?'))return;
  const confirmation=prompt('Para confirmar, escribe BORRAR en mayúsculas:');
  if(confirmation!=='BORRAR') {
    alert('Operación cancelada. No se eliminó ninguna corrida.');
    return;
  }
  const branch=suc||viewSuc();
  const dayToClear=nowParts().key;
  clearedDay=dayToClear; gotCleared=true; deps={}; ready=true;
  try{localStorage.setItem('transpais_offline_deps_'+branch,JSON.stringify({}));}catch(e){}
  render();
  const patch={}; patch[branch+'/deps']=null; patch[branch+'/cleared']=dayToClear;
  db.ref().update(patch).then(function(){ logAction('Limpió la pantalla del día'); }).catch(function(e){fail(e);});
};
if($('btn-reset'))$('btn-reset').onclick=resetForm;

if($('btn-check-audio'))$('btn-check-audio').onclick=async function(){
  const out=$('audio-check-result'), btn=$('btn-check-audio');
  const branch=viewSuc(), folder=(audioBase()||'Audio/')+audioDirOf(branch);
  if(!audioBase()){ out.classList.remove('hidden'); out.textContent='Esta marca no usa voces grabadas: solo suena el tono de aviso.'; return; }
  const modes=['etiq','abord','ultima'], routes=[], units=[];
  Object.keys(CAT).sort().forEach(function(k){ modes.forEach(function(m){ routes.push(k+'_'+m); }); });
  if(CFG.voz.unidad)for(let i=0;i<10;i++)units.push(String(i));
  btn.disabled=true; out.classList.remove('hidden'); out.textContent='Revisando audios…';
  const test=function(f){ return fetch(folder+f+'.mp3',{method:'HEAD',cache:'no-store'}).then(function(r){return r.ok;}).catch(function(){return null;}); };
  try{
    const rr=await Promise.all(routes.map(test)), ur=await Promise.all(units.map(test)), intro=CFG.voz.unidad?await test('unidad'):null;
    if(rr.every(function(x){return x===null;})){ out.textContent='No se pudo revisar (sin conexión o servidor no disponible).'; return; }
    const missR=routes.filter(function(f,i){return rr[i]===false;});
    const name=audioBase()+audioDirOf(branch);
    let html=missR.length?'<div style="color:#f87171;font-weight:800">❌ Faltan '+missR.length+' audios de ruta en '+name+':</div><div>'+esc(missR.map(function(f){return f+'.mp3';}).join(', '))+'</div>'
      :'<div style="color:var(--ok,#00D974);font-weight:800">✅ Están los '+routes.length+' audios de ruta en '+name+'</div>';
    if(CFG.voz.unidad){
      const missU=units.filter(function(f,i){return ur[i]===false;});
      html+=missU.length===units.length?'<div style="color:var(--gold,#FFB800);margin-top:6px">ℹ️ Audios de unidad: aún no hay ninguno (0.mp3 a 9.mp3).</div>'
        :missU.length?'<div style="color:var(--gold,#FFB800);margin-top:6px">⚠️ Faltan dígitos de unidad: '+esc(missU.map(function(f){return f+'.mp3';}).join(', '))+' (si falta un dígito, esa unidad no se dice).</div>'
        :'<div style="color:var(--ok,#00D974);margin-top:6px">✅ Audios de unidad (0 al 9) completos.</div>';
      html+='<div style="color:var(--muted,#93c5fd);margin-top:4px">'+(intro?'🔊 unidad.mp3 encontrado: dirá "Unidad número" antes de los dígitos.':'ℹ️ unidad.mp3 no está (opcional): dirá solo los dígitos.')+'</div>';
    }else{
      html+='<div style="color:var(--muted,#93c5fd);margin-top:6px">El voceo de unidades está desactivado en config.js.</div>';
    }
    out.innerHTML=html;
  }catch(e){ out.textContent='No se pudo revisar.'; }
  finally{ btn.disabled=false; }
};

/* ============ PANTALLA DE ACCESO (inicio de sesión de la terminal) ============ */
function gateOn(){ return document.body.classList.contains('gate-on'); }
function openGate(){
  document.body.classList.add('gate-on');
  const l=$('gate-loading'), f=$('gate-form'), g=$('login-gate');
  if(l)l.classList.add('hidden'); if(f)f.classList.remove('hidden'); if(g)g.classList.remove('hidden');
}
function closeGate(){
  document.body.classList.remove('gate-on');
  const g=$('login-gate'); if(g)g.classList.add('hidden');
  if($('gate-pass'))$('gate-pass').value='';
}
function initGate(){
  if(isTV||isPassenger)return;
  document.body.classList.add('gate-on');
  const g=$('login-gate'); if(g)g.classList.remove('hidden');
  setTimeout(function(){ if(gateOn()&&!canWrite())openGate(); },5000);
}

/* ============ AUTH Y VISTAS ============ */
const sucFromEmail=function(em){const e=(em||'').toLowerCase();const a=CFG.accesos.find(function(x){return x.correo.toLowerCase()===e;});return a?a.sucursal:'of2';};

function accessByEmail(em){ return (CFG.accesos||[]).find(function(x){ return x.correo.toLowerCase()===String(em||'').toLowerCase(); })||null; }
auth.onAuthStateChanged(function(u){
  if(u&&!isTV&&!isPassenger){
    const ac=accessByEmail(u.email);
    if(!ac||(isDueno&&!ac.dueno)||(!isDueno&&ac.dueno)){   /* cuenta sin acceso, o cuenta del dueño fuera de su vista */
      loginRejected=true; auth.signOut();
      const ge=$('gate-error'); if(ge){ ge.textContent=!ac?'❌ Esta cuenta no tiene acceso':(isDueno?'❌ Esta vista es solo para el dueño':'❌ La cuenta del dueño entra por su propia vista'); ge.classList.remove('hidden'); }
      return;
    }
    if(isDueno){ closeGate(); showDueno(); return; }
  }
  const prev=viewSuc();
  suc=(u&&!isTV&&!isPassenger)?sucFromEmail(u.email):null;

  if($('btn-logout')){
    $('btn-logout').classList.toggle('hidden', !u || isTV || isPassenger);
  }

  if(viewSuc()!==prev)attach(viewSuc());
  updateHeaderTitles(); refreshPresetOptions(); renderAds(); renderUrgentMsg(); render(); autoCatalog();
  resetInactivityTimer();
  if(!isTV&&!isPassenger){ if(u){ closeGate(); switchTab('admin'); } else openGate(); }
});

function switchTab(tab){
  if(isDueno)return;
  if(tab==='admin'&&!canWrite())return;
  if($('adm-tabs'))$('adm-tabs').classList.toggle('hidden',tab!=='admin');
  if($('view-screen'))$('view-screen').classList.toggle('hidden',tab!=='screen');
  if($('view-admin'))$('view-admin').classList.toggle('hidden',tab!=='admin');
  if($('btn-tab-screen'))$('btn-tab-screen').className='btn '+(tab==='screen'?'btn-green':'btn-dark');
  if($('btn-tab-admin'))$('btn-tab-admin').className='btn '+(tab==='admin'?'btn-green':'btn-dark');
  render();
}

function openPin(){
  if(canWrite())return switchTab('admin');
  if($('login-user-input'))$('login-user-input').value='';
  if($('login-pass-input'))$('login-pass-input').value='';
  if($('pin-error-msg'))$('pin-error-msg').classList.add('hidden');
  if($('pin-modal-overlay'))$('pin-modal-overlay').classList.remove('hidden');
  if($('login-user-input'))$('login-user-input').focus();
}

function doLogin(){
  const gate=gateOn();
  const uEl=$(gate?'gate-user':'login-user-input'), pEl=$(gate?'gate-pass':'login-pass-input'), errEl=$(gate?'gate-error':'pin-error-msg');
  if(gate){ try{ if(window.unlockAudio)window.unlockAudio(); }catch(e){} }
  const u=uEl.value.trim().toLowerCase(), p=pEl.value.trim();
  if(errEl)errEl.classList.add('hidden');
  if(gate&&errEl)errEl.textContent='❌ Usuario o contraseña incorrectos';
  if(!u||!p){ if(errEl)errEl.classList.remove('hidden'); return; }
  let em=u;
  if(!u.includes('@')){const a=CFG.accesos.find(function(x){return x.usuario.toLowerCase()===u;}); if(a)em=a.correo;}
  const btn=$(gate?'gate-btn':'btn-login-ok'); if(btn)btn.disabled=true;
  loginRejected=false;
  auth.signInWithEmailAndPassword(em,p).then(function(){
    if(loginRejected){ loginRejected=false; return; }   /* la cuenta no tiene acceso a esta vista: ya se cerró su sesión */
    suc=sucFromEmail(em);
    try{ const ax=accessOf(suc); if(ax&&!ax.elegirMarca&&marcaDb!==ax.marca)db.ref(suc+'/marca').set({id:ax.marca}).catch(function(){}); }catch(e){}
    if($('pin-modal-overlay'))$('pin-modal-overlay').classList.add('hidden');
    closeGate();
    if(viewSuc()!==(suc))attach(viewSuc());
    updateHeaderTitles(); switchTab('admin');
  }).catch(function(err){
    console.error('Auth:',err.message);
    if(errEl)errEl.classList.remove('hidden');
  }).then(function(){ if(btn)btn.disabled=false; });
}

function doLogout(force){
  if(force===true||confirm('¿Deseas cerrar la sesión de taquilla?')){
    auth.signOut().then(function(){
      suc=null;
      switchTab('screen');
      updateHeaderTitles();
      openGate();
    }).catch(fail);
  }
}

if($('btn-tab-screen')) $('btn-tab-screen').onclick = function(){ switchTab('screen'); };
if($('btn-tab-admin')) $('btn-tab-admin').onclick = function(){ openPin(); };
if($('btn-logout')) $('btn-logout').onclick = function(){ doLogout(false); };
if($('btn-panic')) $('btn-panic').onclick = function(){ panicStop(); };
if($('btn-mute-local')) $('btn-mute-local').onclick = function(){
  muted = !muted;
  localStorage.setItem('transpais_local_muted', muted ? 'true' : 'false');
  updateMuteUI();
};
if($('btn-chime')) $('btn-chime').onclick = function(){ chime(); };

if($('btn-login-ok')) $('btn-login-ok').onclick = function(){ doLogin(); };
if($('btn-login-cancel')) $('btn-login-cancel').onclick = function(){
  if($('pin-modal-overlay')) $('pin-modal-overlay').classList.add('hidden');
};
if($('login-pass-input')) $('login-pass-input').onkeyup = function(e){
  if(e.key === 'Enter') doLogin();
};
if($('gate-btn')) $('gate-btn').onclick = function(){ doLogin(); };
['gate-user','gate-pass'].forEach(function(id){ if($(id)) $(id).onkeyup = function(e){ if(e.key === 'Enter') doLogin(); }; });

/* ============ TEMAS (clásico, noche, alto contraste, temporadas) ============ */
const THEME_KEYS=['--bg','--accent','--ok','--gold','--muted','--navy','--text'];
function seasonNow(){
  const md=nowParts().key.slice(5), list=CFG.temporadas||[];
  for(let i=0;i<list.length;i++){
    const s=list[i], inRange=s.desde<=s.hasta?(md>=s.desde&&md<=s.hasta):(md>=s.desde||md<=s.hasta);
    if(inRange)return s;
  }
  return null;
}
function effectiveTheme(){
  const cfgT=CFG.tema||{};
  let stored=null; try{ stored=localStorage.getItem('transpais_theme_mode'); }catch(e){}
  const mode=themeMode||stored||cfgT.modoInicial||'auto';
  let name=mode, season=null;
  if(mode==='auto'){
    const n=nowParts(), ini=(cfgT.inicioNoche==null?22:cfgT.inicioNoche)*60, fin=(cfgT.finNoche==null?6:cfgT.finNoche)*60;
    name=(n.min>=ini||n.min<fin)?'noche':'clasico';
    season=seasonNow();
  }
  return {mode:mode,name:name,season:season};
}
const THEME_DEF={'--bg':'#000B18','--accent':'#00A859','--ok':'#00D974','--gold':'#FFB800','--muted':'#93c5fd','--navy':'#002A5C','--text':'#ffffff'};
function scaleHex(h,f){
  const m=/^#?([0-9a-f]{6})$/i.exec(h); if(!m)return h;
  const n=parseInt(m[1],16);
  return '#'+[(n>>16)&255,(n>>8)&255,n&255].map(function(x){ return ('0'+Math.max(0,Math.min(255,Math.round(x*f))).toString(16)).slice(-2); }).join('');
}
function nightify(v){ const o={}; Object.keys(v).forEach(function(k){ o[k]=k==='--text'?'#d7e3f4':scaleHex(v[k],k==='--bg'?0.55:0.82); }); return o; }
function themeVars(t){
  const pal=brandPalette||{}, T=CFG.temas||{};
  let vars;
  if(t.name==='noche') vars=Object.keys(pal).length?nightify(Object.assign({},THEME_DEF,pal)):Object.assign({},T.noche||{});
  else if(t.name==='contraste'){ vars=Object.assign({},T.contraste||{}); if(pal['--accent'])vars['--accent']=pal['--accent']; }
  else vars=Object.assign({},pal,T[t.name]||{});
  if(t.season&&t.season.vars)Object.assign(vars,t.season.vars);
  return vars;
}
function applyTheme(){
  const t=effectiveTheme(), root=document.documentElement, vars=themeVars(t);
  THEME_KEYS.forEach(function(k){ root.style.removeProperty(k); });
  Object.keys(vars).forEach(function(k){ root.style.setProperty(k,vars[k]); });
  ['clasico','noche','contraste'].forEach(function(x){ document.body.classList.toggle('theme-'+x,x===t.name); });
  themeSeason=t.season;
  const sel=$('theme-select'); if(sel&&sel.value!==t.mode)sel.value=t.mode;
}
/* ---- Marca e identidad (nombre, logo, textos y paleta) ---- */
const urlBrand=(function(){ try{ return new URLSearchParams(location.search).get('marca'); }catch(e){ return null; } })();
/* Marca asignada a la empresa de la sucursal que se está viendo (null = libre) */
function accessOf(s){ return (CFG.accesos||[]).find(function(x){return x.sucursal===s&&x.marca;})||null; }
function fixedBrand(){ const x=accessOf(viewSuc()); return x&&!x.elegirMarca?x.marca:null; }
function effectiveBrandId(){
  const M=CFG.marcas||{}, pick=function(id){ return id&&M[id]?id:null; };
  const isDemo=/[?&]demo(=1|=true)?(&|$)/.test(location.search);
  let stored=null; try{ stored=localStorage.getItem('fids_marca'); }catch(e){}
  if(isDemo)return pick(urlBrand)||pick(marcaDb)||pick('generico')||'transpais';
  const fx=fixedBrand(); if(fx&&pick(fx))return pick(urlBrand)||fx;
  return pick(urlBrand)||pick(marcaDb)||pick(stored)||pick(CFG.marcaInicial)||'transpais';
}
function applyBrand(id){
  const M=CFG.marcas||{}, m=M[id]||{};
  Object.keys(CFG.cliente).forEach(function(k){ delete CFG.cliente[k]; });
  Object.assign(CFG.cliente,BASE.cliente,m.cliente||{});
  Object.keys(CFG.sucursales).forEach(function(b){ Object.assign(CFG.sucursales[b],BASE.suc[b],(m.sucursales||{})[b]||{}); });
  CFG.audioBase=(m.audioBase!==undefined)?m.audioBase:BASE.audioBase;
  brandId=M[id]?id:'transpais'; brandPalette=m.paleta||{};
  refreshBrandUI();
}
function refreshBrandUI(){
  document.title=(isPassenger&&vistaInfo&&vistaInfo.app)?CFG.cliente.nombre+' · Pasajero':CFG.cliente.tituloPagina;
  const M=CFG.marcas||{}, ml=document.querySelector('link[rel="manifest"]');
  if(ml)ml.setAttribute('href',(vistaInfo&&vistaInfo.manifest)||(M[brandId]&&M[brandId].manifest)||'manifest.json');
  if($('gate-brand'))$('gate-brand').textContent=CFG.cliente.marca;
  if($('gate-logo'))$('gate-logo').innerHTML=CFG.cliente.logo?'<img src="'+esc(CFG.cliente.logo)+'" alt="">':'';
  if($('gate-foot'))$('gate-foot').textContent=CFG.cliente.nombre+' · v'+APP_VERSION;
  const bs=$('brand-select'), locked=!!fixedBrand();
  if(bs&&bs.previousElementSibling&&bs.previousElementSibling.tagName==='LABEL')bs.previousElementSibling.hidden=locked;
  if(bs)bs.hidden=locked;
  if(bs){ bs.innerHTML=Object.keys(M).map(function(k){ return '<option value="'+esc(k)+'">'+esc(M[k].nombre||k)+'</option>'; }).join(''); bs.value=brandId; }
  updateHeaderTitles();
  tickNormalHtml=''; if(!lcActive)setTickerNormal();
  applyTheme();
  try{ render(); }catch(e){}
}
if($('brand-select'))$('brand-select').onchange=function(e){
  if(!canWrite()){ alert('Inicia sesión de taquilla para cambiar la marca.'); e.target.value=brandId; return; }
  if(fixedBrand()){ e.target.value=brandId; return; }
  const v=e.target.value, nm=((CFG.marcas||{})[v]||{}).nombre||v;
  db.ref(suc+'/marca').set({id:v}).then(function(){
    logAction('Marca e identidad: '+nm);
    if(urlBrand)alert('Esta pestaña está forzada por el enlace (?marca='+urlBrand+'). El cambio se guardó para las TVs y pasajeros.');
  }).catch(fail);
};
if($('theme-select'))$('theme-select').onchange=function(e){
  if(!canWrite()){ alert('Inicia sesión de taquilla para cambiar el tema.'); e.target.value=effectiveTheme().mode; return; }
  const v=e.target.value;
  db.ref(suc+'/theme').set({mode:v}).then(function(){ logAction('Tema de pantalla: '+v); }).catch(fail);
};

function logAction(){}
function renderLog(){}

/* ============ AVISOS PROGRAMADOS ============ */
function hm(s){ const p=String(s).split(':'); return (+p[0])*60+(+p[1]); }
function weekdayOf(key){ return new Date(key+'T12:00:00Z').getUTCDay(); }
function avisoActive(a,n){
  if(!a||a.activo===false||!a.text||!/^\d{2}:\d{2}$/.test(a.desde)||!/^\d{2}:\d{2}$/.test(a.hasta))return false;
  const f=hm(a.desde), t=hm(a.hasta), days=String(a.dias||'0123456'), wd=weekdayOf(n.key), yd=(wd+6)%7, m=n.min;
  if(f<=t)return m>=f&&m<t&&days.indexOf(String(wd))!==-1;
  return (m>=f&&days.indexOf(String(wd))!==-1)||(m<t&&days.indexOf(String(yd))!==-1);
}
function activeAvisos(){
  const n=nowParts();
  return Object.keys(avisosData).sort().map(function(k){return avisosData[k];}).filter(function(a){return avisoActive(a,n);});
}
const AV_DN=['D','L','M','M','J','V','S'];
function renderAvisos(){
  const box=$('av-list'); if(!box)return;
  const n=nowParts(), ids=Object.keys(avisosData).sort();
  box.innerHTML=ids.length?ids.map(function(id){
    const a=avisosData[id]||{}, days=String(a.dias||'0123456');
    const dn=[1,2,3,4,5,6,0].map(function(d){return days.indexOf(String(d))!==-1?AV_DN[d]:'·';}).join(' ');
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid rgba(255,255,255,.08)">'+
      '<div><div style="font-weight:800">'+(a.activo===false?'⚪':'🟢')+' '+esc(a.text)+'</div>'+
      '<div style="font-size:11px;color:var(--muted,#93c5fd)">'+esc(a.desde)+' – '+esc(a.hasta)+' · '+dn+(avisoActive(a,n)?' · <span style="color:var(--ok,#00D974)">saliendo ahora</span>':'')+'</div></div>'+
      '<div style="display:flex;gap:6px"><button type="button" class="btn btn-dark" data-avtoggle="'+esc(id)+'" style="padding:6px 10px;font-size:10px">'+(a.activo===false?'Activar':'Pausar')+'</button>'+
      '<button type="button" class="btn btn-dark" data-avdel="'+esc(id)+'" style="padding:6px 10px;font-size:10px">🗑️</button></div></div>';
  }).join(''):'<div style="color:var(--muted,#93c5fd)">Sin avisos programados.</div>';
}
[0,1,2,3,4,5,6].forEach(function(d){ const b=$('av-d'+d); if(b)b.onclick=function(){ b.classList.toggle('on'); }; });
if($('btn-av-save'))$('btn-av-save').onclick=function(){
  if(!canWrite()){ alert('Inicia sesión de taquilla para programar avisos.'); return; }
  const text=$('av-text').value.trim(), from=$('av-from').value, to=$('av-to').value;
  const days=[0,1,2,3,4,5,6].filter(function(d){ const b=$('av-d'+d); return b&&b.classList.contains('on'); }).join('');
  if(!text){ alert('Escribe el texto del aviso.'); return; }
  if(!/^\d{2}:\d{2}$/.test(from)||!/^\d{2}:\d{2}$/.test(to)||from===to){ alert('Elige una hora de inicio y una de fin distintas.'); return; }
  if(!days){ alert('Elige al menos un día.'); return; }
  if(Object.keys(avisosData).length>=20){ alert('Ya hay 20 avisos programados. Elimina alguno primero.'); return; }
  const ref=db.ref(suc+'/avisos').push();
  ref.set({text:text,desde:from,hasta:to,dias:days,activo:true}).then(function(){
    logAction('Aviso programado: '+text.slice(0,60)+' ('+from+'–'+to+')'); $('av-text').value='';
  }).catch(fail);
};
document.addEventListener('click',function(e){
  const t=e.target.closest&&e.target.closest('[data-avtoggle]'), d=e.target.closest&&e.target.closest('[data-avdel]');
  if((!t&&!d)||!canWrite())return;
  if(t){ const id=t.dataset.avtoggle, a=avisosData[id]||{}; db.ref(suc+'/avisos/'+id).update({activo:a.activo===false}).then(function(){ logAction((a.activo===false?'Activó':'Pausó')+' aviso programado: '+String(a.text||'').slice(0,50)); }).catch(fail); }
  else{ const id=d.dataset.avdel, a=avisosData[id]||{}; db.ref(suc+'/avisos/'+id).remove().then(function(){ logAction('Eliminó aviso programado: '+String(a.text||'').slice(0,50)); }).catch(fail); }
});

/* ============ ESTADO DE TVs (cada TV avisa cada minuto que sigue viva) ============ */
const TV_ID=(function(){
  try{
    let id=localStorage.getItem('transpais_tv_id');
    if(!id){ id='tv'+Math.random().toString(36).slice(2,8); localStorage.setItem('transpais_tv_id',id); }
    return id;
  }catch(e){ return 'tv'+Math.random().toString(36).slice(2,8); }
})();
function tvBeat(){
  if(!isTV||isGeneral||!gotServer)return;
  db.ref(viewSuc()+'/tvs/'+TV_ID).set({ts:firebase.database.ServerValue.TIMESTAMP,view:vista,ver:String(APP_VERSION),audio:!!(actx&&actx.state==='running'),drift:Math.round(srvOff/1000)}).catch(function(){});
}
if(isTV){ setTimeout(tvBeat,8000); setInterval(tvBeat,60000); }

function ageText(ms){
  const s=Math.round(ms/1000);
  if(s<90)return 'hace '+s+' s';
  const m=Math.round(s/60); if(m<90)return 'hace '+m+' min';
  const h=Math.round(m/60); if(h<48)return 'hace '+h+' h';
  return 'hace '+Math.round(h/24)+' días';
}
function renderTvStatus(){
  const box=$('tv-status-list'); if(!box)return;
  const now=Date.now()+srvOff, rows=[]; let down=0, warn=0;
  Object.keys(tvsData).forEach(function(id){
    const t=tvsData[id]; if(!t||!t.ts)return;
    const age=now-t.ts; if(age>7*86400000)return;
    const ok=age<=150000; if(!ok)down++;
    const notes=[];
    if(ok&&t.audio===false)notes.push('🔇 Audio bloqueado: toca la pantalla de la TV');
    if(ok&&Math.abs(t.drift||0)>120)notes.push('⏰ Reloj desfasado '+Math.round(Math.abs(t.drift)/60)+' min');
    if(notes.length)warn++;
    const nm=t.view==='tvcentral'?CFG.sucursales.central.titulo:t.view==='tvof2'?CFG.sucursales.of2.titulo:(((CFG.vistas||{})[t.view]||{}).nombre||'TV');
    rows.push({id:id,name:nm,age:age,ok:ok,ver:t.ver||'',notes:notes});
  });
  rows.sort(function(a,b){return a.name<b.name?-1:a.name>b.name?1:a.age-b.age;});
  box.innerHTML=rows.length?rows.map(function(r){
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid rgba(255,255,255,.08)">'+
      '<div>'+(r.ok?(r.notes.length?'🟡':'🟢'):'🔴')+' <strong>'+esc(r.name)+'</strong> <span style="color:var(--muted,#93c5fd);font-size:10px">'+esc(r.id)+(r.ver?' · v'+esc(r.ver):'')+'</span>'+
      '<div style="font-size:11px;color:'+(r.ok?'var(--ok,#00D974)':'#f87171')+'">'+(r.ok?'Conectada':'Sin señal')+' · '+ageText(r.age)+'</div>'+
      r.notes.map(function(n){return '<div style="font-size:11px;color:var(--gold,#FFB800)">'+esc(n)+'</div>';}).join('')+'</div>'+
      '<button type="button" class="btn btn-dark" data-tvdel="'+esc(r.id)+'" style="padding:6px 10px;font-size:10px">Quitar</button></div>';
  }).join(''):'<div style="color:var(--muted,#93c5fd)">Aún no reporta ninguna TV. Aparecen solas al abrir la TV con esta versión.</div>';
  const t=$('tv-status-title');
  if(t){ t.textContent=down?'⚠️ '+down+' TV SIN SEÑAL':warn?'⚠️ REVISAR TVs ('+warn+')':'📺 ESTADO DE TVs'; t.style.color=down?'#f87171':warn?'var(--gold,#FFB800)':'var(--muted,#93c5fd)'; }
  const bd=$('tv-alert-badge');
  if(bd){
    if(down||warn){
      bd.textContent=down?'⚠️ '+down+' TV sin señal':'⚠️ '+warn+' TV con aviso';
      bd.style.background=down?'rgba(220,38,38,.25)':'rgba(255,184,0,.2)'; bd.style.color=down?'#f87171':'var(--gold,#FFB800)';
      bd.classList.remove('hidden');
    }else bd.classList.add('hidden');
  }
}
document.addEventListener('click',function(e){
  const b=e.target.closest&&e.target.closest('[data-tvdel]');
  if(!b||!canWrite())return;
  db.ref(suc+'/tvs/'+b.dataset.tvdel).remove().catch(fail);
});
setInterval(renderTvStatus,10000);

function showToast(msg){
  const t=$('tv-toast'); if(!t)return;
  t.textContent=msg; t.classList.remove('hidden');
  clearTimeout(showToast._t); showToast._t=setTimeout(function(){ t.classList.add('hidden'); },4000);
}
if($('btn-test-tv'))$('btn-test-tv').onclick=function(){
  if(!canWrite()){ alert('Inicia sesión de taquilla para probar el sonido de la TV.'); return; }
  db.ref(suc+'/ping').set({ts:firebase.database.ServerValue.TIMESTAMP}).then(function(){ showToast('Prueba enviada a las TVs de esta sucursal'); try{ localStorage.setItem('vialtis_snd_day',nowParts().key); }catch(e){} render(); logAction('Prueba de sonido en TV'); }).catch(fail);
};
if(isTV&&navigator.wakeLock){
  const wl=function(){ try{ navigator.wakeLock.request('screen').catch(function(){}); }catch(e){} };
  wl(); document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='visible')wl(); });
}


if(isGeneral){ document.body.classList.add('general-mode'); muted=true; initGeneral(); }
else if(isPairing){ document.body.classList.add('pair-mode'); muted=true; initPairing(); }
else if(isDueno){ document.body.classList.add('dueno-mode'); muted=true; }
else { if(isAnden){ document.body.classList.add('anden-mode'); muted=true; } attach(viewSuc()); }
updateHeaderTitles();
refreshPresetOptions();
updateMuteUI();
applyBrand(effectiveBrandId());
initGate();
renderUrgentMsg();
render();


/* =====================================================================
   V17 · VIALTIS — copiloto, clima y automatizaciones
   ===================================================================== */
var VK={dem:'vialtis_auto_demora',cat:'vialtis_auto_catalogo',wx:'vialtis_clima'};
function vOn(k){ try{ return localStorage.getItem(k)!=='0'; }catch(e){ return true; } }
function vSet(k,v){ try{ localStorage.setItem(k,v?'1':'0'); }catch(e){} }

/* Clima del destino (Open-Meteo, sin llave). Si no hay internet simplemente no se muestra. */
var wxCache={};
function wxCoord(n){ const L=CFG.lugares||{}; n=String(n||'').trim(); return L[n]||L[n.replace(/^Ciudad /,'')]||L['Ciudad '+n]||L[n.split(' - ')[0]]||null; }
function wxIcon(c){ if(c===0)return '☀️'; if(c<=2)return '⛅'; if(c===3)return '☁️'; if(c<=48)return '🌫️'; if(c<=57)return '🌦️'; if(c<=67)return '🌧️'; if(c<=77)return '❄️'; if(c<=82)return '🌧️'; if(c<=86)return '❄️'; return '⛈️'; }
function wxChip(name){
  if(!VK||!wxCache||!vOn(VK.wx))return '';
  const p=wxCoord(name); if(!p)return '';
  const key=p.join(','), w=wxCache[key];
  if(!w||(!w.busy&&Date.now()-w.ts>1800000))wxLoad(key,p);
  return w&&w.t!=null?'<span class="wx">'+wxIcon(w.c)+' '+Math.round(w.t)+'°C</span>':'';
}
function wxLoad(key,p){
  const prev=wxCache[key]||{};
  wxCache[key]={t:prev.t,c:prev.c,ts:prev.ts||0,busy:true};
  fetch('https://api.open-meteo.com/v1/forecast?latitude='+p[0]+'&longitude='+p[1]+'&current=temperature_2m,weather_code')
    .then(function(r){return r.json();})
    .then(function(j){
      if(j&&j.current)wxCache[key]={t:j.current.temperature_2m,c:j.current.weather_code,ts:Date.now()};
      else wxCache[key]={t:prev.t,c:prev.c,ts:Date.now()-1500000};
      clearTimeout(wxLoad._t); wxLoad._t=setTimeout(function(){ stripHtml=''; try{render();}catch(e){} },500);
    })
    .catch(function(){ wxCache[key]={t:prev.t,c:prev.c,ts:Date.now()-1500000}; });
}

/* Auto-aviso: si una salida se retrasa 10 min o más, la TV avisa sola. */
function autoDelayNotice(d,newTime,delta,newDelay){
  if(!canWrite()||!vOn(VK.dem)||delta<=0||newDelay<10)return;
  const msg='⏱️ La salida de las '+d.time+' a '+d.destination+' se reprograma para las '+newTime+'. Disculpe las molestias.';
  db.ref(suc+'/urgent').set({text:msg,day:nowParts().key,ts:Date.now()+srvOff}).then(function(){ showToast('🤖 Aviso de demora publicado en TV'); }).catch(function(){});
}

/* Copiloto: resumen y sugerencias en el panel de taquilla */
function copilotRender(list){
  const el=$('copilot-body'); if(!el||!canWrite())return;
  const soon=list.filter(function(d){return d._st!=='SALIDO'&&d._diff>=0&&d._diff<=60;});
  const miss=list.filter(function(d){return d._needsBus;});
  const now=Date.now()+srvOff; let tvDown=0;
  Object.keys(tvsData||{}).forEach(function(k){ const t=tvsData[k]; if(t&&t.ts&&now-t.ts<=7*86400000&&now-t.ts>150000)tvDown++; });
  const nn=nowParts(), tod=Object.keys(deps).map(function(k){return deps[k];}).filter(function(d){return d&&d.day===nn.key&&d.time;});
  const sal=tod.filter(function(d){return diffOf(d,nn)<0;}), pun=sal.filter(function(d){return !(d.delay>0);});
  const pct=sal.length?Math.round(pun.length*100/sal.length)+'%':'—';
  const nxt=list.find(function(d){return d._st!=='SALIDO'&&d._diff>=0;});
  const kp=function(ic,v,l,bad){ return '<div class="cp-kpi'+(bad?' bad':'')+'"><div class="cp-ic">'+ic+'</div><div class="cp-v">'+v+'</div><div class="cp-l">'+l+'</div></div>'; };
  let html='<div class="cp-kpis">'+kp('🕐',soon.length,'salidas próx. 60 min')+kp('🚌',miss.length,'sin unidad',miss.length>0)+kp('📺',tvDown,'TV sin señal',tvDown>0)+kp('✅',pct,'puntualidad hoy')+'</div>';
  const tips=[];
  list.filter(function(d){return d._st!=='SALIDO'&&d._diff>=0&&d._diff<=30&&d.delay>0;}).slice(0,2).forEach(function(d){
    tips.push('<div class="cp-tip">⏱️ <b>'+esc(d.time)+' '+esc(d.destination)+'</b> lleva '+d.delay+' min de demora.<button class="btn btn-dark" data-cpmsg="'+esc('⏱️ La salida a '+d.destination+' sale con '+d.delay+' minutos de demora. Disculpe las molestias.')+'">📢 Avisar</button></div>');
  });
  if(miss.length)tips.push('<div class="cp-tip warn">🚌 Captura la unidad de: '+miss.slice(0,3).map(function(d){return esc(d.time+' '+d.destination);}).join(' · ')+'</div>');
  if(tvDown)tips.push('<div class="cp-tip warn">📺 Revisa la energía o el internet de '+tvDown+' TV.</div>');
  if(nxt&&nxt._diff<=30&&nxt.bus)tips.push('<div class="cp-tip ok">➡️ Siguiente: <b>'+esc(nxt.time+' '+nxt.destination)+'</b> · unidad '+esc(nxt.bus)+' · en '+nxt._diff+' min</div>');
  if(!tips.length)tips.push('<div class="cp-tip ok">✅ Todo en orden. El copiloto vigila unidades, demoras y TVs.</div>');
  html+=tips.join('');
  if(el._h!==html){ el.innerHTML=html; el._h=html; }
}
document.addEventListener('click',function(e){
  const b=e.target.closest&&e.target.closest('[data-cpmsg]'); if(!b||!canWrite())return;
  db.ref(suc+'/urgent').set({text:b.dataset.cpmsg,day:nowParts().key,ts:Date.now()+srvOff}).then(function(){ showToast('📢 Aviso publicado'); }).catch(fail);
});
var _rx=renderExtras;
renderExtras=function(list,c){ _rx(list,c); try{ copilotRender(list); }catch(e){} };

/* Interruptores del copiloto */
[['vx-dem',VK.dem],['vx-cat',VK.cat],['vx-wx',VK.wx]].forEach(function(p){
  const el=$(p[0]); if(!el)return;
  el.checked=vOn(p[1]);
  el.onchange=function(){ vSet(p[1],el.checked); if(p[1]===VK.wx){ stripHtml=''; try{render();}catch(e){} } };
});

/* Secciones del panel: abiertas en escritorio; en teléfono solo las principales */
(function(){
  const wide=window.innerWidth>768;
  document.querySelectorAll('#view-admin details.adm-sec').forEach(function(d){ if(d.hasAttribute('data-open'))d.open=true; });
})();
var _ed=editDeparture;
editDeparture=function(d){
  const s=$('sec-form'); if(s)s.open=true;
  _ed(d);
  if(s)setTimeout(function(){ s.scrollIntoView({behavior:'smooth',block:'start'}); },60);
};

/* Operación guiada (v18): usa exclusivamente los campos existentes de cada corrida. */
(function guidedOperations(){
  const style=document.createElement('style');
  style.textContent=`
    #vialtis-guided{margin:12px 0}.vg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
    .vg-card{background:linear-gradient(145deg,var(--navy,#10374a),var(--bg,#061421));border:1px solid #ffffff26;border-radius:20px;padding:18px;min-width:0}
    .vg-card h3{font-size:21px;margin:8px 0;overflow-wrap:anywhere}.vg-top{display:flex;justify-content:space-between;gap:8px;align-items:center}.vg-time{font-size:28px;font-weight:900}
    .vg-meta{color:var(--muted);margin:10px 0}.vg-actions{display:flex;flex-wrap:wrap;gap:8px}.vg-actions button{min-height:46px;flex:1;padding:10px;border-radius:12px}
    .vg-flow{display:flex;gap:5px;margin:14px 0}.vg-flow span{height:5px;flex:1;background:#ffffff25;border-radius:8px}.vg-flow .done{background:var(--accent,#14b8a6)}
    #vialtis-hero{flex-shrink:0;margin:8px 0;border:2px solid var(--accent,#14b8a6);border-radius:22px;padding:18px 24px;background:linear-gradient(120deg,var(--navy),var(--bg));overflow:hidden}
    #vialtis-hero h2{font-size:clamp(28px,4vw,68px);margin:6px 0;line-height:1.08}#vialtis-hero .vh-meta{font-size:clamp(20px,2.5vw,40px);font-weight:800}
    .vh-road{height:34px;border-bottom:2px dashed #ffffff50;position:relative;margin-top:8px}.vh-bus{position:absolute;font-size:28px;animation:vg-drive 12s linear infinite}
    @keyframes vg-drive{from{left:-45px}to{left:100%}}
    #vialtis-stale{background:#713f12;color:#fef3c7;padding:10px 16px;font-weight:800;text-align:center;position:relative;z-index:20}
    @media(max-width:768px){#view-admin{padding:12px!important;box-sizing:border-box;max-width:100%}#view-admin input,#view-admin select{font-size:16px!important;max-width:100%;box-sizing:border-box}#view-admin .btn{min-height:44px}#view-admin details{min-width:0}#view-admin table{display:block;overflow-x:auto;max-width:100%}.vg-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
  const stages=['EN ESPERA','ETIQUETANDO PASAJE','EN ABORDAJE','ÚLTIMA LLAMADA','SALIDO'];
  const labels=['Documentar equipaje','Comenzar abordaje','Última llamada','Cerrar salida'];
  let connected=false, rotation=0, busy=false;
  function mount(id,parent){
    let el=$(id); if(!el&&parent){el=document.createElement('section');el.id=id;parent.prepend(el);}return el;
  }
  function drawShiftCheck(list){
    const el=$('shift-check'); if(!el)return;
    if(!canWrite()||isTV){ el.classList.add('hidden'); return; }
    const n=nowParts(), hasDay=Object.keys(deps).some(function(k){ return deps[k]&&deps[k].day===n.key; });
    const missing=list.filter(function(d){ return d._st!=='SALIDO'&&d._diff>=0&&d._diff<=90&&!d.bus&&d.presetKey&&!isCustom(d); });
    const tvOk=Object.keys(tvsData).some(function(k){ const t=tvsData[k]; return t&&t.ts&&(Date.now()+srvOff-t.ts)<=150000; });
    let snd=''; try{ snd=localStorage.getItem('vialtis_snd_day')||''; }catch(e){}
    const items=[
      {ok:connected,t:'Conexión con el servidor'},
      {ok:hasDay,t:'Itinerario del día cargado',fix:['Cargar','load']},
      {ok:!missing.length,t:missing.length?missing.length+' salida(s) sin unidad en la próxima hora y media':'Unidades capturadas',fix:missing.length?['Ver','units']:null},
      {ok:tvOk,t:'TV conectada'},
      {ok:snd===n.key,t:'Sonido de TV probado hoy',fix:['Probar','sound']}
    ];
    if(chequeoData&&chequeoData.fecha===n.key)items.push({ok:!!chequeoData.ok,t:'Autochequeo de las '+chequeoData.hora+(chequeoData.ok?'':': '+asArr(chequeoData.problemas).join('; '))});
    const done=items.filter(function(i){return i.ok;}).length;
    const html=done===items.length?'<div class="sc-ok">✅ Turno listo · todo en orden</div>'
      :'<div class="sc-head">✅ Apertura de turno <b>'+done+' de '+items.length+'</b></div>'+items.map(function(i){
        return '<div class="sc-item '+(i.ok?'ok':'no')+'"><span>'+(i.ok?'✔':'○')+' '+esc(i.t)+'</span>'+(!i.ok&&i.fix?'<button type="button" class="btn btn-dark" data-sc="'+i.fix[1]+'">'+i.fix[0]+'</button>':'')+'</div>';
      }).join('');
    if(el._h!==html){ el.innerHTML=html; el._h=html; }
    el.classList.remove('hidden');
  }
  function draw(){
    const list=ready?buildList(nowParts()):[];
    drawShiftCheck(list);
    beepIfMissing(list);
    const admin=$('view-admin');
    const panel=$('vialtis-guided')||(function(){ const el=document.createElement('section'); el.id='vialtis-guided'; ($('vialtis-guided-slot')||admin).appendChild(el); return el; })();
    if(panel){
      panel.hidden=!canWrite();
      const active=list.filter(function(d){return d._st!=='SALIDO';});
      const html='<h2>Operación guiada</h2><div class="vg-grid">'+active.map(function(d){
        const idx=Math.max(0,stages.indexOf(d.status));
        const button=function(action,label){return '<button type="button" class="btn btn-dark" data-vg="'+action+'" data-key="'+esc(d._k)+'">'+label+'</button>';};
        const late=d._diff>=0&&d._diff<=15&&!d.bus;
        const chip=function(ok,t){return '<span class="vg-chip '+(ok?'ok':'no')+'">'+(ok?'✔ ':'○ ')+t+'</span>';};
        const light=chip(!!d.bus,'Unidad')+chip(idx>=1,'Equipaje')+chip(idx>=2,'Abordaje');
        return '<article class="vg-card'+(late?' vg-alert':'')+(d.bus&&idx>=2?' vg-ready':'')+'"><div class="vg-top"><span class="vg-time">'+esc(d.time)+'</span>'+badge(d._st)+'</div><h3>'+esc(d.destination)+'</h3><div class="vg-meta">🚌 '+esc(d.bus||'Unidad pendiente')+' · 📍 '+esc(d.gate||CFG.sucursales[viewSuc()].puntoAbordaje)+'</div>'+(late?'<div class="vg-warn">⚠️ Sale en '+d._diff+' min y no tiene unidad</div>':'')+'<div class="vg-lights">'+light+'</div>'+(d.delay>0?'<div class="vg-meta">⏱ Retraso +'+d.delay+' min'+(d.motivo?' · '+esc(d.motivo):'')+'</div>':'')+'<div class="vg-flow" aria-label="Etapas confirmadas">'+stages.slice(1).map(function(_,i){return '<span class="'+(idx>i?'done':'')+'"></span>';}).join('')+'</div><div class="vg-actions">'+button('bus',d.bus?'Cambiar unidad':'Asignar unidad')+button('gate','Andén')+button('next',labels[Math.min(idx,3)])+button('delay','Retraso +15')+button('edit','Corregir / editar')+'</div></article>';
      }).join('')+'</div>'+(active.length?'':'<p>No hay corridas pendientes.</p>');
      if(panel._html!==html){panel.innerHTML=html;panel._html=html;}
    }
    if(isTV){
      const table=document.querySelector('.fids-table-wrap');
      let hero=$('vialtis-hero');
      if(!hero){ const wrap=$('screen-split-container'); if(wrap&&wrap.parentElement){ hero=document.createElement('section'); hero.id='vialtis-hero'; wrap.parentElement.insertBefore(hero,wrap); } }
      const boarding0=list.filter(function(d){return d._st==='EN ABORDAJE'||d._st==='ÚLTIMA LLAMADA';});
      const etiq0=list.filter(function(d){return d._st==='ETIQUETANDO PASAJE';});
      const next0=list.filter(function(d){return d._st!=='SALIDO'&&d._diff>=0;}).slice(0,1);
      const boarding=boarding0.length?boarding0:(etiq0.length?etiq0:next0);   /* abordaje/última llamada > etiquetando > próxima salida */
      if(hero){
        hero.hidden=!boarding.length;
        if(boarding.length){
          const d=boarding[rotation%boarding.length];
          const S=CFG.sucursales[viewSuc()];
          const gate=d.gate||S.puntoAbordaje;
          const names=[S.origen||''].filter(Boolean);
          const sc=String(d.scales||'').trim();
          if(sc&&!/^directo/i.test(sc))sc.split(',').forEach(function(x){x=x.trim();if(x)names.push(x);});
          names.push(d.destination);
          const route=names.slice(0,6).map(function(n,i){return (i?'<i class="vh-seg"></i>':'')+'<span class="vh-node"><b></b><em>'+esc(n)+'</em></span>';}).join('');
          const mins=d._diff>=0?d._diff:0, frac=Math.max(0,Math.min(1,mins/30)), C=326.7;
          const col=mins>10?'#22c55e':(mins>=5?'#f59e0b':'#ef4444');
          const ring='<svg class="vh-ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="#ffffff22" stroke-width="10"/><circle cx="60" cy="60" r="52" fill="none" stroke="'+col+'" stroke-width="10" stroke-linecap="round" stroke-dasharray="'+C+'" stroke-dashoffset="'+(C*(1-frac)).toFixed(1)+'" transform="rotate(-90 60 60)"/><text x="60" y="64" text-anchor="middle" fill="#fff" font-size="34" font-weight="900">'+mins+'</text><text x="60" y="88" text-anchor="middle" fill="#fff" font-size="13">MIN</text></svg>';
          const html='<div class="vh-wrap'+(d._st==='ÚLTIMA LLAMADA'?' hurry':'')+'">'+ring+'<div class="vh-main"><div class="vh-info">'+badge(d._st)+'<h2>'+esc(d.destination)+'</h2><div class="vh-meta">'+esc(d.time)+' · Unidad '+esc(d.bus||'por confirmar')+'</div>'+(d.delay>0?'<div class="vh-late">⏱ Retraso +'+d.delay+' min'+(d.motivo?' · '+esc(d.motivo):'')+'</div>':'')+'</div><div class="vh-routebox"><div class="vh-route"><span class="vh-bus">🚌</span>'+route+'</div>'+planoHTML(boarding,d)+'</div></div><div class="vh-gate"><span class="vh-arrow">➜</span><small>ANDÉN</small><strong>'+esc(String(gate).replace(/^andén\s*/i,''))+'</strong></div></div>';
          if(hero._html!==html){hero.innerHTML=html;hero._html=html;}
        }
      }
    }
  }
  document.addEventListener('click',async function(e){
    const b=e.target.closest&&e.target.closest('[data-vg]');
    if(!b||!canWrite()||busy)return;
    if(!connected){alert('Sin conexión con el servidor. Espera a reconectar para modificar la operación.');return;}
    const d=curMap[b.dataset.key];if(!d)return;
    const branch=suc, user=auth.currentUser.uid;
    if(b.dataset.vg==='edit'){editDeparture(d);return;}
    if(b.dataset.vg==='delay'){
      const ch=await askDelay(d); if(!ch)return;
      const before=snapDep(d);
      adjustTime(d,ch.min);
      if(ch.why)dref(d.id).update({motivo:ch.why}).catch(fail);
      pushUndoSnap(before,'Retraso +'+ch.min+' min · '+d.time+' '+d.destination);
      return;
    }
    let patch={};
    if(b.dataset.vg==='bus'||b.dataset.vg==='gate'){
      const bus=b.dataset.vg==='bus';
      let value=bus?await askUnit(d):prompt('Punto de abordaje:',d.gate||CFG.sucursales[branch].puntoAbordaje);
      if(bus&&value===undefined)value=prompt('Número de unidad:',d.bus||'');
      if(value===null)return;
      const v=value.trim();if(!v||v.length>(bus?10:30)){alert('Captura un valor válido.');return;}
      patch=bus?{bus:v}:{gate:v};
    }else{
      const i=Math.max(0,stages.indexOf(d.status)), next=stages[Math.min(i+1,4)];
      if((next==='EN ABORDAJE'||next==='ÚLTIMA LLAMADA')&&!d.bus){alert('Primero asigna la unidad.');return;}
      if(!confirm(d.time+' · '+d.destination+'\n¿Confirmar '+next+'?'))return;
      patch={status:next};
    }
    busy=true;b.disabled=true;
    try{
      await ensureMat();
      if(!canWrite()||suc!==branch||auth.currentUser.uid!==user||!connected)throw new Error('La sesión o conexión cambió.');
      const result=await db.ref(branch+'/deps/'+d.id).transaction(function(current){
        if(!current||current.day!==d.day||current.time!==d.time||current.status!==d.status)return;
        return Object.assign({},current,patch);
      });
      if(!result.committed)alert('La corrida cambió. Revisa la información e intenta de nuevo.');
      else{ showToast('Operación actualizada'); pushUndoSnap(snapDep(d),(patch.bus?'Unidad '+patch.bus:(patch.gate?'Andén '+patch.gate:patch.status))+' · '+d.time+' '+d.destination); }
    }catch(err){fail(err);}finally{busy=false;b.disabled=false;draw();}
  });
  db.ref('.info/connected').on('value',function(snap){
    connected=!!snap.val()&&navigator.onLine;
    const notice=mount('vialtis-stale',document.body);
    notice.hidden=connected;
    notice.textContent='⚠️ Sin conexión con el servidor: la información mostrada puede estar desactualizada.';
  });
  document.addEventListener('click',function(e){
    const b=e.target.closest&&e.target.closest('[data-cpmsg]');
    if(b&&(!connected||!confirm('¿Publicar este aviso?\n'+b.dataset.cpmsg))){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  const warned=new Set();
  function beepIfMissing(list){
    if(!canWrite()||isTV)return;
    list.forEach(function(d){
      if(d._st==='SALIDO'||d._diff<0||d._diff>15||d.bus||warned.has(d._k))return;
      warned.add(d._k);
      try{const AC=window.AudioContext||window.webkitAudioContext,ac=new AC(),o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(ac.destination);o.frequency.value=880;g.gain.value=0.15;o.start();o.stop(ac.currentTime+0.35);}catch(e){}
    });
  }
  const originalRender=render;
  render=function(){originalRender();draw();};
  setInterval(function(){rotation++;draw();},10000);
  draw();
})();

/* Al escribir el usuario en el login, se muestra la marca de su empresa */
(function(){
  ['gate-user','login-user-input'].forEach(function(id){
    const el=$(id); if(!el)return;
    el.addEventListener('input',function(){
      const u=el.value.trim().toLowerCase();
      const x=(CFG.accesos||[]).find(function(y){return y.usuario.toLowerCase()===u||y.correo.toLowerCase()===u;});
      if(x&&x.marca&&CFG.marcas&&CFG.marcas[x.marca]){ if(brandId!==x.marca)applyBrand(x.marca); }
      else if(brandId!==effectiveBrandId())applyBrand(effectiveBrandId());
    });
  });
})();

/* v20: estilos de semáforo, alerta y abordaje animado */
(function(){
  const s=document.createElement('style');
  s.textContent=`
  .vg-lights{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.vg-chip{padding:5px 10px;border-radius:99px;font-size:13px;font-weight:800}
  .vg-chip.ok{background:#16a34a33;color:#86efac}.vg-chip.no{background:#ffffff14;color:#cbd5e1}
  .vg-ready{border-color:#22c55e!important}.vg-alert{border-color:#ef4444!important;animation:vg-blink 1.1s ease-in-out infinite}
  .vg-warn{background:#7f1d1d;color:#fecaca;border-radius:10px;padding:8px 10px;font-weight:800;margin-top:8px}
  @keyframes vg-blink{50%{box-shadow:0 0 0 4px #ef444488}}
  .vh-wrap{display:flex;align-items:center;gap:clamp(12px,2vw,32px)}.vh-ring{width:clamp(90px,10vw,170px);flex:none}.vh-main{flex:1;min-width:0}
  .vh-late{color:#fcd34d;font-weight:800;font-size:clamp(14px,1.6vw,26px)}
  .vh-route{display:flex;align-items:center;margin-top:clamp(38px,4vw,66px);padding-left:34px;position:relative}
  .vh-bus{position:absolute;left:0;top:calc(-1.25em - 4px);font-size:clamp(22px,2.4vw,40px);animation:vh-travel 9s linear infinite}
  .vh-node{display:flex;flex-direction:column;align-items:center;min-width:0}.vh-node b{width:14px;height:14px;border-radius:50%;background:var(--accent,#14b8a6)}
  .vh-node em{font-style:normal;font-size:clamp(11px,1.2vw,20px);max-width:11vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:4px}
  .vh-seg{flex:1;min-width:30px;height:4px;background:repeating-linear-gradient(90deg,var(--accent,#14b8a6) 0 14px,transparent 14px 26px);background-size:26px 4px;animation:vh-flow 1s linear infinite}
  .hurry .vh-seg{animation-duration:.4s}.hurry .vh-bus{animation-duration:4s}
  .vh-gate{text-align:center;flex:none}.vh-gate strong{display:block;font-size:clamp(40px,6vw,110px);line-height:1}.vh-gate small{display:block;letter-spacing:3px;font-weight:800}
  .vh-arrow{display:block;font-size:clamp(30px,4vw,70px);color:var(--accent,#14b8a6);animation:vh-point .9s ease-in-out infinite}
  @keyframes vh-flow{to{background-position:26px 0}}@keyframes vh-rev{50%{transform:translateX(3px) translateY(-2px)}}@keyframes vh-point{50%{transform:translateX(14px)}}
  @media(prefers-reduced-motion:reduce){.vg-alert{animation:none}}`;
  document.head.appendChild(s);
})();


/* ============ VISTA GENERAL (tv2026): salidas de todas las empresas en una pantalla ============ */
function initGeneral(){
  const box=$('view-general'); if(!box)return;
  const sucs=((vistaInfo&&vistaInfo.sucs)||Object.keys(CFG.sucursales)).filter(function(b){ return CFG.sucursales[b]; });
  const data={}, cleared={}, loaded={}; let page=0;
  const stOf=function(d,diff,S){
    if(d.status==='SALIDO'||diff<0)return 'SALIDO';
    if(['ETIQUETANDO PASAJE','EN ABORDAJE','ÚLTIMA LLAMADA'].indexOf(d.status)!==-1)return d.status;
    const e=S.estados;
    if(diff<=e.ultima)return 'ÚLTIMA LLAMADA';
    if(diff<=e.abordaje)return 'EN ABORDAJE';
    if(diff<=e.etiquetado)return 'ETIQUETANDO PASAJE';
    return d.status||'EN ESPERA';
  };
  const hue=function(s){ let h=0; for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))%360; return h; };
  const rowsNow=function(){
    const n=nowParts(), out=[];
    sucs.forEach(function(b){
      const S=CFG.sucursales[b];
      let arr=Object.keys(data[b]||{}).map(function(k){ return data[b][k]; }).filter(function(d){ return d&&d.time&&isLive(d,n); });
      if(loaded[b]&&cleared[b]!==n.key&&!arr.some(function(d){ return d.day===n.key; })){
        Object.keys(S.rutas||{}).forEach(function(k){ const r=S.rutas[k]; arr.push({id:k,time:r[0],destination:r[1],scales:r[2],bus:'',status:'EN ESPERA',day:n.key,delay:0}); });
      }
      arr.forEach(function(d){
        const diff=diffOf(d,n); if(diff<=-15)return;
        out.push({d:d,diff:diff,st:stOf(d,diff,S),S:S,b:b});
      });
    });
    return out.sort(function(a,b){ return a.diff-b.diff||String(a.d.time).localeCompare(String(b.d.time)); });
  };
  const draw=function(){
    const n=nowParts(), rows=rowsNow(), per=Math.max(6,Math.min(14,Math.floor((window.innerHeight||900)/86)));
    const pages=Math.max(1,Math.ceil(rows.length/per)); if(page>=pages)page=0;
    const slice=rows.slice(page*per,(page+1)*per);
    const title=(vistaInfo&&vistaInfo.titulo)||'SALIDAS';
    const body=slice.length?slice.map(function(r){
      const h=hue(r.S.empresa||r.b), d=r.d;
      return '<div class="gen-row"><span class="gen-time">'+esc(d.time)+'</span>'+
        '<span class="gen-co" style="background:hsl('+h+' 55% 24%);border-color:hsl('+h+' 60% 45%)">'+esc(r.S.empresa||r.b)+'</span>'+
        '<span class="gen-dest">'+esc(d.destination)+'<small>'+esc(String(d.scales||'').split(',').slice(0,4).join(', '))+'</small></span>'+
        '<span class="gen-bus">'+(d.bus?'<span class="bus-badge">'+esc(d.bus)+'</span>':'<span class="bus-none">---</span>')+'</span>'+
        '<span class="gen-gate">'+esc(d.gate||r.S.puntoAbordaje)+'</span>'+
        '<span class="gen-st">'+badge(r.st)+'</span></div>';
    }).join(''):'<div class="gen-empty">🚌<br>'+esc(CFG.cliente.mensajeSinSalidas||'No hay salidas programadas por ahora.')+'</div>';
    box.innerHTML='<header class="gen-head"><img src="logo.svg" alt=""><div><h1>'+esc(title)+'</h1><p>'+esc(CFG.cliente.nombre||'')+(pages>1?' · página '+(page+1)+' de '+pages:'')+'</p></div><div class="gen-clock">'+pad(Math.floor(n.min/60))+':'+pad(n.min%60)+'</div></header>'+
      '<div class="gen-cols"><span>HORA</span><span>EMPRESA</span><span>DESTINO</span><span>UNIDAD</span><span>ANDÉN</span><span>ESTADO</span></div><div class="gen-body">'+body+'</div>';
  };
  sucs.forEach(function(b){
    db.ref(b+'/deps').on('value',function(snap){ const o={}; snap.forEach(function(c){ o[c.key]=Object.assign({id:c.key},c.val()); }); data[b]=o; loaded[b]=true; draw(); });
    db.ref(b+'/cleared').on('value',function(snap){ cleared[b]=snap.val(); draw(); });
  });
  setInterval(draw,15000);
  setInterval(function(){ page++; draw(); },10000);
  draw();
}

/* ============ APP DE PASAJEROS (instalable): solo en las vistas con app:true ============ */
(function(){
  if(!isPassenger||!vistaInfo||!vistaInfo.app)return;
  const box=$('install-banner'); if(!box)return;
  const standalone=function(){ return (window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true; };
  const dismissed=function(){ try{ return Date.now()-(+localStorage.getItem('vialtis_install_off')||0)<7*86400000; }catch(e){ return false; } };
  let deferred=null;
  const show=function(txt,withBtn){
    if(standalone()||dismissed())return;
    if($('ib-sub'))$('ib-sub').textContent=txt;
    if($('ib-btn'))$('ib-btn').classList.toggle('hidden',!withBtn);
    box.classList.remove('hidden');
  };
  window.addEventListener('beforeinstallprompt',function(e){ e.preventDefault(); deferred=e; show('Ten las salidas de la Central a un toque, como una app.',true); });
  window.addEventListener('appinstalled',function(){ box.classList.add('hidden'); });
  if($('ib-btn'))$('ib-btn').onclick=function(){
    if(!deferred)return;
    deferred.prompt(); try{ deferred.userChoice.then(function(){ deferred=null; box.classList.add('hidden'); }); }catch(e){ box.classList.add('hidden'); }
  };
  if($('ib-close'))$('ib-close').onclick=function(){ box.classList.add('hidden'); try{ localStorage.setItem('vialtis_install_off',String(Date.now())); }catch(e){} };
  if(/iphone|ipad|ipod/i.test(navigator.userAgent||'')&&!standalone()){
    setTimeout(function(){ show('En iPhone: toca Compartir ⎋ y elige "Añadir a pantalla de inicio".',false); },2500);
  }
})();


/* ============ PANEL EN PESTAÑAS: Salidas / Avisos / Sistema ============ */
function admTab(name){
  ['salidas','avisos','sistema'].forEach(function(n){ const p=$('pane-'+n); if(p)p.classList.toggle('hidden',n!==name); });
  Array.prototype.forEach.call(document.querySelectorAll('.adm-tab'),function(b){ b.classList.toggle('on',b.dataset.tab===name); });
  try{ localStorage.setItem('vialtis_adm_tab',name); }catch(e){}
  if(name==='sistema')pairUI();
}
function openForm(){
  admTab('salidas');
  const f=$('sec-form'); if(f){ f.open=true; if(f.scrollIntoView)f.scrollIntoView({behavior:'smooth',block:'start'}); }
}
document.addEventListener('click',function(e){
  const t=e.target.closest&&e.target.closest('.adm-tab'); if(t&&t.dataset.tab)admTab(t.dataset.tab);
});
if($('btn-add-run'))$('btn-add-run').onclick=function(){ try{ if($('btn-reset'))$('btn-reset').click(); }catch(e){} openForm(); };
(function(){ let t='salidas'; try{ t=localStorage.getItem('vialtis_adm_tab')||'salidas'; }catch(e){} admTab(['salidas','avisos','sistema'].indexOf(t)!==-1?t:'salidas'); })();


/* ============ TECLADO GRANDE (unidad) Y RETRASO CON OPCIONES ============ */
function vqOpen(html){
  const m=document.createElement('div'); m.className='vq-overlay'; m.innerHTML='<div class="vq-sheet">'+html+'</div>'; document.body.appendChild(m); return m;
}
function askUnit(d){
  return new Promise(function(res){
    let v=String(d.bus||'');
    const m=vqOpen('<div class="vq-title">Unidad · '+esc(d.time)+' '+esc(d.destination)+'</div><div class="vq-display" id="vq-disp"></div><div class="vq-keys">'+
      [1,2,3,4,5,6,7,8,9].map(function(n){return '<button type="button" data-k="'+n+'">'+n+'</button>';}).join('')+
      '<button type="button" data-k="clear" class="alt">Borrar</button><button type="button" data-k="0">0</button><button type="button" data-k="back" class="alt">⌫</button></div>'+
      '<div class="vq-row"><button type="button" class="vq-cancel" data-k="cancel">Cancelar</button><button type="button" class="vq-ok" data-k="ok">Guardar</button></div>'+
      '<button type="button" class="vq-link" data-k="text">Usar teclado de letras</button>');
    const disp=m.querySelector('#vq-disp'), paint=function(){ disp.textContent=v||'—'; };
    const done=function(val){ m.remove(); res(val); };
    paint();
    m.addEventListener('click',function(e){
      if(e.target===m)return done(null);
      const b=e.target.closest('[data-k]'); if(!b)return;
      const k=b.dataset.k;
      if(k==='cancel')return done(null);
      if(k==='text')return done(undefined);
      if(k==='ok'){ if(v)return done(v); return; }
      if(k==='clear')v=''; else if(k==='back')v=v.slice(0,-1); else if(v.length<10)v+=k;
      paint();
    });
  });
}
function askDelay(d){
  return new Promise(function(res){
    let min=15, why='';
    const mins=[5,10,15,30,45,60], reasons=['Clima','Mecánica','Tráfico','Operativo'];
    const m=vqOpen('<div class="vq-title">Retrasar · '+esc(d.time)+' '+esc(d.destination)+'</div>'+
      '<div class="vq-lbl">¿Cuánto?</div><div class="vq-chips" id="vq-mins">'+mins.map(function(n){return '<button type="button" data-m="'+n+'" class="'+(n===15?'on':'')+'">+'+n+' min</button>';}).join('')+'</div>'+
      '<div class="vq-lbl">Motivo (opcional)</div><div class="vq-chips" id="vq-why">'+reasons.map(function(r){return '<button type="button" data-w="'+r+'">'+r+'</button>';}).join('')+'</div>'+
      '<input type="text" id="vq-other" maxlength="40" placeholder="Otro motivo (máx. 40 letras)">'+
      '<div class="vq-row"><button type="button" class="vq-cancel" data-a="cancel">Cancelar</button><button type="button" class="vq-ok" data-a="ok" id="vq-go">Retrasar +15 min</button></div>');
    const go=m.querySelector('#vq-go'), other=m.querySelector('#vq-other');
    const done=function(val){ m.remove(); res(val); };
    m.addEventListener('click',function(e){
      if(e.target===m)return done(null);
      const bm=e.target.closest('[data-m]'), bw=e.target.closest('[data-w]'), ba=e.target.closest('[data-a]');
      if(bm){ min=+bm.dataset.m; Array.prototype.forEach.call(m.querySelectorAll('[data-m]'),function(x){x.classList.toggle('on',x===bm);}); go.textContent='Retrasar +'+min+' min'; }
      if(bw){ why=(why===bw.dataset.w)?'':bw.dataset.w; other.value=''; Array.prototype.forEach.call(m.querySelectorAll('[data-w]'),function(x){x.classList.toggle('on',x.dataset.w===why);}); }
      if(ba){ if(ba.dataset.a==='cancel')return done(null); return done({min:min,why:(other.value.trim()||why).slice(0,40)}); }
    });
  });
}

/* ============ DESHACER LA ÚLTIMA ACCIÓN ============ */
var undoStack=[];
function snapDep(d){ return {id:d.id,time:d.time,delay:d.delay==null?null:d.delay,status:d.status==null?null:d.status,bus:d.bus==null?null:d.bus,gate:d.gate==null?null:d.gate,motivo:d.motivo==null?null:d.motivo}; }
function pushUndoSnap(snap,label){ undoStack.push({label:label,snap:snap,branch:suc}); if(undoStack.length>10)undoStack.shift(); renderUndo(); }
function pushUndoDelete(d){
  const full={}; Object.keys(d).forEach(function(k){ if(k!=='id'&&k.charAt(0)!=='_')full[k]=d[k]; });
  undoStack.push({label:'Eliminar · '+d.time+' '+d.destination,full:full,id:d.id,branch:suc}); if(undoStack.length>10)undoStack.shift(); renderUndo();
}
function renderUndo(){
  const bar=$('undo-bar'); if(!bar)return;
  const u=undoStack[undoStack.length-1];
  if(!u||!canWrite()){ bar.classList.add('hidden'); return; }
  if($('undo-text'))$('undo-text').textContent=u.label; bar.classList.remove('hidden');
}
function doUndo(){
  const u=undoStack.pop(); if(!u)return renderUndo();
  if(!canWrite()||u.branch!==suc){ alert('Cambió la sesión; no se puede deshacer.'); undoStack=[]; return renderUndo(); }
  let p;
  if(u.full){ p=db.ref(u.branch+'/deps/'+u.id).set(u.full); }
  else{ const o={}; Object.keys(u.snap).forEach(function(k){ if(k!=='id')o[k]=u.snap[k]; }); p=db.ref(u.branch+'/deps/'+u.snap.id).update(o); }
  p.then(function(){ showToast('↩️ Acción deshecha'); }).catch(fail);
  renderUndo();
}
if($('btn-undo'))$('btn-undo').onclick=doUndo;
document.addEventListener('click',function(e){
  const b=e.target.closest&&e.target.closest('[data-sc]'); if(!b)return;
  const a=b.dataset.sc;
  if(a==='load'&&$('btn-load-all'))$('btn-load-all').click();
  else if(a==='sound'&&$('btn-test-tv'))$('btn-test-tv').click();
  else if(a==='units'){ const c=document.querySelector('.vg-card.vg-alert'); if(c&&c.scrollIntoView)c.scrollIntoView({behavior:'smooth',block:'center'}); }
});

/* ============ SEGUIR MI SALIDA (app de pasajeros) ============ */
function followKeys(){ try{ return JSON.parse(localStorage.getItem('vialtis_follow')||'[]'); }catch(e){ return []; } }
function setFollowKeys(a){ try{ localStorage.setItem('vialtis_follow',JSON.stringify(a)); }catch(e){} }
var followState={}, followAC=null;
function followBeep(){
  try{
    if(!followAC){ const AC=window.AudioContext||window.webkitAudioContext; if(AC)followAC=new AC(); }
    if(!followAC)return; if(followAC.state==='suspended')followAC.resume();
    [0,0.28].forEach(function(dt){ const o=followAC.createOscillator(), g=followAC.createGain(); o.connect(g); g.connect(followAC.destination); o.frequency.value=988; g.gain.value=0.2; o.start(followAC.currentTime+dt); o.stop(followAC.currentTime+dt+0.18); });
  }catch(e){}
}
function followAlert(msg){
  let el=$('follow-alert');
  if(!el){ el=document.createElement('div'); el.id='follow-alert'; el.className='follow-alert hidden'; el.onclick=function(){ el.classList.add('hidden'); }; document.body.appendChild(el); }
  el.textContent=msg; el.classList.remove('hidden');
  clearTimeout(followAlert._t); followAlert._t=setTimeout(function(){ el.classList.add('hidden'); },15000);
  followBeep(); try{ if(navigator.vibrate)navigator.vibrate([350,150,350,150,350]); }catch(e){}
}
function checkFollowAlerts(list){
  if(!isPassenger||!vistaInfo||!vistaInfo.app)return;
  const keys=followKeys(); if(!keys.length)return;
  const keep=[];
  keys.forEach(function(k){
    const d=list.find(function(x){ return x._k===k; });
    if(!d){ delete followState[k]; return; }
    keep.push(k);
    const sig=d._st+'|'+d.time, prev=followState[k];
    if(prev!==undefined&&prev!==sig){
      const gate=d.gate||CFG.sucursales[viewSuc()].puntoAbordajePasajero, ps=prev.split('|'), head=d.time+' '+d.destination;
      let msg;
      if(ps[1]!==d.time)msg='⏰ '+head+': cambió la hora, ahora sale '+d.time+(d.motivo?' ('+d.motivo+')':'');
      else if(d._st==='ETIQUETANDO PASAJE')msg='🧳 '+head+': ya están documentando equipaje';
      else if(d._st==='EN ABORDAJE')msg='🚌 '+head+': ¡abordaje! Pasa a '+gate;
      else if(d._st==='ÚLTIMA LLAMADA')msg='🔔 '+head+': ¡última llamada! '+gate;
      else if(d._st==='SALIDO')msg='✅ '+head+': tu autobús ya salió';
      if(msg)followAlert(msg);
    }
    followState[k]=sig;
  });
  if(keep.length!==keys.length)setFollowKeys(keep);
}
document.addEventListener('click',function(e){
  const b=e.target.closest&&e.target.closest('[data-follow]'); if(!b)return;
  const k=b.dataset.follow, keys=followKeys(), i=keys.indexOf(k);
  if(i===-1){ keys.push(k); followBeep(); } else keys.splice(i,1);
  setFollowKeys(keys); delete followState[k]; savePush(); render();
});

/* =====================================================================
   V29 · avisos con la app cerrada, TV (plano de andenes, andén, idle, voz), app de pasajeros,
   vinculación de TVs y panel del dueño
   ===================================================================== */
function asArr(x){ return Array.isArray(x)?x:(x&&typeof x==='object'?Object.keys(x).map(function(k){return x[k];}):[]); }
var loginRejected=false, chequeoData=null, paxList=[], lastList=[], idleIdx=0, lastUrgentSig=null, urgentInit=false;

/* ---------- voz automática del navegador (inglés en última llamada, aviso urgente hablado) ---------- */
function speak(text,lang){
  return new Promise(function(res){
    const ss=window.speechSynthesis;
    if(!ss||typeof SpeechSynthesisUtterance==='undefined'||muted)return res(false);
    try{
      const u=new SpeechSynthesisUtterance(text); u.lang=lang||'es-MX'; u.rate=0.95;
      let done=false; const end=function(ok){ if(!done){ done=true; res(ok); } };
      u.onend=function(){ end(true); }; u.onerror=function(){ end(false); };
      setTimeout(function(){ end(false); },25000);
      ss.speak(u);
    }catch(e){ res(false); }
  });
}
function enFinalCall(key){
  const r=catalogFor(viewSuc())[key]; return 'Final call. The bus to '+(r?r[1]:'your destination')+' is now departing. Please board immediately.';
}
function speakUrgent(){
  if(!isTV||isGeneral||isAnden||isPairing||CFG.voz.urgenteHablado===false)return;
  const u=urgentInfo(); const sig=(u.text&&!u.expired)?u.text+'|'+(urgentMsg&&urgentMsg.ts||''):'';
  if(!urgentInit){ urgentInit=true; lastUrgentSig=sig; return; }
  if(sig&&sig!==lastUrgentSig){ lastUrgentSig=sig; try{ window.speechSynthesis&&window.speechSynthesis.cancel(); }catch(e){} speak('Aviso importante. '+u.text,'es-MX'); }
  else if(!sig)lastUrgentSig='';
}

/* ---------- TV: plano de andenes ---------- */
function gateNum(d,S){ const m=String(d.gate||S.puntoAbordaje).match(/\d+/); return m?+m[0]:0; }
function planoHTML(boarding,cur){
  const A=CFG.andenes; if(!A||A.activo===false)return '';
  const S=CFG.sucursales[viewSuc()], act=boarding.map(function(d){return gateNum(d,S);}), me=gateNum(cur,S);
  let h='<div class="plano" aria-hidden="true"><span class="pl-lbl">Plano de andenes</span><div class="pl-row">';
  for(let i=A.desde;i<=A.hasta;i++)h+='<span class="pl-a'+(i===me?' me':(act.indexOf(i)!==-1?' on':''))+'">'+i+'</span>';
  return h+'</div></div>';
}

/* ---------- TV: pantalla de espera (sin salidas): reloj grande y anuncios ---------- */
function renderIdle(list){
  lastList=list;
  const el=$('idle-screen'); if(!el)return;
  const on=isTV&&!isGeneral&&!isAnden&&!isPairing&&list.length===0;
  if(!on){ el.classList.add('hidden'); return; }
  const n=nowParts(), ads=Object.values(adsData).filter(function(a){ return a.active&&a.dataUrl&&String(a.dataUrl).indexOf('data:image')===0; });
  const ad=ads.length?ads[idleIdx%ads.length]:null;
  const html='<div class="id-clock">'+pad(Math.floor(n.min/60))+':'+pad(n.min%60)+'</div><div class="id-msg">'+esc(CFG.cliente.mensajeSinSalidas||'No hay salidas programadas por ahora.')+'</div>'+
    (ad?'<img class="id-ad" src="'+esc(ad.dataUrl)+'" alt="">':'<div class="id-brand">'+esc(CFG.cliente.marca||'')+'</div>');
  if(el._h!==html){ el.innerHTML=html; el._h=html; }
  el.classList.remove('hidden');
}
setInterval(function(){ idleIdx++; if(lastList)renderIdle(lastList); },8000);

/* ---------- TV pequeña de andén (?vista=andenvialtis&n=18) ---------- */
function renderAnden(list){
  const el=$('view-anden'); if(!el)return;
  const S=CFG.sucursales[viewSuc()], n=andenN;
  const mine=list.filter(function(d){ return d._st!=='SALIDO'&&d._diff>=0&&gateNum(d,S)===n; });
  const cur=mine.find(function(d){ return ['ETIQUETANDO PASAJE','EN ABORDAJE','ÚLTIMA LLAMADA'].indexOf(d._st)!==-1; })||mine[0];
  let html;
  if(!n)html='<div class="an-free">Falta el número de andén<small>Agrega &amp;n=18 a la dirección</small></div>';
  else if(!cur)html='<div class="an-head"><span>ANDÉN</span><b>'+n+'</b></div><div class="an-free">LIBRE<small>Sin salidas asignadas por ahora</small></div>';
  else{
    const act=['EN ABORDAJE','ÚLTIMA LLAMADA'].indexOf(cur._st)!==-1;
    html='<div class="an-head"><span>ANDÉN</span><b>'+n+'</b></div><div class="an-card'+(cur._st==='ÚLTIMA LLAMADA'?' hurry':'')+'"><div class="an-arrow">'+(act?'⬇':'➜')+'</div><div class="an-main">'+badge(cur._st)+
      '<h2>'+esc(cur.destination)+'</h2><div class="an-meta">'+esc(cur.time)+' · Unidad '+esc(cur.bus||'por confirmar')+'</div>'+etaHTML(cur)+'</div></div>'+
      (mine.length>1?'<div class="an-next">Después: '+mine.slice(1,3).map(function(d){return esc(d.time)+' '+esc(d.destination);}).join(' · ')+'</div>':'');
  }
  if(el._h!==html){ el.innerHTML=html; el._h=html; }
}

/* ---------- avisos con la app cerrada (Web Push) ---------- */
function pushSupported(){ return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window; }
function b64ToU8(s){ const p='='.repeat((4-s.length%4)%4), b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/')), o=new Uint8Array(b.length); for(let i=0;i<b.length;i++)o[i]=b.charCodeAt(i); return o; }
async function pushId(sub){ const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sub.endpoint)); return Array.from(new Uint8Array(h)).slice(0,16).map(function(x){return ('0'+x.toString(16)).slice(-2);}).join(''); }
function travelMin(){ try{ return Math.max(0,Math.min(240,parseInt(localStorage.getItem('vialtis_travel'),10)||0)); }catch(e){ return 0; } }
async function savePush(sub){
  try{
    if(!pushSupported()||!(CFG.push&&CFG.push.activa))return;
    if(!sub){ const reg=await navigator.serviceWorker.ready; sub=await reg.pushManager.getSubscription(); }
    if(!sub)return;
    const j=sub.toJSON(), id=await pushId(sub);
    await db.ref('push/'+viewSuc()+'/'+id).set({s:{endpoint:j.endpoint,keys:{p256dh:j.keys.p256dh,auth:j.keys.auth}},f:followKeys(),v:travelMin(),ts:firebase.database.ServerValue.TIMESTAMP});
  }catch(e){ console.warn('No se pudo guardar el aviso:',e&&e.message); }
}
async function enablePush(){
  if(!pushSupported()){ alert('Este navegador no permite avisos con la app cerrada. En iPhone: abre el sitio en Safari, toca Compartir → "Añadir a pantalla de inicio" y abre la app desde su icono (iOS 16.4 o más nuevo).'); return; }
  if(!CFG.push||!CFG.push.vapidPublic||/REEMPLAZAR/.test(CFG.push.vapidPublic)){ alert('Los avisos con la app cerrada todavía no están configurados.'); return; }
  const perm=await Notification.requestPermission();
  if(perm!=='granted'){ alert('Sin permiso de notificaciones no se pueden mandar avisos. Puedes activarlo en los ajustes del navegador.'); return; }
  try{
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToU8(CFG.push.vapidPublic)});
    try{ localStorage.setItem('vialtis_push','1'); }catch(e){}
    await savePush(sub); showToast('🔔 Avisos con la app cerrada: activados'); render();
  }catch(e){ alert('No se pudieron activar los avisos: '+(e&&e.message||e)); }
}
function pushOn(){ try{ return localStorage.getItem('vialtis_push')==='1'&&Notification.permission==='granted'; }catch(e){ return false; } }

/* ---------- app de pasajeros: llegada estimada, compartir, salir de casa, texto grande, leer en voz alta ---------- */
function arriveAt(d){
  if(!CFG.llegadaEstimada)return '';
  const dur=CFG.duraciones||{}; let m=0;
  Object.keys(dur).forEach(function(k){ if(!m&&String(d.destination).indexOf(k)!==-1)m=dur[k]; });
  if(!m)return '';
  const p=String(d.time).split(':').map(Number), t=(p[0]*60+p[1]+m)%1440;
  return pad(Math.floor(t/60))+':'+pad(t%60);
}
function leaveHomeAt(d){
  const trav=travelMin(); if(!trav)return '';
  const p=String(d.time).split(':').map(Number), t=(((p[0]*60+p[1]-trav-((CFG.push&&CFG.push.margenCasaMin)||20))%1440)+1440)%1440;
  return pad(Math.floor(t/60))+':'+pad(t%60);
}
function paxExtraHTML(d,fol){
  const eta=arriveAt(d);
  const txt='Mi autobús a '+d.destination+' sale a las '+d.time+'.'+(eta?' Llego aproximadamente a las '+eta+'.':'')+' ('+CFG.cliente.nombre+')';
  let h='<div class="pax-extra">'+(eta?'<div class="pax-eta">🕑 Llegada aprox. '+eta+' <small>(estimada)</small></div>':'')+
    '<a class="share-btn" target="_blank" rel="noopener" href="https://wa.me/?text='+encodeURIComponent(txt)+'">📤 Compartir por WhatsApp</a></div>';
  if(fol){
    const lh=leaveHomeAt(d);
    h+='<div class="pax-leave"><label>🏠 Mi trayecto a la terminal <input type="number" inputmode="numeric" min="5" max="240" placeholder="min" value="'+(travelMin()||'')+'" data-travel> min</label>'+
      '<div class="pax-leave-t">'+(lh?'Sal de casa a las <b>'+lh+'</b>':'Escribe cuántos minutos tardas y te digo a qué hora salir.')+'</div></div>';
  }
  return h;
}
function paxToolsRefresh(){
  const box=$('pax-tools'); if(!box)return;
  const app=isPassenger&&vistaInfo&&vistaInfo.app;
  box.classList.toggle('hidden',!app); if(!app)return;
  const pb=$('btn-pushon'); if(pb){ pb.textContent=pushOn()?'🔔 Avisos con app cerrada: activos':'🔔 Activar avisos con la app cerrada'; pb.classList.toggle('on',pushOn()); }
}
document.addEventListener('click',function(e){
  const t=e.target.closest&&e.target.closest('#btn-bigtext,#btn-readaloud,#btn-pushon'); if(!t)return;
  if(t.id==='btn-bigtext'){ const on=!document.body.classList.contains('big-text'); document.body.classList.toggle('big-text',on); try{ localStorage.setItem('vialtis_big',on?'1':''); }catch(e){} }
  else if(t.id==='btn-pushon')enablePush();
  else{
    const keys=followKeys(), mine=paxList.filter(function(d){ return keys.indexOf(d._k)!==-1&&d._st!=='SALIDO'; }), src=mine.length?mine:paxList.filter(function(d){ return d._st!=='SALIDO'&&d._diff>=0; }).slice(0,3);
    if(!src.length){ speak('No hay salidas próximas por ahora.','es-MX'); return; }
    try{ window.speechSynthesis&&window.speechSynthesis.cancel(); }catch(e){}
    speak((mine.length?'Tu salida: ':'Próximas salidas: ')+src.map(function(d){ return 'a las '+d.time+', '+d.destination+', '+String(d._st).toLowerCase()+(d.bus?', unidad '+d.bus:''); }).join('. ')+'.','es-MX');
  }
});
document.addEventListener('change',function(e){
  const i=e.target.closest&&e.target.closest('[data-travel]'); if(!i)return;
  try{ localStorage.setItem('vialtis_travel',String(Math.max(0,Math.min(240,parseInt(i.value,10)||0)))); }catch(x){}
  savePush(); render();
});
(function(){ try{ if(localStorage.getItem('vialtis_big')==='1')document.body.classList.add('big-text'); }catch(e){}
  if(isPassenger&&vistaInfo&&vistaInfo.app){ paxToolsRefresh(); if(pushOn())savePush(); } })();

/* ---------- vincular una TV nueva con un código ---------- */
function isKnownVista(v){ return !!(aliasVista[v]||(CFG.vistas&&CFG.vistas[v])); }
function initPairing(){
  const box=$('view-pair'); if(!box)return;
  let saved=''; try{ saved=localStorage.getItem('vialtis_tv_vista')||''; }catch(e){}
  if(saved&&isKnownVista(saved)&&!(CFG.vistas[saved]&&CFG.vistas[saved].pairing)){
    let ex=''; try{ ex=localStorage.getItem('vialtis_tv_extra')||''; }catch(e){}
    location.replace('?vista='+encodeURIComponent(saved)+ex); return;
  }
  let code=''; try{ code=localStorage.getItem('vialtis_pair_code')||''; }catch(e){}
  if(!/^\d{6}$/.test(code)){ code=String(Math.floor(100000+Math.random()*900000)); try{ localStorage.setItem('vialtis_pair_code',code); }catch(e){} }
  box.innerHTML='<img src="logo.svg" alt=""><h1>Vincular esta TV</h1><div class="pr-code">'+code.slice(0,3)+' '+code.slice(3)+'</div><p>En el panel de administración abre <b>Sistema → Vincular una TV nueva</b>, escribe este código y elige qué pantalla es.</p><p class="pr-wait">Esperando… esta pantalla se configura sola.</p>';
  db.ref('pairing/'+code+'/info').set({ts:firebase.database.ServerValue.TIMESTAMP}).catch(function(){});
  db.ref('pairing/'+code+'/assigned').on('value',function(snap){
    const v=snap.val(); if(!v||!v.vista||!isKnownVista(v.vista))return;
    try{ localStorage.setItem('vialtis_tv_vista',v.vista); localStorage.setItem('vialtis_tv_extra',v.extra||''); }catch(e){}
    location.replace('?vista='+encodeURIComponent(v.vista)+(v.extra||''));
  });
}
function pairOptions(){
  const out=[]; const B=suc||FIRST_SUC;
  Object.keys(CFG.vistas||{}).forEach(function(k){ const v=CFG.vistas[k]; if(v.tipo==='tv'&&!v.pairing&&(!v.suc||v.suc===B))out.push({k:k,n:v.nombre||k,anden:!!v.anden}); });
  if(B==='central')out.push({k:'tvcentral',n:'TV Central'}); if(B==='of2')out.push({k:'tvof2',n:'TV Pedro Cárdenas'});
  return out;
}
function pairUI(){
  const sel=$('pair-vista'); if(!sel)return;
  const opts=pairOptions(); sel.innerHTML=opts.map(function(o){ return '<option value="'+esc(o.k)+'" data-anden="'+(o.anden?1:0)+'">'+esc(o.n)+'</option>'; }).join('');
  const sync=function(){ const o=sel.options[sel.selectedIndex]; const w=$('pair-n-wrap'); if(w)w.classList.toggle('hidden',!(o&&o.dataset.anden==='1')); };
  sel.onchange=sync; sync();
}
if($('btn-pair'))$('btn-pair').onclick=function(){
  if(!canWrite()){ alert('Inicia sesión para vincular una TV.'); return; }
  const code=($('pair-code').value||'').replace(/\D/g,''); const sel=$('pair-vista'), o=sel.options[sel.selectedIndex];
  if(!/^\d{6}$/.test(code)){ alert('Escribe los 6 números que muestra la TV.'); return; }
  if(!o){ alert('Elige qué pantalla será.'); return; }
  let extra=''; if(o.dataset.anden==='1'){ const nn=parseInt($('pair-n').value,10); if(!nn){ alert('Escribe el número de andén.'); return; } extra='&n='+nn; }
  db.ref('pairing/'+code+'/assigned').set({vista:o.value,extra:extra,by:String((auth.currentUser&&auth.currentUser.email)||''),ts:firebase.database.ServerValue.TIMESTAMP})
    .then(function(){ showToast('✅ TV vinculada: '+o.textContent); $('pair-code').value=''; }).catch(fail);
};

/* ---------- panel del dueño: todas las empresas en una pantalla ---------- */
function showDueno(){
  const box=$('view-dueno'); if(!box||showDueno._on){ return; } showDueno._on=true;
  document.body.classList.add('dueno-on');
  const sucs=((vistaInfo&&vistaInfo.sucs)||Object.keys(CFG.sucursales)).filter(function(b){ return CFG.sucursales[b]; });
  const D={}, T={}, CH={};
  const draw=function(){
    const n=nowParts(), nowMs=Date.now()+srvOff;
    box.innerHTML='<header class="dn-head"><img src="logo.svg" alt=""><div><h1>Panel del dueño</h1><p>'+esc(CFG.cliente.nombre||'')+' · '+esc(n.key)+'</p></div><div class="dn-clock">'+pad(Math.floor(n.min/60))+':'+pad(n.min%60)+'</div><button type="button" class="btn btn-dark" id="dn-out">Salir</button></header><div class="dn-grid">'+sucs.map(function(b){
      const S=CFG.sucursales[b], deps=Object.keys(D[b]||{}).map(function(k){return D[b][k];}).filter(function(d){ return d&&d.time&&d.day===n.key; });
      const sal=deps.filter(function(d){ return diffOf(d,n)<0; }), sin=deps.filter(function(d){ return d.presetKey&&!d.bus&&diffOf(d,n)>=0&&diffOf(d,n)<=90; });
      const next=deps.filter(function(d){ return diffOf(d,n)>=0; }).sort(function(a,c){ return diffOf(a,n)-diffOf(c,n); })[0];
      const tvs=Object.keys(T[b]||{}).map(function(k){return T[b][k];}).filter(function(t){ return t&&t.ts&&nowMs-t.ts<7*86400000; }), on=tvs.filter(function(t){ return nowMs-t.ts<=150000; });
      const ch=CH[b], chOk=ch&&ch.fecha===n.key;
      return '<article class="dn-card"><h3>'+esc(S.empresa||b)+'<small>'+esc(S.titulo||'')+'</small></h3>'+
        '<div class="dn-kpis"><div><b>'+deps.length+'</b><span>salidas hoy</span></div><div><b>'+sal.length+'</b><span>ya salieron</span></div><div class="'+(sin.length?'bad':'')+'"><b>'+sin.length+'</b><span>sin unidad (90 min)</span></div><div class="'+(tvs.length&&!on.length?'bad':'')+'"><b>'+on.length+'/'+tvs.length+'</b><span>TVs conectadas</span></div></div>'+
        '<div class="dn-next">'+(next?'Próxima: <b>'+esc(next.time)+'</b> '+esc(next.destination)+' · unidad '+esc(next.bus||'sin asignar'):'Sin salidas pendientes')+'</div>'+
        '<div class="dn-chq '+(chOk?(ch.ok?'ok':'bad'):'')+'">'+(chOk?(ch.ok?'✅ Autochequeo '+esc(ch.hora)+': todo bien':'⚠️ Autochequeo '+esc(ch.hora)+': '+esc(asArr(ch.problemas).join('; '))):'Autochequeo de hoy: pendiente')+'</div></article>';
    }).join('')+'</div>';
  };
  sucs.forEach(function(b){
    db.ref(b+'/deps').on('value',function(s){ D[b]=s.val()||{}; draw(); });
    db.ref(b+'/tvs').on('value',function(s){ T[b]=s.val()||{}; draw(); });
    db.ref(b+'/chequeo').on('value',function(s){ CH[b]=s.val(); draw(); });
  });
  setInterval(draw,15000);
  box.addEventListener('click',function(e){ if(e.target.closest&&e.target.closest('#dn-out'))auth.signOut().then(function(){ location.reload(); }); });
  draw();
}
