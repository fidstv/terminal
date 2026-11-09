/* Pantallas de TV: tabla de salidas, TV de andén y TV nueva (vincular con código) */
'use strict';
const TV_ID = (function () { let id = lsGet('vialtis_tvid', ''); if (!id) { id = 'TV-' + rndCode(10, 'abcdefghijkmnpqrstuvwxyz23456789'); lsSet('vialtis_tvid', id); } return id; })();
let tvVista = 'tv', andenN = 0, offSince = 0, urgSeen = null;

const gateNum = function (d) { const m = String(d.gate || AJ().pantalla.anden || '').match(/\d+/); return m ? +m[0] : 0; };
function aplicarZoom() {
  const p = AJ().pantalla, r = document.documentElement.style;
  r.setProperty('--tvz', String({ normal: 1, grande: 1.25, muygrande: 1.5 }[p.zoom] || 1));
  r.setProperty('--escz', ({ normal: 12, grande: 17, muygrande: 22 }[p.escalas] || 17) + 'px');
  const c = AJ().marca.color; if (/^#[0-9a-fA-F]{6}$/.test(c)) r.setProperty('--accent', c);
}
function guardarCache() { lsSet('vialtis_cache_' + S.e, JSON.stringify({ meta: S.meta, aj: S.aj, deps: S.deps })); }

function urgenteVigente() { const u = S.urgent; if (!u || !u.text) return null; if (u.ts && nowMs() - u.ts > 30 * 60000) return null; return u; }
function renderTV() {
  if (!S.e) return;
  const a = AJ(), list = buildList(), n = nowParts();
  aplicarZoom();
  const nombre = (S.meta && S.meta.nombre) || '';
  $('tv-brand').innerHTML = a.marca.logo ? '<img src="' + esc(a.marca.logo) + '" alt="">' : esc((a.marca.nombre || nombre || CFG.plataforma.nombre).toUpperCase().slice(0, 24));
  $('tv-title').textContent = 'SALIDAS DE AUTOBUSES'; $('tv-sub').textContent = 'PANTALLAS ' + CFG.plataforma.nombre;
  $('tv-time').textContent = n.hh + ':' + n.mm + ':' + n.ss;
  $('tv-date').textContent = new Intl.DateTimeFormat('es-MX', { timeZone: zona(), weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(nowMs()));
  const susp = !!(S.meta && S.meta.suspendida); $('tv-susp').classList.toggle('hidden', !susp);
  if (tvVista === 'anden') { renderAnden(list); return; }
  const g = a.pantalla.anden;
  $('tv-body').innerHTML = list.map(function (d) {
    return '<tr class="' + (d._next ? 'row-next ' : '') + (d._st === ST.SAL ? 'row-sal' : '') + '"><td class="c-time" style="font-size:calc(24px*var(--tvz,1))">' + esc(d.time) + '</td>' +
      '<td class="c-dest"><div class="dest" style="font-size:calc(20px*var(--tvz,1))">' + esc(d.destination) + '</div>' + scalesHTML(d.scales, a.pantalla.ciudades) + '</td>' +
      '<td class="c-bus">' + (d.bus ? '<span class="bus-badge">' + esc(d.bus) + '</span>' : '<span class="bus-none">---</span>') + '</td>' +
      '<td class="c-gate" style="font-size:calc(16px*var(--tvz,1))">' + esc(d.gate || g) + '</td>' +
      '<td class="c-st">' + badge(d._st) + etaHTML(d) + (d.delay > 0 ? '<div class="late">⏱ +' + d.delay + ' min' + (d.motivo ? ' · ' + esc(d.motivo) : '') + '</div>' : '') + '</td></tr>';
  }).join('');
  const vacio = !list.length && !susp;
  const idle = $('tv-idle'); idle.classList.toggle('hidden', !vacio);
  if (vacio) idle.innerHTML = '<div class="id-clock">' + n.hh + ':' + n.mm + '</div><div class="id-msg">' + esc(a.pantalla.mensajeVacio) + '</div>';
  const u = urgenteVigente(), ub = $('tv-urgent');
  ub.classList.toggle('hidden', !u); if (u) ub.innerHTML = '<span>⚠️ ' + esc(u.text) + '</span>';
  $('tv-foot-t').textContent = Voz.busy ? '🔊 VOCEO' : (u ? '⚠️ AVISO' : 'AVISOS');
  $('tv-ticker').textContent = u ? u.text : (a.pantalla.ticker || ('Gracias por viajar con ' + (nombre || 'nosotros') + '.'));
  if (!susp) Voz.tick(list);
}
function renderAnden(list) {
  const el = $('tv-anden'); el.classList.remove('hidden'); document.querySelector('.tv-main').classList.add('hidden');
  const mine = list.filter(function (d) { return d._st !== ST.SAL && d._diff >= 0 && gateNum(d) === andenN; });
  const cur = mine.find(function (d) { return d._st === ST.ABO || d._st === ST.ULT || d._st === ST.ETQ; }) || mine[0];
  let h = '<div class="an-head"><span>ANDÉN</span><b>' + (andenN || '?') + '</b></div>';
  if (!andenN) h = '<div class="an-free">Falta el número de andén<small>Agrega &amp;n=3 a la dirección</small></div>';
  else if (!cur) h += '<div class="an-free">LIBRE<small>Sin salidas asignadas por ahora</small></div>';
  else h += '<div class="an-card' + (cur._st === ST.ULT ? ' hurry' : '') + '"><div class="an-arrow">' + (cur._st === ST.ABO || cur._st === ST.ULT ? '⬇' : '➜') + '</div><div class="an-main">' + badge(cur._st) + '<h2>' + esc(cur.destination) + '</h2><div class="an-meta">' + esc(cur.time) + ' · Unidad ' + esc(cur.bus || 'por confirmar') + '</div>' + etaHTML(cur) + '</div></div>' +
    (mine.length > 1 ? '<div class="an-next">Después: ' + mine.slice(1, 3).map(function (d) { return esc(d.time) + ' ' + esc(d.destination); }).join(' · ') + '</div>' : '');
  el.innerHTML = h;
}
/* Deslizamiento continuo y suave de la tabla */
function iniciarScroll() {
  let pos = 0, last = 0, estado = 'arriba', desde = Date.now();
  document.body.classList.add('scroll-suave');
  (function cuadro(ts) {
    requestAnimationFrame(cuadro);
    const c = $('tv-wrap'); if (!c || tvVista !== 'tv') return;
    const p = AJ().pantalla, max = c.scrollHeight - c.clientHeight, now = Date.now(), pausa = (+p.pausa || 5) * 1000;
    if (max <= 2) { if (c.scrollTop) c.scrollTop = 0; pos = 0; last = 0; estado = 'arriba'; desde = now; return; }
    if (!last) { last = ts; return; }
    const dt = Math.min(100, ts - last) / 1000; last = ts;
    if (estado === 'arriba') { if (now - desde >= pausa) { estado = 'bajando'; pos = c.scrollTop; } return; }
    if (estado === 'bajando') { pos += (+p.velocidad || 40) * dt; if (pos >= max) { pos = max; estado = 'abajo'; desde = now; } c.scrollTop = Math.round(pos); return; }
    if (now - desde >= pausa) { pos = 0; c.scrollTop = 0; estado = 'arriba'; desde = now; }
  })(0);
}
function latido() { if (!S.e || tvVista === 'nueva') return; eref('tvs/' + TV_ID).set({ ts: TS(), view: tvVista, ver: String(window.VIALTIS_VERSION), audio: Voz.unlocked }).catch(function () {}); }

/* TV nueva: muestra un código; el administrador la vincula desde el panel */
function tvPair() {
  tvVista = 'nueva'; document.querySelector('.tv-main').classList.add('hidden'); document.querySelector('.tv-head').classList.add('hidden'); document.querySelector('.tv-foot').classList.add('hidden'); $('tv-sound').classList.add('hidden');
  if (qs.get('reset')) { ['vialtis_tv_e', 'vialtis_tv_vista', 'vialtis_tv_n'].forEach(lsDel); }
  const gE = lsGet('vialtis_tv_e', ''), gV = lsGet('vialtis_tv_vista', '');
  if (gE && gV) return location.replace('?e=' + encodeURIComponent(gE) + '&vista=' + gV + (lsGet('vialtis_tv_n', '') ? '&n=' + lsGet('vialtis_tv_n', '') : '') + (DEMO ? '&demo=1' : ''));
  lsDel('vialtis_pair');   /* versiones anteriores guardaban el código: ya no se reutiliza */
  const p = $('tv-pair'); p.classList.remove('hidden');
  /* Cada vez se pide un código NUEVO. Las reglas solo dejan crearlo si nadie lo usó antes y solo dejan asignarlo una vez,
     así una TV nunca toma la asignación vieja de otra empresa. */
  let intentos = 0;
  (function pedirCodigo() {
    const code = String(100000 + (Number('0x' + rndCode(8, '0123456789abcdef')) % 900000)), creado = nowMs();
    db.ref('pairing/' + code + '/info').set({ ts: TS() }).then(function () {
      const url = location.origin + location.pathname.replace(/[^\/]*$/, '') + '?vincular=' + code;
      p.innerHTML = '<h1>Vincular esta TV</h1><div class="pr-code">' + code.slice(0, 3) + ' ' + code.slice(3) + '</div>' +
        '<p>En el panel entra a <b>Ajustes → Pantallas</b>, escribe este código y elige qué pantalla será.</p>' +
        '<img class="pr-qr" src="' + esc(qrImg(url, 220)) + '" alt="" onerror="this.style.display=\'none\'"><p class="pr-wait">Esperando… esta TV se configura sola.</p>';
      db.ref('pairing/' + code + '/assigned').on('value', function (s) {
        const v = s.val(); if (!v || !v.e || (v.vista !== 'tv' && v.vista !== 'anden')) return;
        if (v.ts && v.ts < creado - 120000) return;   /* asignación vieja: no es para esta TV */
        lsSet('vialtis_tv_e', v.e); lsSet('vialtis_tv_vista', v.vista); lsSet('vialtis_tv_n', v.n ? String(v.n) : '');
        location.replace('?e=' + encodeURIComponent(v.e) + '&vista=' + v.vista + (v.n ? '&n=' + v.n : '') + (DEMO ? '&demo=1' : ''));
      });
    }).catch(function () {
      if (++intentos < 6) return pedirCodigo();
      p.innerHTML = '<h1>Vincular esta TV</h1><p>No se pudo obtener un código. Revisa el internet y recarga la página.</p>';
    });
  })();
}
/* El QR se genera aquí mismo (qrcode.js): funciona sin internet y nadie de fuera ve el código */
const qrImg = function (data, size) {
  try { const q = qrcode(0, 'M'); q.addData(data); q.make(); const c = Math.max(2, Math.floor(size / (q.getModuleCount() + 8))); return q.createDataURL(c, c * 4); } catch (e) { return ''; }
};

function startTV(vista) {
  tvVista = vista; document.body.classList.add('tv-mode'); $('gate').classList.add('hidden'); $('tv').classList.remove('hidden');
  if (vista === 'nueva') return tvPair();
  S.e = qs.get('e') || lsGet('vialtis_tv_e', '');
  if (!S.e) return tvPair();
  andenN = parseInt(qs.get('n') || lsGet('vialtis_tv_n', '0'), 10) || 0;
  try { const c = JSON.parse(lsGet('vialtis_cache_' + S.e, 'null')); if (c) { S.meta = c.meta; S.aj = c.aj; S.deps = c.deps || {}; } } catch (e) {}
  renderTV();
  const fallo = function () { $('tv-off').classList.remove('hidden'); $('tv-off').textContent = 'No se pudo leer la empresa. Revisa la dirección de esta TV.'; };
  eref('meta').on('value', function (s) { S.meta = s.val(); guardarCache(); renderTV(); }, fallo);
  eref('ajustes').on('value', function (s) { S.aj = s.val(); guardarCache(); renderTV(); Musica.sync(); });
  eref('deps').on('value', function (s) { S.deps = s.val() || {}; guardarCache(); renderTV(); });
  eref('urgent').on('value', function (s) {
    S.urgent = s.val(); renderTV();
    const u = urgenteVigente(), sig = u ? u.text + '|' + u.ts : '';
    if (urgSeen === null) urgSeen = sig; else if (sig && sig !== urgSeen) { urgSeen = sig; Voz.parar(); Voz.decir('Aviso importante. ' + u.text); }
  });
  eref('voz_cmd').on('value', function (s) { Voz.orden(s.val(), 'voz'); });
  eref('panico').on('value', function (s) { if (s.val()) Voz.orden({ ts: s.val() }, 'panico'); });
  db.ref('.info/connected').on('value', function (s) { if (s.val()) { offSince = 0; $('tv-off').classList.add('hidden'); } else if (!offSince) offSince = Date.now(); });
  setInterval(function () { if (offSince && Date.now() - offSince > 30000) { $('tv-off').textContent = 'Sin conexión · mostrando el último horario'; $('tv-off').classList.remove('hidden'); } }, 5000);
  setInterval(function () { const n = nowParts(); $('tv-time').textContent = n.hh + ':' + n.mm + ':' + n.ss; }, 1000);
  setInterval(renderTV, 10000);
  setTimeout(latido, 6000); setInterval(latido, 60000);
  const unlock = function () { Voz.unlock(); $('tv-sound').classList.add('hidden'); };
  $('tv-sound').addEventListener('click', unlock); $('tv-sound').focus();
  document.addEventListener('keydown', function (e) { if (!Voz.unlocked && (e.key === 'Enter' || e.key === ' ')) unlock(); });
  if (vista === 'anden') $('tv-sound').classList.add('hidden'); else iniciarScroll();
  if (navigator.wakeLock) { const wl = function () { try { navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {} }; wl(); document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') wl(); }); }
  setTimeout(function () { location.reload(); }, 6 * 3600 * 1000);   /* recarga cada 6 horas para tomar versiones nuevas */
}
