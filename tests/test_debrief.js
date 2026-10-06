// Débrief d'arrivée : idempotence, annulation, confidentialité, aucune donnée inventée, motifs sans apprentissage.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const sourcePath = path.join(__dirname, '../src/debrief.js');
function engine(text = fs.readFileSync(sourcePath, 'utf8')) { const ctx = {}; vm.createContext(ctx); vm.runInContext(text + ';this.api=Debrief;', ctx); return ctx.api; }
const plain = v => JSON.parse(JSON.stringify(v));
const now = Date.parse('2026-10-07T06:12:00Z'), MIN = 60e3, H = 3600e3, D = 24 * H;
const live = (over = {}) => ({ tripKey: 'commute|2026-10-07T07:25|go', src: 'work', leg: 'go', origin: 'home', destination: 'work', how: 'auto',
  startedAt: now - 47 * MIN, endedAt: now, planned: { min: 42, km: 38, tyreScore: 92, level: 'go' },
  observed: { min: 47, km: 38.2, kmSrc: 'route' }, thermal: { range: [38, 46], s: 2, confidence: 'moyenne' },
  evidence: { source: 'metar', at: now - 42 * MIN, distKm: 19.04, visM: 2100, spreadC: 0, flags: ['saturated', 'mist'] }, ...over });

function runTests(text, { quiet = false } = {}) {
  const api = engine(text); let count = 0;
  const test = (name, fn) => { try { fn(); } catch (e) { if (e instanceof assert.AssertionError) e.scenario = name; throw e; } count++; if (!quiet) console.log('✅ ' + name); };
  const fresh = () => api.load(null, now);

  test('un trajet = un débrief : deuxième clôture (GPS + clic) renvoie l’existant', () => {
    const a = api.create(fresh(), live(), now);
    const b = api.create(a.state, live({ how: 'confirmé', endedAt: now + MIN }), now + MIN);
    assert.strictEqual(a.created, true); assert.strictEqual(b.created, false);
    assert.strictEqual(Object.keys(b.state.items).length, 1); assert.strictEqual(b.record.how, 'auto');
  });
  test('idempotence durable : toujours un seul débrief 3 jours plus tard (done[key] a expiré)', () => {
    const a = api.create(fresh(), live(), now);
    const reloaded = api.load(api.serialize(a.state), now + 3 * D);
    const b = api.create(reloaded, live(), now + 3 * D);
    assert.strictEqual(b.created, false); assert.strictEqual(Object.keys(b.state.items).length, 1);
  });
  test('« Annuler l’arrivée » dans les 10 min supprime le débrief', () => {
    const a = api.create(fresh(), live(), now);
    const r = api.revoke(a.state, live().tripKey, now + 9 * MIN);
    assert.strictEqual(r.revoked, true); assert.strictEqual(api.card(r.state, now + 9 * MIN), null);
  });
  test('après 10 min, l’annulation ne détruit plus le débrief', () => {
    const a = api.create(fresh(), live(), now);
    assert.strictEqual(api.revoke(a.state, live().tripKey, now + 11 * MIN).revoked, false);
  });
  test('confidentialité : aucune coordonnée, titre ni adresse persistés', () => {
    const dirty = live({ name: 'Titre privé agenda', loc: 'Adresse privée', lat: 49.9, lon: 2.3, origin: { lat: 49.9, lon: 2.3 },
      destination: 'Rue privée 12', evidence: { ...live().evidence, lat: 49.97, lon: 2.69, station: 'LFAQ' }, planned: { ...live().planned, pts: [{ lat: 1, lon: 2 }] } });
    const raw = api.serialize(api.create(fresh(), dirty, now).state);
    ['Titre privé', 'Adresse privée', 'Rue privée', '"lat"', '"lon"', '49.9', 'LFAQ', '"pts"'].forEach(s => assert(!raw.includes(s), 'fuite : ' + s));
    const r = api.load(raw, now).items[live().tripKey];
    assert.strictEqual(r.origin, null); assert.strictEqual(r.destination, null);
  });
  test('identifiants logiques conservés : domicile, travail, destination ajoutée', () => {
    const r = api.create(fresh(), live({ origin: 'home', destination: 'c1kq9z3x' }), now).record;
    assert.strictEqual(r.origin, 'home'); assert.strictEqual(r.destination, 'c1kq9z3x');
  });
  test('clé de trajet hors format refusée (pas de texte libre en clé)', () => {
    assert.strictEqual(api.create(fresh(), live({ tripKey: 'Rendez-vous chez le médecin' }), now).record, null);
  });
  test('« Je suis déjà rentré » : rien n’est inventé (pas de durée, distance ni météo observées)', () => {
    const r = api.create(fresh(), live({ tripKey: 'leg|2026-10-07T17:10|ret|2026-10-07T15:00', src: 'cal', leg: 'ret', how: 'confirmé',
      startedAt: null, observed: null, thermal: null, evidence: null, planned: { min: 40 } }), now).record;
    assert.strictEqual(r.observed, null); assert.strictEqual(r.thermal, null); assert.strictEqual(r.evidence, null); assert.strictEqual(r.startedAt, null);
    assert.deepStrictEqual(plain(r.planned), { min: 40, km: null, tyreScore: null, level: null });
  });
  test('la confiance thermique reste thermique ; aucune confiance globale du verdict', () => {
    const r = api.create(fresh(), live({ planned: { ...live().planned, confidence: 82 } }), now).record;
    assert.strictEqual(r.thermal.confidence, 'moyenne'); assert(!('confidence' in r.planned));
  });
  test('observation sans source, heure ou distance écartée (jamais présentée comme preuve)', () => {
    assert.strictEqual(api.create(fresh(), live({ evidence: { visM: 2100, flags: ['fog'] } }), now).record.evidence, null);
  });
  test('carte Pneus 2 h, puis « À compléter » dans le Journal sans perte', () => {
    const s = api.create(fresh(), live(), now).state;
    assert(api.card(s, now + 119 * MIN)); assert.strictEqual(api.card(s, now + 121 * MIN), null);
    assert.strictEqual(api.journal(s, now + 121 * MIN)[0].status, 'toComplete');
  });
  test('répondre fait disparaître la carte et fige le ressenti ; l’instantané est inchangé', () => {
    const a = api.create(fresh(), live(), now);
    const b = api.answer(a.state, live().tripKey, 'worse', ['fog', 'fog', 'inconnu'], now + 2 * MIN);
    assert(b.ok); assert.strictEqual(api.card(b.state, now + 3 * MIN), null);
    const r = b.state.items[live().tripKey];
    assert.deepStrictEqual(plain(r.feedback.causes), ['fog']);
    assert.deepStrictEqual(plain({ ...r, feedback: null }), plain(a.record));
  });
  test('« Pire » sans cause refusé ; « Comme prévu » ignore les causes', () => {
    const s = api.create(fresh(), live(), now).state;
    assert.strictEqual(api.answer(s, live().tripKey, 'worse', [], now).ok, false);
    const ok = api.answer(s, live().tripKey, 'expected', ['fog'], now);
    assert.deepStrictEqual(plain(ok.state.items[live().tripKey].feedback.causes), []);
  });
  test('motifs : 1 observation · 2 motif · 3–4 signal · 5+ suggestion, sans modifier aucun seuil', () => {
    let s = fresh();
    for (let i = 0; i < 5; i++) {
      const k = 'commute|2026-10-0' + (i + 1) + 'T07:25|go';
      s = api.create(s, live({ tripKey: k, endedAt: now - i * D }), now).state;
      const causes = ['fog'].concat(i < 2 ? ['rain'] : [], i < 3 ? ['wind'] : [], i === 0 ? ['traffic'] : []);
      s = api.answer(s, k, 'worse', causes, now).state;
    }
    const p = api.patterns(s);
    assert.deepStrictEqual(plain(p), [{ cause: 'fog', n: 5, level: 'suggestion' }, { cause: 'wind', n: 3, level: 'signal' },
      { cause: 'rain', n: 2, level: 'motif' }, { cause: 'traffic', n: 1, level: 'observation' }]);
    assert.strictEqual(api.summary(s).conformity, 0);
  });
  test('historique borné : 200 débriefs max, plus de 365 jours purgés', () => {
    let s = fresh();
    for (let i = 0; i < 210; i++) s = api.create(s, live({ tripKey: 'commute|t' + i + '|go', endedAt: now - i * H }), now).state;
    assert.strictEqual(Object.keys(s.items).length, 200); assert(!s.items['commute|t209|go']);
    assert.strictEqual(Object.keys(api.load(api.serialize(s), now + 400 * D).items).length, 0);
  });
  test('stockage corrompu : état vide, aucune exception', () => {
    assert.deepStrictEqual(plain(api.load('{pas du json', now)), { v: 1, items: {} });
    assert.deepStrictEqual(plain(api.load('{"v":2,"items":{}}', now)), { v: 1, items: {} });
  });
  return count;
}
module.exports = { runTests, sourcePath };
if (require.main === module) console.log(runTests(fs.readFileSync(sourcePath, 'utf8')) + ' tests débrief verts');
