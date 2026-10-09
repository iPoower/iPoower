// Vrais clics sur le bloc Météo, agenda/réseau/GPS fictifs, aucun appel au compte réel.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto');
const { session, BR, errors, NETWORK_NOISE } = require('./lib/context-session');
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), day = '2026-10-09';
let n = 0, stage = '';
const check = async (name, fn) => { stage = name; await fn(); n++; console.log('✅ ' + name); };
const tap = (p, dev, selector) => dev === 'iphone' ? p.locator(selector).first().tap() : p.locator(selector).first().click();
function seal(data) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), it = 600000, key = crypto.pbkdf2Sync(PW.toLowerCase(), salt, it, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv), bytes = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final(), cipher.getAuthTag()]);
  return { s: salt.toString('base64'), i: iv.toString('base64'), it, c: bytes.toString('base64') };
}
function installGeo() {
  window.__originGeo = { lat: 49.08, lon: 2.91, acc: 25, deny: false, delay: 20, age: 0 };
  window.__originGeoCalls = [];
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
    getCurrentPosition(ok, err, options) {
      window.__originGeoCalls.push({ kind: 'get', options }); const g = { ...window.__originGeo };
      setTimeout(() => g.deny ? err({ code: 1 }) : ok({ coords: { latitude: g.lat, longitude: g.lon, accuracy: g.acc, speed: null }, timestamp: Date.now() - g.age }), g.delay);
    },
    watchPosition() { window.__originGeoCalls.push({ kind: 'watch' }); return 99; }, clearWatch() {}
  } });
}
// WebKit can fail the navigation itself under context.setOffline(true), before the
// app can read its encrypted cache. Simulate disconnection at both layers:
 // navigator.onLine remains false across reloads, while fixture shell assets
// are served locally and every live-data request is aborted.
function installOffline() {
  window.__originOffline = sessionStorage.getItem('__originOffline') === '1';
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !window.__originOffline });
  window.__setOriginOffline = v => {
    window.__originOffline = !!v;
    sessionStorage.setItem('__originOffline', v ? '1' : '0');
    window.dispatchEvent(new Event(v ? 'offline' : 'online'));
  };
}
async function setup(s) {
  const p = s.p, calls = [], weatherCalls = []; let routeRelease = null, routeHeld = null, failRoute = false, networkCut = false;
  await s.c.addInitScript(installOffline); await p.evaluate(installOffline);
  await s.c.addInitScript(installGeo); await p.evaluate(installGeo);
  await p.route('https://router.project-osrm.org/**', async r => {
    const u = r.request().url(); calls.push(u);
    if (routeHeld) await routeHeld;
    if (failRoute) return r.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    const m = /driving\/([^;]+);([^?]+)/.exec(u), a = m[1].split(',').map(Number), b = m[2].split(',').map(Number);
    const rawMin = a[0] < 2.3 ? 24 : a[0] > 2.8 ? 45 : 40, km = rawMin === 24 ? 38.1 : rawMin === 45 ? 78.2 : 60;
    const coords = Array.from({ length: 12 }, (_, i) => [a[0] + (b[0] - a[0]) * i / 11, a[1] + (b[1] - a[1]) * i / 11]);
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: km * 1000, duration: rawMin * 60,
      geometry: { coordinates: coords }, legs: [{ annotation: { duration: coords.slice(1).map(() => rawMin * 60 / 11) } }] }] }) });
  });
  p.on('request', r => { if (r.url().includes('open-meteo.com') && new URL(r.url()).searchParams.get('latitude')?.includes(',')) weatherCalls.push(r.url()); });
  await p.route('https://data.geopf.fr/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: [{ properties: { label: "1 Rue de l'Église 59000 Lille", context: '59, Nord, Hauts-de-France', type: 'housenumber' }, geometry: { coordinates: [2.97, 49.05] } }] }) }));
  const cal = await p.evaluate(day => {
    S.gpsAuto = false; S.work.days = [7]; S.customs = [{ id: 'ami', name: 'Lieu enregistré test', lat: 49.04, lon: 2.8 }];
    liveReset(); tripPreviewReset(); GPS = null; PLACE.conf = null;
    USER_STORE.state.lastDeparture = null; USER_STORE.state.dayContext.nextDestination = null;
    const H = { ...S.locs[0], label: 'Domicile', city: 'Domicile' }, A = { lat: 49.3, lon: 3.2, label: 'Alpha', city: 'Alpha' }, B = { lat: 49.6, lon: 3.6, label: 'Beta', city: 'Beta' };
    const leg = (k, from, to, dep, arr, fromKind) => ({ k, from, to, dep: day + 'T' + dep, arr: day + 'T' + arr, fromKind, km: 60, min: 40, routed: true,
      pts: [{ f: .5, lat: (from.lat + to.lat) / 2, lon: (from.lon + to.lon) / 2 }], g: [[from.lat, from.lon], [to.lat, to.lon]] });
    const events = [
      { id: 'fixture-alpha', t: 'Rendez-vous Alpha', s: day + 'T10:00', e: day + 'T11:00', ...A, mode: 'maison', legs: [leg('go', H, A, '09:10', '09:50', 'home'), leg('ret', A, H, '11:10', '11:50', 'event')] },
      { id: 'fixture-beta', t: 'Rendez-vous Beta', s: day + 'T13:00', e: day + 'T14:00', ...B, mode: 'direct', legs: [leg('go', A, B, '12:10', '12:50', 'prev'), leg('ret', B, H, '14:10', '14:50', 'event')] },
      { id: 'fixture-alpha', t: 'Alpha demain', s: '2026-10-10T10:00', e: '2026-10-10T11:00', ...A, legs: [{ ...leg('go', H, A, '09:10', '09:50', 'home'), dep: '2026-10-10T09:10', arr: '2026-10-10T09:50' }] }
    ];
    CAL = { events, updated: new Date(Date.now()).toISOString() }; CALDONE = true; saveSettings(); renderAll();
    return { events, updated: CAL.updated };
  }, day);
  const sealed = seal(cal);
  await p.route('**/calendar.sealed.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sealed) }));
  await p.evaluate(async sealed => { CAL.c = sealed.c; lsSet(CAL_CACHE_KEY, JSON.stringify({ t: Date.now(), sealed })); await window.TWRC_VAULT.flush(); }, sealed);
  // Registered last: this interceptor precedes both the OSRM and calendar
  // fixture routes, so offline tests cannot read their mock live responses.
  await p.route('**/*', r => {
    const u = r.request().url(), staticShell = u.startsWith('https://ipoower.github.io/iPoower/race-control/')
      && !/(?:calendar\.sealed|obs|version|relay|datex)\.json/.test(u);
    return networkCut && !staticShell ? r.abort('internetdisconnected') : r.fallback();
  });
  await s.settle(7);
  return { calls, weatherCalls, offline: v => { networkCut = !!v; }, hold: () => { routeHeld = new Promise(resolve => { routeRelease = resolve; }); }, release: () => { routeRelease?.(); routeHeld = null; }, fail: v => { failRoute = v; } };
}
const state = p => p.evaluate(() => {
  const e = CAL.events.find(e => e.id === 'fixture-alpha' && e.s.slice(0, 10) === '2026-10-09'), t = APP_CONTEXT.planned.find(t => t.e === e && (t.planL || t.l).k === 'go'), leg = t && (t.planL || t.l);
  return { id: TripCancel.eventId(e), key: t && t.key, from: t && t.from, pending: !!(leg && leg.originPending), dep: t && t.dep, arr: t && t.arr,
    km: leg && leg.km, min: leg && leg.min, g: leg && leg.g, seq: t && (t.seq || []).map(q => q.t),
    origins: S.calOrigins, calendar: JSON.stringify(CAL.events), others: JSON.stringify(CAL.events.filter(x => x !== e).map(x => effLegs(x))), ret: JSON.stringify(effLegs(e).filter(l => l.k === 'ret')),
    wx: document.querySelector('#secWx .wx-trip')?.innerText, loc: UI.loc, gps: JSON.stringify(GPS), place: JSON.stringify(PLACE),
    editor: !!CAL_ORIGIN_FORM, message: CAL_ORIGIN_FORM && CAL_ORIGIN_FORM.message, vaultError: window.TWRC_VAULT.error };
});
async function ready(s) {
  for (let i = 0; i < 50; i++) { const x = await state(s.p); if (!x.pending && x.seq.length) return x; await s.settle(1); }
  const detail = await s.p.evaluate(() => {
    const e = CAL && CAL.events && CAL.events.find(e => e.id === 'fixture-alpha' && e.s.slice(0, 10) === '2026-10-09');
    const t = e && APP_CONTEXT.planned.find(t => t.e === e && (t.planL || t.l || {}).k === 'go');
    const leg = t && (t.planL || t.l), k = leg && !leg.originPending ? legKey(leg) : null;
    return { view: UI.view, offline: offlineNow(), present: !!e, trip: !!t, calCount: CAL && CAL.events && CAL.events.length,
      origin: leg && leg.originExplicit, pending: leg && leg.originPending, km: leg && leg.km, dep: leg && leg.dep,
      routeEntries: CANCELROUTES.size, cache: k && LEGM[k] && { hasModels: !!LEGM[k].models, age: Date.now() - LEGM[k].t },
      vaultError: !!window.TWRC_VAULT.error, storageError: !!window.TWRC_STORAGE_ERROR };
  });
  assert.fail('route et météo non prêtes : ' + JSON.stringify(detail));
}
async function apply(s, dev, mode) {
  await tap(s.p, dev, '#secWx [data-act=cal-origin-open]'); await s.p.selectOption('#wxOriginMode', mode);
  await tap(s.p, dev, '#wxOriginEditor [data-act=cal-origin-apply]');
  for (let i = 0; i < 30 && (await state(s.p)).editor; i++) await s.settle(1);
}
(async () => {
  const browser = await BR.launch();
  try {
    for (const dev of ['pc', 'iphone']) {
      const s = await session(browser, { at: day + 'T08:00:00+02:00', dev }), p = s.p, ctl = await setup(s);
      // session() impose Météo pour ses captures sans sauvegarder l'onglet ; le reload doit restaurer un vrai choix utilisateur.
      await p.evaluate(() => chooseView('meteo'));
      const original = await ready(s), key = original.key;
      await check(dev + ' · commande discrète dans Prochain trajet, cinq onglets conservés', async () => {
        assert.match(original.wx, /Domicile → Alpha/); assert.equal(await p.locator('#secWx [data-act=cal-origin-open]').count(), 1);
        assert.deepEqual(await p.locator('#viewSeg [data-act=view]').evaluateAll(es => es.map(e => e.dataset.v)), ['meteo', 'pneus', 'trajet', 'tenue', 'analyse']);
      });
      await tap(p, dev, '#secWx [data-act=cal-origin-open]');
      await check(dev + ' · choix domicile, lieux, adresse, GPS et retour automatique', async () => {
        const options = await p.locator('#wxOriginMode option').evaluateAll(es => es.map(e => e.value));
        for (const value of ['auto', 'home', 'saved:work', 'saved:ami', 'address', 'gps']) assert(options.includes(value));
      });
      await p.selectOption('#wxOriginMode', 'saved:work'); await tap(p, dev, '#wxOriginEditor [data-act=cal-origin-close]');
      await check(dev + ' · Retour abandonne le brouillon sans changer le trajet', async () => { const x = await state(p); assert.equal(x.from, original.from); assert.equal(x.key, key); assert.deepEqual(x.origins, {}); });
      ctl.hold(); await apply(s, dev, 'saved:work');
      await check(dev + ' · recalcul en attente reste sur Alpha, aucune ancienne métrique', async () => {
        const x = await state(p); assert(x.pending); assert.equal(x.key, key); assert.match(x.wx, /Travail test → Alpha/); assert(!/\d+ min|\d+ km/.test(x.wx.split('Ensuite :')[0]));
        assert.equal(x.min, null); assert.equal(x.km, null); assert.deepEqual(x.g, []);
      });
      ctl.release(); const work = await ready(s);
      await check(dev + ' · OSRM recalcule kilomètres, durée, heure conseillée et météo du parcours', async () => {
        assert.equal(work.km, 38.1); assert.equal(work.min, 26); assert.equal(work.dep, day + 'T09:24'); assert.equal(work.arr, day + 'T09:50');
        assert.equal(work.key, key); assert(ctl.calls.some(u => /driving\/2.25,48.9;/.test(u))); assert(ctl.weatherCalls.some(u => new URL(u).searchParams.get('latitude').startsWith('48.9,')));
        assert.match(work.wx, /26 min.*38 km/); assert.match(work.wx, /remplace ici l’origine de #maison/);
      });
      await check(dev + ' · calendrier, retour, autres occurrences, lieu météo et GPS inchangés', async () => {
        for (const k of ['calendar', 'others', 'ret', 'loc', 'gps', 'place']) assert.equal(work[k], original[k], k);
        assert.equal(Object.keys(work.origins).length, 1); assert.deepEqual(Object.keys(work.origins[work.id]), ['go']);
      });
      await check(dev + ' · choix protégé du lieu confirmé et du GPS avant le départ', async () => {
        const ok = await p.evaluate(() => {
          const t = APP_CONTEXT.planned.find(t => t.e?.id === 'fixture-alpha' && t.l.k === 'go'), oldPhase = LIVE.phase, oldFix = FIX;
          LIVE.phase = 'advice'; FIX = { lat: 50, lon: 3, acc: 20, ts: Date.now() };
          const projected = liveTrip(t, liveNow()); LIVE.phase = oldPhase; FIX = oldFix;
          return projected.from === t.from && projected.dep === t.dep && appAgendaLeg(t.e, t.l).from.id === 'work';
        }); assert(ok);
      });
      await p.reload(); await s.settle(10); await ready(s);
      await check(dev + ' · rechargement : préférence récupérée du coffre, aucun stockage brut lisible', async () => {
        const x = await state(p); assert.equal(x.origins[x.id].go.choice.placeId, 'work'); assert.equal(x.key, key);
        const raw = await p.evaluate(() => ({ sealed: !!window.TWRC_RAW_STORAGE.getItem('twrc.vault.v2'), plain: ['twrc.settings.v1', 'twrc.context.v1', 'twrc.calOrigins'].filter(k => window.TWRC_RAW_STORAGE.getItem(k) !== null) }));
        assert(raw.sealed); assert.deepEqual(raw.plain, []);
      });
      await tap(p, dev, '#secWx [data-act=cal-origin-open]'); await p.selectOption('#wxOriginMode', 'address'); await p.fill('#wxOriginQ', "1 Rue de l'Église 59000 Lille");
      await check(dev + ' · actualisation météo conserve saisie, focus et sélection', async () => {
        await p.evaluate(() => { const el = document.getElementById('wxOriginQ'); el.focus(); el.setSelectionRange(4, 9); renderAll(); });
        assert.equal(await p.locator('#wxOriginQ').inputValue(), "1 Rue de l'Église 59000 Lille");
        assert.deepEqual(await p.evaluate(() => [document.activeElement.id, document.activeElement.selectionStart, document.activeElement.selectionEnd]), ['wxOriginQ', 4, 9]);
      });
      await tap(p, dev, '#wxOriginEditor [data-act=cal-origin-search]');
      for (let i = 0; i < 25 && !await p.locator('[data-act=cal-origin-pick]').count(); i++) await s.settle(1);
      await tap(p, dev, '#wxOriginEditor [data-act=cal-origin-pick]'); await tap(p, dev, '#wxOriginEditor [data-act=cal-origin-apply]'); await s.settle(4); const address = await ready(s);
      await check(dev + ' · adresse manuelle retenue, nouveau trajet et même occurrence', async () => { assert.match(address.from, /Rue de l'Église/); assert.equal(address.min, 50); assert.equal(address.km, 78.2); assert.equal(address.dep, day + 'T09:00'); assert.equal(address.key, key); assert.equal(address.loc, original.loc); });
      await tap(p, dev, '#secWx [data-act=cal-origin-open]'); await p.selectOption('#wxOriginMode', 'gps');
      const gpsBefore = await state(p); await tap(p, dev, '#wxOriginEditor [data-act=cal-origin-gps]'); await s.settle(1);
      await tap(p, dev, '#wxOriginEditor [data-act=cal-origin-apply]'); await s.settle(4); const gpsChoice = await ready(s);
      await check(dev + ' · GPS ponctuel sans watch, sans changer lieu réel ni météo affichée', async () => {
        assert.equal(gpsChoice.origins[gpsChoice.id].go.choice.kind, 'gps'); for (const k of ['loc', 'gps', 'place']) assert.equal(gpsChoice[k], gpsBefore[k]);
        const calls = await p.evaluate(() => window.__originGeoCalls); assert.equal(calls.filter(c => c.kind === 'get').length, 1); assert(!calls.some(c => c.kind === 'watch')); assert.equal(calls[0].options.maximumAge, 0);
      });
      await tap(p, dev, '#secWx [data-act=cal-origin-open]'); await p.selectOption('#wxOriginMode', 'gps'); await p.evaluate(() => { window.__originGeo.deny = true; });
      await tap(p, dev, '#wxOriginEditor [data-act=cal-origin-gps]'); await s.settle(1);
      await check(dev + ' · GPS refusé : message clair et aucun changement appliqué', async () => { assert.match((await state(p)).message, /GPS refusé/); assert.equal((await state(p)).origins[gpsChoice.id].go.choice.kind, 'gps'); });
      await p.selectOption('#wxOriginMode', 'gps'); await p.evaluate(() => { window.__originGeo.deny = false; window.__originGeo.delay = 1000; });
      await tap(p, dev, '#wxOriginEditor [data-act=cal-origin-gps]'); await p.selectOption('#wxOriginMode', 'home'); await s.settle(3);
      await check(dev + ' · réponse GPS tardive ne remplace pas le nouveau choix', async () => assert.equal(await p.evaluate(() => CAL_ORIGIN_FORM.hit), null));
      await tap(p, dev, '#wxOriginEditor [data-act=cal-origin-close]');
      ctl.offline(true); await p.evaluate(() => window.__setOriginOffline(true)); await apply(s, dev, 'saved:ami');
      await check(dev + ' · hors ligne : choix enregistré, même rendez-vous, heure/route/météo en attente', async () => { const x = await state(p); assert(await p.evaluate(() => navigator.onLine) === false); assert(await p.evaluate(async () => { try { await fetch('https://router.project-osrm.org/route/v1/driving/0,0;1,1'); return false; } catch (e) { return true; } })); assert(x.pending); assert.match(x.wx, /Lieu enregistré test → Alpha/); assert.match(x.wx, /Hors ligne.*en attente/); assert.equal(x.key, key); });
      await p.reload(); await s.settle(8);
      await check(dev + ' · redémarrage hors ligne retrouve agenda chiffré et origine choisie', async () => { const x = await state(p); assert(await p.evaluate(() => navigator.onLine) === false); assert.equal(x.origins[x.id].go.choice.placeId, 'ami'); assert(x.pending); assert.equal(x.key, key); });
      ctl.offline(false); await p.evaluate(() => window.__setOriginOffline(false)); await s.settle(8); await ready(s);
      await check(dev + ' · reconnexion reprend le calcul depuis le départ choisi', async () => { const x = await state(p); assert(!x.pending); assert.equal(x.from, 'Lieu enregistré test'); assert(x.seq.length); });
      ctl.fail(true); await apply(s, dev, 'saved:work'); await s.settle(3);
      await check(dev + ' · route 503 garde le rendez-vous et masque les anciennes mesures', async () => { const x = await state(p); assert(x.pending); assert.equal(x.key, key); assert.equal(x.km, null); });
      ctl.fail(false); await p.evaluate(() => window.dispatchEvent(new Event('online'))); await s.settle(5); await ready(s);
      await check(dev + ' · nouvelle connexion relance aussi un itinéraire précédemment en erreur', async () => assert.equal((await state(p)).km, 38.1));
      await p.evaluate(async () => {
        await window.TWRC_VAULT.flush(); window.__originVaultBefore = window.TWRC_RAW_STORAGE.getItem('twrc.vault.v2'); window.__originStorageSet = Storage.prototype.setItem;
        Storage.prototype.setItem = function(k, v) { if (k === 'twrc.vault.v2') throw new DOMException('quota fictif', 'QuotaExceededError'); return window.__originStorageSet.call(this, k, v); };
      });
      await tap(p, dev, '#secWx [data-act=cal-origin-open]'); await p.selectOption('#wxOriginMode', 'home'); await tap(p, dev, '#wxOriginEditor [data-act=cal-origin-apply]'); await s.settle(4);
      await check(dev + ' · stockage refusé : aucun faux succès, coffre précédent intact', async () => {
        const x = await state(p); assert.match(x.message, /Enregistrement chiffré non confirmé/); assert(!/Départ enregistré/.test(x.wx));
        assert(await p.evaluate(() => window.TWRC_RAW_STORAGE.getItem('twrc.vault.v2') === window.__originVaultBefore));
      });
      await p.evaluate(() => { Storage.prototype.setItem = window.__originStorageSet; }); await tap(p, dev, '#wxOriginEditor [data-act=cal-origin-apply]'); await s.settle(4);
      await apply(s, dev, 'auto'); const automatic = await ready(s);
      await check(dev + ' · Départ automatique rétablit exactement l’UX et l’origine #maison', async () => { assert.equal(automatic.from, original.from); assert.equal(automatic.dep, original.dep); assert.equal(automatic.km, original.km); assert.equal(automatic.key, key); assert.equal(automatic.origins[automatic.id].go.choice, null); });
      await apply(s, dev, 'saved:work'); await ready(s);
      await p.evaluate(k => tripCancelStart(k), key); await s.settle(2);
      await check(dev + ' · annulation reste prioritaire, la préférence n’est pas effacée', async () => { assert(await p.evaluate(() => !APP_CONTEXT.trips.some(t => t.e?.id === 'fixture-alpha' && t.e.s.slice(0, 10) === '2026-10-09'))); assert.equal((await state(p)).origins[original.id].go.choice.placeId, 'work'); });
      await p.evaluate(id => tripCancelUndo(id), original.id); await s.settle(4); await ready(s);
      await check(dev + ' · retour sur annulation récupère le même départ choisi', async () => assert.equal((await state(p)).from, 'Travail test'));
      const exportData = await p.evaluate(() => Backup.make({ settings: S, view: UI.view, context: USER_STORE.state, tripCancel: TRIPCANCEL, at: new Date().toISOString() }));
      assert(exportData.settings.calOrigins[original.id]);
      const legacySettings = { ...exportData.settings }; delete legacySettings.calOrigins;
      const backup = { app: 'twrc-backup', v: 1, kdf: 'PBKDF2-SHA256', ...seal({ app: 'twrc', v: 1, at: new Date(s.T0).toISOString(), settings: legacySettings, view: 'meteo' }) };
      p.on('dialog', d => d.accept());
      await p.evaluate(text => backupImport(new File([text], 'backup-v1-fictif.json', { type: 'application/json' })), JSON.stringify(backup));
      await s.settle(8); await ready(s);
      await check(dev + ' · vrai import chiffré V1 et reload conservent l’origine locale', async () => assert.equal((await state(p)).origins[original.id].go.choice.placeId, 'work'));
      await tap(p, dev, '#secWx [data-act=cal-origin-open]');
      await check(dev + ' · PC/iPhone : champs lisibles, cibles 44 pt et aucun débordement', async () => {
        const layout = await p.evaluate(() => { const W = document.documentElement.clientWidth; return { W, sw: document.documentElement.scrollWidth,
          small: [...document.querySelectorAll('#wxOriginEditor button,#wxOriginEditor select,#secWx [data-act=cal-origin-open]')].filter(e => e.getClientRects().length).filter(e => { const r = e.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map(e => e.id || e.dataset.act) }; });
        assert(layout.sw <= layout.W + 1, JSON.stringify(layout)); assert.deepEqual(layout.small, []);
      });
      await tap(p, dev, '#wxOriginEditor [data-act=cal-origin-close]');
      await tap(p, dev, '#viewSeg [data-act=view][data-v=pneus]'); await tap(p, dev, '#viewSeg [data-act=view][data-v=meteo]');
      await check(dev + ' · aller-retour entre onglets conserve le même trajet et son origine', async () => { const x = await state(p); assert.equal(x.key, key); assert.equal(x.from, 'Travail test'); });
      await p.evaluate(k => liveStart(k), key); await s.settle(3);
      await check(dev + ' · départ réel passe au moteur actif et ferme la modification de l’origine', async () => {
        assert(await p.evaluate(k => LIVE.phase === 'active' && TRIPSTART.key === k, key)); assert.equal(await p.locator('#secWx [data-act=cal-origin-open]').count(), 0);
      });
      const target = Date.parse('2026-10-10T08:00:00+02:00'), current = await p.evaluate(() => Date.now());
      await p.clock.fastForward(target - current); await p.evaluate(() => { calendarOriginPurge(); renderAll(); }); await s.settle(2);
      await check(dev + ' · changement de jour purge l’ancien choix sans l’appliquer à l’occurrence suivante', async () => {
        assert.deepEqual(await p.evaluate(() => S.calOrigins), {});
        assert(await p.evaluate(() => effLegs(CAL.events.find(e => e.t === 'Alpha demain')).every(l => !l.originExplicit)));
      });
      await s.c.close();
    }
    await check('aucune exception JavaScript dans les parcours', async () => assert.deepEqual(errors, [], errors.map(String).join(' | ').replace(/https?:\S+/g, '<url>').slice(0, 600)));
    if (NETWORK_NOISE.length) console.log('ℹ️ requêtes coupées en vol WebKit : ' + NETWORK_NOISE.length);
    console.log(`${n}/${n} scénarios OK`);
  } finally { await browser.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + String(e.stack).replace(/https?:\S+/g, '<url>').slice(0, 1800)); process.exitCode = 1; });
