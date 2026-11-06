/* Modo demostración (?demo=1): imita Firebase con los datos guardados en este navegador.
   Aplica las MISMAS reglas de reglas-firebase.json, así que en la demo también se ve qué puede y qué no puede hacer cada persona.
   Opciones: &sinreglas (no aplicar reglas) · &verificar=1 (el correo debe verificarse; usa __demoVerify('correo') para simularlo). */
(function () {
  if (!/[?&]demo/.test(location.search)) return;
  const KEY = 'vialtis_demo_db', UK = 'vialtis_demo_users', SK = 'vialtis_demo_session', MK = 'vialtis_demo_mail';
  const noRules = /[?&]sinreglas/.test(location.search), needVerif = /[?&]verificar=1/.test(location.search);
  let RULES = null;
  if (!noRules && window.RulesEval) {
    try { const x = new XMLHttpRequest(); x.open('GET', 'reglas-firebase.json?' + Date.now(), false); x.send(); RULES = JSON.parse(x.responseText); } catch (e) { console.warn('Demo sin reglas:', e); }
  }
  const rd = function (k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
  const load = function () { return rd(KEY, {}); }, save = function (o) { localStorage.setItem(KEY, JSON.stringify(o)); };
  const users = function () { return rd(UK, {}); }, saveUsers = function (u) { localStorage.setItem(UK, JSON.stringify(u)); };
  let authUser = null, authCbs = [], listeners = [];
  const segs = function (p) { return String(p || '').split('/').filter(Boolean); };
  const getAt = function (o, s) { for (let i = 0; i < s.length; i++) { if (o == null || typeof o !== 'object') return undefined; o = o[s[i]]; } return o; };
  const ctxAuth = function () { if (!authUser) return null; const u = users()[authUser]; if (!u) return null; return { uid: u.uid, token: { email: authUser, email_verified: !!u.verified } }; };
  const resolveTS = function (v) { if (v && typeof v === 'object') { if (v['.sv'] === 'timestamp') return Date.now(); Object.keys(v).forEach(function (k) { v[k] = resolveTS(v[k]); }); } return v; };
  const readOK = function (path) { if (!RULES) return true; if (/^\.info/.test(path)) return true; return RulesEval.canRead(RULES, load(), segs(path), ctxAuth(), Date.now()); };
  function snap(path) {
    const v = getAt(load(), segs(path)), val = v === undefined ? null : JSON.parse(JSON.stringify(v));
    const s = { key: segs(path).pop() || null, val: function () { return val; }, exists: function () { return val !== null; },
      child: function (p) { return snap(path + '/' + p); }, numChildren: function () { return val && typeof val === 'object' ? Object.keys(val).length : 0; },
      forEach: function (fn) { if (val && typeof val === 'object') Object.keys(val).some(function (k) { return fn(snap(path + '/' + k)) === true; }); } };
    return s;
  }
  function fire(l, first) {
    if (/^\.info/.test(l.path)) { if (first) setTimeout(function () { l.cb({ val: function () { return l.path.indexOf('connected') !== -1 ? true : 0; } }); }, 0); return; }
    const ok = readOK(l.path), cur = ok ? JSON.stringify(getAt(load(), segs(l.path)) === undefined ? null : getAt(load(), segs(l.path))) : 'DENIED';
    if (!first && cur === l.last) return;
    l.last = cur;
    if (!ok) { if (l.err) l.err(new Error('PERMISSION_DENIED')); return; }
    l.cb(snap(l.path));
  }
  const notifyAll = function () { listeners.slice().forEach(function (l) { fire(l, false); }); };
  window.addEventListener('storage', function (e) { if (e.key === KEY) notifyAll(); });
  function write(entries) {
    return new Promise(function (res, rej) {
      const db0 = load(), a = ctxAuth();
      entries = entries.map(function (e) { return [e[0], e[1] === undefined ? null : resolveTS(JSON.parse(JSON.stringify(e[1] === null ? null : e[1])))]; });
      if (RULES) for (const e of entries) { const r = RulesEval.canWrite(RULES, db0, segs(e[0]), e[1], a, Date.now()); if (!r.ok) return rej(new Error('PERMISSION_DENIED: ' + e[0] + ' (' + r.why + ')')); }
      let cur = db0; entries.forEach(function (e) { cur = RulesEval.applyWrite ? RulesEval.applyWrite(cur, segs(e[0]), e[1]) : cur; });
      save(cur); setTimeout(notifyAll, 0); res();
    });
  }
  function mkRef(path) {
    path = segs(path).join('/');
    const r = { path: path, key: segs(path).pop() || null,
      child: function (p) { return mkRef(path + '/' + p); },
      on: function (t, cb, err) { const l = { path: path, cb: cb, err: err, last: undefined }; listeners.push(l); setTimeout(function () { fire(l, true); }, 0); return cb; },
      off: function () { listeners = listeners.filter(function (l) { return l.path !== path; }); },
      once: function () { return new Promise(function (res, rej) { if (!readOK(path)) return rej(new Error('PERMISSION_DENIED')); res(snap(path)); }); },
      set: function (v) { return write([[path, v]]); },
      remove: function () { return write([[path, null]]); },
      update: function (o) { return write(Object.keys(o).map(function (k) { return [path ? path + '/' + k : k, o[k]]; })); },
      push: function (v) { const k = '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); const p = write([[path + '/' + k, v]]); p.key = k; return p; } };
    return r;
  }
  if (!window.RulesEval) { console.error('Falta rules-eval.js'); return; }
  const userObj = function () {
    const u = users()[authUser]; if (!u) return null;
    return { uid: u.uid, email: authUser, emailVerified: !!u.verified,
      sendEmailVerification: function () { localStorage.setItem(MK, JSON.stringify({ tipo: 'verificar', email: authUser, ts: Date.now() })); return Promise.resolve(); },
      reload: function () { return Promise.resolve(); }, getIdToken: function () { return Promise.resolve('demo'); } };
  };
  const emit = function () { const u = authUser ? userObj() : null; authCbs.forEach(function (cb) { cb(u); }); notifyAll(); };
  const err = function (code, msg) { const e = new Error(msg || code); e.code = code; return e; };
  const authObj = {
    get currentUser() { return authUser ? userObj() : null; },
    onAuthStateChanged: function (cb) { authCbs.push(cb); const s = localStorage.getItem(SK); if (s && users()[s]) authUser = s; setTimeout(function () { cb(authUser ? userObj() : null); notifyAll(); }, 0); return function () {}; },
    createUserWithEmailAndPassword: function (email, pass) {
      email = String(email || '').trim().toLowerCase(); const u = users();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Promise.reject(err('auth/invalid-email'));
      if (String(pass || '').length < 6) return Promise.reject(err('auth/weak-password'));
      if (u[email]) return Promise.reject(err('auth/email-already-in-use'));
      u[email] = { uid: 'u' + Math.random().toString(36).slice(2, 12), pass: pass, verified: !needVerif }; saveUsers(u);
      authUser = email; localStorage.setItem(SK, email); setTimeout(emit, 0); return Promise.resolve({ user: userObj() });
    },
    signInWithEmailAndPassword: function (email, pass) {
      email = String(email || '').trim().toLowerCase(); const u = users();
      if (!u[email]) return Promise.reject(err('auth/user-not-found')); if (u[email].pass !== pass) return Promise.reject(err('auth/wrong-password'));
      authUser = email; localStorage.setItem(SK, email); setTimeout(emit, 0); return Promise.resolve({ user: userObj() });
    },
    signOut: function () { authUser = null; localStorage.removeItem(SK); setTimeout(emit, 0); return Promise.resolve(); },
    sendPasswordResetEmail: function (email) { localStorage.setItem(MK, JSON.stringify({ tipo: 'reset', email: email, ts: Date.now() })); return Promise.resolve(); }
  };
  const dbFn = function () { return { ref: mkRef }; }; dbFn.ServerValue = { TIMESTAMP: { '.sv': 'timestamp' } };
  window.firebase = { apps: [1], initializeApp: function () {}, auth: function () { return authObj; }, database: dbFn };
  window.__demoVerify = function (email) { const u = users(); email = String(email).toLowerCase(); if (u[email]) { u[email].verified = true; saveUsers(u); } };   /* como en Firebase real: no avisa solo; hay que recargar al usuario */
  window.__demoMail = function () { return rd(MK, null); };
})();
