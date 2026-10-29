/* =====================================================================
   MODO DEMO — solo se activa con  ?demo=1  en la dirección.
   Reemplaza Firebase por una base de datos de ejemplo guardada en este
   navegador: no toca los datos reales ni pide internet.
   Ejemplos:
     index.html?demo=1                        -> taquilla (usuario: ofcentral, terminalof2 o admin; contraseña: cualquiera)
     index.html?demo=1&vista=tvcentral        -> TV Central (Transpais)
     index.html?demo=1&vista=tvof2            -> TV Pedro Cárdenas (Transpais)
     index.html?demo=1&vista=pasajerocentral  -> vista de pasajero (Transpais)
     index.html?demo=1&vista=tvvialtis        -> TV Vialtis
     index.html?demo=1&vista=pasajerovialtis  -> app de pasajeros Vialtis
     index.html?demo=1&vista=tv2026           -> vista general (todas las empresas)
     agrega &reset=1 para reiniciar los datos de ejemplo
   Abre taquilla y TV en dos pestañas del mismo navegador: se sincronizan.
   ===================================================================== */
(function(){
  if(!/[?&]demo(=1|=true)?(&|$)/.test(location.search)) return;
  const CFG = window.FIDS_CONFIG; if(!CFG) return;
  const KEY = 'fids_demo_db_v1';

  function parts(){
    const f=new Intl.DateTimeFormat('en-CA',{timeZone:CFG.zonaHoraria,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    const p={}; f.formatToParts(new Date()).forEach(function(x){p[x.type]=x.value;});
    return {key:p.year+'-'+p.month+'-'+p.day, min:(+p.hour%24)*60+(+p.minute)};
  }
  function seed(){
    const n=parts(), offsets=[2,9,14,25,40,70], buses=['9548','7721','','4103','6650','8812'], out={__ts:Date.now()};
    Object.keys(CFG.sucursales).forEach(function(b){
      const rutas=CFG.sucursales[b].rutas, keys=Object.keys(rutas), deps={};
      offsets.forEach(function(off,i){
        const k=keys[i]; if(!k)return; const r=rutas[k], t=(n.min+off)%1440;
        deps[k]={presetKey:k,time:('0'+Math.floor(t/60)).slice(-2)+':'+('0'+(t%60)).slice(-2),destination:r[1],scales:r[2],bus:buses[i],status:'EN ESPERA',sucursal:b,day:n.key,delay:0};
      });
      out[b]={deps:deps};
    });
    return out;
  }
  let data=null;
  try{
    data=JSON.parse(localStorage.getItem(KEY)||'null');
    if(!data||!data.__ts||Date.now()-data.__ts>3*3600*1000||/[?&]reset=1/.test(location.search)) data=null;
  }catch(e){ data=null; }
  if(!data){ data=seed(); try{localStorage.setItem(KEY,JSON.stringify(data));}catch(e){} }

  const listeners=[];
  const segs=function(p){return String(p||'').split('/').filter(Boolean);};
  function getAt(p){
    if(p==='.info/connected')return true;
    if(p==='.info/serverTimeOffset')return 0;
    let o=data; const s=segs(p);
    for(let i=0;i<s.length;i++){ if(o==null||typeof o!=='object')return undefined; o=o[s[i]]; }
    return o;
  }
  function setAt(p,v){
    const s=segs(p); if(!s.length){ data=(v&&typeof v==='object')?v:{}; return; }
    let o=data;
    for(let i=0;i<s.length-1;i++){ if(o[s[i]]==null||typeof o[s[i]]!=='object')o[s[i]]={}; o=o[s[i]]; }
    if(v==null)delete o[s[s.length-1]]; else o[s[s.length-1]]=v;
  }
  function resolve(v){
    if(v&&typeof v==='object'){
      if(v['.sv']==='timestamp')return Date.now();
      const o={}; Object.keys(v).forEach(function(k){ const r=resolve(v[k]); if(r!=null)o[k]=r; }); return o;
    }
    return v;
  }
  function snap(p){
    const v=getAt(p), key=segs(p).pop()||null;
    return {key:key,
      val:function(){return v===undefined?null:JSON.parse(JSON.stringify(v));},
      exists:function(){return v!=null;},
      forEach:function(cb){ if(v&&typeof v==='object')Object.keys(v).forEach(function(k){cb(snap(p+'/'+k));}); }};
  }
  function notify(){ setTimeout(function(){ listeners.slice().forEach(function(l){ try{l.cb(snap(l.path));}catch(e){console.error(e);} }); },0); }
  function save(){ try{localStorage.setItem(KEY,JSON.stringify(data));}catch(e){} notify(); }
  window.addEventListener('storage',function(e){
    if(e.key!==KEY||!e.newValue)return;
    try{ data=JSON.parse(e.newValue); notify(); }catch(err){}
  });

  const db={ref:function(path){
    path=segs(path).join('/');
    return {
      key:segs(path).pop()||null,
      on:function(evt,cb){ listeners.push({path:path,cb:cb}); setTimeout(function(){ try{cb(snap(path));}catch(e){console.error(e);} },0); return cb; },
      off:function(){ for(let i=listeners.length-1;i>=0;i--) if(listeners[i].path===path)listeners.splice(i,1); },
      once:function(){ return Promise.resolve(snap(path)); },
      set:function(v){ setAt(path,resolve(v)); save(); return Promise.resolve(); },
      update:function(o){ Object.keys(o).forEach(function(k){ setAt(path?path+'/'+k:k,resolve(o[k])); }); save(); return Promise.resolve(); },
      remove:function(){ setAt(path,null); save(); return Promise.resolve(); },
      transaction:function(fn){
        const cur=getAt(path), out=fn(cur===undefined?null:JSON.parse(JSON.stringify(cur)));
        if(out===undefined)return Promise.resolve({committed:false,snapshot:snap(path)});
        setAt(path,resolve(out)); save(); return Promise.resolve({committed:true,snapshot:snap(path)});
      },
      push:function(v){
        const r=db.ref((path?path+'/':'')+'-d'+Date.now().toString(36)+Math.random().toString(36).slice(2,5));
        if(v!==undefined){ const p=r.set(v); r.then=p.then.bind(p); r.catch=p.catch.bind(p); }
        return r;
      }
    };
  }};
  const database=function(){return db;}; database.ServerValue={TIMESTAMP:{'.sv':'timestamp'}};

  let user=null; const authCbs=[];
  const auth={
    get currentUser(){return user;},
    onAuthStateChanged:function(cb){ authCbs.push(cb); setTimeout(function(){cb(user);},0); },
    signInWithEmailAndPassword:function(email,pass){
      const ok=CFG.accesos.some(function(a){return a.correo.toLowerCase()===String(email).toLowerCase();});
      if(!ok||!pass)return Promise.reject(new Error('Usuario o contraseña incorrectos (demo)'));
      user={email:email}; authCbs.forEach(function(cb){cb(user);});   /* como Firebase: el aviso de sesión llega antes de que termine el inicio */
      return Promise.resolve({user:user});
    },
    signOut:function(){ user=null; authCbs.forEach(function(cb){cb(null);}); return Promise.resolve(); }
  };

  window.firebase={initializeApp:function(){},database:database,auth:function(){return auth;}};

  const b=document.createElement('div');
  b.style.cssText='position:fixed;left:50%;transform:translateX(-50%);top:3px;z-index:99999;background:#FFB800;color:#000;font:700 10px sans-serif;padding:2px 10px;border-radius:0 0 8px 8px;opacity:.92;pointer-events:none;white-space:nowrap;max-width:96vw;overflow:hidden;text-overflow:ellipsis';
  b.textContent='MODO DEMO · datos de ejemplo · login: '+CFG.accesos.map(function(a){return a.usuario;}).join(' / ')+' + cualquier contraseña';
  document.body.appendChild(b);
})();
