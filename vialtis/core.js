/* Utilidades, Firebase, tiempo y datos compartidos */
'use strict';
const $ = function (id) { return document.getElementById(id); };
const esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
const pad = function (n) { return (n < 10 ? '0' : '') + n; };
const qs = new URLSearchParams(location.search);
const DEMO = qs.has('demo');
const lsGet = function (k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
const lsSet = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
const lsDel = function (k) { try { localStorage.removeItem(k); } catch (e) {} };
const deepMerge = function (base, over) {
  if (over === undefined || over === null) return JSON.parse(JSON.stringify(base));
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return over;
  const o = {}; Object.keys(base).forEach(function (k) { o[k] = deepMerge(base[k], over[k]); });
  Object.keys(over).forEach(function (k) { if (!(k in o)) o[k] = over[k]; });
  return o;
};
const rndCode = function (len, abc) { const a = new Uint32Array(len); (window.crypto || window.msCrypto).getRandomValues(a); let s = ''; for (let i = 0; i < len; i++) s += abc.charAt(a[i] % abc.length); return s; };
const asArr = function (x) { return Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.keys(x).map(function (k) { return x[k]; }) : []); };

/* ---------- Firebase ---------- */
let auth = null, db = null, srvOff = 0, FB_OK = false;
(function initFirebase() {
  const placeholder = /REEMPLAZAR/.test(JSON.stringify(CFG.firebase));
  if (!DEMO && placeholder) return;
  if (typeof firebase === 'undefined') return;
  try {
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(CFG.firebase);
    auth = firebase.auth(); db = firebase.database(); FB_OK = true;
    /* Solo para pruebas locales con los emuladores de Firebase (en config.js: emulador: { auth: '127.0.0.1:9099', db: '127.0.0.1:9000' }) */
    if (CFG.emulador && !DEMO) { auth.useEmulator('http://' + CFG.emulador.auth); const h = CFG.emulador.db.split(':'); db.useEmulator(h[0], +h[1]); }
    db.ref('.info/serverTimeOffset').on('value', function (s) { srvOff = s.val() || 0; });
  } catch (e) { console.error('Firebase:', e); }
})();
const TS = function () { return (typeof firebase !== 'undefined' && firebase.database && firebase.database.ServerValue) ? firebase.database.ServerValue.TIMESTAMP : Date.now(); };
const nowMs = function () { return Date.now() + srvOff; };

/* ---------- Tiempo (zona horaria de la plataforma) ---------- */
/* Zona horaria: la que eligió la empresa en Ajustes, o la de la plataforma */
const zonaOK = function (z) { try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch (e) { return false; } };
const zona = function () { const z = typeof S !== 'undefined' && S.aj && S.aj.zona; return z && zonaOK(z) ? z : CFG.plataforma.tz; };
function tzParts(ms) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: zona(), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = {}; f.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
  return { key: p.year + '-' + p.month + '-' + p.day, min: (+p.hour % 24) * 60 + (+p.minute), sec: +p.second, hh: pad(+p.hour % 24), mm: p.minute, ss: p.second };
}
const nowParts = function () { return tzParts(nowMs()); };
const toMin = function (t) { const p = String(t || '0:0').split(':').map(Number); return (p[0] || 0) * 60 + (p[1] || 0); };
const fromMin = function (m) { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
const dayShift = function (key, delta) { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + delta); return d.toISOString().slice(0, 10); };
/* Minutos que faltan para una salida. Usa el día de la salida (no adivina), y entiende un retraso que pasó de medianoche (23:50 → 00:10). */
const diffOf = function (d, n) {
  let t = toMin(d.time); if (d.orig && toMin(d.orig) - t > 720) t += 1440;
  if (d.day === n.key) return t - n.min;
  if (d.day && d.day === dayShift(n.key, -1)) return t - 1440 - n.min;
  let x = toMin(d.time) - n.min; if (x < -1200) x += 1440; if (x > 1200) x -= 1440; return x;   /* salidas sin día (datos viejos) */
};
const isLive = function (d, n) { return d.day === n.key || (n.min < 360 && d.day === dayShift(n.key, -1)); };
const weekIdx = function (key) { return (new Date(key + 'T12:00:00Z').getUTCDay() + 6) % 7; };   /* 0=lunes … 6=domingo */

/* ---------- Estado de la empresa que se está viendo ---------- */
const S = { e: null, meta: null, aj: null, deps: {}, rutas: {}, urgent: null, tvs: {}, plantillas: null };
const AJ = function () { return deepMerge(CFG.defaults, S.aj || {}); };
const empresaNombre = function () { const a = AJ(); return (a.marca.nombre || (S.meta && S.meta.nombre) || CFG.plataforma.nombre); };
const eref = function (p) { return db.ref('empresas/' + S.e + (p ? '/' + p : '')); };

/* ---------- Estados de una salida (los minutos salen de Voceo) ---------- */
const ST = { ESP: 'EN ESPERA', ETQ: 'ETIQUETANDO PASAJE', ABO: 'EN ABORDAJE', ULT: 'ÚLTIMA LLAMADA', SAL: 'SALIDO' };
const MANUAL = { ETIQUETANDO: ST.ETQ, ABORDAJE: ST.ABO, ULTIMA: ST.ULT, SALIDO: ST.SAL };
function estadoDe(d, diff) {
  if (d.status === 'SALIDO' || diff < 0) return ST.SAL;
  if (MANUAL[d.status]) return MANUAL[d.status];
  const v = AJ().voceo;
  if (diff <= v.ultima.min) return ST.ULT;
  if (diff <= v.abord.min) return ST.ABO;
  if (diff <= v.etiq.min) return ST.ETQ;
  return ST.ESP;
}
function buildList() {
  const n = nowParts();
  const arr = Object.keys(S.deps || {}).map(function (k) { const d = Object.assign({}, S.deps[k]); d.id = k; return d; })
    .filter(function (d) { return d && d.time && isLive(d, n); });
  arr.forEach(function (d) { d._diff = diffOf(d, n); d._st = estadoDe(d, d._diff); d._eta = d._diff >= 0 ? d._diff : null; });
  const vis = arr.filter(function (d) { return !(d._st === ST.SAL && d._diff <= -15); });
  vis.sort(function (a, b) { return a._diff - b._diff; });
  const nx = vis.find(function (d) { return d._st !== ST.SAL && d._diff >= 0; });
  vis.forEach(function (d) { d._next = d === nx; });
  return vis;
}
const badge = function (st) {
  const m = { 'EN ESPERA': 'status-espera', 'ETIQUETANDO PASAJE': 'status-etiq', 'EN ABORDAJE': 'status-abordaje', 'ÚLTIMA LLAMADA': 'status-ultima', 'SALIDO': 'status-salido' };
  return '<span class="badge-status ' + (m[st] || 'status-espera') + '">' + esc(st) + '</span>';
};
const etaHTML = function (d) { if (d._eta == null) return ''; return '<div class="eta' + (d._eta <= 5 ? ' hot' : '') + '">' + (d._eta === 0 ? 'sale ahora' : 'sale en ' + d._eta + ' min') + '</div>'; };
const noAcc = function (t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); };
function scalesHTML(sc, ciudades) {
  const mains = String(ciudades || '').split(',').map(noAcc).map(function (x) { return x.trim(); }).filter(Boolean);
  const stops = String(sc || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  if (!stops.length) return '';
  return '<div class="tv-scales"><span class="tv-sc-lbl">Escalas:</span>' + stops.map(function (s, i) {
    const main = mains.some(function (m) { return noAcc(s).indexOf(m) !== -1; });
    return (i ? '<i>•</i>' : '') + (main ? '<b class="tv-sc-main">' + esc(s) + '</b>' : '<span>' + esc(s) + '</span>');
  }).join('') + '</div>';
}

/* ---------- Avisos en pantalla y ventanas ---------- */
let toastT = null;
function toast(msg) {
  let t = $('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'v-toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2800);
}
const fail = function (e) { console.error(e); const m = String(e && e.message || e); toast(/PERMISSION|permiso/i.test(m) ? (S.meta && S.meta.suspendida ? '⛔ La empresa está suspendida: no se pueden hacer cambios' : '⛔ No tienes permiso para hacer eso') : '⚠️ ' + m.slice(0, 90)); };
function vqOpen(html) { const m = document.createElement('div'); m.className = 'vq-overlay'; m.innerHTML = '<div class="vq-sheet">' + html + '</div>'; document.body.appendChild(m); return m; }
function askUnit(titulo, actual) {
  return new Promise(function (res) {
    let v = String(actual || '');
    const m = vqOpen('<div class="vq-title">' + esc(titulo) + '</div><div class="vq-display" id="vq-disp"></div><div class="vq-keys">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button type="button" data-k="' + n + '">' + n + '</button>'; }).join('') +
      '<button type="button" data-k="clear" class="alt">Borrar</button><button type="button" data-k="0">0</button><button type="button" data-k="back" class="alt">⌫</button></div>' +
      '<div class="vq-row"><button type="button" class="vq-cancel" data-k="cancel">Cancelar</button><button type="button" class="vq-ok" data-k="ok">Guardar</button></div>');
    const disp = m.querySelector('#vq-disp'), paint = function () { disp.textContent = v || '—'; }, done = function (x) { m.remove(); res(x); };
    paint();
    m.addEventListener('click', function (e) {
      if (e.target === m) return done(null);
      const b = e.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k;
      if (k === 'cancel') return done(null);
      if (k === 'ok') return done(v);
      if (k === 'clear') v = ''; else if (k === 'back') v = v.slice(0, -1); else if (v.length < 10) v += k;
      paint();
    });
  });
}
function askDelay(titulo) {
  return new Promise(function (res) {
    let min = 15, why = '';
    const mins = [5, 10, 15, 30, 45, 60], rs = ['Clima', 'Mecánica', 'Tráfico', 'Operativo'];
    const m = vqOpen('<div class="vq-title">' + esc(titulo) + '</div><div class="vq-lbl">¿Cuánto?</div><div class="vq-chips">' +
      mins.map(function (n) { return '<button type="button" data-m="' + n + '" class="' + (n === 15 ? 'on' : '') + '">+' + n + ' min</button>'; }).join('') + '</div>' +
      '<div class="vq-lbl">Motivo (opcional)</div><div class="vq-chips">' + rs.map(function (r) { return '<button type="button" data-w="' + r + '">' + r + '</button>'; }).join('') + '</div>' +
      '<input type="text" id="vq-other" maxlength="40" placeholder="Otro motivo (máx. 40 letras)">' +
      '<div class="vq-row"><button type="button" class="vq-cancel" data-a="c">Cancelar</button><button type="button" class="vq-ok" data-a="ok" id="vq-go">Retrasar +15 min</button></div>');
    const go = m.querySelector('#vq-go'), other = m.querySelector('#vq-other'), done = function (x) { m.remove(); res(x); };
    m.addEventListener('click', function (e) {
      if (e.target === m) return done(null);
      const bm = e.target.closest('[data-m]'), bw = e.target.closest('[data-w]'), ba = e.target.closest('[data-a]');
      if (bm) { min = +bm.dataset.m; Array.prototype.forEach.call(m.querySelectorAll('[data-m]'), function (x) { x.classList.toggle('on', x === bm); }); go.textContent = 'Retrasar +' + min + ' min'; }
      if (bw) { why = why === bw.dataset.w ? '' : bw.dataset.w; other.value = ''; Array.prototype.forEach.call(m.querySelectorAll('[data-w]'), function (x) { x.classList.toggle('on', x.dataset.w === why); }); }
      if (ba) { if (ba.dataset.a === 'c') return done(null); return done({ min: min, why: (other.value.trim() || why).slice(0, 40) }); }
    });
  });
}
