/* Panel de la empresa: Salidas (lista editable), Rutas, Voz, Pantalla y Ajustes */
'use strict';
let pendCode = (qs.get('vincular') || '').replace(/\D/g, '').slice(0, 6), tabActual = 'salidas', undoStack = [], pendiente = false, schT = 0, equipo = null, plataforma = null, misInv = [], got = { deps: false, rutas: false };
const esAdmin = function () { return Session.rol === 'admin'; };
const planDe = function () { const p = S.meta && S.meta.plan; return CFG.planes[p] ? p : 'gratis'; };
const baseURL = function () { return location.origin + location.pathname.replace(/[^\/]*$/, ''); };
const urlTV = function (v, n) { return baseURL() + '?e=' + S.e + '&vista=' + v + (n ? '&n=' + n : '') + (DEMO ? '&demo=1' : ''); };

function startPanel() {
  if (startPanel.uid) { if (startPanel.uid === Session.uid) return; return location.reload(); }   /* otra cuenta en la misma página: se recarga limpia */
  startPanel.uid = Session.uid;
  $('gate').classList.add('hidden'); $('app').classList.remove('hidden'); document.body.classList.remove('tv-mode');
  S.e = Session.empresa; document.body.classList.toggle('rol-taquillero', !esAdmin()); document.body.classList.toggle('es-dueno', Session.owner);
  const err = function () {};
  eref('meta').on('value', function (s) { S.meta = s.val(); schedule(); }, err);
  eref('ajustes').on('value', function (s) { S.aj = s.val(); schedule(); }, err);
  eref('deps').on('value', function (s) { S.deps = s.val() || {}; got.deps = true; autoCargar(); schedule(); }, err);
  eref('rutas').on('value', function (s) { S.rutas = s.val() || {}; got.rutas = true; autoCargar(); schedule(); }, err);
  eref('urgent').on('value', function (s) { S.urgent = s.val(); schedule(); }, err);
  eref('plantillas').on('value', function (s) { S.plantillas = s.val(); schedule(); }, err);
  eref('tvs').on('value', function (s) { S.tvs = s.val() || {}; schedule(); }, err);
  if (esAdmin()) db.ref('equipos/' + S.e).on('value', function (s) { equipo = s.val() || {}; schedule(); }, err);
  if (Session.owner) db.ref('plataforma/empresas').on('value', function (s) { plataforma = s.val() || {}; schedule(); }, err);
  document.addEventListener('focusout', function () { setTimeout(function () { if (pendiente) schedule(); }, 150); });
  document.addEventListener('click', clicks); document.addEventListener('change', cambios);
  setInterval(function () { const n = nowParts(); $('ap-clock').textContent = n.hh + ':' + n.mm; if (tabActual === 'salidas') schedule(); }, 15000);
  if (pendCode) { abiertos.tv = true; lsSet('vialtis_tab', 'ajustes'); }
  abrir(lsGet('vialtis_tab', 'salidas'));
}
function abrir(t) {
  if (!esAdmin() && (t === 'rutas' || t === 'voz' || t === 'pantalla')) t = 'salidas';
  tabActual = t; lsSet('vialtis_tab', t);
  Array.prototype.forEach.call(document.querySelectorAll('.pane'), function (p) { p.classList.toggle('hidden', p.id !== 'pane-' + t); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) { b.classList.toggle('on', b.dataset.tab === t); });
  renderActual(true);
}
function schedule() { clearTimeout(schT); schT = setTimeout(function () { renderActual(false); }, 40); }
function editando() { const a = document.activeElement; return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest('#panes')); }
function renderActual(forzar) {
  if (!forzar && editando()) { pendiente = true; return; }
  pendiente = false;
  const n = nowParts(), nm = empresaNombre(); $('ap-empresa').textContent = nm; $('ap-clock').textContent = n.hh + ':' + n.mm;
  $('ap-susp').classList.toggle('hidden', !(S.meta && S.meta.suspendida));
  ({ salidas: renderSalidas, rutas: renderRutas, voz: renderVoz, pantalla: renderPantalla, ajustes: renderAjustes }[tabActual] || renderSalidas)();
}

/* ---------- Salidas ---------- */
function limpiarViejas() {
  if (!got.deps) return; const n = nowParts(), lim = dayShift(n.key, -2), up = {};
  if (lsGet('vialtis_limpio_' + S.e, '') === n.key) return; lsSet('vialtis_limpio_' + S.e, n.key);
  Object.keys(S.deps).forEach(function (k) { const d = S.deps[k]; if (!d || !d.day || d.day < lim) up[k] = null; });
  if (Object.keys(up).length) eref('deps').update(up).catch(function () {});
}
function autoCargar() {
  limpiarViejas();
  /* Una vez por día, y otra vez si cambian las rutas (así no reaparece lo que se borró a mano) */
  if (!got.deps || !got.rutas || !Object.keys(S.rutas).length) return; const n = nowParts();
  const sig = n.key + '|' + Object.keys(S.rutas).sort().join(',');
  if (lsGet('vialtis_cargado_' + S.e, '') === sig) return; lsSet('vialtis_cargado_' + S.e, sig); cargarItinerario(false);
}
function cargarItinerario(forzar) {
  const n = nowParts(), wi = weekIdx(n.key), up = {}; let c = 0;
  Object.keys(S.rutas).forEach(function (rid) {
    const r = S.rutas[rid]; if (!r || r.activa === false) return;
    if (String(r.dias || '1111111').charAt(wi) !== '1') return;
    const id = n.key + '_' + rid; if (S.deps[id]) return;
    up[id] = { time: r.hora, destination: r.destino, scales: r.escalas || '', day: n.key, ruta: rid }; c++;
  });
  if (c) eref('deps').update(up).then(function () { toast('📥 ' + c + ' salidas cargadas'); }).catch(fail); else if (forzar) toast('Ya están cargadas todas las salidas de hoy');
}
function updDep(id, patch, label) {
  const d = S.deps[id]; if (!d) return Promise.resolve(); const prev = {};
  Object.keys(patch).forEach(function (k) { prev[k] = d[k] === undefined ? null : d[k]; });
  undoStack.push({ t: 'upd', id: id, prev: prev, label: label }); if (undoStack.length > 15) undoStack.shift();
  return eref('deps/' + id).update(patch).catch(fail);
}
function retrasar(id, m, why) {
  const d = S.deps[id]; if (!d) return; const hora = d.orig || d.time;
  const patch = { time: fromMin(toMin(d.time) + m), delay: (d.delay || 0) + m, orig: hora }; if (why) patch.motivo = why;
  updDep(id, patch, 'Retraso +' + m + ' min · ' + d.time + ' ' + d.destination);
  if (AJ().voceo.retraso.on !== false) eref('voz_cmd').set({ mode: 'retraso', id: id, minutos: m, hora: hora, destino: d.destination, ts: TS() }).catch(function () {});
}
function filaSalida(d, a) {
  const manual = MANUAL[d.status] && d.status !== 'SALIDO', stv = d.status && MANUAL[d.status] ? d.status : '';
  const late = !d.bus && d._diff >= 0 && d._diff <= 30 && d._st !== ST.SAL;
  const opt = function (v, t) { return '<option value="' + v + '"' + (stv === v ? ' selected' : '') + '>' + t + '</option>'; };
  return '<div class="sl-row' + (late ? ' late' : '') + (d._next ? ' next' : '') + (d._st === ST.SAL ? ' done' : '') + '" data-id="' + esc(d.id) + '">' +
    '<input type="time" class="sl-time" data-f="time" value="' + esc(d.time) + '">' +
    '<input type="text" class="sl-dest" data-f="destination" list="dl-rutas" maxlength="60" value="' + esc(d.destination) + '">' +
    '<button type="button" class="sl-bus' + (d.bus ? '' : ' none') + '" data-a="bus">🚌 ' + (d.bus ? '<b>' + esc(d.bus) + '</b>' : 'sin unidad') + '</button>' +
    '<input type="text" class="sl-gate" data-f="gate" maxlength="30" placeholder="' + esc(a.pantalla.anden) + '" value="' + esc(d.gate || '') + '">' +
    '<div class="sl-stwrap"><select class="sl-st" data-a="st" title="Estado: Automático sigue la hora">' + opt('', 'Automático') + opt('ETIQUETANDO', 'Etiquetando') + opt('ABORDAJE', 'Abordaje') + opt('ULTIMA', 'Última llamada') + opt('SALIDO', 'Salió') + '</select>' + (manual ? '<span class="pin" title="Estado fijado a mano">📌</span>' : '') + '<span class="sl-badge">' + badge(d._st) + '</span></div>' +
    '<div class="sl-dl"><button type="button" data-a="d5">+5</button><button type="button" data-a="d15">+15</button>' + (d.delay > 0 ? '<span class="dl-tag">⏱ +' + d.delay + '</span>' : '') + '</div>' +
    '<button type="button" class="sl-more" data-a="more" title="Más">⋯</button></div>';
}
function renderSalidas() {
  const a = AJ(), n = nowParts(), list = buildList();
  const hoy = Object.keys(S.deps).map(function (k) { return S.deps[k]; }).filter(function (d) { return d.day === n.key; });
  const sal = hoy.filter(function (d) { return diffOf(d, n) < 0; }).length, sin = list.filter(function (d) { return !d.bus && d._diff >= 0 && d._diff <= 90; }).length;
  const dests = {}; Object.keys(S.rutas).forEach(function (k) { if (S.rutas[k] && S.rutas[k].destino) dests[S.rutas[k].destino] = 1; });
  $('pane-salidas').innerHTML = '<div class="chips"><span class="chip">📊 Hoy: ' + hoy.length + ' salidas · ' + sal + ' ya salieron</span>' + (sin ? '<span class="chip bad">⚠️ ' + sin + ' sin unidad (90 min)</span>' : '') + '</div>' +
    '<div class="acts"><button type="button" class="btn btn-green" data-a="add">➕ Agregar salida</button><button type="button" class="btn btn-dark" data-a="load">📥 Cargar itinerario</button><button type="button" class="btn btn-dark' + (undoStack.length ? '' : ' hidden') + '" data-a="undo">↩️ Deshacer<small>' + esc(undoStack.length ? undoStack[undoStack.length - 1].label : '') + '</small></button></div>' +
    (list.length ? '<div class="sl-head"><span>Hora</span><span>Destino</span><span>Unidad</span><span>Andén</span><span>Estado</span><span>Retraso</span><span></span></div>' : '') +
    '<div class="sl-list">' + (list.length ? list.map(function (d) { return filaSalida(d, a); }).join('') : '<div class="empty">No hay salidas hoy.<br>Agrega una, o carga el itinerario desde tus <b>Rutas</b>.</div>') + '</div>' +
    '<datalist id="dl-rutas">' + Object.keys(dests).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>';
}
function modalAgregar() {
  const n = nowParts(), def = fromMin(n.min + 30);
  const m = vqOpen('<div class="vq-title">➕ Agregar salida</div><div class="vq-lbl">Hora</div><input type="time" id="ag-h" value="' + def + '"><div class="vq-lbl">Destino</div><input type="text" id="ag-d" list="dl-rutas" maxlength="60" placeholder="Ej. Tampico">' +
    '<div class="vq-lbl">Escalas (separadas con coma)</div><input type="text" id="ag-e" maxlength="200" placeholder="Ej. San Fernando, Soto la Marina"><div class="vq-lbl">Unidad (opcional)</div><input type="text" id="ag-b" maxlength="10" inputmode="numeric">' +
    '<div class="vq-row" style="margin-top:14px"><button type="button" class="vq-cancel" data-a="c">Cancelar</button><button type="button" class="vq-ok" data-a="ok">Agregar</button></div>');
  m.addEventListener('click', function (e) {
    if (e.target === m) return m.remove(); const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'c') return m.remove();
    const h = m.querySelector('#ag-h').value, d = m.querySelector('#ag-d').value.trim(); if (!h || !d) return toast('Escribe la hora y el destino');
    const id = 'x' + Date.now(), obj = { time: h, destination: d, scales: m.querySelector('#ag-e').value.trim(), bus: m.querySelector('#ag-b').value.trim() || null, day: nowParts().key };
    if (!obj.bus) delete obj.bus;
    eref('deps/' + id).set(obj).then(function () { undoStack.push({ t: 'add', id: id, label: 'Agregar ' + h + ' ' + d }); toast('✅ Salida agregada'); m.remove(); }).catch(fail);
  });
}
function menuMas(id) {
  const d = S.deps[id]; if (!d) return;
  const m = vqOpen('<div class="vq-title">' + esc(d.time + ' · ' + d.destination) + '</div><button type="button" class="vq-big" data-m="delay">⏱ Retraso con motivo<small>Elige cuánto y por qué</small></button>' +
    '<button type="button" class="vq-big" data-m="dup">📄 Duplicar esta salida<small>Para un refuerzo</small></button>' +
    '<div class="vq-lbl">Voceo ahora</div><div class="vq-chips"><button type="button" data-m="v-etiq">Etiquetado</button><button type="button" data-m="v-abord">Abordaje</button><button type="button" data-m="v-ultima">Última llamada</button></div>' +
    '<button type="button" class="vq-big danger" data-m="del" style="margin-top:12px">🗑️ Eliminar salida</button><div class="vq-row"><button type="button" class="vq-cancel" data-m="c">Cerrar</button></div>');
  m.addEventListener('click', async function (e) {
    if (e.target === m) return m.remove(); const b = e.target.closest('[data-m]'); if (!b) return; const k = b.dataset.m; m.remove();
    if (k === 'delay') { const r = await askDelay('Retrasar · ' + d.time + ' ' + d.destination); if (r) retrasar(id, r.min, r.why); }
    else if (k === 'dup') { const nid = 'x' + Date.now(), c = Object.assign({}, d); delete c.status; delete c.id; c.day = nowParts().key; eref('deps/' + nid).set(c).then(function () { undoStack.push({ t: 'add', id: nid, label: 'Duplicar ' + d.time }); toast('📄 Duplicada'); }).catch(fail); }
    else if (k.indexOf('v-') === 0) { eref('voz_cmd').set({ mode: k.slice(2), id: id, ts: TS() }).then(function () { toast('🔊 Voceo enviado a las TVs'); }).catch(fail); }
    else if (k === 'del') { if (!confirm('¿Eliminar esta salida?')) return; const full = Object.assign({}, d); delete full.id; undoStack.push({ t: 'del', id: id, full: full, label: 'Eliminar ' + d.time + ' ' + d.destination }); eref('deps/' + id).remove().catch(fail); }
  });
}
function deshacer() {
  const u = undoStack.pop(); if (!u) return; let p;
  if (u.t === 'upd') p = eref('deps/' + u.id).update(u.prev); else if (u.t === 'del') p = eref('deps/' + u.id).set(u.full); else p = eref('deps/' + u.id).remove();
  p.then(function () { toast('↩️ Acción deshecha'); schedule(); }).catch(fail);
}

/* ---------- Rutas ---------- */
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
function renderRutas() {
  const ids = Object.keys(S.rutas).sort(function (a, b) { return toMin((S.rutas[a] || {}).hora) - toMin((S.rutas[b] || {}).hora); }), lim = CFG.planes[planDe()].rutas;
  $('pane-rutas').innerHTML = '<div class="chips"><span class="chip">🗺️ ' + ids.length + ' de ' + lim + ' rutas (plan ' + esc(CFG.planes[planDe()].nombre) + ')</span></div>' +
    '<div class="acts"><button type="button" class="btn btn-green" data-a="r-add">➕ Agregar ruta</button><button type="button" class="btn btn-dark" data-a="r-paste">📋 Pegar lista</button>' + (ids.length ? '' : '<button type="button" class="btn btn-dark" data-a="r-demo">✨ Cargar ejemplo</button>') + '</div>' +
    '<p class="hint">Aquí defines tu itinerario fijo. Cada día se cargan solas las rutas activas que correspondan a ese día.</p>' +
    '<div class="rt-list">' + (ids.length ? ids.map(function (id) {
      const r = S.rutas[id], dias = String(r.dias || '1111111');
      return '<div class="rt-row' + (r.activa === false ? ' off' : '') + '" data-rid="' + esc(id) + '"><input type="time" data-rf="hora" value="' + esc(r.hora) + '"><input type="text" data-rf="destino" value="' + esc(r.destino) + '" placeholder="Destino" maxlength="60"><input type="text" data-rf="escalas" value="' + esc(r.escalas || '') + '" placeholder="Escalas (coma)" maxlength="200">' +
        '<div class="rt-dias">' + DIAS.map(function (x, i) { return '<button type="button" data-a="r-dia" data-i="' + i + '" class="' + (dias.charAt(i) === '1' ? 'on' : '') + '">' + x + '</button>'; }).join('') + '</div>' +
        '<label class="sw"><input type="checkbox" data-rf="activa" ' + (r.activa === false ? '' : 'checked') + '><i></i></label><button type="button" class="rt-del" data-a="r-del" title="Quitar">🗑️</button></div>';
    }).join('') : '<div class="empty">Todavía no tienes rutas.<br>Agrega una, pega una lista, o carga el ejemplo.</div>') + '</div>';
}
function altaRutas(arr) {
  const lim = CFG.planes[planDe()].rutas; if (Object.keys(S.rutas).length + arr.length > lim) return toast('Tu plan permite ' + lim + ' rutas');
  const up = {}; arr.forEach(function (r, i) { up['r' + (Date.now() + i)] = { hora: r.hora, destino: r.destino, escalas: r.escalas || '', dias: '1111111', activa: true }; });
  eref('rutas').update(up).then(function () { toast('✅ ' + arr.length + ' rutas agregadas'); }).catch(fail);
}
function modalPegar() {
  const m = vqOpen('<div class="vq-title">📋 Pegar lista de rutas</div><p class="hint">Una por renglón: <b>hora | destino | escalas</b><br>Ej: 10:30 | San Luis Potosí | San Fernando, Jiménez</p><textarea id="pg-t" rows="8" placeholder="08:00 | Tampico | San Fernando, Soto la Marina"></textarea>' +
    '<div class="vq-row" style="margin-top:12px"><button type="button" class="vq-cancel" data-a="c">Cancelar</button><button type="button" class="vq-ok" data-a="ok">Agregar</button></div>');
  m.addEventListener('click', function (e) {
    if (e.target === m) return m.remove(); const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'c') return m.remove();
    const arr = []; m.querySelector('#pg-t').value.split('\n').forEach(function (l) {
      const p = l.split(/\s*[|;\t]\s*/); const h = (p[0] || '').trim().match(/^(\d{1,2})[:.](\d{2})/); if (!h || !p[1]) return;
      arr.push({ hora: pad(+h[1]) + ':' + h[2], destino: p[1].trim().slice(0, 60), escalas: (p[2] || '').trim().slice(0, 200) });
    });
    if (!arr.length) return toast('No encontré rutas. Usa: hora | destino | escalas'); altaRutas(arr); m.remove();
  });
}

/* ---------- Voz ---------- */
const PH = '{empresa} {destino} {unidad} {anden} {hora} {minutos}';
function renderVoz() {
  const a = AJ(), v = a.voceo, t = a.textos, vz = a.voz; Voz.cargarVoces();
  const sw = function (id, on) { return '<label class="sw"><input type="checkbox" id="' + id + '" ' + (on ? 'checked' : '') + '><i></i></label>'; };
  const card = function (k, ico, nombre, desc) { return '<div class="vx-card"><div class="vx-head"><span class="vx-ico">' + ico + '</span><div class="vx-tt"><b>' + nombre + '</b><small>' + desc + '</small></div>' + sw('vz-' + k + '-on', v[k].on !== false) + '</div>' +
    '<div class="vx-min"><label>Sonar cuando falten</label><input type="number" id="vz-' + k + '-min" min="1" max="240" step="1" inputmode="numeric" value="' + v[k].min + '"><span>min</span></div>' +
    '<label class="vz-lbl">Lo que dice</label><textarea id="vz-t-' + k + '" rows="3" maxlength="300">' + esc(t[k]) + '</textarea><button type="button" class="btn btn-dark vz-play" data-a="vz-play" data-k="' + k + '">▶ Probar</button></div>'; };
  const voces = Voz.voices.filter(function (x) { return /^es/i.test(String(x.lang).replace('_', '-')); });
  $('pane-voz').innerHTML = '<div class="vx-intro"><h2>🔊 Voceos automáticos</h2><p>Enciende o apaga cada voceo, elige con cuántos minutos de anticipación suena y escribe lo que dice. La TV lo lee en voz alta.</p></div>' +
    card('etiq', '🧳', 'Etiquetado', 'Pasajeros a documentar equipaje') + card('abord', '🚌', 'Abordaje', 'Abordaje en el andén') + card('ultima', '🔔', 'Última llamada', 'Última llamada para abordar') +
    '<div class="vx-card"><div class="vx-head"><span class="vx-ico">⏱</span><div class="vx-tt"><b>Retraso</b><small>Avisa en voz alta cuando marcas un retraso</small></div>' + sw('vz-retraso-on', v.retraso.on !== false) + '</div><label class="vz-lbl">Lo que dice</label><textarea id="vz-t-retraso" rows="3" maxlength="300">' + esc(t.retraso) + '</textarea><button type="button" class="btn btn-dark vz-play" data-a="vz-play" data-k="retraso">▶ Probar</button></div>' +
    '<p class="hint">Puedes usar estos huecos en el texto, se llenan solos: <code>' + PH + '</code></p>' +
    '<div class="vx-card"><div class="vx-tt"><b>🗣️ La voz</b><small>Se usa la voz de la TV o del navegador. Una voz de calidad en español de México suena mucho mejor.</small></div>' +
    '<label class="vz-lbl">Voz</label><select id="vz-voz"><option value="">Automática (recomendada)</option>' + voces.map(function (x) { return '<option value="' + esc(x.name) + '"' + (vz.nombre === x.name ? ' selected' : '') + '>' + esc(x.name + ' (' + x.lang + ')') + '</option>'; }).join('') + '</select>' +
    '<label class="vz-lbl">Velocidad: <b id="vz-vel-v">' + vz.velocidad + '</b></label><input type="range" id="vz-vel" min="0.6" max="1.3" step="0.05" value="' + vz.velocidad + '">' +
    '<label class="vz-lbl">Volumen: <b id="vz-vol-v">' + vz.volumen + '</b></label><input type="range" id="vz-vol" min="0.2" max="1" step="0.1" value="' + vz.volumen + '"></div>' +
    '<div id="vz-prev" class="vx-prev"></div><div id="vz-msg" class="vx-msg"></div>' +
    '<div class="acts"><button type="button" class="btn btn-green" data-a="vz-save">Guardar cambios</button><button type="button" class="btn btn-dark btn-red" data-a="vz-reset">Restaurar originales</button></div>';
  vozPrev();
}
function vozLeer() {
  const g = function (id) { return $(id); };
  return { voceo: { etiq: { on: g('vz-etiq-on').checked, min: +g('vz-etiq-min').value }, abord: { on: g('vz-abord-on').checked, min: +g('vz-abord-min').value }, ultima: { on: g('vz-ultima-on').checked, min: +g('vz-ultima-min').value }, retraso: { on: g('vz-retraso-on').checked } },
    textos: { etiq: g('vz-t-etiq').value.trim(), abord: g('vz-t-abord').value.trim(), ultima: g('vz-t-ultima').value.trim(), retraso: g('vz-t-retraso').value.trim() },
    voz: { nombre: g('vz-voz').value, velocidad: +g('vz-vel').value, volumen: +g('vz-vol').value } };
}
function vozCheck(v) {
  const E = v.voceo.etiq.min, A = v.voceo.abord.min, U = v.voceo.ultima.min;
  if ([E, A, U].some(function (x) { return !(x >= 1 && x <= 240 && Math.floor(x) === x); })) return 'Escribe minutos enteros entre 1 y 240 en los tres voceos.';
  if (!(E > A && A > U)) return 'Los minutos deben ir de mayor a menor: etiquetado › abordaje › última llamada.';
  if (Object.keys(v.textos).some(function (k) { return v.textos[k].length < 5; })) return 'Cada voceo necesita un texto (mínimo 5 letras).';
  return '';
}
function vozPrev() {
  if (!$('vz-etiq-min')) return; const v = vozLeer(), err = vozCheck(v), at = function (m) { return fromMin(14 * 60 - m); };
  const it = function (ico, n, x) { return '<span class="vx-pv' + (x.on ? '' : ' off') + '">' + ico + ' ' + n + ' <b>' + (x.on ? at(x.min) : 'apagado') + '</b></span>'; };
  $('vz-prev').innerHTML = '<div class="vx-pv-t">Ejemplo: para una salida a las <b>14:00</b> sonaría así</div>' + it('🧳', 'Etiquetado', v.voceo.etiq) + it('🚌', 'Abordaje', v.voceo.abord) + it('🔔', 'Última llamada', v.voceo.ultima);
  if (!vozPrev.keep) { $('vz-msg').textContent = err; $('vz-msg').className = 'vx-msg' + (err ? ' bad' : ''); }
}

/* ---------- Pantalla ---------- */
function renderPantalla() {
  const a = AJ(), p = a.pantalla, m = a.musica, mk = a.marca;
  const grp = function (g, val) { return '<div class="zm-group" data-zg="' + g + '">' + [['normal', 'Normal'], ['grande', 'Grande'], ['muygrande', 'Muy grande']].map(function (o) { return '<button type="button" data-zv="' + o[0] + '" class="' + (val === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>'; };
  $('pane-pantalla').innerHTML = '<div class="box"><h3>🔎 Tamaño de la pantalla</h3><p class="hint">Agranda lo importante de la tabla. Cuanto más grande, menos salidas caben a la vez.</p><div class="zm-lbl">Tamaño general</div>' + grp('zoom', p.zoom) + '<div class="zm-lbl">Tamaño de las escalas</div>' + grp('escalas', p.escalas) + '</div>' +
    '<div class="box"><h3>🏙️ Textos de la pantalla</h3><label class="vz-lbl">Ciudades que se destacan en dorado (separadas con coma)</label><input type="text" data-pf="ciudades" value="' + esc(p.ciudades) + '" placeholder="Ej. Victoria, Mante" maxlength="120">' +
    '<label class="vz-lbl">Andén que se muestra si una salida no tiene andén</label><input type="text" data-pf="anden" value="' + esc(p.anden) + '" maxlength="30">' +
    '<label class="vz-lbl">Mensaje cuando no hay salidas</label><input type="text" data-pf="mensajeVacio" value="' + esc(p.mensajeVacio) + '" maxlength="90">' +
    '<label class="vz-lbl">Texto de la barra de abajo (opcional)</label><input type="text" data-pf="ticker" value="' + esc(p.ticker) + '" maxlength="140" placeholder="Gracias por viajar con nosotros"></div>' +
    '<div class="box"><h3>🎨 Identidad</h3><label class="vz-lbl">Nombre en pantalla</label><input type="text" data-mf="nombre" value="' + esc(mk.nombre) + '" maxlength="24" placeholder="' + esc((S.meta && S.meta.nombre) || '') + '">' +
    '<label class="vz-lbl">Color principal</label><input type="color" data-mf="color" value="' + esc(mk.color) + '"><label class="vz-lbl">Logo (imagen)</label><input type="file" id="mk-logo" accept="image/*"><div class="acts"><button type="button" class="btn btn-dark" data-a="mk-quitar">Quitar logo</button></div></div>' +
    '<div class="box"><h3>🎵 Música de fondo</h3><p class="hint">Suena bajito en las TVs y baja sola cuando hay un voceo. Las canciones se guardan en la carpeta <code>musica</code> de la plataforma. <span id="mu-n"></span></p>' +
    '<div class="vx-head"><div class="vx-tt"><b>Música encendida</b></div><label class="sw"><input type="checkbox" data-uf="on" ' + (m.on ? 'checked' : '') + '><i></i></label></div>' +
    '<label class="vz-lbl">Volumen: <b id="mu-vol-v">' + m.vol + '</b></label><input type="range" data-uf="vol" min="0.05" max="1" step="0.05" value="' + m.vol + '">' +
    '<div class="row2"><div><label class="vz-lbl">Desde</label><input type="time" data-uf="desde" value="' + esc(m.desde) + '"></div><div><label class="vz-lbl">Hasta</label><input type="time" data-uf="hasta" value="' + esc(m.hasta) + '"></div></div></div>';
  fetch('musica/lista.json').then(function (r) { return r.json(); }).then(function (l) { const x = $('mu-n'); if (x) x.textContent = (Array.isArray(l) ? l.length : 0) + ' canciones disponibles.'; }).catch(function () { const x = $('mu-n'); if (x) x.textContent = 'Aún no hay canciones.'; });
}

/* ---------- Ajustes ---------- */
const abiertos = {};
function renderAjustes() {
  const a = AJ(), pl = planDe(), lim = CFG.planes[pl], tvs = Object.keys(S.tvs).map(function (k) { return Object.assign({ id: k }, S.tvs[k]); }).filter(function (t) { return t.ts && nowMs() - t.ts < 7 * 864e5; });
  const on = tvs.filter(function (t) { return nowMs() - t.ts <= 150000; });
  const det = function (k, titulo, cuerpo, soloAdmin) { if (soloAdmin && !esAdmin()) return ''; return '<details class="adm-sec" data-k="' + k + '"' + (abiertos[k] ? ' open' : '') + '><summary>' + titulo + '</summary><div class="adm-body">' + cuerpo + '</div></details>'; };
  const u = urgenteVigente(), plant = asArr(S.plantillas).length ? asArr(S.plantillas) : ['🌧️ Retraso por lluvia: las salidas pueden demorar. Gracias por su paciencia.', '🔧 Unidad en revisión: se asignará otra unidad en breve.', '🚦 Tráfico intenso: posibles demoras de 10 a 15 minutos.'];
  $('pane-ajustes').innerHTML =
    det('av', '📢 Avisos urgentes', (u ? '<div class="chip bad">Publicado: ' + esc(u.text) + '</div>' : '') + '<input type="text" id="av-t" maxlength="140" placeholder="Escribe el aviso (se lee en voz alta en las TVs)"><div class="acts"><button type="button" class="btn btn-green" data-a="av-pub">Publicar</button><button type="button" class="btn btn-dark" data-a="av-quitar">Quitar aviso</button></div>' +
      '<div class="vq-lbl">Plantillas</div><div class="tpls">' + plant.map(function (t, i) { return '<button type="button" class="btn btn-dark tpl" data-a="av-tpl" data-i="' + i + '">' + esc(t.length > 42 ? t.slice(0, 41) + '…' : t) + '</button>'; }).join('') + '</div><div class="acts"><button type="button" class="btn btn-dark" data-a="av-guardar">＋ Guardar el texto como plantilla</button></div>') +
    det('tv', '📺 Pantallas (TVs)', '<p class="hint">TVs de este plan: <b>' + on.length + ' conectadas</b> de ' + lim.tvs + ' permitidas.</p>' +
      '<div class="vq-lbl">Vincular una TV nueva</div><p class="hint">Abre en la TV: <code>' + esc(baseURL() + '?vista=nueva' + (DEMO ? '&demo=1' : '')) + '</code> y escribe aquí el código de 6 números que muestra.</p>' +
      '<div class="row2"><input type="text" id="pr-code" inputmode="numeric" maxlength="7" placeholder="Código de la TV" value="' + esc(pendCode) + '"><select id="pr-vista"><option value="tv">TV de salidas</option><option value="anden">TV de andén</option></select></div><input type="number" id="pr-n" min="1" max="99" placeholder="Número de andén (solo para TV de andén)" class="hidden"><div class="acts"><button type="button" class="btn btn-green" data-a="pr-ok">Vincular</button></div>' +
      '<div class="vq-lbl">TVs de esta empresa</div>' + (tvs.length ? tvs.map(function (t) { const v = nowMs() - t.ts <= 150000; return '<div class="sc-item ' + (v ? 'ok' : 'no') + '"><span>' + (v ? '🟢' : '🔴') + ' ' + esc(t.view || 'tv') + ' · ' + esc(t.id) + '</span><span class="hint">' + (v ? 'conectada' : 'visto hace ' + Math.round((nowMs() - t.ts) / 60000) + ' min') + '</span></div>'; }).join('') : '<p class="hint">Ninguna TV ha reportado todavía.</p>') +
      '<div class="vq-lbl">Direcciones</div><div class="urls"><button type="button" class="btn btn-dark" data-a="copy" data-v="' + esc(urlTV('tv')) + '">📋 Copiar dirección de la TV</button><button type="button" class="btn btn-dark" data-a="copy" data-v="' + esc(urlTV('anden', 1)) + '">📋 Copiar dirección de andén</button></div>', true) +
    det('eq', '👥 Equipo', '<p class="hint">Crea un código de invitación y compártelo. La persona crea su cuenta con ese código y entra a esta empresa.</p><div class="row2"><select id="iv-rol"><option value="taquillero">Taquillero (opera las salidas)</option><option value="admin">Administrador (configura todo)</option></select><button type="button" class="btn btn-green" data-a="iv-crear">Crear invitación</button></div><div id="iv-out">' + misInv.map(function (i) { return '<div class="invcard"><b>' + esc(i.code) + '</b> · ' + esc(i.rol) + '<br><small>' + esc(i.url) + '</small><button type="button" class="btn btn-dark" data-a="copy" data-v="' + esc(i.url) + '">📋 Copiar enlace</button></div>'; }).join('') + '</div>' +
      '<div class="vq-lbl">Personas</div>' + Object.keys(equipo || {}).map(function (uid) { const p = equipo[uid]; return '<div class="sc-item"><span>' + (p.rol === 'admin' ? '🛡️' : '🎫') + ' ' + esc(p.email) + ' · ' + esc(p.rol) + '</span>' + (uid === S.e ? '<span class="hint">' + (uid === Session.uid ? 'tú · ' : '') + 'fundador</span>' : uid !== Session.uid ? '<button type="button" class="btn btn-dark btn-red" data-a="eq-quitar" data-u="' + esc(uid) + '">Quitar</button>' : '<span class="hint">tú</span>') + '</div>'; }).join(''), true) +
    det('cu', '👤 Mi cuenta', '<div class="sc-item"><span>Correo: <b>' + esc(Session.email) + '</b></span></div><div class="sc-item"><span>Rol: <b>' + esc(Session.rol) + '</b> · Plan: <b>' + esc(lim.nombre) + '</b></span></div>' +
      (esAdmin() ? '<label class="vz-lbl">Nombre de la empresa</label><input type="text" data-nf="nombre" value="' + esc((S.meta && S.meta.nombre) || '') + '" maxlength="60">' : '') +
      '<div class="acts"><button type="button" class="btn btn-dark" data-a="pw">🔑 Cambiar mi contraseña (te llega un correo)</button><button type="button" class="btn btn-dark btn-red" data-a="logout">Cerrar sesión</button></div>') +
    (Session.owner ? det('pl', '🌐 Plataforma (solo tú)', '<p class="hint">Todas las empresas registradas: ' + Object.keys(plataforma || {}).length + '</p>' + Object.keys(plataforma || {}).map(function (id) { const p = plataforma[id]; return '<div class="sc-item"><span><b>' + esc(p.nombre) + '</b> · ' + new Date(p.creada || 0).toLocaleDateString('es-MX') + '<br><small>' + esc(id) + '</small></span><span><select data-a="pl-plan" data-id="' + esc(id) + '">' + Object.keys(CFG.planes).map(function (k) { return '<option value="' + k + '"' + (p.plan === k ? ' selected' : '') + '>' + CFG.planes[k].nombre + '</option>'; }).join('') + '</select> <button type="button" class="btn btn-dark" data-a="pl-susp" data-id="' + esc(id) + '">Suspender / activar</button></span></div>'; }).join(''), false) : '');
  const sel = $('pr-vista'); if (sel) sel.onchange = function () { $('pr-n').classList.toggle('hidden', sel.value !== 'anden'); };
}

/* ---------- Clics y cambios ---------- */
function clicks(e) {
  const t = e.target.closest('[data-tab],[data-a],[data-zv]'); if (!t) { const s = e.target.closest('details.adm-sec > summary'); if (s) abiertos[s.parentElement.dataset.k] = !s.parentElement.open; return; }
  if (t.dataset.tab) return abrir(t.dataset.tab);
  if (t.dataset.zv) { const g = t.parentElement.dataset.zg, o = {}; return eref('ajustes/pantalla/' + g).set(t.dataset.zv).then(function () { toast('🔎 Tamaño actualizado en las TVs'); }).catch(fail); }
  const a = t.dataset.a, row = t.closest('[data-id]'), id = row && row.dataset.id, d = id && S.deps[id];
  if (a === 'add') return modalAgregar(); if (a === 'load') return cargarItinerario(true); if (a === 'undo') return deshacer();
  if (a === 'bus' && d) return askUnit('Unidad · ' + d.time + ' ' + d.destination, d.bus).then(function (v) { if (v !== null) updDep(id, { bus: v || null }, 'Unidad ' + (v || 'quitada') + ' · ' + d.time); });
  if ((a === 'd5' || a === 'd15') && d) return retrasar(id, a === 'd5' ? 5 : 15);
  if (a === 'more' && d) return menuMas(id);
  if (a === 'r-add') return altaRutas([{ hora: '08:00', destino: 'Nuevo destino', escalas: '' }]);
  if (a === 'r-paste') return modalPegar();
  if (a === 'r-demo') return altaRutas([{ hora: '08:00', destino: 'Tampico', escalas: 'San Fernando, Soto la Marina' }, { hora: '10:30', destino: 'San Luis Potosí', escalas: 'Ciudad Victoria, Jaumave, Tula' }, { hora: '13:00', destino: 'Ciudad Valles', escalas: 'Ciudad Victoria, Ciudad Mante' }, { hora: '18:30', destino: 'Tampico', escalas: 'San Fernando, Altamira' }]);
  const rr = t.closest('[data-rid]');
  if (a === 'r-del' && rr) { if (confirm('¿Quitar esta ruta?')) eref('rutas/' + rr.dataset.rid).remove().catch(fail); return; }
  if (a === 'r-dia' && rr) { const r = S.rutas[rr.dataset.rid], s = String(r.dias || '1111111').split(''), i = +t.dataset.i; s[i] = s[i] === '1' ? '0' : '1'; return eref('rutas/' + rr.dataset.rid + '/dias').set(s.join('')).catch(fail); }
  if (a === 'vz-play') { const v = vozLeer(), k = t.dataset.k, ej = { destination: 'San Luis Potosí', bus: '9548', gate: AJ().pantalla.anden, time: '14:00', delay: 15 }; if (!window.speechSynthesis) return toast('Este navegador no tiene voz'); Voz.unlocked = true; const prev = S.aj; S.aj = deepMerge(S.aj || {}, { voz: v.voz, textos: v.textos }); Voz.parar(); Voz.decir(Voz.plantilla(v.textos[k], ej)); S.aj = prev; return; }
  if (a === 'vz-save') { const v = vozLeer(), err = vozCheck(v); vozPrev.keep = true; if (err) { $('vz-msg').textContent = '⚠️ ' + err; $('vz-msg').className = 'vx-msg bad'; return; } return eref('ajustes').update({ voceo: v.voceo, textos: v.textos, voz: v.voz }).then(function () { $('vz-msg').textContent = '✅ Guardado: las TVs ya usan estos tiempos y textos.'; $('vz-msg').className = 'vx-msg ok'; toast('🔊 Voceos actualizados'); }).catch(fail); }
  if (a === 'vz-reset') { if (!confirm('¿Volver a los valores originales de voceos, textos y voz?')) return; return eref('ajustes').update({ voceo: null, textos: null, voz: null }).then(function () { vozPrev.keep = false; toast('Voceos restaurados'); renderActual(true); }).catch(fail); }
  if (a === 'mk-quitar') return eref('ajustes/marca/logo').remove().catch(fail);
  if (a === 'av-pub') { const x = $('av-t').value.trim(); if (!x) return toast('Escribe el aviso'); return eref('urgent').set({ text: x, ts: TS() }).then(function () { toast('📢 Aviso publicado'); }).catch(fail); }
  if (a === 'av-quitar') return eref('urgent').remove().catch(fail);
  if (a === 'av-tpl') { const l = asArr(S.plantillas).length ? asArr(S.plantillas) : ['🌧️ Retraso por lluvia: las salidas pueden demorar. Gracias por su paciencia.', '🔧 Unidad en revisión: se asignará otra unidad en breve.', '🚦 Tráfico intenso: posibles demoras de 10 a 15 minutos.']; $('av-t').value = l[+t.dataset.i]; return; }
  if (a === 'av-guardar') { const x = $('av-t').value.trim().slice(0, 120); if (!x) return toast('Escribe primero el aviso'); const l = (asArr(S.plantillas).length ? asArr(S.plantillas) : ['🌧️ Retraso por lluvia: las salidas pueden demorar. Gracias por su paciencia.', '🔧 Unidad en revisión: se asignará otra unidad en breve.', '🚦 Tráfico intenso: posibles demoras de 10 a 15 minutos.']).slice(); if (l.indexOf(x) === -1) l.push(x); return eref('plantillas').set(l.slice(0, 12)).then(function () { toast('Plantilla guardada'); }).catch(fail); }
  if (a === 'pr-ok') {
    const code = ($('pr-code').value || '').replace(/\D/g, ''), vista = $('pr-vista').value, n = parseInt($('pr-n').value, 10) || 0;
    if (code.length !== 6) return toast('Escribe los 6 números que muestra la TV'); if (vista === 'anden' && !n) return toast('Escribe el número de andén');
    const v = { vista: vista, ts: TS(), e: S.e }; if (n) v.n = n;
    return db.ref('pairing/' + code + '/assigned').set(v).then(function () { toast('✅ TV vinculada'); $('pr-code').value = ''; }).catch(function (e) { if (/PERMISSION/i.test(String(e && e.message || e))) return toast(S.meta && S.meta.suspendida ? '⛔ La empresa está suspendida' : '⚠️ Ese código no existe o ya se usó. Revisa el número que muestra la TV.'); fail(e); });
  }
  if (a === 'copy') { const v = t.dataset.v; if (navigator.clipboard) navigator.clipboard.writeText(v).then(function () { toast('📋 Copiado'); }, function () { prompt('Copia esta dirección:', v); }); else prompt('Copia esta dirección:', v); return; }
  if (a === 'iv-crear') {
    const rol = $('iv-rol').value, code = rndCode(10, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789');
    return db.ref('invitaciones/' + code).set({ empresa: S.e, rol: rol, exp: Date.now() + 7 * 864e5 }).then(function () { misInv.unshift({ code: code, rol: rol, url: baseURL() + '?invitacion=' + code + (DEMO ? '&demo=1' : '') }); toast('🎟️ Invitación creada (vale 7 días y para una sola persona)'); renderActual(true); }).catch(fail);
  }
  if (a === 'eq-quitar') { const uid = t.dataset.u; if (!confirm('¿Quitar a esta persona del equipo? Ya no podrá entrar a la empresa.')) return; const up = {}; up['usuarios/' + uid] = null; up['equipos/' + S.e + '/' + uid] = null; return db.ref().update(up).then(function () { toast('Persona quitada'); }).catch(fail); }
  if (a === 'pw') return auth.sendPasswordResetEmail(Session.email).then(function () { toast('📧 Te enviamos un correo para cambiar tu contraseña'); }).catch(fail);
  if (a === 'logout') return salir();
  if (a === 'pl-susp') { const id = t.dataset.id; return db.ref('empresas/' + id + '/meta/suspendida').once('value').then(function (s) { return db.ref('empresas/' + id + '/meta/suspendida').set(s.val() ? null : true); }).then(function () { toast('Listo'); }).catch(fail); }
  if (a === 'panico') return eref('panico').set(TS()).then(function () { toast('🛑 Voz detenida en las TVs'); }).catch(fail);
}
function cambios(e) {
  const t = e.target, row = t.closest('[data-id]'), id = row && row.dataset.id, d = id && S.deps[id];
  if (t.dataset.f && d) { let v = t.value.trim(); if (t.dataset.f === 'time' && !/^\d{2}:\d{2}$/.test(v)) return; if (t.dataset.f === 'destination' && !v) { t.value = d.destination; return; } return updDep(id, (function () { const o = {}; o[t.dataset.f] = v || null; return o; })(), 'Cambiar ' + t.dataset.f + ' · ' + d.time + ' ' + d.destination); }
  if (t.dataset.a === 'st' && d) { const v = t.value; return updDep(id, { status: v || null }, 'Estado ' + (v || 'automático') + ' · ' + d.time + ' ' + d.destination); }
  const rr = t.closest('[data-rid]'); if (t.dataset.rf && rr) { const f = t.dataset.rf, v = f === 'activa' ? t.checked : t.value.trim(); if (f === 'hora' && !/^\d{2}:\d{2}$/.test(v)) return; return eref('rutas/' + rr.dataset.rid + '/' + f).set(v).catch(fail); }
  if (t.dataset.pf) return eref('ajustes/pantalla/' + t.dataset.pf).set(t.value.trim()).then(function () { toast('Guardado'); }).catch(fail);
  if (t.dataset.mf) return eref('ajustes/marca/' + t.dataset.mf).set(t.value.trim()).then(function () { toast('Guardado'); }).catch(fail);
  if (t.dataset.uf) { const v = t.type === 'checkbox' ? t.checked : (t.type === 'range' ? +t.value : t.value); return eref('ajustes/musica/' + t.dataset.uf).set(v).catch(fail); }
  if (t.dataset.nf === 'nombre' && esAdmin()) return eref('meta/nombre').set(t.value.trim().slice(0, 60)).then(function () { toast('Nombre guardado'); }).catch(fail);
  if (t.dataset.a === 'pl-plan') { const id2 = t.dataset.id, up = {}; up['empresas/' + id2 + '/meta/plan'] = t.value; up['plataforma/empresas/' + id2 + '/plan'] = t.value; return db.ref().update(up).then(function () { toast('Plan actualizado'); }).catch(fail); }
  if (t.id === 'mk-logo' && t.files && t.files[0]) {
    const rd = new FileReader(); rd.onload = function () { const im = new Image(); im.onload = function () { const h = Math.min(120, im.height), w = Math.round(im.width * h / im.height), cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(im, 0, 0, w, h); const url = cv.toDataURL('image/png'); if (url.length > 150000) return toast('El logo pesa demasiado; usa una imagen más sencilla'); eref('ajustes/marca/logo').set(url).then(function () { toast('Logo guardado'); }).catch(fail); }; im.src = rd.result; }; rd.readAsDataURL(t.files[0]); return;
  }
}
document.addEventListener('input', function (e) {
  if (e.target.closest && e.target.closest('#pane-voz')) { vozPrev.keep = false; vozPrev(); if (e.target.id === 'vz-vel') $('vz-vel-v').textContent = e.target.value; if (e.target.id === 'vz-vol') $('vz-vol-v').textContent = e.target.value; }
  if (e.target.dataset && e.target.dataset.uf === 'vol') $('mu-vol-v').textContent = e.target.value;
});
