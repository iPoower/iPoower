// Contexte du jour : données synthétiques, vrais taps, quatre vues et expiration.
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs'), crypto = require('node:crypto');
const { session, BR, errors, U } = require('./lib/context-session');
const { unlockIfLocked } = require('./lib/unlock');
const { revealPlaceControls } = require('./lib/place-controls');
let n = 0, scope = {};
const read = p => p.evaluate(() => {
  const c = APP_CONTEXT.snapshot;
  return { day: c.dayType, place: c.currentLocation && c.currentLocation.id, origin: c.origin && c.origin.id, destination: c.destination && c.destination.id,
    destinationName: c.destination && c.destination.name, status: c.status, car: c.activeCarId, occasion: UI.outfitOccasion, next: c.nextTrip && { from: c.nextTrip.from, to: c.nextTrip.to, car: c.nextTrip.carId, src: c.nextTrip.src, key: c.nextTrip.key },
    dayContext: USER_STORE.state.dayContext, work: S.work, stored: JSON.parse(localStorage.getItem(USER_STORE.key)) };
});
async function check(label, fn) { try { await fn(); n++; console.log('✅ ' + label); } catch (e) { console.error('❌ ' + label + ' · ' + e.message); throw e; } }
async function tap(p, selector) {
  await revealPlaceControls(p, selector);
  if (/data-act=day-(type|car)/.test(selector)) await openDay(p);
  // Un clic utilisateur sur « Destination suivante » suppose que l'en-tête du cockpit
  // a été ramené à l'écran. WebKit peut conserver le scroll de la vue précédente
  // et viser un point recouvert par <main class="wrap">. Aucun clic forcé : on
  // replace le panneau comme le ferait l'utilisateur, puis Playwright vérifie
  // toujours visibilité, stabilité et réception réelle des événements pointeur.
  if (selector === '#dayContext .day-destination > summary') {
    await p.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await p.locator(selector).first().scrollIntoViewIfNeeded();
  }
  const el = p.locator(selector).first(); scope.selector = selector;
  try { if (scope.device === 'iphone') await el.tap(); else await el.click(); } catch (e) {
    const hit = await p.evaluate(selector => {
      const node = document.querySelector(selector), rect = node?.getBoundingClientRect();
      if (!rect) return null;
      const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
      const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
      const at = document.elementFromPoint(x, y);
      return { x, y, box: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        scrollY, hit: at?.tagName.toLowerCase() + (at?.id ? '#' + at.id : '') + (at?.className && typeof at.className === 'string' ? '.' + at.className.split(' ').slice(0, 2).join('.') : ''),
        receivesPointer: !!at && (node === at || node.contains(at)) };
    }, selector).catch(() => null);
    console.error('DIAGNOSTIC ' + JSON.stringify({ ...scope, present: await el.count(), visible: await el.isVisible().catch(() => false), enabled: await el.isEnabled().catch(() => false), hit, state: await read(p), overlay: await p.evaluate(() => [...document.querySelectorAll('[role=dialog],dialog[open]')].map(x => x.id)) })); throw e;
  }
}
async function decisionText(p) {
  const context = p.locator('#decisionCore [data-ux=analysis-context]');
  if (await context.isVisible() && !await context.evaluate(x => x.open))
    await tap(p, '#decisionCore [data-ux=analysis-context] > summary');
  return p.locator('#decisionCore').innerText();
}
async function openDay(p) {
  if (await p.evaluate(() => UI.view === 'analyse')) await tap(p, '#viewSeg [data-act=view][data-v=pneus]');
  if (!(await p.locator('#dayContext .day-editor').getAttribute('open') != null)) await tap(p, '#dayContext .day-editor > summary');
}
async function destination(p, id) { await openDay(p); const details = p.locator('#dayContext .day-destination'); if (!(await details.getAttribute('open') != null)) await tap(p, '#dayContext .day-destination > summary'); await tap(p, '#dayContext [data-act=day-destination][data-id="' + id + '"]'); }
async function views(p, expected) {
  for (const v of ['pneus', 'meteo', 'tenue', 'analyse']) {
    scope.view = v; if (v === 'tenue') await p.evaluate(() => { UI.view = 'tenue'; renderAll(); });
    else await tap(p, '#viewSeg [data-act=view][data-v=' + v + ']');
    const s = await read(p); for (const [k, x] of Object.entries(expected)) assert.equal(s[k], x, v + ' · ' + JSON.stringify(s));
    if (expected.destination === 'b') {
      assert.equal(s.next.to, 'Lieu B'); assert.equal(s.next.from, 'Travail test');
      if (v === 'pneus') { assert.match(await p.locator('#secBrf').innerText(), /Lieu B/i); assert.doesNotMatch(await p.locator('#secBrf .brf-ev').first().innerText(), /domicile|maison/i); }
      if (v === 'meteo') assert.match(await p.locator('#secWx .wx-route').innerText(), /Travail test.*Lieu B/i);
      if (v === 'tenue') assert.match(await p.locator('#secTenue').innerText(), /Lieu B/i);
      if (v === 'analyse') assert.equal(await p.evaluate(() => labCar().id), 'carB');
    }
    if (expected.destination === null && expected.status === 'travel') {
      if (v === 'pneus') assert.match(await p.locator('#secBrf').innerText(), /Destination à confirmer/i);
      if (v === 'meteo') { assert.match(await p.locator('#secWx .wx-route').innerText(), /Destination à confirmer/i); assert.equal(await p.locator('#secWx .wx-when').count(), 0); }
    }
  }
}
function sealCalendar(data) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), it = 600000;
  const key = crypto.pbkdf2Sync(fs.readFileSync('.passphrase', 'utf8').trim().toLowerCase(), salt, it, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final(), cipher.getAuthTag()]);
  return { v: 1, kdf: 'PBKDF2-SHA256', s: salt.toString('base64'), i: iv.toString('base64'), it, c: bytes.toString('base64') };
}
async function agendaRegression(browser, dev) {
  scope = { device: dev, phase: 'conflit Agenda après travail' };
  const s = await session(browser, { at: '2026-10-13T15:57:00+02:00', dev }), p = s.p;
  let sealed, revision = s.T0;
  await p.route('**/calendar.sealed.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sealed) }));
  await p.route('https://router.project-osrm.org/**', r => {
    const m = /driving\/([^;]+);([^?]+)/.exec(r.request().url()), a = m[1].split(',').map(Number), b = m[2].split(',').map(Number);
    const coords = Array.from({ length: 12 }, (_, i) => [a[0] + (b[0] - a[0]) * i / 11, a[1] + (b[1] - a[1]) * i / 11]);
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: 12000, duration: 1080,
      geometry: { coordinates: coords }, legs: [{ annotation: { duration: coords.slice(1).map(() => 1080 / 11) } }] }] }) });
  });
  const payload = await p.evaluate(() => {
    liveReset(); tripPreviewReset(); S.gpsAuto = 0; GPS = null; FIX = FIXPREV = null; TRIPSTART = null;
    S.work = { from: 'home', to: 'work', dep: '06:30', ret: '16:00', days: [1, 2, 3, 4, 5], durMin: 40 };
    S.customs = []; USER_STORE.state.dayContext.nextDestination = null; USER_STORE.state.lastDeparture = null;
    const home = { ...S.locs[0], city: 'Domicile test', label: 'Domicile test' }, work = { ...S.locs[1], city: 'Travail test', label: 'Travail test' };
    const target = { lat: 48.96, lon: 2.4, city: 'Alpha fictif', label: 'Alpha fictif' };
    const leg = (k, from, to, dep, arr, min) => ({ k, from, to, dep: '2026-10-13T' + dep, arr: '2026-10-13T' + arr,
      km: 12, min, routed: true, pts: [{ f: .5, lat: (from.lat + to.lat) / 2, lon: (from.lon + to.lon) / 2 }], g: [[from.lat, from.lon], [to.lat, to.lon]] });
    saveSettings(); CAL = { events: [] }; CALDONE = true; renderAll();
    return { events: [{ id: 'appointment-alpha-fixture', t: 'Rendez-vous Alpha fictif', s: '2026-10-13T17:15', e: '2026-10-13T17:45',
      ...target, loc: 'Adresse Alpha fictive', legs: [leg('go', work, target, '16:47', '17:05', 18), leg('ret', target, home, '17:55', '18:13', 18)] }] };
  });
  const publish = async events => {
    sealed = sealCalendar({ events, updated: new Date(++revision).toISOString() });
    await p.evaluate(async () => { await loadCalendar(); renderAll(); }); await s.settle(10);
  };
  await publish(payload.events); await tap(p, '#placeBar [data-act=place-confirm][data-place=work]'); await s.settle(8);
  const originalSettings = await p.evaluate(() => JSON.stringify(S)), originalEvent = JSON.stringify(payload.events[0]);
  const plannedKey = await p.evaluate(() => APP_CONTEXT.planned.find(t => t.e?.id === 'appointment-alpha-fixture' && t.l.k === 'go').key);
  await check(dev + ' · 16:00 retour automatique / 16:47 Agenda depuis travail : vraie occurrence prioritaire', async () => {
    const x = await read(p); assert.equal(x.next.src, 'cal'); assert.equal(x.next.key, plannedKey);
    assert.equal(await p.evaluate(() => APP_CONTEXT.snapshot.departureTime), '2026-10-13T16:47');
    assert(await p.evaluate(() => !!APP_CONTEXT.agendaConflict && !APP_CONTEXT.trips.some(t => t.src === 'work' && t.dep.slice(0, 10) === placeToday() && t.td.dir === 'ret')));
    assert.match(await p.locator('#secWx #wxNextTrip').innerText(), /retour automatique de 16:00.*incompatible/);
    assert.equal(x.dayContext.nextDestination, null); // priorité dérivée, pas un choix utilisateur inventé
  });
  await check(dev + ' · retour explicite au domicile respecte le choix utilisateur', async () => {
    await destination(p, 'home'); assert.equal((await read(p)).next.src, 'work');
    assert.equal(await p.evaluate(() => APP_CONTEXT.agendaConflict), null);
  });
  await tap(p, '#dayContext [data-act=day-destination][data-agenda-key]'); await s.settle(8);
  const shared = async key => {
    for (const view of ['meteo', 'pneus', 'trajet', 'analyse']) {
      await tap(p, '#viewSeg [data-act=view][data-v=' + view + ']');
      const x = await p.evaluate(() => ({ key: APP_CONTEXT.snapshot.nextTrip?.key, wx: wxTrips(CX.m)[0]?.id,
        label: labInput(labCar()).trip?.label, firstLabel: wxTrips(CX.m)[0]?.label,
        cal: APP_CONTEXT.snapshot.agendaEvent?.id, summary: document.querySelector('#secTripSummary')?.innerText }));
      assert.equal(x.key, key, view); assert.equal(x.wx, key, view); assert.equal(x.cal, 'appointment-alpha-fixture', view);
      assert.equal(x.label, x.firstLabel, view); assert(x.label, 'Analyse utilise bien la météo du rendez-vous');
      if (view === 'trajet') assert.match(x.summary, /Alpha fictif|Beta fictif/);
    }
  };
  await check(dev + ' · sélection exacte propagée dans Météo, Pneus, Trajet et Analyse', () => shared(plannedKey));
  await check(dev + ' · sélection n’altère ni réglages, ni agenda, ni lieu actuel', async () => {
    const x = await read(p); assert.equal(x.place, 'work'); assert.equal(x.dayContext.nextDestination.tripKey, plannedKey);
    assert.equal(x.dayContext.nextDestination.dep, '2026-10-13T16:47');
    assert.equal(await p.evaluate(() => JSON.stringify(S)), originalSettings);
    assert.equal(await p.evaluate(() => JSON.stringify(CAL.events[0])), originalEvent);
  });
  await p.evaluate(async () => { await window.TWRC_VAULT.flush(); }); await p.reload(); await s.settle(12);
  await check(dev + ' · reload conserve occurrence/heure dans le coffre, rien en clair', async () => {
    const x = await read(p); assert.equal(x.next.key, plannedKey); assert.equal(x.dayContext.nextDestination.dep, '2026-10-13T16:47');
    assert.deepEqual(await p.evaluate(() => [...Array(window.TWRC_RAW_STORAGE.length)].map((_, i) => window.TWRC_RAW_STORAGE.key(i))
      .filter(k => /Alpha fictif|Adresse Alpha|appointment-alpha-fixture/.test(window.TWRC_RAW_STORAGE.getItem(k)))), []);
  });
  await p.evaluate(() => { window.__savedAgenda = CAL; CAL = null; renderAll(); });
  await check(dev + ' · calendrier indisponible : aucune substitution par commute', async () => {
    assert.equal((await read(p)).next, null); assert.equal((await read(p)).dayContext.nextDestination.tripKey, plannedKey);
    await tap(p, '#viewSeg [data-act=view][data-v=meteo]'); assert.match(await p.locator('#wxNextTrip').innerText(), /Agenda indisponible.*attente de vérification/);
  });
  await p.evaluate(() => { CAL = window.__savedAgenda; renderAll(); }); await s.settle(5);
  const changed = structuredClone(payload.events[0]);
  Object.assign(changed, { lat: 48.98, lon: 2.46, city: 'Beta fictif', label: 'Beta fictif', loc: 'Adresse Beta fictive' });
  const target = { lat: changed.lat, lon: changed.lon, city: changed.city, label: changed.label };
  changed.legs[0].to = target; changed.legs[0].dep = '2026-10-13T16:42'; changed.legs[0].min = 23;
  changed.legs[1].from = target; changed.legs.forEach(l => { l.g = [[l.from.lat, l.from.lon], [l.to.lat, l.to.lon]]; l.pts = [{ f: .5, lat: (l.from.lat + l.to.lat) / 2, lon: (l.from.lon + l.to.lon) / 2 }]; });
  await publish([changed]);
  const changedKey = (await read(p)).next.key;
  await check(dev + ' · adresse/horaire changés : vraie nouvelle route, même occurrence sélectionnée', async () => {
    const x = await read(p); assert.equal(x.dayContext.nextDestination.destinationPoint.lat, changed.lat);
    assert.equal(x.dayContext.nextDestination.dep, '2026-10-13T16:42'); assert.notEqual(changedKey, plannedKey);
    assert.equal(await p.evaluate(() => JSON.stringify(CAL.events[0])), JSON.stringify(changed)); await shared(changedKey);
  });
  await tap(p, '#viewSeg [data-act=view][data-v=pneus]');
  p.once('dialog', d => d.accept()); await p.evaluate(key => tripCancelStart(key), changedKey); await s.settle(5);
  await check(dev + ' · annulation locale enlève la sélection et le trajet, sans toucher Google Agenda', async () => {
    const x = await read(p); assert.equal(x.dayContext.nextDestination, null); assert.equal(x.next.src, 'work');
    assert(await p.evaluate(k => !APP_CONTEXT.trips.some(t => t.key === k), changedKey));
    assert.equal(await p.evaluate(() => JSON.stringify(CAL.events[0])), JSON.stringify(changed));
  });
  await p.evaluate(() => tripCancelUndo(TripCancel.eventId(CAL.events[0]))); await s.settle(6);
  await openDay(p); if (!(await p.locator('#dayContext .day-destination').getAttribute('open') != null)) await tap(p, '#dayContext .day-destination > summary');
  await tap(p, '#dayContext [data-act=day-destination][data-agenda-key]');
  await publish([]);
  await check(dev + ' · événement supprimé au rafraîchissement : aucun trajet local fantôme', async () => {
    assert.equal((await read(p)).dayContext.nextDestination, null);
    assert(await p.evaluate(() => !APP_CONTEXT.trips.some(t => t.src === 'local' || t.src === 'cal')));
  });
  // Précondition : un ancien rendez-vous est le lieu réellement confirmé, avec l'ancien ID dynamique.
  await p.evaluate(() => {
    const at = Date.now(); PLACE.extra = { id: 'agenda-next', name: 'Ancien lieu confirmé fictif', lat: 48.75, lon: 2.3, at };
    PLACE.conf = { placeId: PLACE.extra.id, at, how: 'manual', day: placeToday() };
    USER_STORE.state.dayContext.lastConfirmedPlace = { placeId: PLACE.extra.id, at, source: 'manual' }; renderAll();
  });
  await publish(payload.events); await openDay(p);
  if (!(await p.locator('#dayContext .day-destination').getAttribute('open') != null)) await tap(p, '#dayContext .day-destination > summary');
  await tap(p, '#dayContext [data-agenda-key]'); await s.settle(6);
  await check(dev + ' · nouveau rendez-vous ne remplace jamais le lieu réellement confirmé', async () => {
    const x = await read(p); assert.equal(x.place, 'agenda-next'); assert.equal(x.origin, 'agenda-next');
    assert.notEqual(x.destination, x.place); assert.equal(await p.evaluate(() => placeNow().place.lat), 48.75);
    assert.equal(await p.evaluate(() => PLACE.extra.name), 'Ancien lieu confirmé fictif');
  });
  await p.clock.setSystemTime(new Date('2026-10-14T06:00:00+02:00'));
  const early = structuredClone(payload.events[0]); early.id = 'early-fixture'; early.s = '2026-10-14T06:25'; early.e = '2026-10-14T06:28'; early.mode = 'maison';
  const home = payload.events[0].legs[1].to; early.legs = [{ ...early.legs[0], from: home, dep: '2026-10-14T06:02', arr: '2026-10-14T06:20' }];
  early.legs[0].g = [[home.lat, home.lon], [early.lat, early.lon]];
  early.legs[0].pts = [{ f: .5, lat: (home.lat + early.lat) / 2, lon: (home.lon + early.lon) / 2 }];
  await publish([early]); await tap(p, '#placeBar [data-act=place-confirm][data-place=home]');
  await openDay(p); if (!(await p.locator('#dayContext .day-destination').getAttribute('open') != null)) await tap(p, '#dayContext .day-destination > summary');
  const earlyKey = await p.locator('#dayContext [data-agenda-key]').getAttribute('data-agenda-key');
  await tap(p, '#dayContext [data-agenda-key]'); await s.settle(5);
  await check(dev + ' · rendez-vous avant travail : vraie clé, 06:02 et domicile conservés', async () => {
    const x = await read(p); assert.equal(x.next.key, earlyKey); assert.equal(x.dayContext.nextDestination.dep, '2026-10-14T06:02');
    assert.equal(x.next.from, 'Domicile test'); assert.equal(await p.evaluate(() => APP_CONTEXT.agendaConflict), null);
  });
  await s.c.close();
}
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) for (const profile of ['configured', 'clean']) {
      scope = { device: dev, profile, phase: 'préconditions' };
      const s = await session(b, { at: '2026-10-06T17:00:00+02:00', dev, unlock: profile === 'configured' }); let p = s.p;
      await p.route('https://router.project-osrm.org/**', r => {
        const m = /driving\/([^;]+);([^?]+)/.exec(r.request().url()), a = m[1].split(',').map(Number), b = m[2].split(',').map(Number);
        const coords = Array.from({ length: 12 }, (_, i) => [a[0] + (b[0] - a[0]) * i / 11, a[1] + (b[1] - a[1]) * i / 11]);
        return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: 18000, duration: 2160,
          geometry: { coordinates: coords }, legs: [{ annotation: { duration: coords.slice(1).map(() => 2160 / 11) } }] }] }) });
      });
      if (profile === 'clean') await tap(p, '[data-act=nocode]');
      // Préconditions techniques uniquement : aucune action utilisateur simulée par evaluate.
      await p.evaluate(() => {
        S.locs = [{ id: 'home', name: 'Domicile test', lat: 48.85, lon: 2.35 }, { id: 'work', name: 'Travail test', lat: 48.9, lon: 2.25 }];
        S.customs = [{ id: 'b', name: 'Lieu B', lat: 48.8, lon: 2.45 }];
        S.work = { from: 'home', to: 'work', dep: '06:30', ret: '18:00', days: [1, 2, 3], durMin: 40 };
        S.cars = [structuredClone(S.cars[0]), structuredClone(S.cars[0])]; S.cars.forEach((c, i) => { c.id = 'car' + (i ? 'B' : 'A'); c.name = c.short = 'Voiture ' + (i ? 'B' : 'A'); });
        CAL = { events: [] }; GPS = null; FIX = FIXPREV = null; S.gpsAuto = 0; saveSettings(); renderAll();
      });
      await tap(p, '[data-act=refresh]'); await s.settle();
      scope.phase = 'travail confirmé'; await tap(p, '#placeBar [data-act=place-confirm][data-place=work]');
      await check(dev + '/' + profile + ' · Maison est uniquement PRÉVU', async () => { const x = await read(p); assert.equal(x.destination, 'home'); assert.equal(x.dayContext.nextDestination, null); });
      scope.phase = 'WORK → RENDEZ-VOUS AGENDA';
      await p.evaluate(() => {
        const home = { ...S.locs[0], label: 'Domicile test', city: 'Domicile test' };
        const piano = { lat: 49.971, lon: 2.651, label: 'Le Zèbre test', city: 'Albert test' };
        const leg = { k: 'go', from: home, to: piano, dep: '2026-10-06T17:40', arr: '2026-10-06T18:20', km: 48, min: 40, routed: true,
          pts: [{ f: .5, lat: (home.lat + piano.lat) / 2, lon: (home.lon + piano.lon) / 2, km: 24 }], g: [[home.lat, home.lon], [piano.lat, piano.lon]] };
        CAL = { events: [{ id: 'piano-test', t: 'Piano test', s: '2026-10-06T18:30', e: '2026-10-06T19:30',
          loc: 'Le Zèbre test', label: 'Albert test', lat: piano.lat, lon: piano.lon, legs: [leg] }], updated: new Date(Date.now()).toISOString(), c: CAL && CAL.c };
        CALDONE = true; renderAll();
      });
      await openDay(p); if (!(await p.locator('#dayContext .day-destination').getAttribute('open') != null)) await tap(p, '#dayContext .day-destination > summary');
      const agendaButton = p.locator('#dayContext [data-act=day-destination][data-agenda-key]').first();
      await check(dev + '/' + profile + ' · rendez-vous agenda proposé dans Destination suivante', async () => {
        assert.equal(await agendaButton.count(), 1); assert.match(await agendaButton.innerText(), /17:40.*Piano test.*Albert test/);
      });
      const chosenKey = await agendaButton.getAttribute('data-agenda-key');
      await tap(p, '#dayContext [data-act=day-destination][data-agenda-key]');
      await s.settle();
      await check(dev + '/' + profile + ' · Travail → Piano direct remplace le retour Maison', async () => {
        const x = await read(p); assert.match(x.destination, /^agenda-cal-[0-9a-f]{32}$/); assert.equal(x.dayContext.nextDestination.originId, 'work');
        assert.equal(x.next.key, chosenKey); assert.equal(x.next.src, 'cal');
        assert.equal(x.dayContext.nextDestination.dep, '2026-10-06T17:40');
        assert.equal(x.next.from, 'Travail test'); assert.equal(x.next.to, 'Albert test'); assert.doesNotMatch(x.next.to, /Domicile|Maison/);
        assert.match(await p.locator('#dayContext .day-destination > summary').innerText(), /Piano test.*Albert test.*CONFIRMÉ/);
      });
      await p.evaluate(() => { CAL = { events: [], updated: new Date(Date.now()).toISOString(), c: CAL && CAL.c }; CALDONE = true; renderAll(); });
      scope.phase = 'WORK → CUSTOM'; await destination(p, 'b'); await p.evaluate(() => { if (PLACE.extra && PLACE.extra.id === 'agenda-next') { PLACE.extra = null; USER_STORE.flush(); renderAll(); } }); await tap(p, '[data-act=day-car][data-id=carB]');
      await s.settle();
      await check(dev + '/' + profile + ' · même destination et voiture dans les quatre vues', () => views(p, { place: 'work', destination: 'b', car: 'carB', status: 'work' }));
      const original = (await read(p)).work;
      await check(dev + '/' + profile + ' · voiture manuelle unique, touch 44 px et Race Control aligné', async () => {
        assert(await p.evaluate(() => [...document.querySelectorAll('#dayContext button')].filter(x => x.getClientRects().length).every(x => x.getBoundingClientRect().height >= 44)));
        assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.equal(await p.evaluate(() => TCARS().length), 2); assert.equal(await p.evaluate(() => appTripCars().length), 1);
        assert.equal(await p.locator('#dayContext [data-act=day-car][data-id=""]').count(), 0);
        assert.equal((await read(p)).next.car, 'carB');
        for (const view of ['pneus', 'meteo', 'tenue', 'analyse']) {
          if (view === 'tenue') await p.evaluate(() => { UI.view = 'tenue'; renderAll(); });
          else await tap(p, '#viewSeg [data-act=view][data-v=' + view + ']');
          const editor = p.locator('#dayContext details.day-editor');
          if (await editor.isVisible() && await editor.getAttribute('open') != null) await tap(p, '#dayContext .day-editor > summary');
          const decision = p.locator('#decisionCore');
          if (profile === 'clean') {
            assert.equal(await decision.isVisible(), false, view + ' : synthèse privée masquée sans code');
            continue;
          }
          assert(await decision.isVisible(), view + ' : synthèse visible');
          assert.match(await decisionText(p), /Voiture\s*·\s*Voiture B\s*·\s*choix manuel/i);
          await tap(p, '#decisionCore [data-act=decision-car-change]');
          assert.notEqual(await p.locator('#dayContext details.day-editor').getAttribute('open'), null);
          assert(await p.locator('#dayContext [role=group][aria-label="Voiture active"]').isVisible(), view + ' : sélecteur visible');
          assert.equal(await p.locator('#dayContext [data-act=day-car][data-id=carB]').getAttribute('aria-pressed'), 'true');
        }
      });
      await tap(p, '[data-act=day-car][data-id=carA]');
      await check('changement manuel de voiture : propagation globale immédiate', async () => {
        assert.equal((await read(p)).car, 'carA'); assert.equal((await read(p)).next.car, 'carA');
        assert.equal(await p.evaluate(() => appTripCars().length), 1);
        const decision = p.locator('#decisionCore'); if (await decision.isVisible()) assert.match(await decisionText(p), /Voiture\s*·\s*Voiture A\s*·\s*choix manuel/i);
      });
      await tap(p, '[data-act=day-car][data-id=carB]');
      if (profile === 'configured') await p.locator('#dayContext').screenshot({ path: path.join(process.env.SP, 'day-context-' + dev + '.png') });
      await p.evaluate(() => { S.cars[1].tire.type = 'none'; saveSettings(); renderAll(); });
      await tap(p, '[data-act=day-car][data-id=carA]'); await tap(p, '[data-act=day-car][data-id=carB]');
      await check('Voiture configurée sans pneus : sélection réelle conservée, aucune analyse des autres pneus', async () => {
        await views(p, { place: 'work', destination: 'b', car: 'carB' });
        assert(await p.evaluate(() => APP_CONTEXT.snapshot.trips.every(t => !t.res || t.res.every(r => r.c.id === 'carB'))));
        assert.match(await p.locator('#secLab').innerText(), /Monte.*inconnue/i);
      });
      await p.evaluate(() => { S.cars[1].tire.type = S.cars[0].tire.type; saveSettings(); renderAll(); });
      await p.reload(); await s.settle();
      await check(dev + '/' + profile + ' · reload conserve le contexte', () => views(p, { place: 'work', destination: 'b', car: 'carB' }));
      await p.close(); p = await s.c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.goto(U);
      for (let i = 0; i < 6; i++) { await p.clock.runFor(500); await p.waitForTimeout(80); }
      await unlockIfLocked(p, async () => { for (let i = 0; i < 8; i++) { await p.clock.runFor(500); await p.waitForTimeout(80); } });   // réouverture : code demandé (sécurité V1)
      await p.waitForFunction(() => typeof APP_CONTEXT !== 'undefined' && APP_CONTEXT.snapshot && APP_CONTEXT.snapshot.activeCarId === 'carB');
      await check(dev + '/' + profile + ' · réouverture conserve Lieu B', () => views(p, { place: 'work', destination: 'b', car: 'carB' }));
      scope.phase = 'congé puis travail'; await tap(p, '[data-act=day-type][data-v=off]');
      await check('Congé retire commute local sans réécrire planning', async () => { assert.equal((await read(p)).day, 'off'); assert(await p.evaluate(() => !APP_CONTEXT.snapshot.trips.some(t => t.src === 'work' && t.dep.slice(0, 10) === placeToday()))); assert.deepEqual((await read(p)).work, original); });
      await tap(p, '[data-act=day-type][data-v=work]');
      await check('Travail rétablit commute ; Tenue manuel reste prioritaire', async () => {
        await p.evaluate(() => { UI.view = 'tenue'; renderAll(); }); assert.equal((await read(p)).occasion, 'office');
        await tap(p, '[data-act=outfit-occasion][data-v=outing]'); assert.equal((await read(p)).occasion, 'outing');
        await tap(p, '[data-act=day-type][data-v=work]'); assert.equal((await read(p)).occasion, 'outing');
      });
      scope.phase = 'arrivée Lieu B'; await tap(p, '#placeBar [data-act=place-leave]');
      await tap(p, '#placeBar [data-act=place-confirm][data-place=b]');
      await check('Arrivée termine destination et départ ensemble', async () => { const x = await read(p); assert.equal(x.place, 'b'); assert.equal(x.dayContext.nextDestination, null); assert.equal(x.stored.tripStart, null); });
      scope.phase = 'CUSTOM → HOME'; await destination(p, 'home');
      await check('Lieu B → Maison', async () => { const x = await read(p); assert.equal(x.destination, 'home'); assert.equal(x.origin, 'b'); });
      await tap(p, '#placeBar [data-act=place-confirm][data-place=home]');
      await destination(p, 'work'); await check('HOME → WORK', async () => { assert.equal((await read(p)).destination, 'work'); });
      await tap(p, '#placeBar [data-act=place-confirm][data-place=work]');
      await destination(p, 'home'); await check('WORK → HOME explicite', async () => assert.equal((await read(p)).destination, 'home'));
      await destination(p, ''); await tap(p, '#placeBar [data-act=place-leave]');
      await check('WORK → UNKNOWN ne devient jamais Maison', () => views(p, { status: 'travel', destination: null, car: 'carB' }));
      await p.reload(); await p.waitForFunction(() => typeof APP_CONTEXT !== 'undefined' && APP_CONTEXT.snapshot && APP_CONTEXT.snapshot.status === 'travel');
      await check('UNKNOWN persiste après reload', async () => assert.equal((await read(p)).destination, null));
      scope.phase = 'origine du lendemain'; await tap(p, '#placeBar [data-act=place-confirm][data-place=b]');
      await p.clock.setSystemTime(new Date('2026-10-07T06:00:00+02:00'));
      await check('CUSTOM → WORK le lendemain : voiture manuelle persistante jusqu’au changement utilisateur', async () => {
        await views(p, { origin: 'b', destination: 'work', car: 'carB', day: 'work' });
        const x = await read(p); assert.equal(x.next.from, 'Lieu B'); assert.equal(x.next.to, 'Travail test');
        assert.equal(x.dayContext.nextDestination, null); assert.equal(x.dayContext.dayType, null); assert.equal(x.dayContext.outfitChoice, null); assert.equal(x.occasion, 'office');
        assert.equal(x.dayContext.activeCarId, 'carB'); const decision = p.locator('#decisionCore'); if (await decision.isVisible()) assert.match(await decisionText(p), /Voiture\s*·\s*Voiture B\s*·\s*choix manuel/i);
        assert.deepEqual(x.work, original);
      });
      scope.phase = 'travail exceptionnel';
      await p.evaluate(() => { S.work.days = [1, 2]; saveSettings(); renderAll(); });
      await tap(p, '[data-act=day-type][data-v=work]');
      await check('Jour normalement off : vrai tap Travail autorise le commute sans changer le planning', async () => {
        const x = await read(p); assert.equal(x.next.src, 'work'); assert.equal(x.next.from, 'Lieu B'); assert.equal(x.next.to, 'Travail test'); assert.deepEqual(x.work.days, [1, 2]);
      });
      await tap(p, '[data-act=day-type][data-v=off]');
      await check('Congé exceptionnel supprime les trajets du jour', async () => assert(await p.evaluate(() => !APP_CONTEXT.snapshot.trips.some(t => t.src === 'work' && t.dep.slice(0, 10) === placeToday()))));
      await p.clock.setSystemTime(new Date('2026-10-08T06:00:00+02:00')); await tap(p, '[data-act=day-type][data-v=work]');
      await check('Origine temporaire expirée : planning Domicile PRÉVU retrouvé', async () => { const x = await read(p); assert.equal(x.next.from, 'Domicile test'); assert.equal(x.dayContext.nextDestination, null); assert.equal(x.dayContext.outfitChoice, null); });
      await p.evaluate(() => { S.cars = S.cars.filter(c => c.id !== 'carB'); saveSettings(); renderAll(); });
      await check('Suppression voiture active : ID nettoyé et fallback conservé', async () => { assert.equal((await read(p)).car, null); assert.equal(await p.evaluate(() => appTripCars()[0].id), 'carA'); });
      await s.c.close();
    }
    for (const dev of ['iphone', 'pc']) await agendaRegression(b, dev);
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
  } finally { await b.close(); }
  console.log(`${n}/${n} scénarios OK · erreurs JS : aucune`);
})().catch(e => { console.error('❌ ' + JSON.stringify(scope)); console.error(e); process.exit(1); });
