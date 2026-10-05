'use strict';
const assert = require('node:assert/strict'), Road = require('../src/road-intelligence'), F = require('./lib/road-fixtures');
let n = 0; const check = (label, fn) => { fn(); n++; console.log('✅ ' + label); };
const route = Road.fromOSRM(F.routeJSON), e = extra => Road.normalize(F.event(extra), 'datex');
const filter = (events, fix = F.fix, r = route) => Road.filter(r, fix, events, F.NOW);
check('modèle complet, champs inconnus null, provenance source et unités préservées', () => {
  const a = e(); for (const key of ['delaySeconds', 'lengthMeters', 'currentSpeed', 'freeFlowSpeed', 'congestion', 'laneInfo', 'distanceAhead', 'etaToEvent', 'relevanceScore']) assert.equal(a[key], null);
  assert.equal(a.id, 'datex:fixture-accident'); assert.equal(a.lat, F.coordinates[7][1]); assert.equal(a.officialSource, true); assert(a.start && a.end);
  for (const type of ['accident', 'works', 'closure', 'obstacle', 'stopped_vehicle', 'restriction', 'weather', 'congestion', 'jam', 'slowdown']) assert.equal(e({ type }).type, type);
});
check('géométries invalides, identifiant absent, fournisseur et coordonnées invalides refusés', () => {
  for (const x of [{ sourceId: '' }, { geometry: { type: 'Point', coordinates: [[2, 48]] } }, { geometry: { type: 'Polygon', coordinates: [] } }, { geometry: null, latitude: 200, longitude: 2 }]) assert.equal(e(x), null);
  assert.equal(Road.normalize(F.event(), 'secret/key'), null); assert.equal(e({ delaySeconds: -1 }).delaySeconds, null);
});
check('axe OSRM indexé, distance et rencontre OSRM ; pas de durée trafic inventée', () => {
  const a = filter([e()]).events[0]; assert(a.distanceAhead > 650 && a.distanceAhead < 680); assert.equal(Math.round(a.etaToEvent), 360); assert.equal(a.delaySeconds, null); assert.equal(a.matchConfidence, 'high');
  const j = JSON.parse(JSON.stringify(F.routeJSON)); delete j.routes[0].legs[0].annotation;
  assert.equal(filter([e()], F.fix, Road.fromOSRM(j)).events[0].etaToEvent, null);
});
check('événement dépassé retiré ; avance GPS et dérive contrôlées', () => {
  assert.equal(filter([e()], { ...F.fix, lat: F.coordinates[8][1] }).events.length, 0);
  for (const fix of [{ ...F.fix, acc: 61 }, { ...F.fix, ts: F.NOW - 120001 }, { ...F.fix, ts: F.NOW + 10001 }]) assert.equal(filter([e()], fix).reason, 'gps_uncertain');
  assert.equal(filter([e()], { ...F.fix, lon: 2.4 }).reason, 'off_route');
});
check('sens opposé, route parallèle, absence d’axe ou de direction : aucun signalement', () => {
  for (const extra of [{ direction: 'southBound' }, { roadNumber: 'D2' }, { roadNumber: null }, { direction: 'unknown' }, { geometry: { type: 'Point', coordinates: [2.3511, F.coordinates[7][1]] } }]) assert.equal(filter([e(extra)]).events.length, 0);
  assert.equal(filter([e({ direction: 'bothWays' })]).events.length, 1);
  const j = JSON.parse(JSON.stringify(F.routeJSON)); j.routes[0].legs[0].steps = [];
  assert.equal(filter([e()], F.fix, Road.fromOSRM(j)).events.length, 0);
});
check('validité future, terminée, suspendue et horodatage impossible refusés', () => {
  for (const extra of [{ status: 'ended' }, { status: 'suspended' }, { endTime: new Date(F.NOW).toISOString() }, { startTime: new Date(F.NOW + 1).toISOString() }, { updatedAt: null }, { updatedAt: new Date(F.NOW + 60001).toISOString() }]) assert.equal(filter([e(extra)]).events.length, 0);
});
check('situation longue en cours à distance zéro ; section quittée par l’itinéraire masquée', () => {
  const long = e({ geometry: { type: 'LineString', coordinates: [F.coordinates[2], F.coordinates[8]] } });
  const a = filter([long], { ...F.fix, lat: F.coordinates[5][1] }).events[0]; assert.equal(a.distanceAhead, 0); assert.equal(a.etaToEvent, 0);
  const j = JSON.parse(JSON.stringify(F.routeJSON)); j.routes[0].legs[0].steps = [
    { ref: 'A1', geometry: { coordinates: [F.coordinates[0]] } }, { ref: 'D2', geometry: { coordinates: [F.coordinates[4]] } }, { ref: 'A1', geometry: { coordinates: [F.coordinates[7]] } }];
  assert.equal(filter([long], F.fix, Road.fromOSRM(j)).rejected[0].reason, 'non_used_section');
});
check('boucle ou croisement ambigu : la projection ne crée pas de fausse alerte', () => {
  const j = JSON.parse(JSON.stringify(F.routeJSON)); j.routes[0].geometry.coordinates = [...F.coordinates, ...F.coordinates.slice().reverse(), ...F.coordinates];
  j.routes[0].legs[0].annotation.duration = Array(32).fill(60);
  assert.equal(filter([e()], F.fix, Road.fromOSRM(j)).events.length, 0);
});
check('fusion multi-source conservatrice, pas de doublons ni fusion des vitesses et accidents', () => {
  const a = filter([e(), Road.normalize(F.event({ sourceId: 'b' }), 'other')]).events; assert.equal(a.length, 1); assert.equal(a[0].provenance.length, 2);
  assert.equal(filter([e(), Road.normalize(F.event({ sourceId: 'b', type: 'congestion', currentSpeed: 12 }), 'other')]).events.length, 2);
  assert.equal(filter([e(), e({ sourceId: 'another' })]).events.length, 2);
});
check('fraîcheur du flux : publication et vérification, aucun faux live par tampon récent', () => {
  assert.equal(Road.feed(F.feed(), 'datex', F.NOW).ageMs, 30000);
  assert.equal(Road.feed(F.feed('datex', { publicationTime: new Date(F.NOW - 20 * 60000).toISOString() }), 'datex', F.NOW).ageMs, 20 * 60000);
  for (const extra of [{ complete: false }, { provider: 'wrong' }, { events: [F.event(), F.event()] }, { checkedAt: new Date(F.NOW + 60001).toISOString() }, { coverage: '' }, { flows: {} }]) assert.throws(() => Road.feed(F.feed('datex', extra), 'datex', F.NOW));
});
check('alerte sévère : événement récent, cool-down, doublon, source fraîche et trajet', () => {
  const events = filter([e()]).events, input = { events, seen: new Set(), now: F.NOW, lastAlert: -Infinity, fresh: true };
  assert(Road.alertGate(input)); assert.equal(Road.alertGate({ ...input, fresh: false }), null); assert.equal(Road.alertGate({ ...input, lastAlert: F.NOW - 60000 }), null);
  assert.equal(Road.alertGate({ ...input, seen: new Set(['datex:fixture-accident']) }), null);
  assert.equal(filter([e({ type: 'congestion', severity: 3 })]).events[0].alertEligible, false);
  assert.equal(filter([e({ updatedAt: new Date(F.NOW - 3600001).toISOString() })]).events[0].alertEligible, false);
});
check('index spatial borné, filtre sans parcours global quadratique et cadence adaptative', () => {
  const events = Array.from({ length: 2500 }, (_, i) => e({ sourceId: 'fixture-' + i })), t = performance.now();
  assert.equal(filter(events).events.length, 2500); assert(performance.now() - t < 2000);
  assert.equal(Road.cadence('idle'), Infinity); assert.equal(Road.cadence('advice'), 600000); assert.equal(Road.cadence('active', true), 30000);
  assert.equal(Road.fromOSRM({ routes: [{ geometry: { coordinates: [[0, 0], [170, 80]] } }] }), null);
});
console.log(`${n}/${n} scénarios OK`);
