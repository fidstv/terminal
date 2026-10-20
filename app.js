/* ============ CONFIGURACIÓN POR CLIENTE (ver config.js) ============ */
const CFG = window.FIDS_CONFIG;
if(!CFG){ document.body.innerHTML='<h2 style="color:#f87171;font-family:sans-serif;padding:30px">Falta el archivo config.js</h2>'; throw new Error('Falta config.js'); }
const APP_VERSION = window.FIDS_VERSION || 'dev';
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

const isTV = vista.startsWith('tv') || href.includes('tvof2') || href.includes('tvcentral');
const isPassenger = vista.startsWith('pasajero') || href.includes('pasajero');

const TZ = CFG.zonaHoraria;
const $ = function(id){ return document.getElementById(id); };
const esc = function(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
const pad = function(x){ return String(x).padStart(2,'0'); };

let tvsData = {}, lastPingTs = 0, themeMode = null, themeSeason = null, logData = [], stripNext = null, stripVisible = false, stripIdx = 0, stripHtml = '';
let suc = null, deps = {}, adsData = {}, adsConfig = {force7030:false}, ready = false, srvOff = 0, urgentMsg = '';
let gotServer = false, gotCleared = false, offlineFallback = false, clearedDay = null, fbTimer = null, curMap = {};

if(isPassenger) document.body.classList.add('passenger-mode');
if(isTV) document.body.classList.add('tv-mode');

const viewSuc = function(){
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
const catalogFor=function(branch){return branch==='central'?CAT_CENTRAL:CAT;};

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
  const e=CFG.sucursales[viewSuc()==='central'?'central':'of2'].estados;
  if(diff<=e.ultima)return'ÚLTIMA LLAMADA';
  if(diff<=e.abordaje)return'EN ABORDAJE';
  if(diff<=e.etiquetado)return'ETIQUETANDO PASAJE';
  return d.status||'EN ESPERA';
}

function updateHeaderTitles(){
  const c=viewSuc()==='central';
  const S=CFG.sucursales[c?'central':'of2'];
  if($('brand-name'))$('brand-name').textContent=CFG.cliente.marca;
  if($('login-title'))$('login-title').textContent='SISTEMA FIDS '+CFG.cliente.nombre.toUpperCase();
  if($('header-terminal-title'))$('header-terminal-title').textContent=S.titulo;
  if($('header-terminal-sub'))$('header-terminal-sub').textContent=(isPassenger?S.subtituloPasajero:S.subtitulo);
  if($('ticker-text-content'))$('ticker-text-content').innerHTML='🧳 <strong>'+S.rotuloAviso+':</strong> Favor de pasar a documentar y etiquetar su equipaje <strong>CON EL EQUIPAJERO</strong> a partir de '+S.estados.etiquetado+' minutos antes de su salida. &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 🎒 <strong>CABINA:</strong> Permitido 1 EQUIPAJE DE MANO O MOCHILA.';
}

/* ============ AUDIO Y VOCEO DINÁMICO CON RUTAS POR SUCURSAL ============ */
let actx=null,muted=localStorage.getItem('transpais_local_muted')==='true';
let currentVoiceAudio=null;

function setVoiceIndicator(show){
  if(isPassenger)return;
  const vi=$('voice-indicator');
  if(vi)vi.classList.toggle('active',!!show);
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

    const branchFolder = viewSuc() === 'central' ? 'central/' : 'of2/';
    const primarySrc = 'Audio/' + branchFolder + key + '_' + mode + '.mp3';
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
  if(!/^\d{1,5}$/.test(b))return;
  const folder='Audio/'+(viewSuc()==='central'?'central/':'of2/');
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
  b.textContent=muted?'🔇 VOCEO EN TAQUILLA: DESACTIVADO':'🔊 VOCEO EN TAQUILLA: ACTIVADO';
  b.className=muted?'btn btn-dark btn-red':'btn btn-green';
}

/* ============ DATOS Y SINCRONIZACIÓN ============ */
let refs=[];
function attach(s){
  try{
    refs.forEach(function(r){r.off();});
    tvsData={}; deps={}; adsData={}; ready=false; gotServer=false; gotCleared=false; offlineFallback=false; clearedDay=null;
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
      renderUrgentMsg();
    });

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
      const rlg=db.ref(s+'/log'); refs.push(rlg);
      rlg.on('value',function(snap){
        const arr=[]; snap.forEach(function(c){ const v=c.val(); if(v&&v.ts)arr.push({k:c.key,ts:v.ts,by:v.by||'',text:v.text||''}); });
        arr.sort(function(a,b){return b.ts-a.ts;}); logData=arr; renderLog();
        if(arr.length>80&&canWrite()){ const upd={}; arr.slice(60).forEach(function(x){ upd[x.k]=null; }); db.ref(s+'/log').update(upd).catch(function(){}); }
      });
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
      o._needsBus = !!(!o.bus && o.presetKey && !isCustom(o) && o._st!=='SALIDO' && o._diff>=0 && o._diff<=CFG.sucursales[viewSuc()==='central'?'central':'of2'].estados.abordaje);
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
  if(!canWrite()||!ready||!gotServer||!gotCleared||autoBusy||viewSuc()!==suc)return;
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
  try{
    const byDay = {};
    Object.keys(deps).forEach(function(key){
      const d = deps[key];
      if(!d || !d.time || !d.day || d.day === day || !/^\d{4}-\d{2}-\d{2}$/.test(d.day)) return;
      (byDay[d.day] = byDay[d.day] || {})[key.replace(/^old_/, '')] = {time:d.time, destination:d.destination||'', bus:d.bus||'', delay:d.delay||0, status:d.status||'', presetKey:d.presetKey||''};
    });
    const days = Object.keys(byDay);
    if(days.length){
      days.forEach(function(dy){ db.ref(branch + '/archive/' + dy).set(byDay[dy]).catch(function(){}); });
      db.ref(branch + '/archive').once('value').then(function(s){
        const ks = Object.keys(s.val() || {}).sort();
        if(ks.length > 45){ const upd = {}; ks.slice(0, ks.length - 45).forEach(function(k){ upd[k] = null; }); return db.ref(branch + '/archive').update(upd); }
      }).catch(function(){});
    }
  }catch(e){}
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
  const shouldSplit = activeList.length > 0 && (isForced || (isTV && autoSplitState));

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
  const avisos = CFG.sucursales[viewSuc()==='central'?'central':'of2'].avisos;
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
  const boardingPoint = d.gate || CFG.sucursales[isCentral?'central':'of2'].puntoAbordajePasajero;
  const isActive = d._st === 'ETIQUETANDO PASAJE' || d._st === 'EN ABORDAJE' || d._st === 'ÚLTIMA LLAMADA';

  const cardClass = 'passenger-card ' + (isActive ? 'gold-card-active' : '');

  return '<div class="' + cardClass + '">' +
    '<div class="passenger-card-header">' +
      '<span class="passenger-card-time">' + esc(d.time) + '</span>' +
      '<div>' + badge(d._st) + etaHTML(d) + '</div>' +
    '</div>' +
    '<div>' +
      '<div class="passenger-card-dest">' + esc(d.destination) + '</div>' +
      (sc ? '<div class="passenger-card-scales">Escalas: ' + esc(sc) + '</div>' : '') +
    '</div>' +
    '<div class="passenger-card-details">' +
      '<span>🚌 Bus: ' + esc(d.bus || '---') + '</span>' +
      '<span>📍 ' + esc(boardingPoint) + '</span>' +
    '</div>' +
  '</div>';
}

function tvRow(d,c){
  const sc=cleanScales(d.scales);
  const isActive = d._st === 'ETIQUETANDO PASAJE' || d._st === 'EN ABORDAJE' || d._st === 'ÚLTIMA LLAMADA';
  const rowClass = isActive ? 'gold-row-active' : '';

  return '<td style="font-size:24px;font-weight:900;font-family:monospace" class="'+rowClass+'">'+esc(d.time)+'</td>'+
  '<td class="'+rowClass+'"><div style="font-size:20px;font-weight:900">'+esc(d.destination)+'</div>'+(sc?'<div style="font-size:12px;color:var(--muted,#93c5fd);margin-top:4px">Escalas: '+esc(sc)+'</div>':'')+'</td>'+
  '<td class="c '+rowClass+'">'+(d.bus?'<span class="bus-badge">'+esc(d.bus)+'</span>':'<span class="bus-none">---</span>')+'</td>'+
  '<td class="c '+rowClass+'" style="font-size:16px;font-weight:800;color:var(--ok,#00D974)">'+esc(d.gate||CFG.sucursales[c?'central':'of2'].puntoAbordaje)+'</td>'+
  '<td class="c '+rowClass+'">'+badge(d._st)+etaHTML(d)+'</td>';
}

function adminRow(d){
  return '<td><strong>'+esc(d.time)+'</strong></td>'+
  '<td><div><strong>'+esc(d.destination)+'</strong></div><div style="font-size:10px;color:var(--muted,#93c5fd)">MP3: '+esc((d.presetKey&&!isCustom(d))?d.presetKey:'Sin audio')+'</div></td>'+
  '<td class="c"><input type="text" class="inline-bus-input" maxlength="10" value="'+esc(d.bus||'')+'" placeholder="---">'+
    '<div style="font-size:9px;color:var(--muted,#93c5fd);margin-top:4px">Punto de abordaje</div>'+
    '<input type="text" class="inline-gate-input" value="'+esc(d.gate||'')+'" placeholder="'+esc(CFG.sucursales[viewSuc()==='central'?'central':'of2'].puntoAbordaje)+'" maxlength="30" style="width:110px;padding:4px;font-size:11px;text-align:center"></td>'+
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
    }
  } else {
    const fixedWrap=$('fixed-departures-wrap'), fixedBody=$('fixed-fids-body');
    const pinned=(isTV&&!isPassenger)?list.filter(function(d){return d._st==='ETIQUETANDO PASAJE';}):[];
    const moving=(isTV&&!isPassenger)?list.filter(function(d){return d._st!=='ETIQUETANDO PASAJE';}):list;
    if(fixedWrap&&fixedBody){
      fixedWrap.classList.toggle('hidden',pinned.length===0);
      syncRows(fixedBody,pinned,function(d){return tvRow(d,c);});
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
function stripSlides(){
  const out=[];
  if(stripNext)out.push('route');
  if((CFG.consejos||[]).length)out.push('tip');
  if(themeSeason&&themeSeason.saludo)out.push('season');
  return out;
}
function routeHTML(d,S){
  const gate=d.gate||S.puntoAbordaje;
  const eta=d._eta>=0?(d._eta===0?'sale ahora':'sale en '+d._eta+' min'):'';
  const etaEn=d._eta>=0?(d._eta===0?'departing now':'departs in '+d._eta+' min'):'';
  let nodes=[S.origen||''];
  nodes=nodes.filter(Boolean);
  const sc=String(d.scales||'').trim();
  if(sc){
    if(/^directo/i.test(sc))nodes.push(sc);
    else nodes=nodes.concat(sc.split(',').map(function(x){return x.trim();}).filter(Boolean).slice(0,6));
  }
  nodes.push(d.destination);
  const line=nodes.map(function(nm,i){
    const cls=i===nodes.length-1?' rs-end':(i===0?' rs-start':'');
    return (i?'<span class="rs-seg"></span>':'')+'<span class="rs-node'+cls+'"><span class="rs-dot"></span><span class="rs-name">'+esc(nm)+'</span></span>';
  }).join('');
  return '<div class="rs-head"><span class="k">'+bil('PRÓXIMA SALIDA','NEXT DEPARTURE')+'</span><span>'+esc(d.time)+'</span><span>'+esc(d.destination)+'</span>'+
    (d.bus?'<span>🚌 '+esc(d.bus)+'</span>':'')+'<span>📍 '+esc(gate)+'</span>'+(eta?'<span class="k">'+bil(eta,etaEn)+'</span>':'')+'</div>'+
    '<div class="rs-line"><span class="rs-bus">🚌</span>'+line+'</div>';
}
function renderStrip(){
  const st=$('route-strip'); if(!st)return;
  if(!isTV||!CFG.franja||CFG.franja.activa===false||!stripVisible){ st.classList.add('hidden'); return; }
  const slides=stripSlides();
  if(!slides.length){ st.classList.add('hidden'); return; }
  const which=slides[stripIdx%slides.length], S=CFG.sucursales[viewSuc()==='central'?'central':'of2'];
  let inner='';
  if(which==='route')inner=routeHTML(stripNext,S);
  else if(which==='tip'){
    const tips=CFG.consejos, t=tips[Math.floor(stripIdx/slides.length)%tips.length];
    inner='<div class="rs-tip"><span class="ic">'+esc(t.icono||'ℹ️')+'</span><span>'+bil(esc(t.es),esc(t.en||t.es))+'</span></div>';
  }else inner='<div class="rs-tip"><span class="ic">'+esc(themeSeason.icono||'🎉')+'</span><span>'+esc(themeSeason.saludo)+'</span></div>';
  const html='<div class="rs-slide">'+inner+'</div>';
  if(html!==stripHtml){ st.innerHTML=html; stripHtml=html; }
  st.classList.remove('hidden');
}
if(CFG.franja&&CFG.franja.activa!==false)setInterval(function(){ stripIdx++; renderStrip(); },((CFG.franja&&CFG.franja.segundos)||12)*1000);

function renderExtras(list,c){
  const S=CFG.sucursales[c?'central':'of2'];
  const upAll=list.filter(function(d){return d._st!=='SALIDO'&&d._diff>=0;});
  stripNext=upAll[0]||null; stripVisible=list.length>0; renderStrip();
  const bn=$('last-call-banner');
  if(bn){
    const lc=isTV?list.filter(function(d){return d._st==='ÚLTIMA LLAMADA';}):[];
    if(lc.length){
      const txt=lc.slice(0,2).map(function(d){return d.destination+' · '+(d.gate||S.puntoAbordaje);}).join('   |   ');
      bn.innerHTML='🔔 '+bil('ÚLTIMA LLAMADA','FINAL CALL')+' — '+esc(txt);
      bn.classList.remove('hidden');
    }else bn.classList.add('hidden');
  }
  const os=$('ops-summary');
  if(os){
    if(!canWrite()){ os.classList.add('hidden'); return; }
    const up=list.filter(function(d){return d._st!=='SALIDO'&&d._diff>=0;}).slice(0,3);
    const miss=list.filter(function(d){return d._needsBus;});
    let html='<div style="font-size:11px;font-weight:900;color:var(--muted,#93c5fd);margin-bottom:8px">RESUMEN DE OPERACIÓN</div>';
    html+=up.length?'<div style="display:flex;flex-wrap:wrap;gap:10px">'+up.map(function(d,i){
      return '<div style="flex:1 1 170px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px 12px">'+
        '<div style="font-size:10px;color:var(--muted,#93c5fd);font-weight:800">'+(i===0?'PRÓXIMA SALIDA':'DESPUÉS')+'</div>'+
        '<div style="font-size:22px;font-weight:900;font-family:monospace">'+esc(d.time)+'</div>'+
        '<div style="font-weight:800">'+esc(d.destination)+'</div>'+
        '<div style="font-size:11px;color:var(--muted,#93c5fd)">🚌 '+esc(d.bus||'sin unidad')+' · en '+d._diff+' min</div></div>';
    }).join('')+'</div>':'<div style="color:var(--muted,#93c5fd);font-size:12px">No hay salidas pendientes.</div>';
    if(miss.length)html+='<div style="margin-top:10px;background:rgba(225,29,72,.18);border:1px solid rgba(255,65,108,.6);color:#ff9bb2;border-radius:10px;padding:8px 12px;font-weight:800;font-size:12px">⚠️ Falta capturar la unidad: '+miss.map(function(d){return esc(d.time+' '+d.destination+' (en '+d._diff+' min)');}).join(' · ')+'</div>';
    const nn=nowParts(), tod=Object.keys(deps).map(function(k){return deps[k];}).filter(function(d){return d&&d.day===nn.key&&d.time;});
    const sal=tod.filter(function(d){return diffOf(d,nn)<0;}), pun=sal.filter(function(d){return !(d.delay>0);});
    html+='<div style="margin-top:10px;font-size:11px;color:var(--muted,#93c5fd)">📊 Hoy: '+tod.length+' salidas · '+sal.length+' ya salieron'+(sal.length?' · '+pun.length+' puntuales ('+Math.round(pun.length*100/sal.length)+'%) · '+(sal.length-pun.length)+' con demora':'')+'</div>';
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
    else if(act==='time')ensureMat().then(function(){adjustTime(d,+b.dataset.v);}).catch(fail);
    else if(act==='edit')editDeparture(d);
    else if(act==='del'&&confirm('¿Eliminar esta corrida de la pantalla?'))ensureMat().then(function(){logAction('Eliminó salida '+d.time+' '+d.destination);return dref(d.id).remove();}).catch(fail);
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
  logAction('Demora '+(deltaMinutes>0?'+':'')+deltaMinutes+' min · '+d.destination+' → '+newTime);
}

function editDeparture(d){
  $('dep-id').value=d.id; $('dep-preset-key').value=isCustom(d)?'':(d.presetKey||'');
  $('dep-time').value=d.time; $('dep-destination').value=d.destination;
  $('dep-scales').value=d.scales||''; $('dep-bus').value=d.bus||'';
  const sel=$('dep-status'); sel.value=Array.from(sel.options).some(function(o){return o.value===d.status;})?d.status:'REPROGRAMADO';
  window.scrollTo({top:0,behavior:'smooth'});
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
  const branch=viewSuc(), folder='Audio/'+(branch==='central'?'central/':'of2/');
  const modes=['etiq','abord','ultima'], routes=[], units=[];
  Object.keys(CAT).sort().forEach(function(k){ modes.forEach(function(m){ routes.push(k+'_'+m); }); });
  if(CFG.voz.unidad)for(let i=0;i<10;i++)units.push(String(i));
  btn.disabled=true; out.classList.remove('hidden'); out.textContent='Revisando audios…';
  const test=function(f){ return fetch(folder+f+'.mp3',{method:'HEAD',cache:'no-store'}).then(function(r){return r.ok;}).catch(function(){return null;}); };
  try{
    const rr=await Promise.all(routes.map(test)), ur=await Promise.all(units.map(test)), intro=CFG.voz.unidad?await test('unidad'):null;
    if(rr.every(function(x){return x===null;})){ out.textContent='No se pudo revisar (sin conexión o servidor no disponible).'; return; }
    const missR=routes.filter(function(f,i){return rr[i]===false;});
    const name=branch==='central'?'Audio/central/':'Audio/of2/';
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

/* ============ AUTH Y VISTAS ============ */
const sucFromEmail=function(em){const e=(em||'').toLowerCase();const a=CFG.accesos.find(function(x){return x.correo.toLowerCase()===e;});return a?a.sucursal:'of2';};

auth.onAuthStateChanged(function(u){
  const prev=viewSuc();
  suc=(u&&!isTV&&!isPassenger)?sucFromEmail(u.email):null;

  if($('btn-logout')){
    $('btn-logout').classList.toggle('hidden', !u || isTV || isPassenger);
  }

  if(viewSuc()!==prev)attach(viewSuc());
  updateHeaderTitles(); refreshPresetOptions(); renderAds(); renderUrgentMsg(); render(); autoCatalog();
  resetInactivityTimer();
});

function switchTab(tab){
  if(tab==='admin'&&!canWrite())return;
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
  const u=$('login-user-input').value.trim().toLowerCase(), p=$('login-pass-input').value.trim();
  if(!u||!p){ if($('pin-error-msg'))$('pin-error-msg').classList.remove('hidden'); return; }
  let em=u;
  if(!u.includes('@')){const a=CFG.accesos.find(function(x){return x.usuario.toLowerCase()===u;}); if(a)em=a.correo;}
  const btn=$('btn-login-ok'); if(btn)btn.disabled=true;
  auth.signInWithEmailAndPassword(em,p).then(function(){
    suc=sucFromEmail(em);
    if($('pin-modal-overlay'))$('pin-modal-overlay').classList.add('hidden');
    if(viewSuc()!==(suc==='central'?'central':'of2'))attach(viewSuc());
    updateHeaderTitles(); switchTab('admin');
  }).catch(function(err){
    console.error('Auth:',err.message);
    if($('pin-error-msg'))$('pin-error-msg').classList.remove('hidden');
  }).then(function(){ if(btn)btn.disabled=false; });
}

function doLogout(force){
  if(force===true||confirm('¿Deseas cerrar la sesión de taquilla?')){
    auth.signOut().then(function(){
      suc=null;
      switchTab('screen');
      updateHeaderTitles();
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
function applyTheme(){
  const t=effectiveTheme(), root=document.documentElement;
  const vars=Object.assign({},(CFG.temas||{})[t.name]||{},t.season&&t.season.vars?t.season.vars:{});
  THEME_KEYS.forEach(function(k){ root.style.removeProperty(k); });
  Object.keys(vars).forEach(function(k){ root.style.setProperty(k,vars[k]); });
  ['clasico','noche','contraste'].forEach(function(x){ document.body.classList.toggle('theme-'+x,x===t.name); });
  themeSeason=t.season;
  const sel=$('theme-select'); if(sel&&sel.value!==t.mode)sel.value=t.mode;
}
if($('theme-select'))$('theme-select').onchange=function(e){
  if(!canWrite()){ alert('Inicia sesión de taquilla para cambiar el tema.'); e.target.value=effectiveTheme().mode; return; }
  const v=e.target.value;
  db.ref(suc+'/theme').set({mode:v}).then(function(){ logAction('Tema de pantalla: '+v); }).catch(fail);
};

/* ============ HISTORIAL DE CAMBIOS ============ */
function logAction(text){
  if(!canWrite())return;
  try{
    const who=String((auth.currentUser&&auth.currentUser.email)||'').split('@')[0].slice(0,30);
    db.ref(suc+'/log').push({ts:firebase.database.ServerValue.TIMESTAMP,by:who,text:String(text).slice(0,120)}).catch(function(){});
  }catch(e){}
}
function renderLog(){
  const box=$('log-list'); if(!box)return;
  const fmt=new Intl.DateTimeFormat('es-MX',{timeZone:TZ,hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',hourCycle:'h23'});
  box.innerHTML=logData.length?logData.slice(0,15).map(function(x){
    return '<div style="padding:5px 0;border-top:1px solid rgba(255,255,255,.08)"><span style="color:var(--muted,#93c5fd);font-size:10px">'+esc(fmt.format(new Date(x.ts)))+(x.by?' · '+esc(x.by):'')+'</span><div>'+esc(x.text)+'</div></div>';
  }).join(''):'<div style="color:var(--muted,#93c5fd)">Aún no hay cambios registrados.</div>';
}

/* ============ REPORTE DE PUNTUALIDAD (CSV) ============ */
function minusMin(time,delay){
  const p=String(time).split(':').map(Number), t=(((p[0]*60+p[1]-(delay||0))%1440)+1440)%1440;
  return pad(Math.floor(t/60))+':'+pad(t%60);
}
function csvCell(v){ v=String(v==null?'':v); return /[",\n;]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
function reportRows(map,day,n){
  return Object.keys(map||{}).map(function(k){
    const d=map[k]; if(!d||!d.time)return null;
    const delay=d.delay||0;
    let estado=d.status||'EN ESPERA';
    if(day===n.key){ if(diffOf(Object.assign({day:day},d),n)<0)estado='SALIDO'; } else estado='SALIDO';
    return [day,minusMin(d.time,delay),d.time,d.destination||'',d.bus||'',delay,delay===0?'SI':'NO',estado];
  }).filter(Boolean).sort(function(a,b){return a[0]<b[0]?-1:a[0]>b[0]?1:(a[2]<b[2]?-1:1);});
}
function downloadCSV(name,rows){
  const head=['fecha','hora_programada','hora_actual','destino','unidad','demora_min','puntual','estado'];
  const txt='\ufeff'+[head].concat(rows).map(function(r){return r.map(csvCell).join(',');}).join('\r\n');
  const blob=new Blob([txt],{type:'text/csv;charset=utf-8'}), url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=name; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); },1500);
}
function todayDepsMap(n){
  const m={}; Object.keys(deps).forEach(function(k){ const d=deps[k]; if(d&&d.day===n.key&&d.time)m[k]=d; }); return m;
}
if($('btn-report-today'))$('btn-report-today').onclick=function(){
  if(!canWrite()){ alert('Inicia sesión de taquilla para descargar reportes.'); return; }
  const n=nowParts(); downloadCSV('reporte_'+suc+'_'+n.key+'.csv',reportRows(todayDepsMap(n),n.key,n));
};
if($('btn-report-week'))$('btn-report-week').onclick=function(){
  if(!canWrite()){ alert('Inicia sesión de taquilla para descargar reportes.'); return; }
  const n=nowParts(), branch=suc;
  db.ref(branch+'/archive').once('value').then(function(snap){
    const all=snap.val()||{}, days=Object.keys(all).sort().slice(-7); let rows=[];
    days.forEach(function(dy){ rows=rows.concat(reportRows(all[dy],dy,n)); });
    rows=rows.concat(reportRows(todayDepsMap(n),n.key,n));
    downloadCSV('reporte_'+branch+'_ultimos_dias_'+n.key+'.csv',rows);
  }).catch(fail);
};

/* ============ ESTADO DE TVs (cada TV avisa cada minuto que sigue viva) ============ */
const TV_ID=(function(){
  try{
    let id=localStorage.getItem('transpais_tv_id');
    if(!id){ id='tv'+Math.random().toString(36).slice(2,8); localStorage.setItem('transpais_tv_id',id); }
    return id;
  }catch(e){ return 'tv'+Math.random().toString(36).slice(2,8); }
})();
function tvBeat(){
  if(!isTV||!gotServer)return;
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
    const nm=t.view==='tvcentral'?CFG.sucursales.central.titulo:t.view==='tvof2'?CFG.sucursales.of2.titulo:'TV';
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
  db.ref(suc+'/ping').set({ts:firebase.database.ServerValue.TIMESTAMP}).then(function(){ showToast('Prueba enviada a las TVs de esta sucursal'); logAction('Prueba de sonido en TV'); }).catch(fail);
};
if(isTV&&navigator.wakeLock){
  const wl=function(){ try{ navigator.wakeLock.request('screen').catch(function(){}); }catch(e){} };
  wl(); document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='visible')wl(); });
}


attach(viewSuc());
updateHeaderTitles();
refreshPresetOptions();
updateMuteUI();
applyTheme();
renderUrgentMsg();
render();
