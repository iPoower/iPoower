// Repères de confort, données manquantes, précipitations et jours locaux.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/wardrobe.js'), 'utf8') + ';this.advice=sartorialAdvice;this.window=wardrobeWindow;', ctx);
const sample = (T, extra = {}) => ({ T, Tapp: T, pp: 0, P: 0, gust: 10, wind: 5, snow: 0, code: 0, uv: 0, ...extra });
let count = 0;
const test = (name, fn) => { fn(); count++; console.log('✅ ' + name); };
test('0 °C est une température valide et produit des couches chaudes', () => assert.match(ctx.advice([sample(0)]).title, /Grand froid/));
test('le ressenti pilote la tenue, sans soustraire le vent une deuxième fois', () => {
  const a = ctx.advice([sample(12, { Tapp: 5, gust: 40 })]); assert.equal(a.low, 5); assert.match(a.title, /Froid/);
});
test('pluie et rafales fortes : imperméable, semelle gomme, capuche', () => {
  const a = ctx.advice([sample(12, { P: 1.1, pp: 85, gust: 58 })]);
  assert.match(a.pieces[0].item, /imperméable/); assert.match(a.pieces[3].item, /gomme/);
  assert(a.accessories.some(x => /capuche/.test(x))); assert(!a.accessories.some(x => /Parapluie/.test(x)));
});
test('une pluie possible à 50 % suffit à prévoir une protection', () => assert(ctx.advice([sample(18, { pp: 50 })]).wet));
test('désaccord de modèles : AROME 0 mm mais modèle de base 0,5 mm → protection, comme « pluie possible » en Météo', () => {
  assert(ctx.advice([sample(18, { P: 0, Pb: 0.5, pp: 30 })]).wet); assert(!ctx.advice([sample(18, { P: 0, Pb: 0.1, pp: 30 })]).wet);
});
test('neige et pluie verglaçante : semelle crantée', () => {
  for (const code of [73, 66]) assert.match(ctx.advice([sample(2, { code })]).pieces[3].item, /crantée/);
});
test('chaleur : lin, veste facultative et protection solaire', () => {
  const a = ctx.advice([sample(31, { uv: 7 })]); assert.match(a.pieces[0].item, /facultative/); assert.match(a.pieces[1].item, /lin/);
  assert(a.accessories.some(x => /solaire/.test(x)));
});
test('amplitude importante : couches amovibles', () => assert(ctx.advice([sample(8), sample(22)]).notes.some(x => /varie/.test(x))));
test('aucune température : aucun conseil inventé', () => assert.equal(ctx.advice([sample(null, { Tapp: null })]), null));
test('ressenti absent : repli sur l’air et indication partielle', () => {
  const a = ctx.advice([sample(12, { Tapp: null, pp: null, gust: null })]); assert.equal(a.low, 12); assert(a.partial); assert.equal(a.pp, null);
});
test('NaN et Infinity ne deviennent pas une température', () => assert.equal(ctx.advice([sample(NaN), sample(Infinity)]), null));
test('la tenue bureau et la promenade ont des accessoires différents', () => {
  assert(ctx.advice([sample(18)], 'office').accessories.some(x => /Cravate/.test(x)));
  const a = ctx.advice([sample(18)], 'walk'); assert.match(a.pieces[3].item, /gomme/); assert(a.notes.some(x => /marcher/.test(x)));
});
const makeModel = (date, next) => ({ hs: [date, next].flatMap(d => Array.from({ length: 24 }, (_, hh) => ({ ...sample(hh), date: d, hh, t: d + 'T' + String(hh).padStart(2, '0') + ':00' }))) });
test('aujourd’hui commence à l’heure locale et demain couvre 08 h–20 h', () => {
  const m = makeModel('2026-10-03', '2026-10-04'), today = ctx.window(m, 0, '2026-10-03T18:05'), next = ctx.window(m, 1, '2026-10-03T18:05');
  assert.equal(today.samples.length, 3); assert.equal(today.start, '18:00'); assert.equal(next.samples.length, 13); assert.equal(next.date, '2026-10-04');
});
test('demain reste le jour suivant à un changement d’heure ou de mois', () => {
  for (const [d, n] of [['2026-10-24', '2026-10-25'], ['2026-10-31', '2026-11-01']]) assert.equal(ctx.window(makeModel(d, n), 1, d + 'T23:55').date, n);
});
test('une observation actuelle périmée ne remplace pas les prévisions', () => {
  const m = makeModel('2026-10-03', '2026-10-04'); m.cur = { time: '2026-10-03T10:00', T: -10, Tapp: -15 };
  assert.equal(ctx.window(m, 0, '2026-10-03T18:05').samples[0].Tapp, 18);
});
test('créneaux manquants signalés, sans inventer les heures absentes', () => {
  const m = makeModel('2026-10-03', '2026-10-04'); m.hs = m.hs.filter(x => x.hh !== 18);
  assert(ctx.window(m, 0, '2026-10-03T18:05').incomplete);
});
console.log(count + '/' + count + ' scénarios OK');
