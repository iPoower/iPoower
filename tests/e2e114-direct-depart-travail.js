// Lot 2 (passe R2) · R2-04, parcours complet avec un itinéraire simulé qui ABOUTIT (iPhone et PC, moteurs réels).
// Un rendez-vous #direct, premier de sa journée : le relais a planifié l'aller depuis le domicile. Le départ est ensuite
// choisi dans l'app (lieu enregistré « Travail test ») ; l'itinéraire et la météo du nouveau trajet sont calculés.
// Attendu, lu dans l'agenda AFFICHÉ : le message #direct et la ligne « ALLER » citent le même départ, « depuis Travail test »,
// avec le trajet recalculé (durée de l'itinéraire simulé) ; « Départ automatique » rétablit « depuis le domicile ».
// Agenda fictif du harnais, re-chiffré avec la clé de test : seul le mode d'un rendez-vous change. Itinéraire 100 % simulé.
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { seal, tryUnseal } = require('../tools/keys.js');
const PW = fs.readFileSync('.passphrase', 'utf8').trim();
const SRC = process.env.SP, SP = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e114-'));
fs.cpSync(SRC, SP, { recursive: true });
const base = tryUnseal(JSON.parse(fs.readFileSync(path.join(SRC, 'cal.fake.json'), 'utf8')), PW.toLowerCase());
assert(base && Array.isArray(base.events), 'agenda fictif lisible avec la clé de test');
const direct = base.events.find(e => !e.allDay && e.lat != null && e.mode !== 'pasdetrajet' && e.s >= '2026-10-03' && ((e.legs || []).find(l => l.k === 'go') || {}).fromKind === 'home');
assert(direct, 'un rendez-vous fictif horaire, premier de sa journée, avec aller depuis le domicile existe');
fs.writeFileSync(path.join(SP, 'cal.fake.json'), JSON.stringify(seal({ ...base, events: base.events.map(e => e.id === direct.id ? { ...e, mode: 'direct' } : e) }, PW.toLowerCase())));
process.env.SP = SP;
const { BR, session, errors } = require('./lib/context-session');
const ROUTE_MIN = 24, ROUTE_KM = 31;   // itinéraire simulé depuis le travail : durée et distance propres, pour le reconnaître à l'écran
let n = 0, stage = '';
const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
// Ce que l'utilisateur lit dans la carte du rendez-vous : message #direct (.alt) et ligne « ALLER » (.leg, .leg-o, .leg-h).
const shown = (p, id) => p.evaluate(id => {
  UI.view = 'pneus'; renderAll();
  const card = document.querySelector(`#secCal .cal-e[data-event-id="${id}"]`), txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  const legs = card ? [...card.querySelectorAll('.leg')] : [], go = legs.find(l => /ALLER/.test(txt(l.querySelector('.leg-h') || l)));
  const e = CAL.events.find(x => x.id === id), eff = effLegs(e).find(l => l.k === 'go');
  return { card: !!card, alt: txt(card && card.querySelector('.alt')), origin: txt(go && go.querySelector('.leg-o')), head: txt(go && go.querySelector('.leg-h')), go: txt(go),
    msg: (/aller calculé (depuis [^.]+)\./.exec(txt(card && card.querySelector('.alt'))) || [])[1] || null,
    aller: (/^(?:🏠|📍) (depuis .+)$/.exec(txt(go && go.querySelector('.leg-o'))) || [])[1] || null,
    eff: eff ? { fromKind: eff.fromKind, pending: !!eff.originPending, routed: !!eff.routed, min: eff.min, km: eff.km, dep: eff.dep, arr: eff.arr, city: eff.from && eff.from.city } : null,
    planned: (e.legs.find(l => l.k === 'go') || {}).fromKind };
}, id);
(async () => {
  const browser = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(browser, { at: '2026-10-02T18:00:00+02:00', dev }), calls = [];
      // Itinéraire simulé qui aboutit (la session de base refuse toute requête d'itinéraire).
      await s.p.route('https://router.project-osrm.org/**', r => {
        const u = r.request().url(), m = /driving\/([^;]+);([^?]+)/.exec(new URL(u).pathname), a = m[1].split(',').map(Number), b = m[2].split(',').map(Number); calls.push({ from: a, to: b });
        const coords = Array.from({ length: 12 }, (_, i) => [a[0] + (b[0] - a[0]) * i / 11, a[1] + (b[1] - a[1]) * i / 11]);
        return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: ROUTE_KM * 1000, duration: ROUTE_MIN * 60,
          geometry: { coordinates: coords }, legs: [{ annotation: { duration: coords.slice(1).map(() => ROUTE_MIN * 60 / 11) } }] }] }) });
      });
      const work = await s.p.evaluate(() => { const l = S.locs.find(x => x.id === S.work.to); return { name: l.name, lat: l.lat, lon: l.lon }; });
      let before;
      await check(dev + ' · avant le choix : #direct premier de la journée, message et ALLER « depuis le domicile »', async () => {
        before = await shown(s.p, direct.id);
        assert.equal(before.card, true, 'carte du rendez-vous affichée'); assert.equal(before.planned, 'home'); assert.equal(before.eff.fromKind, 'home');
        assert.equal(before.msg, 'depuis le domicile'); assert.equal(before.aller, 'depuis le domicile');
        assert.match(before.alt, /#direct est dans ton agenda, mais aucun rendez-vous avec trajet ne le précède/);
        assert.equal(calls.length, 0, 'aucun itinéraire demandé tant que le plan du relais est suivi');
      });
      await check(dev + ' · départ choisi « ' + work.name + ' » : itinéraire simulé demandé depuis le travail, et abouti', async () => {
        await s.p.evaluate(id => { const e = CAL.events.find(x => x.id === id);
          S.calOrigins = CalendarOrigin.update(S.calOrigins, TripCancel.eventId(e), 'go', { kind: 'saved', placeId: S.work.to }, TripCancel.eventExpiration(e, Date.now()));
          markEdit('calOrigins'); saveSettings(); renderAll(); }, direct.id);   // mêmes écritures que l'éditeur de départ (calendar-origin-editor.js)
        await s.settle(10); await shown(s.p, direct.id); await s.settle(6);
        const d = await shown(s.p, direct.id);
        assert.ok(calls.some(c => Math.abs(c.from[0] - work.lon) < 0.01 && Math.abs(c.from[1] - work.lat) < 0.01 && Math.abs(c.to[0] - direct.lon) < 0.01 && Math.abs(c.to[1] - direct.lat) < 0.01), 'itinéraire demandé du travail vers le rendez-vous : ' + JSON.stringify(calls));
        assert.equal(d.eff.pending, false, 'départ confirmé, itinéraire et météo prêts : ' + JSON.stringify(d.eff)); assert.equal(d.eff.routed, true);
        assert.notEqual(d.eff.fromKind, 'home'); assert.equal(d.eff.city, work.name); assert.equal(d.planned, 'home', 'le plan du relais, lui, part toujours du domicile');
      });
      await check(dev + ' · R2-04 · message #direct et ligne ALLER : « depuis ' + work.name + ' », jamais « depuis le domicile »', async () => {
        const d = await shown(s.p, direct.id);
        assert.equal(d.msg, 'depuis ' + work.name, d.alt); assert.equal(d.aller, 'depuis ' + work.name, d.origin); assert.equal(d.msg, d.aller);
        assert.doesNotMatch(d.alt, /depuis le domicile/); assert.doesNotMatch(d.go, /depuis le domicile/); assert.doesNotMatch(d.alt, /en cours de confirmation/);
        assert.match(d.alt, /Départ choisi dans l’app pour ce rendez-vous/);
        console.log('   ↪ ' + dev + ' · message : aller calculé ' + d.msg + ' · ALLER : ' + d.origin + ' · ' + d.head.slice(0, 70));
      });
      await check(dev + ' · trajet affiché = itinéraire simulé depuis le travail (durée, distance, arrivée inchangée)', async () => {
        const d = await shown(s.p, direct.id), planned = direct.legs.find(l => l.k === 'go');
        assert.ok(d.eff.min >= ROUTE_MIN && d.eff.min <= ROUTE_MIN + 6, 'durée issue de l’itinéraire simulé : ' + d.eff.min + ' min'); assert.equal(Math.round(d.eff.km), ROUTE_KM);
        assert.match(d.head, new RegExp('départ ' + d.eff.dep.slice(11, 16) + ' → ' + d.eff.arr.slice(11, 16) + ' · ' + ROUTE_KM + ' km · ' + d.eff.min + ' min'));
        assert.ok(d.eff.arr <= direct.s, 'arrivée avant le début du rendez-vous : ' + d.eff.arr + ' ≤ ' + direct.s); assert.equal(d.eff.arr, planned.arr, 'heure d’arrivée du plan conservée');
      });
      await check(dev + ' · rechargement : le départ choisi et les deux textes sont conservés', async () => {
        await s.p.evaluate(() => window.TWRC_VAULT && window.TWRC_VAULT.flush && window.TWRC_VAULT.flush());
        await s.p.reload(); await s.settle(14); await shown(s.p, direct.id); await s.settle(8);
        const d = await shown(s.p, direct.id);
        assert.equal(d.msg, 'depuis ' + work.name, d.alt); assert.equal(d.aller, 'depuis ' + work.name, d.origin);
      });
      await check(dev + ' · « Départ automatique » : retour au plan du relais, message et ALLER « depuis le domicile »', async () => {
        await s.p.evaluate(id => { const e = CAL.events.find(x => x.id === id);
          S.calOrigins = CalendarOrigin.update(S.calOrigins, TripCancel.eventId(e), 'go', null, TripCancel.eventExpiration(e, Date.now())); markEdit('calOrigins'); saveSettings(); renderAll(); }, direct.id);
        await s.settle(8);
        const d = await shown(s.p, direct.id);
        assert.equal(d.eff.fromKind, 'home'); assert.equal(d.msg, 'depuis le domicile'); assert.equal(d.aller, 'depuis le domicile');
        assert.equal(d.head, before.head, 'trajet d’origine rétabli à l’identique');
      });
      await s.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await browser.close(); fs.rmSync(SP, { recursive: true, force: true }); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e && e.stack || e)); process.exit(1); });
