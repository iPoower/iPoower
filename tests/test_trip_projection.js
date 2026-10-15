// Régression observée en production : les heures pleines météo étaient prises
// pour des passages, puis triées en faisant reculer les kilomètres et la chauffe.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '../src');
const ctx = {}; vm.createContext(ctx);
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
vm.runInContext(read('engine.js') + read('tirespecs.js') + read('tyrelab.js') + `
  const APP_CONTEXT = { snapshot: { trips: [], activeTrip: null } };
  const CX = {}, PROFILE = () => ({ commuteOk: true }), locHasCoords = () => false;
` + read('app/weather-view.js') + read('app/analysis-view.js') + `
  labInput = car => ({ now: '2026-10-06T06:00', ageMin: 5, car, hours: APP_CONTEXT.snapshot.trips[0].seq[0].hs });
  this.adapt = t => { APP_CONTEXT.snapshot.trips = [t]; return wxTrips({ payload: { utc_offset_seconds: 7200 } })[0]; };
  this.project = (t, car) => tripLab(t, car);
  this.lab = tyreLab;
`, ctx);
const plain = x => JSON.parse(JSON.stringify(x));
const hours = Array.from({ length: 48 }, (_, h) => ({ t: new Date(Date.parse('2026-10-05T18:00Z') + h * 3600e3).toISOString().slice(0, 16), T: 8, Tr: 8, RH: 70, P: 0, Pl: 0, code: 1, gust: 10, rad: 0 }));
const index = time => hours.findIndex(h => h.t === '2026-10-06T' + time);
const car = { name: 'Voiture fictive', tire: { type: 'summer', brand: 'Michelin', model: 'Pilot Sport 4S', size: '215/40 ZR18 89Y XL', press: '2,3' } };
const trip = { key: 'work-go', src: 'work', dep: '2026-10-06T06:30', arr: '2026-10-06T07:10', from: 'Ville A', to: 'Ville B', l: { km: 41 },
  seq: [['06:00', 'Ville A'], ['06:00', 'Ville B'], ['07:00', 'Ville A'], ['07:00', 'Ville B']].map(([at, loc]) => ({ hs: hours, i: index(at), loc })) };
const original = JSON.stringify(trip), adapted = plain(ctx.adapt(trip)), briefing = plain(ctx.project(trip, car));
assert.equal(adapted.points[0].t, trip.dep); assert.equal(adapted.points.at(-1).t, trip.arr);
assert(adapted.points.every((p, i, a) => p.t >= trip.dep && p.t <= trip.arr && (!i || p.t >= a[i - 1].t)));
assert.deepEqual(adapted.points.map(p => p.x), trip.seq.map(q => q.hs[q.i]), 'les échantillons météo existants sont conservés');
const analysis = plain(ctx.lab({ now: '2026-10-06T06:00', ageMin: 5, car, hours, trip: adapted }));
assert.deepEqual(briefing.trip.rows, analysis.trip.rows, 'briefing et Analyse partagent exactement les passages');
assert.deepEqual(analysis.trip.rows.map(p => p.km), [0, 14, 27, 41]);
assert(analysis.trip.rows.every(p => p.range[0] >= 0 && p.range[1] <= 45), '8 °C homogènes : aucune chauffe négative');
assert.equal(JSON.stringify(trip), original, 'aucune mutation des trajets ou de la météo');
const agenda = { ...trip, src: 'calendar', seq: trip.seq.slice(0, 3).map((q, i) => ({ ...q, t: ['2026-10-06T06:30', '2026-10-06T06:50', '2026-10-06T07:10'][i], f: [0, .45, 1][i], km: [0, 18, 41][i] })) };
const relayPoints = plain(ctx.adapt(agenda)).points;
assert.deepEqual(relayPoints.map(p => [p.t, p.f, p.km]), agenda.seq.map(q => [q.t, q.f, q.km]), 'passages datés de l’agenda inchangés');
console.log('✅ Passages monotones 06:30–07:10 · km 0→14→27→41 · briefing = Analyse · météo et agenda conservés');

// Le moteur de preuves doit recevoir les points aval réels, même si une autre
// météo est consultée. Exécute legSeq -> wxTrips -> evInput -> evidenceEngine.
const clock = Date.parse('2026-10-06T04:30:00Z');
const FixedDate = class extends Date { constructor(...a) { super(...(a.length ? a : [clock])); } static now() { return clock; } };
const spatial = { Date: FixedDate, Intl, console }; vm.createContext(spatial);
vm.runInContext(read('engine.js') + read('evidence.js') + read('reliability.js') + `
  const APP_CONTEXT = { snapshot: { trips: [] } }, UI = { loc: 'preview' }, DEMO = { on: false };
  const CX = { m: { tz: 'Europe/Paris', payload: { utc_offset_seconds: 7200 } } };
  const RAW = { preview: { t: Date.now() - 300000 } }, PLACE = { conf: null }, GPS = null;
  const OBS = null, OBS_LAST = null, offlineNow = () => false, lsGet = () => null;
  const locHasCoords = p => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
  const curLoc = () => ({ id: 'preview', lat: 40, lon: 1 });
` + read('app/weather-view.js') + `
  this.pipeline = (models, pts, departure, duration) => {
    const seq = legSeq(models, pts, departure, duration);
    APP_CONTEXT.snapshot.trips = [{ key: 'test-route', dep: departure, arr: addMin(departure, duration), seq }];
    const projected = wxTrips(CX.m)[0].points, input = evInput();
    return { seq, projected, input, evidence: evidenceEngine(input) };
  };
`, spatial);
const sample = { ...hours[index('06:00')], Td: 2, RH: 60, vis: 20000, wind: 25, ice: { level: 0 } };
const model = x => ({ hs: [x], byTime: new Map([[x.t, 0]]) });
const points = [{ lat: 48.7, lon: 2.2, f: 0, name: 'Lieu A' }, { lat: 49.2, lon: 2.5, f: 1, name: 'Lieu B' }];
const dense = { ...sample, t: '2026-10-06T07:00', vis: 100, code: 45 };
const forward = spatial.pipeline([model(sample), model(dense)], points, trip.dep, 40);
assert.equal(forward.input.points.length, 2, 'les deux portions du trajet doivent atteindre les preuves');
assert.deepEqual(plain(forward.projected.map(p => [p.lat, p.lon])), points.map(p => [p.lat, p.lon]));
assert.equal(forward.evidence.worst.lv, 3, 'brouillard à destination conservé');
assert.equal(forward.input.points[0].lat, points[0].lat, 'un aperçu météo ne déplace pas le départ');
const reverse = spatial.pipeline([model({ ...sample, vis: 100 }), model({ ...dense, vis: 20000, code: 1 })], points, trip.dep, 40);
assert.equal(reverse.evidence.worst.lv, 3, 'brouillard au départ conservé aussi');
console.log('✅ Preuves : legSeq → passages → entrée géolocalisée complète, pire portion conservée dans les deux sens');
