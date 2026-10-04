#!/usr/bin/env node
// Relais réel, réseau entièrement fictif : fraîcheur distincte, cache privé, invalidations et erreurs.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-relay-freshness-'));
const { APP_KEY_TEST, RC_KEY_TEST } = require('./lib/test-keys'), { seal, tryUnseal } = require('../tools/keys');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/relay-config.fake.json'), 'utf8'));
['relay.js', 'engine.js', 'demo.js'].forEach(f => fs.copyFileSync(path.join(ROOT, 'src', f), path.join(TMP, f)));
fs.copyFileSync(path.join(ROOT, 'tests/relay-harness/mock_tt.js'), path.join(TMP, 'mock_tt.js'));
fs.writeFileSync(path.join(TMP, 'relay-config.sealed.json'), JSON.stringify(seal(cfg, RC_KEY_TEST)));
fs.writeFileSync(path.join(TMP, 'mock.js'), `
require('./mock_tt');
const baseFetch = global.fetch, counts = { geo: 0, route: 0, reverse: 0, metar: 0, ics: 0 };
global.fetch = async (u, o) => {
  u = String(u);
  if (u.includes('calendar.google')) { counts.ics++; return {ok: true, text: async () => require('fs').readFileSync(__dirname + '/input.ics', 'utf8')}; }
  if (u.includes('aviationweather')) {
    counts.metar++;
    if (process.env.FAIL_METAR === '1') throw new Error('METAR fictif indisponible');
    return { ok: true, json: async () => [{ icaoId: 'LFAQ', rawOb: 'LFAQ 050600Z 04005KT CAVOK 12/08 Q1018', obsTime: Date.now() / 1000 - 1800 }] };
  }
  if (u.includes('project-osrm')) { counts.route++; if (process.env.FAIL_ROUTE === '1') return {ok: false, status: 503}; }
  if (u.includes('geocodage/reverse')) counts.reverse++;
  else if (u.includes('geocodage/search') || u.includes('geocoding-api')) counts.geo++;
  return baseFetch(u, o);
};
process.on('exit', () => require('fs').writeFileSync(__dirname + '/counts.json', JSON.stringify(counts)));
`);
let fail = 0, checks = 0;
const check = (name, ok) => { checks++; if (!ok) fail++; console.log((ok ? '✅ ' : '❌ ') + name); };
const ev = (id, loc, start = '1200', end = '1230', mode = '') => ['BEGIN:VEVENT', 'UID:' + id,
  'DTSTART;TZID=Europe/Paris:20261005T' + start + '00', 'DTEND;TZID=Europe/Paris:20261005T' + end + '00',
  'SUMMARY:PRIVE_CACHE_TITRE_' + id, 'LOCATION:' + loc, ...(mode ? ['DESCRIPTION:' + mode] : []), 'END:VEVENT'].join('\r\n');
const ics = (...events) => ['BEGIN:VCALENDAR', ...events, 'END:VCALENDAR'].join('\r\n');
const baseICS = ics(ev('b', 'Lille'), ev('c', 'Amiens', '1400', '1430'));
const read = f => JSON.parse(fs.readFileSync(path.join(TMP, f), 'utf8'));
function run(minute, calendar = baseICS, options = {}) {
  fs.writeFileSync(path.join(TMP, 'input.ics'), calendar);
  const instant = new Date(Date.parse('2026-10-05T09:00:00+02:00') + minute * 60e3).toISOString();
  const r = spawnSync(process.execPath, ['-r', './mock.js', 'relay.js'], { cwd: TMP, encoding: 'utf8', timeout: 30000,
    env: { PATH: process.env.PATH, FAKE: instant, SCN: 'doux', GCAL_ICS: 'https://calendar.google.com/test.ics',
      APP_KEY: APP_KEY_TEST, RC_KEY: RC_KEY_TEST, ...options } });
  if (r.error || r.status !== 0) throw new Error('Relais fictif en échec, code ' + r.status + (r.error ? ' (' + r.error.code + ')' : ''));
  const sealed = read('calendar.sealed.json');
  return { obs: read('obs.json'), counts: read('counts.json'), cal: tryUnseal(sealed, APP_KEY_TEST), sealed,
    logs: (r.stdout || '') + (r.stderr || ''), instant };
}
try {
  const a = run(0), b = run(3);
  check('38r.1 · premier passage : géocodages/routes, cache dans agenda chiffré', a.counts.geo > 0 && a.counts.route > 0 && a.cal.relayCache.routes.length > 0 && !tryUnseal(a.sealed, RC_KEY_TEST));
  check('38r.2 · passage suivant : ICS/METAR relus, aucun OSRM/géocodage/reverse répété', b.counts.ics === 1 && b.counts.metar === 1 && b.counts.geo === 0 && b.counts.route === 0 && b.counts.reverse === 0);
  check('38r.3 · réussite METAR : collecte et fin distinctes de la vraie mesure', b.obs.observationsFetchedAt === b.instant && b.obs.completedAt === b.instant && b.obs.stations.LFAQ.last.t !== b.instant);
  const changedTime = run(6, ics(ev('b', 'Lille'), ev('c', 'Amiens', '1500', '1530')));
  const oldC = b.cal.events.find(e => e.t.endsWith('_c')), newC = changedTime.cal.events.find(e => e.t.endsWith('_c'));
  check('38r.4 · horaire modifié : route géométrique réutilisée, départ recalculé', changedTime.counts.route === 0 && oldC.legs[0].dep !== newC.legs[0].dep && newC.s === '2026-10-05T15:00');
  const changedPlace = run(9, ics(ev('b', 'Paris'), ev('c', 'Amiens', '1400', '1430')));
  const newB = changedPlace.cal.events.find(e => e.t.endsWith('_b'));
  check('38r.5 · lieu modifié : nouveau géocodage et nouvelles extrémités de route', changedPlace.counts.geo > 0 && changedPlace.counts.route > 0 && newB.lat !== a.cal.events.find(e => e.t.endsWith('_b')).lat);
  const changedMode = run(12, ics(ev('b', 'Lille'), ev('c', 'Amiens', '1400', '1430', '#maison')));
  check('38r.6 · mode #maison : chaîne reconstruite, jamais ancienne jambe directe', changedMode.cal.events.find(e => e.t.endsWith('_b')).legs.some(l => l.k === 'ret') && changedMode.cal.events.find(e => e.t.endsWith('_c')).legs.find(l => l.k === 'go').fromKind === 'home');
  const movedCfg = { ...cfg, origins: [{ ...cfg.origins[0], lat: cfg.origins[0].lat + 0.02 }], home: { ...cfg.home, lat: cfg.home.lat + 0.02 } };
  fs.writeFileSync(path.join(TMP, 'relay-config.sealed.json'), JSON.stringify(seal(movedCfg, RC_KEY_TEST)));
  const movedHome = run(15);
  check('38r.7 · origine modifiée : pas de route réutilisée depuis ancien domicile', movedHome.counts.route > 0 && movedHome.cal.events[0].legs[0].from.lat !== a.cal.events[0].legs[0].from.lat);
  const failedMetar = run(18, baseICS, { FAIL_METAR: '1' });
  check('38r.8 · panne METAR : fin du run fraîche, collecte/mesure antérieures conservées', failedMetar.obs.completedAt === failedMetar.instant && failedMetar.obs.observationsFetchedAt === movedHome.obs.observationsFetchedAt && failedMetar.obs.stations.LFAQ.last.t === movedHome.obs.stations.LFAQ.last.t && !!failedMetar.obs.metarError);
  const expired = run(24 * 60 + 20, baseICS.replace(/20261005/g, '20261006'));
  check('38r.9 · TTL expiré : géocodage et OSRM réellement relancés', expired.counts.geo > 0 && expired.counts.route > 0);
  fs.rmSync(path.join(TMP, 'calendar.sealed.json'));
  const failRoute = run(23, baseICS, { FAIL_ROUTE: '1' }), retryRoute = run(26);
  check('38r.10 · panne route : estimation jamais gardée dans le cache inter-runs', failRoute.cal.relayCache.routes.length === 0 && failRoute.cal.events.some(e => e.legs.some(l => !l.routed)) && retryRoute.counts.route > 0 && retryRoute.cal.events.every(e => e.legs.every(l => l.routed)));
  const unknownICS = ics(ev('unknown', 'Ville introuvable fictive'));
  const unknown = run(29, unknownICS), unknownAgain = run(32, unknownICS), unknownExpired = run(35, unknownICS);
  check('38r.11 · géocodage négatif : évite répétition, expire après cinq minutes', unknown.counts.geo > 0 && unknownAgain.counts.geo === 0 && unknownExpired.counts.geo > 0 && unknown.cal.events[0].lat === null);
  check('38r.12 · confidentialité : cache/titres/lieux/clés absents du public et logs', [a, b, changedPlace, failedMetar].every(x => {
    const pub = JSON.stringify(x.obs) + x.logs + JSON.stringify(x.sealed);
    return !['PRIVE_CACHE_TITRE_', 'relayCache', '"q":"lille"', '"q":"amiens"', '"from":', '"to":', '"g":', APP_KEY_TEST, RC_KEY_TEST].some(s => pub.includes(s));
  }));
  check('38r.13 · bornes : cache positif non prolongé à chaque lecture', b.cal.relayCache.routes.every(x => x.at === Date.parse(a.instant)) && b.cal.relayCache.geo.length <= 128 && b.cal.relayCache.routes.length <= 256);
  const now = Date.parse(a.instant);
  const workflowDue = (name, updated, manual = false) => {
    const source = fs.readFileSync(path.join(ROOT, '.github/workflows', name), 'utf8');
    const block = source.split("          node - <<'NODE'\n")[1].split('\n          NODE')[0];
    let output = '';
    const fakeFS = { readFileSync: () => JSON.stringify({ updated }), appendFileSync: (_, s) => { output += s; } };
    const fixedDate = class extends Date { static now() { return now; } };
    new Function('require', 'process', 'Date', 'console', block)(() => fakeFS, { env: { MANUAL: String(manual), GITHUB_OUTPUT: 'unused' } }, fixedDate, { log: () => {} });
    return output === 'due=1\n';
  };
  const workflows = ['race-control.yml', 'race-control-watchdog.yml'];
  check('38r.14 · gates : relance à deux minutes, fraîcheur valide respectée', workflows.every(n => !workflowDue(n, new Date(now - 60000).toISOString()) && workflowDue(n, new Date(now - 120000).toISOString())));
  check('38r.15 · horodatage futur/invalide : ne bloque jamais le relais', workflows.every(n => workflowDue(n, new Date(now + 180000).toISOString()) && workflowDue(n, 'invalide')) && workflowDue('race-control.yml', a.instant, true));
} finally { fs.rmSync(TMP, { recursive: true, force: true }); }
console.log(checks - fail + '/' + checks + ' contrôles relais fraîcheur');
process.exitCode = fail ? 1 : 0;
