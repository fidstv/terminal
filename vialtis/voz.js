/* Voceos automáticos con texto a voz (los textos y los minutos los edita cada empresa) y música de fondo */
'use strict';
const Voz = { unlocked: false, q: [], busy: false, voices: [], stopAt: 0 };

Voz.cargarVoces = function () { try { Voz.voices = (window.speechSynthesis && speechSynthesis.getVoices()) || []; } catch (e) { Voz.voices = []; } };
if (window.speechSynthesis) { Voz.cargarVoces(); try { speechSynthesis.onvoiceschanged = Voz.cargarVoces; } catch (e) {} }
Voz.elegir = function (nombre) {
  const v = Voz.voices; if (!v.length) return null;
  if (nombre) { const x = v.find(function (a) { return a.name === nombre; }); if (x) return x; }
  const pref = ['es-MX', 'es-US', 'es-419', 'es-ES', 'es'];
  for (let i = 0; i < pref.length; i++) { const x = v.find(function (a) { return String(a.lang).replace('_', '-').indexOf(pref[i]) === 0; }); if (x) return x; }
  return null;
};
/* "9548" → "9 5 4 8" para que se lea dígito por dígito */
const digitos = function (u) { return String(u || '').replace(/[^0-9A-Za-z]/g, '').split('').join(' '); };
Voz.plantilla = function (txt, d) {
  const a = AJ(), gate = d && d.gate ? d.gate : a.pantalla.anden;
  const map = { empresa: empresaNombre(), destino: d ? d.destination : '', unidad: d && d.bus ? digitos(d.bus) : 'asignada', anden: gate, hora: d ? (d.orig || d.time) : '', minutos: d && d.delay ? d.delay : '' };
  return String(txt || '').replace(/\{(\w+)\}/g, function (m, k) { return map[k] !== undefined ? map[k] : m; }).replace(/\s+/g, ' ').trim();
};
Voz.unlock = function () {
  if (Voz.unlocked) return; Voz.unlocked = true;
  try { if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) {}
  Musica.sync();
};
Voz.hablar = function (texto) {
  return new Promise(function (res) {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return res(false);
    try {
      const a = AJ().voz, u = new SpeechSynthesisUtterance(texto), v = Voz.elegir(a.nombre);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'es-MX';
      u.rate = +a.velocidad || 0.95; u.volume = a.volumen === undefined ? 1 : +a.volumen;
      let done = false; const fin = function (ok) { if (!done) { done = true; res(ok); } };
      u.onend = function () { fin(true); }; u.onerror = function () { fin(false); };
      setTimeout(function () { fin(false); }, 6000 + texto.length * 130);
      speechSynthesis.speak(u);
    } catch (e) { res(false); }
  });
};
Voz.correr = async function () {
  if (Voz.busy) return; Voz.busy = true; Musica.duck(true);
  const mio = Voz.stopAt;
  while (Voz.q.length && mio === Voz.stopAt) { const t = Voz.q.shift(); await Voz.hablar(t); }
  Voz.busy = false; Musica.duck(false);
};
Voz.decir = function (texto) { if (!Voz.unlocked || !texto) return false; Voz.q.push(texto); Voz.correr(); return true; };
Voz.parar = function () { Voz.stopAt++; Voz.q.length = 0; try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {} Voz.busy = false; Musica.duck(false); };
Voz.anunciar = function (modo, d) { const t = AJ().textos[modo]; return Voz.decir(Voz.plantilla(t, d)); };

/* Voceos automáticos: suenan una sola vez por salida y por tipo, según los minutos de la pestaña Voceo */
function firedSet() { try { return JSON.parse(lsGet('vialtis_fired', '{}')); } catch (e) { return {}; } }
Voz.tick = function (list) {
  if (!S.e) return;
  const a = AJ().voceo, f = firedSet(), n = nowParts(); let cambio = false;
  Object.keys(f).forEach(function (k) { if (f[k] !== n.key && f[k] !== dayShift(n.key, -1)) { delete f[k]; cambio = true; } });
  list.forEach(function (d) {
    if (d._st === ST.SAL || d._diff <= 0) return;
    const modo = d._diff <= a.ultima.min ? 'ultima' : d._diff <= a.abord.min ? 'abord' : d._diff <= a.etiq.min ? 'etiq' : null;
    if (!modo) return;
    const k = S.e + '|' + d.id + '|' + modo + '|' + d.time;
    if (f[k]) return;
    f[k] = n.key; cambio = true;
    if (a[modo].on !== false && Voz.unlocked) Voz.anunciar(modo, d);
  });
  if (cambio) lsSet('vialtis_fired', JSON.stringify(f));
};
/* Órdenes desde el panel: voceo manual, aviso de retraso y detener */
Voz.orden = function (c, kind) {
  if (!c || !c.ts) return;
  const last = +lsGet('vialtis_ord_' + kind, 0); if (c.ts <= last) return; lsSet('vialtis_ord_' + kind, String(c.ts));
  if (nowMs() - c.ts > 20000) return;
  if (kind === 'panico') return Voz.parar();
  const d = S.deps[c.id] ? Object.assign({ id: c.id }, S.deps[c.id]) : { destination: c.destino || '', bus: '', time: c.hora || '' };
  if (c.mode === 'retraso') { d.orig = c.hora || d.orig; d.delay = c.minutos || d.delay; }
  Voz.anunciar(c.mode, d);
};

/* ---------- Música de fondo ---------- */
const Musica = { lista: null, i: 0, ducked: false, audio: null };
Musica.cargar = function () {
  if (Musica.lista !== null) return;
  Musica.lista = [];
  fetch('musica/lista.json?' + (window.VIALTIS_VERSION || '1')).then(function (r) { return r.json(); }).then(function (l) {
    Musica.lista = (Array.isArray(l) ? l : []).filter(function (x) { return x && x.archivo; });
    for (let k = Musica.lista.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); const t = Musica.lista[k]; Musica.lista[k] = Musica.lista[j]; Musica.lista[j] = t; }
  }).catch(function () {});
};
Musica.vol = function () { const m = AJ().musica; return Math.max(0, Math.min(1, +m.vol || 0)) * (Musica.ducked ? 0.2 : 1); };
Musica.horario = function () { const m = AJ().musica, n = nowParts(), d = toMin(m.desde), h = toMin(m.hasta); return d <= h ? (n.min >= d && n.min < h) : (n.min >= d || n.min < h); };
Musica.sync = function () {
  const m = AJ().musica; Musica.cargar();
  if (!Musica.audio) { Musica.audio = new Audio(); Musica.audio.addEventListener('ended', function () { Musica.i++; Musica.sync(); }); }
  const au = Musica.audio, debe = Voz.unlocked && m.on && Musica.horario() && Musica.lista && Musica.lista.length && S.e && !(S.meta && S.meta.suspendida);
  if (!debe) { if (!au.paused) au.pause(); return; }
  au.volume = Musica.vol();
  if (au.paused) {
    const t = Musica.lista[Musica.i % Musica.lista.length]; const src = 'musica/' + t.archivo;
    if (au.getAttribute('data-src') !== src) { au.src = src; au.setAttribute('data-src', src); }
    au.play().catch(function () {});
  }
};
Musica.duck = function (on) { Musica.ducked = on; if (Musica.audio && !Musica.audio.paused) Musica.audio.volume = Musica.vol(); };
setInterval(function () { try { Musica.sync(); } catch (e) {} }, 15000);
