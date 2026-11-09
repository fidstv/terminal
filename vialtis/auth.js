/* Entrar, crear cuenta (libre o con invitación), verificar correo y arrancar el panel */
'use strict';
const Session = { user: null, uid: null, email: null, empresa: null, rol: null, owner: false };

function gateShow(which) {
  $('app').classList.add('hidden'); $('gate').classList.remove('hidden');
  ['entrar', 'crear', 'verificar', 'sinempresa'].forEach(function (k) { const f = $('f-' + k); if (f) f.classList.toggle('hidden', k !== which); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-gt]'), function (b) { b.classList.toggle('on', b.dataset.gt === which); });
  $('gate-tabs').classList.toggle('hidden', which === 'verificar' || which === 'sinempresa');
  gateMsg('');
}
function gateMsg(t, ok) { const m = $('gate-msg'); m.textContent = t || ''; m.className = 'gate-msg' + (t ? '' : ' hidden') + (ok ? ' ok' : ''); }
function errTxt(e) {
  const c = e && e.code || '', m = String(e && e.message || e);
  if (/email-already-in-use/.test(c)) return 'Ese correo ya tiene una cuenta. Entra con él.';
  if (/wrong-password|invalid-credential|user-not-found|invalid-login/.test(c)) return 'Correo o contraseña incorrectos.';
  if (/invalid-email/.test(c)) return 'Escribe un correo válido.';
  if (/weak-password/.test(c)) return 'La contraseña es muy corta.';
  if (/too-many-requests/.test(c)) return 'Demasiados intentos. Espera unos minutos.';
  if (/network/.test(c)) return 'Sin conexión a internet.';
  if (/PERMISSION/.test(m)) return 'No se pudo guardar tu cuenta (permisos). Avisa a quien administra la plataforma.';
  return m.slice(0, 120);
}
const emailDe = function (x) { x = String(x || '').trim(); return CFG.plataforma.alias[x.toLowerCase()] || x; };

async function entrar() {
  const em = emailDe($('lg-user').value), pw = $('lg-pass').value;
  if (!em || !pw) return gateMsg('Escribe tu correo y tu contraseña.');
  $('btn-entrar').disabled = true;
  try { await auth.signInWithEmailAndPassword(em, pw); } catch (e) { gateMsg(errTxt(e)); }
  $('btn-entrar').disabled = false;
}
async function crearCuenta() {
  const nombre = $('rg-nombre').value.trim(), em = $('rg-email').value.trim(), pw = $('rg-pass').value, code = $('rg-code').value.trim();
  if (!code && nombre.length < 2) return gateMsg('Escribe el nombre de tu empresa.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return gateMsg('Escribe un correo válido.');
  if (pw.length < 8) return gateMsg('La contraseña debe tener al menos 8 caracteres.');
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return gateMsg('Usa letras y números en la contraseña.');
  if (pw.toLowerCase().indexOf(em.split('@')[0].toLowerCase()) !== -1 && em.split('@')[0].length > 3) return gateMsg('La contraseña no debe contener tu correo.');
  if (!$('rg-terminos').checked) return gateMsg('Acepta los términos para continuar.');
  $('btn-crear').disabled = true;
  lsSet('vialtis_pend', JSON.stringify({ nombre: nombre, code: code }));
  try {
    const cred = await auth.createUserWithEmailAndPassword(em, pw);
    try { await cred.user.sendEmailVerification(); } catch (e) { /* se puede reenviar */ }
  } catch (e) { lsDel('vialtis_pend'); gateMsg(errTxt(e)); }
  $('btn-crear').disabled = false;
}
async function reenviar() { try { await auth.currentUser.sendEmailVerification(); gateMsg('Te enviamos el correo de nuevo. Revisa también spam.', true); } catch (e) { gateMsg(errTxt(e)); } }
async function yaVerifique() {
  try { const u = auth.currentUser; await u.reload(); await u.getIdToken(true); } catch (e) {}
  const u = auth.currentUser;
  if (u && u.emailVerified) onUser(u); else gateMsg('Todavía no aparece verificado. Abre el enlace del correo y vuelve a tocar el botón.');
}
async function olvide() {
  const em = emailDe($('lg-user').value); if (!em) return gateMsg('Escribe tu correo arriba y vuelve a tocar "Olvidé mi contraseña".');
  try { await auth.sendPasswordResetEmail(em); gateMsg('Si el correo existe, te enviamos un enlace para cambiar la contraseña.', true); } catch (e) { gateMsg(errTxt(e)); }
}
function salir() { auth.signOut().then(function () { location.href = location.pathname + (DEMO ? '?demo=1' : ''); }); }

async function prepararPerfil(user) {
  const uref = db.ref('usuarios/' + user.uid);
  let u = null;
  try { u = (await uref.once('value')).val(); } catch (e) { u = null; }
  if (!u) {
    const pend = JSON.parse(lsGet('vialtis_pend', 'null') || 'null') || {};
    try {
      const up = {};
      if (pend.code && !/^[A-Za-z0-9]{8,24}$/.test(pend.code)) { lsDel('vialtis_pend'); gateShow('sinempresa'); return gateMsg('El código de invitación no es válido.'); }
      if (pend.code) {
        const inv = (await db.ref('invitaciones/' + pend.code).once('value')).val();
        if (!inv || inv.exp < Date.now()) { lsDel('vialtis_pend'); return gateShow('sinempresa'), gateMsg('El código de invitación no es válido o ya venció. Pídele uno nuevo a tu administrador.'); }
        up['usuarios/' + user.uid] = { email: user.email, empresa: inv.empresa, rol: inv.rol, inv: pend.code };
        up['equipos/' + inv.empresa + '/' + user.uid] = { email: user.email, rol: inv.rol, inv: pend.code };
      } else {
        const nombre = (pend.nombre || user.email.split('@')[0]).slice(0, 60);
        up['usuarios/' + user.uid] = { email: user.email, empresa: user.uid, rol: 'admin' };
        up['empresas/' + user.uid + '/meta'] = { nombre: nombre, plan: 'gratis', creada: TS() };
        up['equipos/' + user.uid + '/' + user.uid] = { email: user.email, rol: 'admin' };
        up['plataforma/empresas/' + user.uid] = { nombre: nombre, plan: 'gratis', creada: TS() };
      }
      await db.ref().update(up);
      if (pend.code) db.ref('invitaciones/' + pend.code).remove().catch(function () {});   /* la invitación es de un solo uso */
      lsDel('vialtis_pend');
      u = (await uref.once('value')).val();
    } catch (e) { gateShow('sinempresa'); return gateMsg(errTxt(e)); }
  }
  if (!u) { gateShow('sinempresa'); return gateMsg('Tu cuenta no está ligada a ninguna empresa.'); }
  Object.assign(Session, { user: user, uid: user.uid, email: user.email, empresa: u.empresa, rol: u.rol, owner: user.email === CFG.plataforma.dueno });
  startPanel();
}
function onUser(user) {
  if (!user) return gateShow(qs.get('invitacion') ? 'crear' : 'entrar');
  if (!user.emailVerified) { $('ver-email').textContent = user.email; return gateShow('verificar'); }
  prepararPerfil(user);
}
function startAuth() {
  gateShow(qs.get('invitacion') ? 'crear' : 'entrar');
  const inv = qs.get('invitacion'); if (inv) { $('rg-code').value = inv.replace(/[^A-Za-z0-9]/g, ''); $('rg-nombre-wrap').classList.add('hidden'); }
  document.addEventListener('click', function (e) {
    const t = e.target.closest('[data-gt]'); if (t) return gateShow(t.dataset.gt);
    const id = e.target.id;
    if (id === 'btn-entrar') entrar(); else if (id === 'btn-crear') crearCuenta(); else if (id === 'btn-reenviar') reenviar();
    else if (id === 'btn-yaverif') yaVerifique(); else if (id === 'btn-olvide') olvide(); else if (id === 'btn-salir-g' || id === 'btn-salir-g2') salir();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !$('gate').classList.contains('hidden')) { if (!$('f-entrar').classList.contains('hidden')) entrar(); else if (!$('f-crear').classList.contains('hidden')) crearCuenta(); } });
  $('rg-code').addEventListener('input', function () { $('rg-nombre-wrap').classList.toggle('hidden', !!this.value.trim()); });
  auth.onAuthStateChanged(onUser);
}
