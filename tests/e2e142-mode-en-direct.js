// Mode « EN DIRECT » (20/11/2026, maquette A validée), données FICTIVES, iPhone puis PC : plein écran pendant le trajet.
// Ouverture depuis l'onglet Trajet ; la vue couvre tout l'écran (aucun onglet ni contenu visible dessous) ; carte Plan IGN
// demandée à la Géoplateforme ; trajet démarré et GPS simulé qui avance sur l'itinéraire : km parcourus qui montent, km restants
// qui baissent, vitesse GPS affichée ; « ✕ » referme et rend l'app intacte ; ouverture automatique seulement avec un
// itinéraire prêt ; rien n'est écrit.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 600))); if (!ok) fail++; };
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T10:00:00+01:00', dev }), p = s.p, ign = [];
  await p.route('https://data.geopf.fr/wmts**', r => { ign.push(r.request().url()); r.fulfill({ status: 200, contentType: 'image/png', body: PX }); });
  await p.route('https://router.project-osrm.org/**', r => {
    const m = /driving\/([^;]+);([^?]+)/.exec(new URL(r.request().url()).pathname), A = m[1].split(',').map(Number), B = m[2].split(',').map(Number);
    const coords = Array.from({ length: 21 }, (_, i) => [A[0] + (B[0] - A[0]) * i / 20, A[1] + (B[1] - A[1]) * i / 20]);
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: 40000, duration: 2400,
      geometry: { coordinates: coords }, legs: [{ annotation: { duration: coords.slice(1).map(() => 120) } }] }] }) });
  });
  await s.settle(4);
  const ends = await p.evaluate(() => { S.work.days = []; S.gpsAuto = 1; saveSettings(); const [o, d] = S.locs;
    appProgramManualTrip({ originId: o.id, originPoint: null, destinationId: d.id, destinationPoint: null, dep: liveNow().slice(0, 16), carId: S.cars[0].id });
    UI.view = 'trajet'; rebuild(); renderAll(); return { a: [o.lat, o.lon], b: [d.lat, d.lon] }; });
  await s.settle(8);
  const before = await p.evaluate(() => JSON.stringify({ cars: S.cars, loans: S.loans || [] }));
  await p.locator('#viewSeg [data-v=gps]').click(); await s.settle(1); await p.locator('#secGps [data-act=drive-open]').click(); await s.settle(4);
  const a = await p.evaluate(() => { const el = document.getElementById('liveDrive'), r = el.getBoundingClientRect(), top = document.elementFromPoint(innerWidth / 2, innerHeight - 30);
    return { hidden: el.hidden, w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, covers: !!top && el.contains(top), text: el.innerText, focus: document.activeElement && document.activeElement.dataset.act }; });
  check(`${dev} · « EN DIRECT » ouvert depuis le Trajet : plein écran (${a.vw}×${a.vh}), rien de l’app visible dessous, focus sur « ✕ »`, !a.hidden && a.w === a.vw && a.h === a.vh && a.covers && a.focus === 'drive-close', JSON.stringify(a).slice(0, 400));
  check(`${dev} · conduite : ARRIVÉE, RESTANTS et vitesse visibles, Détails repliés`, ['RESTANTS', 'km/h', 'ARRIVÉE', 'Détails'].every(k => a.text.includes(k)) && !a.text.includes('PARCOURUS') && !a.text.includes('Feux indisponibles'), a.text.slice(0, 300));
  await p.locator('#liveDrive .dv-details summary').click();
  const details = await p.locator('#liveDrive').innerText();
  check(`${dev} · Détails conserve les km parcourus, le secteur et les sources`, ['PARCOURUS', 'SECTEUR', 'la signalisation prime'].every(k => details.includes(k)), details.slice(0, 300));
  await p.locator('#liveDrive .dv-details summary').click();
  check(`${dev} · fond de carte Plan IGN demandé à la Géoplateforme`, ign.length > 0 && ign.every(u => /LAYER=GEOGRAPHICALGRIDSYSTEMS\.PLANIGNV2/.test(u)), String(ign.length));
  // Trajet démarré, GPS qui avance sur l'itinéraire (30 % puis 60 %).
  await p.evaluate(() => { const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip; liveStart(t.key); });
  const at = f => [ends.a[0] + (ends.b[0] - ends.a[0]) * f, ends.a[1] + (ends.b[1] - ends.a[1]) * f];
  const val = () => p.evaluate(() => { const q = k => (document.querySelector('#liveDrive [data-dv="' + k + '"]') || {}).textContent || ''; return { done: q('done'), left: q('left'), speed: q('speed'), gps: q('gps'), phase: LIVE.phase }; });
  const num = v => parseFloat(String(v).replace(',', '.'));
  let first = null, second = null;
  // Vitesse réaliste (90 km/h) : 1,5 km par minute ; un saut invraisemblable serait rejeté par le suivi (« Déplacement GPS à confirmer »).
  const step = 1.5 / 40;
  for (const [i, f] of [[0, 0.05], [1, 0.05 + step], [2, 0.05 + 2 * step], [3, 0.05 + 3 * step]]) {
    if (i) await p.clock.runFor(60e3);
    const [lat, lon] = at(f); await p.evaluate(g => { window.__geo = { lat: g[0], lon: g[1], acc: 8 }; window.__geoPush(); }, [lat, lon]);
    await s.settle(2); const v = await val(); if (i === 1) first = v; if (i === 3) second = v;
  }
  check(`${dev} · en roulant (GPS simulé) : km parcourus qui montent, km restants qui baissent`, first && second && num(second.done) > num(first.done) && num(second.left) < num(first.left) && num(first.done) > 0, JSON.stringify({ first, second }));
  check(`${dev} · vitesse GPS déduite des relevés (≈ 90 km/h) et précision indiquée`, second && Math.abs(num(second.speed) - 90) <= 15 && /GPS ± \d+ m/.test(second.gps), JSON.stringify(second));
  await p.locator('#liveDrive [data-act=drive-close]').click(); await s.settle(2);
  const z = await p.evaluate(() => ({ hidden: document.getElementById('liveDrive').hidden, cls: document.documentElement.classList.contains('dv-on'), view: UI.view }));
  check(`${dev} · « ✕ » referme le mode en direct, retour à l’onglet GPS intact`, z.hidden && !z.cls && z.view === 'gps', JSON.stringify(z));
  // Ouverture automatique (« Partir maintenant ») : seulement avec un itinéraire prêt ; sans itinéraire, le Trajet reste visible.
  await p.evaluate(() => { const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip; driveAutoOpen(t.key, 2, () => null); });
  await s.settle(5); const without = await p.evaluate(() => !document.getElementById('liveDrive').hidden);
  await p.evaluate(() => { const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip; driveAutoOpen(t.key); });
  await s.settle(2); const auto = { without, withRoute: await p.evaluate(() => !document.getElementById('liveDrive').hidden) }; await p.evaluate(() => driveClose());
  check(`${dev} · ouverture automatique seulement quand l’itinéraire est prêt (échec d’itinéraire : Trajet et « Réessayer » restent visibles)`, !auto.without && auto.withRoute, JSON.stringify(auto));
  check(`${dev} · rien d’écrit (voitures, trajets imprévus)`, before === await p.evaluate(() => JSON.stringify({ cars: S.cars, loans: S.loans || [] })));
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
