/* Lógica de los avisos al celular con la app cerrada.
   No depende de Firebase ni de web-push: recibe la base de datos y el envío (db, send) para poder probarse. */
'use strict';

function pad(n){ return (n<10?'0':'')+n; }
function nowParts(ms,tz){
  const f=new Intl.DateTimeFormat('en-CA',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const p={}; f.formatToParts(new Date(ms)).forEach(function(x){p[x.type]=x.value;});
  return {key:p.year+'-'+p.month+'-'+p.day,min:(+p.hour%24)*60+(+p.minute),hhmm:pad(+p.hour%24)+':'+p.minute};
}
function dayShift(key,delta){ const d=new Date(key+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+delta); return d.toISOString().slice(0,10); }
function toMin(t){ const p=String(t).split(':').map(Number); return p[0]*60+p[1]; }
function diffOf(d,n){ let x=toMin(d.time)-n.min; if(x<-1200)x+=1440; if(x>1200)x-=1440; return x; }
function isLive(d,n){ return d.day===n.key||(n.min<360&&d.day===dayShift(n.key,-1)); }
const MANUAL=['ETIQUETANDO PASAJE','EN ABORDAJE','ÚLTIMA LLAMADA'];
function statOf(d,diff,e){
  if(d.status==='SALIDO'||diff<0)return 'SALIDO';
  if(MANUAL.indexOf(d.status)!==-1)return d.status;
  if(diff<=e.ultima)return 'ÚLTIMA LLAMADA';
  if(diff<=e.abordaje)return 'EN ABORDAJE';
  if(diff<=e.etiquetado)return 'ETIQUETANDO PASAJE';
  return d.status||'EN ESPERA';
}
const safe=function(k){ return String(k).replace(/[.#$\[\]\/|]/g,'_'); };
function message(d,st,prevTime,gate){
  const head=d.time+' '+d.destination;
  if(prevTime&&prevTime!==d.time)return '⏰ '+head+': cambió la hora, ahora sale '+d.time+(d.motivo?' ('+d.motivo+')':'');
  if(st==='ETIQUETANDO PASAJE')return '🧳 '+head+': ya están documentando equipaje';
  if(st==='EN ABORDAJE')return '🚌 '+head+': ¡abordaje! Pasa a '+gate;
  if(st==='ÚLTIMA LLAMADA')return '🔔 '+head+': ¡última llamada! '+gate;
  if(st==='SALIDO')return '✅ '+head+': tu autobús ya salió';
  return null;
}
function asList(v){ return Array.isArray(v)?v.filter(Boolean):(v&&typeof v==='object'?Object.keys(v).map(function(k){return v[k];}):[]); }

/* ctx: {db:{get,update,remove,set}, send(sub,payload)->{ok,gone}, nowMs, cfg} */
async function runOnce(ctx){
  const db=ctx.db, cfg=ctx.cfg, n=nowParts(ctx.nowMs,cfg.tz), out={enviados:0,quitados:0,chequeos:0};
  for(const b of Object.keys(cfg.branches)){
    const B=cfg.branches[b];
    const tokens=await db.get('push/'+b);
    if(tokens&&Object.keys(tokens).length){
      const deps=(await db.get(b+'/deps'))||{}, state=(await db.get('pushstate/'+b))||{};
      for(const tid of Object.keys(tokens)){
        const rec=tokens[tid]||{}, mine=state[tid]||{}, upd={};
        let gone=false;
        const push=async function(msg,k){
          const r=await ctx.send(rec.s,{title:cfg.titulo||'Aviso',body:msg,tag:safe(k),url:cfg.url||'./'});
          if(r&&r.gone)gone=true; else if(r&&r.ok)out.enviados++;
        };
        for(const k of asList(rec.f)){
          const parts=String(k).split('|'), id=parts[1], d=deps[id];
          if(!d||!d.time||d.day!==parts[0])continue;
          const diff=diffOf(d,n), st=statOf(d,diff,B.estados), sig=st+'|'+d.time, sk=safe(k), prev=mine[sk];
          if(prev===undefined){ upd[sk]=sig; }
          else if(prev!==sig){
            const msg=message(d,st,prev.split('|')[1],d.gate||B.puntoAbordaje);
            upd[sk]=sig; if(msg&&!gone)await push(msg,k);
          }
          const travel=+rec.v||0;
          if(travel>0&&st!=='SALIDO'&&diff>=0){
            const leaveAt=toMin(d.time)-travel-(cfg.margenCasaMin||20), lk='L_'+sk;
            if(n.min>=leaveAt&&n.min<toMin(d.time)&&mine[lk]!==d.time){
              upd[lk]=d.time; if(!gone)await push('🏠 Ya es hora de salir de casa para tu autobús de las '+d.time+' a '+d.destination,k+'-casa');
            }
          }
        }
        if(gone){ await db.remove('push/'+b+'/'+tid); await db.remove('pushstate/'+b+'/'+tid); out.quitados++; }
        else if(Object.keys(upd).length){ await db.update('pushstate/'+b+'/'+tid,upd); }
      }
    }
    /* Aviso al dueño: una TV lleva más de 10 minutos sin señal (y avisa cuando vuelve) */
    const dueno=await db.get('push/dueno');
    if(dueno&&Object.keys(dueno).length){
      const tvs=(await db.get(b+'/tvs'))||{}, tst=(await db.get('pushstate/_tv/'+b))||{}, upd={}, dgone=[];
      const sendAll=async function(msg,tag){ for(const id of Object.keys(dueno)){ const r=await ctx.send(dueno[id].s,{title:cfg.titulo||'Aviso',body:msg,tag:tag,url:cfg.urlDueno||'./?vista=dueno'}); if(r&&r.gone)dgone.push(id); else if(r&&r.ok)out.enviados++; } };
      for(const tid of Object.keys(tvs)){
        const t=tvs[tid]; if(!t||!t.ts)continue; const age=ctx.nowMs-t.ts, key=safe(tid), name=(B.empresa||b)+' · '+(t.view||tid);
        if(age>10*60000&&age<12*3600000&&!tst[key]){ upd[key]=1; await sendAll('📺 TV sin señal: '+name+' lleva '+Math.round(age/60000)+' min desconectada','tv-'+key); }
        else if(age<=3*60000&&tst[key]){ upd[key]=null; await sendAll('✅ TV de nuevo en línea: '+name,'tv-'+key); }
      }
      if(Object.keys(upd).length)await db.update('pushstate/_tv/'+b,upd);
      for(const id of dgone)await db.remove('push/dueno/'+id);
    }
    /* Autochequeo diario: deja el resultado en <sucursal>/chequeo para la lista de apertura del panel */
    if(cfg.chequeoHora){
      const last=await db.get('pushstate/_chequeo/'+b);
      if(last!==n.key&&n.min>=toMin(cfg.chequeoHora)&&n.min<toMin(cfg.chequeoHora)+30){
        const deps=(await db.get(b+'/deps'))||{}, tvs=(await db.get(b+'/tvs'))||{}, problemas=[];
        const hoy=Object.keys(deps).filter(function(k){return deps[k]&&deps[k].day===n.key;});
        if(!hoy.length)problemas.push('El itinerario de hoy no está cargado');
        const vivas=Object.keys(tvs).filter(function(k){return tvs[k]&&ctx.nowMs-tvs[k].ts<=5*60000;});
        if(!vivas.length)problemas.push('Ninguna TV está conectada');
        const sinUnidad=hoy.filter(function(k){ const d=deps[k]; return d.presetKey&&!d.bus&&diffOf(d,n)>=0&&diffOf(d,n)<=240; }).length;
        if(sinUnidad)problemas.push(sinUnidad+' salida(s) de las próximas 4 horas sin unidad');
        await db.set(b+'/chequeo',{ts:ctx.nowMs,fecha:n.key,hora:n.hhmm,ok:problemas.length===0,problemas:problemas});
        await db.set('pushstate/_chequeo/'+b,n.key); out.chequeos++;
      }
    }
  }
  return out;
}
module.exports={runOnce,nowParts,diffOf,statOf,message,toMin};
