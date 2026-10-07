'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const sourcePath = require('node:path').resolve(__dirname, '../src/debrief.js');
function runTests(source = fs.readFileSync(sourcePath, 'utf8'), { quiet = false } = {}) {
  const ctx = { Date, Math, JSON, Set }; vm.createContext(ctx); vm.runInContext(source + ';this.api=Debrief;', ctx);
  const D = ctx.api, json = v => JSON.parse(JSON.stringify(v)), at = Date.parse('2026-10-07T08:00:00+02:00');
  let n = 0; const check = (name, fn) => { fn(); n++; if (!quiet) console.log('✅ ' + name); };
  const departure = (extra = {}) => ({ key: 'aller', at: at - 30 * 60e3, name: 'Travail test', from: 'Maison test', to: 'Travail test',
    carId: 'carA', car: 'Test A', prediction: { known: true, conditions: [], fetchedAt: at - 35 * 60e3, verdict: 'GO',
      thermal: { s: 2, range: [20, 30], conf: 'moyenne' } }, ...extra });
  const arrived = (conditions = [], start = departure()) => D.reply(D.close(D.begin(null, start, at), { key: 'aller', how: 'confirmé' }, at), 'aller', { conditions }, at + 1000);
  check('prévision et voiture figées au départ, aucun alias vers la saisie', () => {
    const input = departure(), state = D.begin(null, input, at); input.prediction.conditions.push('fog'); input.car = 'autre';
    assert.deepEqual(json(state.active.prediction.conditions), []); assert.equal(state.active.car, 'Test A');
    const twice = D.begin(state, { ...departure(), car: 'autre' }, at); assert.equal(twice.active.car, 'Test A');
  });
  check('arrivée manuelle : un trajet terminé et le départ retiré', () => {
    const state = D.close(D.begin(null, departure(), at), { key: 'aller', how: 'confirmé' }, at);
    assert.equal(state.entries.length, 1); assert.equal(state.active, null); assert.equal(state.entries[0].start.at, at - 30 * 60e3);
  });
  check('deux appels de clôture : une seule entrée et première arrivée conservée', () => {
    const state = D.close(arrived(['fog']), { key: 'aller', how: 'auto' }, at + 5000);
    assert.equal(state.entries.length, 1); assert.equal(state.entries[0].at, at); assert.deepEqual(json(state.entries[0].feedback.conditions), ['fog']);
  });
  check('GPS et confirmation manuelle donnent le même journal', () => {
    for (const how of ['auto', 'confirmé']) { const state = D.close(D.begin(null, departure(), at), { key: 'aller', how }, at); assert.equal(state.entries[0].how, how); }
  });
  check('annulation, expiration, coupe-circuit et mode inconnu ne sont pas des arrivées', () => {
    for (const how of ['annulé', 'expiré', 'coupe-circuit', 'cancel', null]) assert.equal(D.close(null, { key: 'aller', how }, at).entries.length, 0);
  });
  check('arrivée après coup : aucune prévision et aucun départ inventés', () => {
    const state = D.reply(D.close(null, { key: 'aller', how: 'confirmé' }, at), 'aller', { conditions: [] }, at);
    assert.equal(state.entries[0].start, null); assert.equal(D.compare(state.entries[0]).kind, 'unknown'); assert.equal(D.stats(state, at).comparable, 0);
  });
  check('brume rencontrée après route normale : phénomène non annoncé, jamais concordant', () => {
    const cmp = D.compare(arrived(['fog']).entries[0]); assert.equal(cmp.kind, 'missed'); assert.deepEqual(json(cmp.missed), ['fog']);
  });
  check('neige, verglas et cumul de dangers gardent leur identité', () => {
    for (const observed of [['snow'], ['ice'], ['fog', 'ice', 'snow']]) {
      const cmp = D.compare(arrived(observed).entries[0]); assert.equal(cmp.kind, 'missed'); assert.equal(cmp.missed.length, observed.length);
    }
  });
  check('phénomène annoncé puis non rencontré : alerte non rencontrée, pas faux négatif', () => {
    const s = departure(); s.prediction.conditions = ['fog']; const cmp = D.compare(arrived([], s).entries[0]);
    assert.equal(cmp.kind, 'unused'); assert.deepEqual(json(cmp.unused), ['fog']);
  });
  check('écart mixte : annoncé verglas, rencontré brume', () => {
    const s = departure(); s.prediction.conditions = ['ice']; assert.equal(D.compare(arrived(['fog'], s).entries[0]).kind, 'mixed');
  });
  check('pluie et humidité restent comparables sans masquer un brouillard', () => {
    const s = departure(); s.prediction.conditions = ['rain'];
    assert.equal(D.compare(arrived(['wet'], s).entries[0]).kind, 'match'); assert.equal(D.compare(arrived(['wet', 'fog'], s).entries[0]).kind, 'missed');
  });
  check('route normale explicitement renseignée : concordant', () => assert.equal(D.compare(arrived([]).entries[0]).kind, 'match'));
  check('sans réponse, « Plus tard » ne compte jamais comme retour concordant', () => {
    const state = D.defer(D.close(D.begin(null, departure(), at), { key: 'aller', how: 'auto' }, at), 'aller', at);
    assert.equal(state.entries[0].deferred, true); assert.equal(D.stats(state, at).answered, 0); assert.equal(D.compare(state.entries[0]).kind, 'pending');
    assert.equal(D.reply(state, 'aller', { conditions: [] }, at).entries[0].deferred, false);
  });
  check('une réponse modifiée remplace la précédente sans gonfler l’échantillon', () => {
    const state = D.reply(arrived(['fog']), 'aller', { conditions: [], grip: 'normal' }, at + 2000), stats = D.stats(state, at + 2000);
    assert.equal(stats.answered, 1); assert.equal(stats.counts.match, 1); assert.equal(stats.counts.missed, 0);
  });
  check('météo absente, âge inconnu ou > 90 min : prévision non comparable', () => {
    for (const override of [{ known: false }, { fetchedAt: null }, { fetchedAt: at - 121 * 60e3 }]) {
      const s = departure(); Object.assign(s.prediction, override); const state = arrived([], s);
      assert.equal(D.compare(state.entries[0]).kind, 'unknown'); assert.equal(D.stats(state, at + 1000).comparable, 0);
    }
  });
  check('la limite de fraîcheur est exacte, hors ligne seul ne dégrade pas une prévision fraîche', () => {
    const s = departure(); s.prediction.fetchedAt = s.at - 90 * 60e3; s.prediction.offline = true;
    assert.equal(D.compare(arrived([], s).entries[0]).kind, 'match');
  });
  check('cinq états thermiques dont signal chaud 3 et très chaud 4, confiance limitée à faible/moyenne', () => {
    for (const s of [0, 1, 2, 3, 4]) for (const conf of ['faible', 'moyenne']) assert.equal(D.thermal({ s, range: [10, 30], conf }).s, s);
    for (const conf of ['élevée', 0.92, null]) assert.equal(D.thermal({ s: 2, range: [10, 30], conf }), null);
    assert.equal(D.thermal({ s: 5, range: [10, 30], conf: 'moyenne' }), null);
  });
  check('intervalle thermique invalide et fausse précision rejetés', () => {
    for (const range of [[30, 10], [NaN, 20], [10], [-200, 300]]) assert.equal(D.thermal({ s: 2, range, conf: 'faible' }), null);
  });
  check('confidentialité : aucun GPS, tracé, payload ou champ libre ne traverse le journal', () => {
    const extra = { lat: 48.123456, lon: 2.654321, gps: { trace: 'secret' }, payload: 'secret' }, input = { ...departure(), ...extra };
    input.prediction = { ...input.prediction, ...extra }; input.prediction.thermal = { s: 4, range: [60, 80], conf: 'faible', ...extra };
    const state = D.reply(D.close(D.begin(null, input, at), { key: 'aller', how: 'auto', ...extra, end: { ...extra, thermal: input.prediction.thermal } }, at), 'aller', { conditions: ['fog'], ...extra }, at);
    assert(!/48\.123456|2\.654321|secret|"lat"|"lon"|"payload"|"gps"/.test(JSON.stringify(state)));
  });
  check('rétention : 90 jours, 60 trajets maximum, derniers trajets conservés', () => {
    let state = null;
    for (let i = 0; i < 65; i++) state = D.close(state, { key: 'trip' + i, how: 'auto' }, at + i * 1000);
    assert.equal(state.entries.length, 60); assert.equal(state.entries[0].key, 'trip64'); assert.equal(state.entries.at(-1).key, 'trip5');
    assert.equal(D.clean(state, at + 64000 + D.RETENTION).entries.length, 0);
  });
  check('annuler une arrivée retire aussi son débrief et ses statistiques', () => {
    const state = D.undo(arrived(['fog']), 'aller', at + 1000); assert.equal(state.entries.length, 0); assert.equal(D.stats(state, at + 1000).answered, 0);
  });
  check('rechargement : mêmes prévisions, retours et intervalles sans mutation', () => {
    const state = arrived(['fog']), loaded = D.clean(json(state), at + 3600e3); assert.deepEqual(json(loaded), json(state));
  });
  check('document corrompu, futur, mauvais trajet ou réponse inconnue ne deviennent pas une observation', () => {
    assert.deepEqual(json(D.clean('corrompu', at).entries), []);
    assert.equal(D.begin(null, departure({ at: at + 120000 }), at).active, null);
    const state = D.reply(arrived(['fog']), 'aller', { conditions: ['inconnu'] }, at + 1000); assert.deepEqual(json(state.entries[0].feedback.conditions), ['fog']);
    assert.equal(D.reply(null, 'absent', { conditions: [] }, at).entries.length, 0);
    const wrong = json(arrived([])); wrong.entries[0].start.key = 'autre'; assert.equal(D.clean(wrong, at).entries[0].start, null);
  });
  return n;
}
if (require.main === module) { const n = runTests(); console.log(`${n}/${n} scénarios OK`); }
module.exports = { sourcePath, runTests };
