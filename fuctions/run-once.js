/* Alternativa GRATIS al Cloud Function: se ejecuta desde GitHub Actions cada 5 minutos (ver .github/workflows/notificar.yml).
   Variables: FIREBASE_SERVICE_ACCOUNT (JSON), DATABASE_URL, VAPID_PUBLIC, VAPID_PRIVATE. */
'use strict';
const admin = require('firebase-admin');
const webpush = require('web-push');
const { runOnce } = require('./core');
const cfg = require('./config.json');

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)), databaseURL: process.env.DATABASE_URL });
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@vialtis.mx', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
const db = admin.database();
const wrap = { get: async (p) => (await db.ref(p).get()).val(), set: (p, v) => db.ref(p).set(v), update: (p, v) => db.ref(p).update(v), remove: (p) => db.ref(p).remove() };
const send = async (sub, payload) => {
  try { await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 600, urgency: 'high' }); return { ok: true }; }
  catch (e) { return { ok: false, gone: e.statusCode === 404 || e.statusCode === 410 }; }
};
runOnce({ db: wrap, send, nowMs: Date.now(), cfg }).then((r) => { console.log('Listo:', JSON.stringify(r)); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
