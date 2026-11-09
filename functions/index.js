/* Cloud Function programada: cada minuto revisa las salidas que siguen los pasajeros y manda los avisos.
   Requiere el plan Blaze de Firebase. Las claves VAPID se leen de las variables VAPID_PUBLIC y VAPID_PRIVATE (archivo functions/.env). */
'use strict';
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const webpush = require('web-push');
const { runOnce } = require('./core');
const cfg = require('./config.json');

admin.initializeApp();

exports.avisos = onSchedule({ schedule: 'every 1 minutes', timeZone: cfg.tz, timeoutSeconds: 55, memory: '256MiB' }, async () => {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@vialtis.mx', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
  const db = admin.database();
  const wrap = {
    get: async (p) => (await db.ref(p).get()).val(),
    set: (p, v) => db.ref(p).set(v),
    update: (p, v) => db.ref(p).update(v),
    remove: (p) => db.ref(p).remove()
  };
  const send = async (sub, payload) => {
    try { await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 600, urgency: 'high' }); return { ok: true }; }
    catch (e) { return { ok: false, gone: e.statusCode === 404 || e.statusCode === 410 }; }
  };
  await runOnce({ db: wrap, send, nowMs: Date.now(), cfg });
});
