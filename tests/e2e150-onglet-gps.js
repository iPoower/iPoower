// Onglet GPS (21/11/2026), données FICTIVES, iPhone puis PC, GPS simulé.
// 6 onglets (Météo, Pneus, Trajet, GPS, Garage, Analyse) lisibles à 414 et 375 px (cibles ≥ 44 px, aucun libellé coupé) ;
// SANS trajet : onglet GPS → choix de la voiture → « Rouler sans destination » → cockpit EN DIRECT ;
// AVEC trajet : onglet GPS → carte du trajet → « Démarrer » → cockpit sur CE trajet ; l'onglet Trajet n'a plus de bouton
// EN DIRECT ; raccourcis 1 à 6 et retour arrière.
'use strict';
const path = require('path');
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 700))); if (!ok) fail++; };
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const LABELS = ['Météo', 'Pneus', 'Trajet', 'GPS', 'Garage', 'Analyse'];
const tabs = p => p.evaluate(() => [...document.querySelectorAll('#viewSeg [data-act=view]')].map(b => { const r = b.getBoundingClientRect();
  return { v: b.dataset.v, text: b.textContent.replace(/\s+/g, ' ').trim().replace(/^\S+\s/, ''), key: b.getAttribute('aria-keyshortcuts'), w: Math.round(r.width), h: Math.round(r.height), clip: b.scrollWidth > b.clientWidth + 1 }; }));
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T10:00:00+01:00', dev }), p = s.p;
  await s.p.evaluate(() => { lsSet('twrc.drive.live', '1'); renderAll(); });   // mode EN DIRECT (sans CarPlay) : préférence de l’appareil, désactivée par défaut depuis le 27/11
  await p.route('https://data.geopf.fr/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PX }));
  await p.route('https://overpass-api.de/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"elements":[]}' }));
  const RAD = Math.PI / 180, meters = (a, c) => 6371000 * RAD * Math.hypot(c[0] - a[0], (c[1] - a[1]) * Math.cos((a[0] + c[0]) * RAD / 2));
  await p.route('https://router.project-osrm.org/**', r => { const m = /driving\/([^;]+);([^?]+)/.exec(new URL(r.request().url()).pathname), A = m[1].split(',').map(Number), B = m[2].split(',').map(Number);
    const co = Array.from({ length: 21 }, (_, i) => [A[0] + (B[0] - A[0]) * i / 20, A[1] + (B[1] - A[1]) * i / 20]), d = meters([A[1], A[0]], [B[1], B[0]]);
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: d, duration: d / 15, geometry: { coordinates: co }, legs: [{ steps: [], annotation: { duration: co.slice(1).map(() => d / 300) } }] }] }) }); });
  await p.emulateMedia({ reducedMotion: 'reduce' }); await s.settle(4);
  // Barre d'onglets : ordre, raccourcis, lisibilité à 414 et 375 px (téléphone) ; captures pour le rapport.
  if (dev === 'iphone') for (const w of [414, 375]) {
    await p.setViewportSize({ width: w, height: 860 }); await s.settle(1);
    const t = await tabs(p);
    check(`${dev} ${w} px · 6 onglets dans l’ordre ${t.map(x => x.text).join(' · ')}, raccourcis 1 à 6, cibles ≥ 44 px, aucun libellé coupé (largeur ${Math.min(...t.map(x => x.w))} px au moins)`,
      JSON.stringify(t.map(x => x.text)) === JSON.stringify(LABELS) && t.every((x, i) => x.key === String(i + 1) && x.h >= 44 && x.w >= 44 && !x.clip), JSON.stringify(t));
    if (process.env.SP) await p.locator('#viewSeg').screenshot({ path: path.join(process.env.SP, `onglets-${w}.png`) }).catch(() => {});
  }
  // SANS trajet dans les 3 h (jour de repos, aucun trajet programmé).
  const ids = await p.evaluate(() => { S.work.days = []; appSetDayType('off'); saveSettings(); appSetCar(S.cars[0].id); UI.view = 'trajet'; rebuild(); renderAll();
    return { A: S.cars[0].id, B: S.cars[1].id, soon: typeof driveSoonTrip === 'function' ? !!driveSoonTrip() : null }; });
  await s.settle(3);
  const tr = await p.evaluate(() => ({ live: document.querySelectorAll('#secTrip [data-act=drive-open], #secTrip [data-act=drive-gps], #secTripSummary [data-act=drive-open], #secTripSummary [data-act=drive-gps]').length,
    words: [...document.querySelectorAll('#secTrip button, #secTripSummary button')].filter(b => /EN DIRECT/.test(b.textContent)).length }));
  check(`${dev} · onglet Trajet : plus aucun bouton EN DIRECT (Trajet sert à préparer)`, tr.live === 0 && tr.words === 0, JSON.stringify(tr));
  const tab = await p.locator('#viewSeg [data-v=gps]').click({ timeout: 5000 }).then(() => true, () => false); await s.settle(2);
  if (!tab) { check(`${dev} · SANS trajet : onglet GPS présent dans la barre`, false, 'aucun onglet GPS'); await s.c.close(); return; }
  const g = await p.evaluate(() => { const r = document.getElementById('secGps'); return { view: UI.view, shown: !!r && !r.hidden && r.getBoundingClientRect().height > 0, h: (r && r.querySelector('h3') || {}).textContent || '',
    cars: r ? [...r.querySelectorAll('[data-act=drive-car]')].map(x => [x.dataset.id, x.getAttribute('aria-pressed')]) : [], big: r ? [...r.querySelectorAll('[data-act=drive-car], [data-act=drive-free], [data-act=drive-dest]')].every(x => x.getBoundingClientRect().height >= 44) : false,
    trip: !!(r && r.querySelector('[data-gps=trip]')), others: [...document.querySelectorAll('.wrap .mod')].filter(m => m.id !== 'secGps' && m.id !== 'settings' && m.getBoundingClientRect().height > 0).map(m => m.id) }; });
  check(`${dev} · SANS trajet : onglet GPS = choix de la voiture (voiture du jour présélectionnée), seule section affichée`, g.view === 'gps' && g.shown && /Quelle voiture/.test(g.h) && g.cars.length >= 2 && g.cars.find(c => c[0] === ids.A)[1] === 'true' && g.big && !g.trip && !g.others.length, JSON.stringify(g));
  await p.locator(`#secGps [data-act=drive-car][data-id="${ids.B}"]`).click(); await s.settle(1);
  await p.evaluate(() => { const [o] = S.locs; window.__geo = { lat: o.lat + 0.02, lon: o.lon, acc: 6 }; });
  if (dev === 'iphone' && process.env.SP) { await p.setViewportSize({ width: 414, height: 860 }); await s.settle(1); await p.screenshot({ path: path.join(process.env.SP, 'onglet-gps-sans-trajet-414.png') }).catch(() => {}); }
  await p.locator('#secGps [data-act=drive-free]').click(); await s.settle(4);
  const f = await p.evaluate(() => ({ open: DRIVE.open, free: !!DRIVE.free, car: appDay().activeCarId, shown: !document.getElementById('liveDrive').hidden, setup: !!document.querySelector('#liveDrive [data-act=drive-car]') }));
  check(`${dev} · SANS trajet : voiture choisie puis « Rouler sans destination » → cockpit EN DIRECT ouvert`, f.open && f.free && f.shown && !f.setup && f.car === ids.B, JSON.stringify(f));
  await p.locator('#liveDrive [data-act=drive-close]').last().click(); await s.settle(2);
  const back = await p.evaluate(() => ({ view: UI.view, closed: document.getElementById('liveDrive').hidden, cars: document.querySelectorAll('#secGps [data-act=drive-car]').length }));
  check(`${dev} · « Fermer » : retour à l’onglet GPS (choix de la voiture)`, back.view === 'gps' && back.closed && back.cars >= 2, JSON.stringify(back));
  // AVEC trajet : carte du trajet et « Démarrer ».
  const key = await p.evaluate(B => { const [o, d] = S.locs; appProgramManualTrip({ originId: o.id, originPoint: null, destinationId: d.id, destinationPoint: null, dep: liveNow().slice(0, 16), carId: B }); rebuild(); renderAll();
    const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip; return { key: t && t.key, to: d.name }; }, ids.B); await s.settle(8);
  const c = await p.evaluate(() => { const r = document.getElementById('secGps'), go = r && r.querySelector('[data-act=drive-open]'); return { trip: !!(r && r.querySelector('[data-gps=trip]')), text: r ? r.innerText : '', go: go ? go.textContent.trim() : '', h: go ? Math.round(go.getBoundingClientRect().height) : 0, cars: r ? r.querySelectorAll('[data-act=drive-car]').length : -1 }; });
  check(`${dev} · AVEC trajet : onglet GPS = carte du trajet (destination, voiture, km, départ) et grand bouton « Démarrer »`, c.trip && c.go === 'Démarrer' && c.h >= 56 && c.cars === 0 && c.text.includes(key.to) && /🚗/.test(c.text) && /Départ \d{2}:\d{2}/.test(c.text) && /\d+(,\d)? km/.test(c.text) && !/Origine à confirmer/.test(c.text), JSON.stringify(c));
  if (dev === 'iphone' && process.env.SP) await p.screenshot({ path: path.join(process.env.SP, 'onglet-gps-avec-trajet-414.png') }).catch(() => {});
  await p.locator('#secGps [data-act=drive-open]').click(); await s.settle(4);
  const o = await p.evaluate(() => ({ open: DRIVE.open, key: DRIVE.key, free: !!DRIVE.free, shown: !document.getElementById('liveDrive').hidden }));
  check(`${dev} · AVEC trajet : « Démarrer » → cockpit EN DIRECT sur ce trajet`, o.open && o.shown && !o.free && o.key === key.key, JSON.stringify({ o, key }));
  await p.locator('#liveDrive [data-act=drive-close]').last().click(); await s.settle(2);
  // Raccourcis 1 à 6 (ordinateur) et retour arrière (historique des vues).
  if (dev === 'pc') {
    await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    const seq = [];
    for (const k of ['1', '2', '3', '4', '5', '6']) { await p.keyboard.press(k); await s.settle(0.3); seq.push(await p.evaluate(() => UI.view)); }
    check(`${dev} · touches 1 à 6 : ${seq.join(', ')}`, seq.join(',') === 'meteo,pneus,trajet,gps,garage,analyse', seq.join(','));
    await p.keyboard.press('4'); await s.settle(0.5); await p.keyboard.press('5'); await s.settle(0.5);
    await p.evaluate(() => history.back()); await s.settle(1); const b1 = await p.evaluate(() => UI.view);
    await p.evaluate(() => history.back()); await s.settle(1); const b2 = await p.evaluate(() => UI.view);
    check(`${dev} · retour arrière : Garage → GPS → Analyse`, b1 === 'gps' && b2 === 'analyse', JSON.stringify({ b1, b2 }));
  }
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
