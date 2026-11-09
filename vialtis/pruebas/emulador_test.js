/* Prueba las reglas con el EMULADOR OFICIAL de Firebase (el mismo motor que Firebase real).
   Uso:  npm install   y luego   npm run test:emulador   (necesita Java) */
'use strict';
const fs = require('fs'), path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { ref, get, set } = require('firebase/database');
require('firebase/app').setLogLevel('silent');

const host = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':');
const now = Date.now(), pasos = [];
const logReal = console.log;
console.log = function () { pasos.push({ log: Array.from(arguments).join(' ') }); };
require('./casos.js')(
  function (label, auth, p, val, expect, commit = true) { pasos.push({ t: 'w', label, auth, p, val, expect, commit }); },
  function (label, auth, p, expect) { pasos.push({ t: 'r', label, auth, p, expect }); },
  now);
console.log = logReal;

(async function () {
  const env = await initializeTestEnvironment({
    projectId: 'vialtis-pruebas',
    database: { host: host[0], port: +host[1], rules: fs.readFileSync(path.join(__dirname, '..', 'reglas-firebase.json'), 'utf8') }
  });
  await env.clearDatabase();
  const dbDe = function (a) { return (a ? env.authenticatedContext(a.uid, a.token) : env.unauthenticatedContext()).database(); };
  const admin = async function (fn) { let r; await env.withSecurityRulesDisabled(async function (c) { r = await fn(c.database()); }); return r; };
  let n = 0, bad = 0;
  for (const s of pasos) {
    if (s.log) { console.log(s.log); continue; }
    n++;
    let ok;
    try {
      if (s.t === 'r') { await get(ref(dbDe(s.auth), s.p)); ok = true; }
      else {
        const antes = s.commit ? null : await admin(function (d) { return get(ref(d, s.p)).then(function (x) { return x.val(); }); });
        await set(ref(dbDe(s.auth), s.p), s.val); ok = true;
        if (!s.commit) await admin(function (d) { return set(ref(d, s.p), antes); });   /* deshace la prueba */
      }
    } catch (e) { if (!/PERMISSION_DENIED|permission/i.test(String(e && e.message))) { console.log('   (error inesperado: ' + e.message + ')'); } ok = false; }
    if (ok !== s.expect) { bad++; console.log('❌', s.label, '→ esperado', s.expect ? 'PERMITIDO' : 'DENEGADO', 'y fue', ok ? 'PERMITIDO' : 'DENEGADO'); }
    else console.log('✔ ', s.label, ok ? '(permitido)' : '(denegado)');
  }
  console.log('\nEmulador oficial · pruebas:', n, '| fallas:', bad);
  await env.cleanup();
  process.exit(bad ? 1 : 0);
})().catch(function (e) { console.error('No se pudo correr el emulador:', e.message); process.exit(2); });
