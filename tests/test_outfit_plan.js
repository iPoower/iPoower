// Le moteur reçoit un instant et des snapshots fictifs : aucune horloge implicite, aucun réseau.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
class ExplicitDate extends Date { static now() { throw new Error('Horloge implicite interdite'); } }
const ctx = { Date: ExplicitDate, fetch: () => { throw new Error('Réseau interdit'); } }; vm.createContext(ctx);
vm.runInContext(['wardrobe.js', 'outfit-plan.js'].map(f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8')).join('\n') + ';this.plan=outfitDayPlan;', ctx);
const home = { id: 'home', name: 'Maison fictive', lat: 48.85, lon: 2.35 }, work = { id: 'work', name: 'Bureau fictif', lat: 48.9, lon: 2.25 };
const other = { id: 'other', name: 'Lieu du soir fictif', lat: 48.8, lon: 2.45 };
const sample = (t, extra = {}) => ({ t, T: 18, Tapp: 18, pp: 0, P: 0, snow: 0, wind: 8, gust: 12, code: 0, uv: 0, ...extra });
const model = fn => ({ mode: 'live', hs: ['2026-10-03', '2026-10-04'].flatMap(date => Array.from({ length: 24 }, (_, h) => {
  const t = date + 'T' + String(h).padStart(2, '0') + ':00'; return sample(t, fn ? fn(h, date) : {});
})), cur: { time: null } });
const input = (fn, overrides = {}) => {
  const now = '2026-10-03T06:00', nowMs = Date.parse(now + ':00+02:00');
  return { now, nowMs, selected: home, locations: [home, work, other], calendar: null, calendarDone: true, dayOffset: 0, occasion: 'outing',
    sources: [home, work, other].map(place => ({ place, model: model(fn), fetchedAt: nowMs })), ...overrides };
};
const event = (p, s, e, extra = {}) => ({ ...p, t: 'Événement fictif', s: '2026-10-03T' + s, e: '2026-10-03T' + e, ...extra });
const rowAt = (p, hhmm) => p.timeline.find(x => x.s <= p.date + 'T' + hhmm && x.e > p.date + 'T' + hhmm);
const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
let count = 0;
const test = (name, fn) => { fn(); count++; console.log('✅ ' + name); };
test('matin froid → après-midi doux : une seule base, un manteau mutualisé et une adaptation', () => {
  const p = ctx.plan(input(h => ({ T: h < 12 ? 5 : 21, Tapp: h < 12 ? 5 : 21 })));
  assert.equal(p.base.pieces.length, 4); assert.equal(p.status, '1 adaptation nécessaire');
  assert(rowAt(p, '08:00').layerIds.includes('outer')); assert(!rowAt(p, '13:00').layerIds.includes('outer'));
  assert(rowAt(p, '13:00').actions.some(a => a.type === 'remove'));
  assert(!p.extras.some(x => x.id === 'knit')); assert.equal(p.extras.filter(x => x.id === 'outer').length, 1);
  assert.match(p.base.pieces[1].item, /Chemise légère/); assert(p.notes.some(t => /varie/.test(t)));
});
test('temps stable : aucune adaptation ni pièce supplémentaire obligatoire', () => {
  const p = ctx.plan(input()); assert.equal(p.status, 'Tenue valable toute la journée'); assert(p.confirmed);
  assert.equal(p.extras.length, 0); assert(p.timeline.length < 6);
});
test('pluie seulement au retour : emporter le trench dès le départ et l’ajouter au retour', () => {
  const i = input(), commute = { from: 'home', to: 'work', dep: '07:00', ret: '17:00', durMin: 40, days: [6] };
  i.work = commute; i.sources[0].model = model(h => h >= 17 ? { pp: 90, P: 1, code: 61 } : {});
  const p = ctx.plan(i), back = rowAt(p, '17:00');
  assert.equal(back.kind, 'trip'); assert(back.weather.wet); assert(back.layerIds.includes('outer'));
  assert(back.actions.some(a => a.type === 'add' && a.id === 'outer'));
  assert(p.timeline[0].actions.some(a => a.type === 'bring' && a.id === 'outer'));
  assert(!rowAt(p, '10:00').layerIds.includes('outer')); assert.equal(p.status, '1 adaptation nécessaire');
  assert.equal(p.extras.filter(x => /imperméable/.test(x.item)).length, 1); assert(!p.extras.some(x => /Parapluie/.test(x.item)));
});
test('pluie qui cesse puis douceur : retrait explicite de la protection', () => {
  const p = ctx.plan(input(h => h < 12 ? { T: 18, Tapp: 18, pp: 80, P: 1, code: 61 } : { T: 24, Tapp: 24 }));
  assert(rowAt(p, '13:00').actions.some(a => a.type === 'remove' && a.id === 'outer'));
  assert(p.timeline.some(x => /non prévue/.test(x.transition || '')));
});
test('pluie qui cesse mais froid continu : garder le même manteau limite les transitions', () => {
  const p = ctx.plan(input(h => ({ T: 5, Tapp: 5, ...(h < 12 ? { pp: 80, P: 1, code: 61 } : {}) })));
  assert.equal(p.adaptations, 0); assert(rowAt(p, '14:00').layerIds.includes('outer'));
  assert(p.timeline.some(x => /non prévue/.test(x.transition || '')));
});
test('événement du soir plus froid : la couche supplémentaire est emportée avant le départ', () => {
  const i = input(); i.sources[2].model = model(() => ({ T: 10, Tapp: 8 }));
  i.calendar = { events: [event(other, '20:00', '22:00')] };
  const p = ctx.plan(i); assert(p.end >= '2026-10-03T22:00'); assert.equal(rowAt(p, '21:00').placeName, other.name);
  assert(rowAt(p, '21:00').actions.some(a => a.type === 'add') || p.timeline.some(x => x.s === '2026-10-03T20:00' && x.actions.some(a => a.type === 'add')));
  assert(p.extras.some(x => !x.wornInitially && /20:00/.test(x.detail)));
});
test('plusieurs lieux : températures réellement propres à chaque lieu', () => {
  const i = input(); i.sources[1].model = model(() => ({ T: 12, Tapp: 11 })); i.sources[2].model = model(() => ({ T: 24, Tapp: 24 }));
  i.calendar = { events: [event(work, '09:15', '11:45'), event(other, '14:00', '16:00')] };
  const p = ctx.plan(i); assert.equal(rowAt(p, '09:30').weather.low, 11); assert.equal(rowAt(p, '14:30').weather.low, 24);
  assert(p.timeline.some(x => x.s === '2026-10-03T09:15')); assert.equal(p.base.pieces.length, 4);
});
test('météo aux points de route existants : la pluie au point intermédiaire est couverte', () => {
  const i = input(); i.sources[2].model = model(() => ({ pp: 90, P: 2, code: 63 }));
  i.legs = [{ dep: '2026-10-03T10:00', arr: '2026-10-03T11:00', from: home, to: work,
    points: [{ f: 0, place: home }, { f: .5, place: other }, { f: 1, place: work }] }];
  const p = ctx.plan(i); assert(rowAt(p, '10:30').weather.wet); assert(rowAt(p, '10:30').layerIds.includes('outer'));
});
test('fortes rafales même au sec : couche coupe-vent et capuche', () => {
  const p = ctx.plan(input(() => ({ wind: 42, gust: 65 }))); assert(p.timeline.every(x => x.layerIds.includes('outer')));
  assert.match(p.labels.outer, /capuche/); assert(p.base.strongWind);
});
test('neige et pluie verglaçante : protection, semelles crantées et catégories explicites', () => {
  for (const code of [73, 66]) {
    const p = ctx.plan(input(() => ({ T: 0, Tapp: -2, code, snow: code === 73 ? 1 : 0 })));
    assert.match(p.base.pieces[3].item, /crantée/); assert(p.timeline.every(x => x.layerIds.includes('outer')));
    assert.equal(p.timeline[0].weather.hazard, code === 73 ? 'snow' : 'freezing');
  }
});
test('froid → doux → soir froid : plusieurs adaptations, toujours une seule base', () => {
  const p = ctx.plan(input(h => ({ T: h < 12 || h >= 18 ? 5 : 21, Tapp: h < 12 || h >= 18 ? 5 : 21 })));
  assert.equal(p.adaptations, 2); assert.equal(p.status, 'plusieurs adaptations'); assert.equal(p.base.pieces.length, 4);
});
test('seuils voisins : la couche reste stable pour éviter des allers-retours inutiles', () => {
  const p = ctx.plan(input(h => ({ T: h % 2 ? 12.9 : 13.1, Tapp: h % 2 ? 12.9 : 13.1 })));
  assert.equal(p.adaptations, 0); assert.equal(p.minimalPieces, 1);
});
test('données partielles : repli sur l’air sans inventer pluie et rafales', () => {
  const p = ctx.plan(input(() => ({ Tapp: null, pp: null, P: null, gust: null, snow: null, code: null })));
  assert(p.base); assert(p.quality.partial); assert(!p.confirmed); assert.equal(p.timeline[0].weather.gust, null);
  assert(!p.timeline[0].weather.precipKnown); assert.equal(p.timeline[0].weather.low, 18);
});
test('heure manquante : garder un créneau inconnu dans la timeline', () => {
  const i = input(); i.sources[0].model.hs = i.sources[0].model.hs.filter(x => x.t !== '2026-10-03T12:00');
  const p = ctx.plan(i), gap = rowAt(p, '12:30'); assert(gap.weather.missing); assert.match(gap.layerText, /à confirmer/);
  assert(!p.confirmed); assert(!gap.actions.some(a => a.type === 'add' || a.type === 'remove'));
});
test('point de route sans météo : couverture partielle conservée après regroupement', () => {
  const i = input(); i.sources = i.sources.filter(x => x.place.id !== 'other');
  i.legs = [{ dep: '2026-10-03T10:00', arr: '2026-10-03T12:00', from: home, to: work,
    points: [{ f: 0, place: home }, { f: .5, place: other }, { f: 1, place: work }] }];
  const p = ctx.plan(i); assert(rowAt(p, '11:30').weather.missing); assert(!p.confirmed);
});
test('ancien cache : aucune observation périmée injectée dans la prévision', () => {
  const i = input(); i.sources[0].fetchedAt -= 120 * 60000; i.sources[0].model.cur = { time: i.now, T: -40, Tapp: -45 };
  const p = ctx.plan(i); assert(p.quality.stale); assert(!p.confirmed); assert.equal(p.timeline[0].weather.low, 18);
});
test('courant périmé malgré un téléchargement récent : signalement explicite', () => {
  const i = input(); i.sources[0].model.cur = { time: '2026-10-03T02:00', T: -40, Tapp: -45 };
  assert(ctx.plan(i).quality.stale);
});
test('événement sans lieu : pas de météo empruntée au domicile', () => {
  const i = input(); i.calendar = { events: [event(null, '12:00', '13:00', { t: 'Événement sans lieu', loc: '', lat: null, lon: null })] };
  const p = ctx.plan(i), unknown = rowAt(p, '12:30'); assert.equal(unknown.placeName, 'Lieu non précisé');
  assert.equal(unknown.weather.low, null); assert(p.quality.locationMissing); assert(!p.confirmed);
});
test('lieu non résolu : ne pas géocoder ni choisir une ville voisine', () => {
  const i = input(); i.calendar = { events: [event(null, '12:00', '13:00', { loc: 'Adresse à préciser', lat: null, lon: null })] };
  assert.equal(rowAt(ctx.plan(i), '12:30').weather.low, null);
});
test('aucun agenda disponible : timeline météo du lieu connu et information visible', () => {
  const p = ctx.plan(input()); assert(p.notes.some(x => /Aucun agenda disponible/.test(x)));
  assert(p.timeline.every(x => x.placeName === home.name));
});
test('agenda vide et déplacements désactivés : aucun voyage inventé', () => {
  const p = ctx.plan(input(null, { calendar: { events: [] }, work: { from: 'home', to: 'work', dep: '07:00', ret: '17:00', days: [] } }));
  assert(p.timeline.every(x => x.kind === 'place')); assert(p.notes.some(x => /Aucun événement/.test(x)));
});
test('événement terminé la veille : ne pas inventer une présence nocturne dans cette ville', () => {
  const p = ctx.plan(input(null, { calendar: { events: [event(other, '12:00', '13:00', { s: '2026-10-02T12:00', e: '2026-10-02T13:00' })] } }));
  assert(p.timeline.every(x => x.placeName === home.name));
});
test('agenda #pasdetrajet : aucune fausse visite à cette adresse', () => {
  const p = ctx.plan(input(null, { calendar: { events: [event(other, '12:00', '13:00', { mode: 'pasdetrajet' })] } }));
  assert(p.timeline.every(x => x.placeName === home.name));
});
test('journée entière et fin absente : hypothèses horaires explicites', () => {
  const p = ctx.plan(input(null, { calendar: { events: [event(work, '00:00', '23:00', { allDay: true })] } }));
  assert(rowAt(p, '10:00').assumed); assert(p.notes.some(x => /09:00–18:00/.test(x)));
});
test('événement traversant minuit : journée suivante couverte sans retour inventé', () => {
  const i = input(null, { dayOffset: 1, calendar: { events: [event(other, '23:00', '23:59', { e: '2026-10-04T01:00' })] } });
  const p = ctx.plan(i); assert.equal(p.start, '2026-10-04T00:00'); assert.equal(rowAt(p, '00:30').placeName, other.name);
});
test('demain inclut un départ habituel avant 08:00', () => {
  const p = ctx.plan(input(null, { dayOffset: 1, work: { from: 'home', to: 'work', dep: '06:30', ret: '17:00', durMin: 30, days: [0] } }));
  assert.equal(p.date, '2026-10-04'); assert.equal(p.start, '2026-10-04T06:30');
});
test('consultation le soir : conserver le plan complet et marquer le matin passé', () => {
  const now = '2026-10-03T18:00', i = input(h => ({ T: h < 12 ? 5 : 21, Tapp: h < 12 ? 5 : 21 }), { now, nowMs: Date.parse(now + ':00+02:00') });
  i.sources.forEach(s => { s.fetchedAt = i.nowMs; });
  const p = ctx.plan(i); assert.equal(p.start, '2026-10-03T08:00'); assert(rowAt(p, '10:00').past);
  assert.equal(p.adaptations, 1); assert(p.extras.some(x => x.id === 'outer'));
});
test('horaires invalides : ignorer le trajet mal formé sans planter le plan', () => {
  const p = ctx.plan(input(null, { work: { from: 'home', to: 'work', dep: '99:00', ret: '17:00', days: [6] } }));
  assert(p.base); assert(p.timeline.every(x => x.kind !== 'trip'));
});
test('agenda en cours de lecture : ne pas prétendre que toute la journée est confirmée', () => {
  assert(!ctx.plan(input(null, { calendarDone: false })).confirmed);
});
test('fuseaux différents : lire la météo à la même heure physique', () => {
  const i = input(); i.utcOffset = 7200; i.sources[0].utcOffset = 3600;
  i.sources[0].model = model(h => ({ T: h, Tapp: h }));
  assert.equal(ctx.plan(i).timeline[0].weather.low, 5);
});
test('aucune température : aucune tenue ni changement prétendument calculé', () => {
  const p = ctx.plan(input(() => ({ T: null, Tapp: null }))); assert.equal(p.base, null); assert.equal(p.extras.length, 0);
  assert(p.timeline.every(x => x.actions.every(a => a.type === 'confirm'))); assert(!p.confirmed);
});
test('température zéro valide et valeurs non finies ignorées', () => {
  assert(ctx.plan(input(() => ({ T: 0, Tapp: 0 }))).base);
  assert.equal(ctx.plan(input(() => ({ T: NaN, Tapp: Infinity }))).base, null);
});
test('moteur reproductible et snapshots inchangés, sans réseau ni Date.now', () => {
  const i = deepFreeze(input(h => ({ T: h < 12 ? 5 : 22, Tapp: h < 12 ? 5 : 22 }))), before = JSON.stringify(i);
  const first = JSON.stringify(ctx.plan(i)), second = JSON.stringify(ctx.plan(i)); assert.equal(first, second); assert.equal(JSON.stringify(i), before);
});
console.log(count + '/' + count + ' scénarios OK');
