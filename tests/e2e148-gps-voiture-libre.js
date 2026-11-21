// GPS · ouverture (21/11/2026, lot 4), données FICTIVES, iPhone puis PC, GPS simulé.
// Onglet GPS sans trajet dans les 3 h : choix de la voiture directement dans l'onglet (voiture du jour présélectionnée, rien d'écrit avant de démarrer) ;
// « Rouler sans destination » : voiture du jour mise à jour, km parcourus au GPS, ni feux ni guidage, « Terminer » → km ajoutés
// au compteur de CETTE voiture seulement sur appui ; « Choisir une destination » : formulaire du Trajet, départ maintenant,
// voiture choisie ; avec un trajet en cours ou dans les 3 h : mode EN DIRECT directement, sans question (celui de demain matin ne compte pas).
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 700))); if (!ok) fail++; };
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T10:00:00+01:00', dev }), p = s.p;
  await p.route('https://data.geopf.fr/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PX }));
  await p.route('https://router.project-osrm.org/**', r => r.abort());
  await p.emulateMedia({ reducedMotion: 'reduce' }); await s.settle(4);
  const ids = await p.evaluate(() => { S.work.days = []; appSetDayType('off'); S.cars[1].odo = [{ d: '2026-11-15', km: 42000 }]; S.cars[0].odo = [{ d: '2026-11-15', km: 15000 }]; saveSettings(); appSetCar(S.cars[0].id);
    UI.view = 'trajet'; rebuild(); renderAll(); return { A: S.cars[0].id, B: S.cars[1].id, trip: typeof driveSoonTrip === 'function' ? !!driveSoonTrip() : !!(APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip), later: (APP_CONTEXT.snapshot.nextTrip || {}).dep || null }; });
  await s.settle(3);
  check(`${dev} · situation de départ : aucun trajet en cours ni dans les 3 h (prochain : ${ids.later || 'aucun'}, demain matin ne compte pas)`, !ids.trip && (!ids.later || ids.later.slice(0, 10) > '2026-11-16'), JSON.stringify(ids));
  await p.locator('#viewSeg [data-v=gps]').click(); await s.settle(2);
  const a = await p.evaluate(() => { const r = document.getElementById('secGps'); return { shown: !r.hidden && r.getBoundingClientRect().height > 0, h: (r.querySelector('h3') || {}).textContent, cars: [...r.querySelectorAll('[data-act=drive-car]')].map(x => [x.dataset.id, x.getAttribute('aria-pressed')]), h44: [...r.querySelectorAll('[data-act=drive-car], [data-act=drive-free], [data-act=drive-dest]')].every(x => x.getBoundingClientRect().height >= 44), driving: DRIVE.open }; });
  check(`${dev} · onglet GPS sans trajet : « Quelle voiture conduis-tu ? », voiture du jour présélectionnée, grandes cibles`, a.shown && /Quelle voiture/.test(a.h) && a.cars.length >= 2 && a.cars.find(c => c[0] === ids.A)[1] === 'true' && a.h44 && !a.driving, JSON.stringify(a));
  await p.locator(`#secGps [data-act=drive-car][data-id="${ids.B}"]`).click(); await s.settle(1);
  const sel = await p.evaluate(B => ({ pressed: document.querySelector(`#secGps [data-act=drive-car][data-id="${B}"]`).getAttribute('aria-pressed'), active: appDay().activeCarId }), ids.B);
  check(`${dev} · voiture choisie visible, rien d’écrit avant de démarrer`, sel.pressed === 'true' && sel.active === ids.A, JSON.stringify(sel));
  // Trajet libre : 2 km à 60 km/h (1 km par minute).
  await p.evaluate(() => { const [o] = S.locs; window.__geo = { lat: o.lat + 0.02, lon: o.lon, acc: 6 }; });
  await p.locator('#secGps [data-act=drive-free]').click(); await s.settle(4);
  for (let i = 1; i <= 2; i++) { await p.clock.runFor(60e3); await p.evaluate(k => { const [o] = S.locs; window.__geo = { lat: o.lat + 0.02 + k * 0.009, lon: o.lon, acc: 6 }; window.__geoPush(); }, i); await s.settle(3); }
  const f = await p.evaluate(() => { const q = k => (document.querySelector('#liveDrive [data-dv="' + k + '"]') || {}).textContent || ''; const e = document.querySelector('#liveDrive .dv-freeend'), g = document.querySelector('#liveDrive [data-dv="guide"]');
    return { active: appDay().activeCarId, done: q('done'), speed: q('speed'), lights: q('lightsLabel'), end: e && !e.hidden ? e.textContent : '', guide: !!g && !g.hidden, odo: lastOdo(S.cars[1]).km }; });
  const num = v => parseFloat(String(v).replace(',', '.'));
  check(`${dev} · trajet libre : voiture du jour = voiture choisie, ${f.done} km parcourus au GPS, vitesse ${f.speed} km/h`, f.active === ids.B && Math.abs(num(f.done) - 2) <= .15 && Math.abs(num(f.speed) - 60) <= 8, JSON.stringify(f));
  check(`${dev} · sans destination : ni feux ni guidage annoncés, « Terminer le trajet · 2 km »`, /Sans destination/.test(f.lights) && !f.guide && /Terminer le trajet · 2 km/.test(f.end) && f.odo === 42000, JSON.stringify(f));
  await p.locator('#liveDrive [data-act=drive-free-end]').click(); await s.settle(2);
  const e = await p.evaluate(() => ({ sheet: (document.querySelector('#liveDrive [data-dv="arrived"]') || {}).innerText || '', odo: lastOdo(S.cars[1]).km }));
  check(`${dev} · « Terminer » : TRAJET TERMINÉ, +2 km, compteur inchangé sans appui`, /TRAJET TERMINÉ/.test(e.sheet) && /\+2 km/.test(e.sheet) && e.odo === 42000, JSON.stringify(e));
  await p.locator('#liveDrive [data-act=drive-odo]').click(); await s.settle(2);
  const o = await p.evaluate(() => ({ b: lastOdo(S.cars[1]), a: lastOdo(S.cars[0]).km }));
  check(`${dev} · « Ajouter au compteur » : 42 002 km pour la voiture choisie, l’autre intacte`, o.b.km === 42002 && o.b.d === '2026-11-16' && o.a === 15000, JSON.stringify(o));
  await p.locator('#liveDrive [data-act=drive-close]').last().click(); await s.settle(2);
  const w = await p.evaluate(() => ({ hidden: document.getElementById('liveDrive').hidden, free: !!DRIVE.free }));
  check(`${dev} · « Fermer » : GPS du trajet libre arrêté, vue fermée`, w.hidden && !w.free, JSON.stringify(w));
  // « Choisir une destination » : formulaire du Trajet, départ maintenant, voiture choisie.
  await p.locator('#viewSeg [data-v=gps]').click(); await s.settle(1);
  await p.locator(`#secGps [data-act=drive-car][data-id="${ids.A}"]`).click(); await p.locator('#secGps [data-act=drive-dest]').click(); await s.settle(2);
  const d = await p.evaluate(() => ({ hidden: document.getElementById('liveDrive').hidden, car: TRIP_FORM.carId, when: TRIP_FORM.when, focus: document.activeElement && document.activeElement.id, active: appDay().activeCarId }));
  check(`${dev} · « Choisir une destination » : formulaire du Trajet, champ destination, départ maintenant, voiture choisie`, d.hidden && d.car === ids.A && d.when === 'now' && d.focus === 'tripDestQ' && d.active === ids.A, JSON.stringify(d));
  // Trajet programmé : le GPS s'ouvre directement, sans question.
  await p.evaluate(B => { const [o, dd] = S.locs; appProgramManualTrip({ originId: o.id, originPoint: null, destinationId: dd.id, destinationPoint: null, dep: '2026-11-16T11:00', carId: B }); rebuild(); renderAll(); }, ids.B); await s.settle(4);
  await p.locator('#viewSeg [data-v=gps]').click(); await s.settle(2); await p.locator('#secGps [data-act=drive-open]').click(); await s.settle(3);
  const t = await p.evaluate(() => ({ open: DRIVE.open, setup: !!document.querySelector('#liveDrive [data-act=drive-car]'), key: DRIVE.key, trip: (APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip || {}).key }));
  check(`${dev} · trajet déjà programmé : onglet GPS « Démarrer » → mode EN DIRECT sur ce trajet, sans choix de voiture`, t.open && !t.setup && !!t.key && t.key === t.trip, JSON.stringify(t));
  await s.c.close();
}
(async () => {
  const b = await BR.launch();
  try { await run(b, 'iphone'); await run(b, 'pc'); } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
