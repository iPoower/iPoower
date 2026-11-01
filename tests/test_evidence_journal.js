// Dette D2 : le journal du moteur de preuves (twrc.shadow.v1, synchronisé) n'est JAMAIS écrit pendant un rendu de l'onglet
// Météo (evidenceHtml) ; il l'est seulement sur l'événement « nouvelle météo reçue » (evWeatherReceived, appelé par refreshAll
// après le rendu). Vrai code de src/app/weather-view.js et de refreshAll (src/app.js), stockage compté. Données fictives.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const VIEW = path.join(__dirname, '../src/app/weather-view.js'), APP = path.join(__dirname, '../src/app.js');
const SHADOW_KEY = 'twrc.shadow.v1', H = 3600e3, T0 = Date.parse('2026-10-31T08:00:00Z');
const N = 50;   // rendus successifs de la carte « Preuves »

// Bloc « moteur de preuves v2 » de la vue Météo : de EV_FLAG jusqu'à la fin du fichier (evidenceHtml compris).
function evidenceBlock(view) {
  const from = view.indexOf('const EV_FLAG = ');
  assert(from > 0, 'bloc du moteur de preuves introuvable dans weather-view.js');
  return view.slice(from);
}
// Phénomène fictif : brouillard probable (niveau 2) appuyé par une observation de station proche (couche A).
const verdict = () => ({ v1: 0, prevLv: 2, coverage: { expected: 4, located: 4 }, r: {
  worst: { lv: 2, trust: 1, label: 'maintenant', ev: [{ layer: 'A', w: 0.8, lv: 2, dir: '+', source: 'Station fictive', text: 'brume' }] },
  headline: null, contradiction: null, fog: [], phen: [{ lv: 2, icon: '🌫', label: 'Brouillard', value: 'probable', trust: 1, trustTxt: 'moyenne' }],
  axes: { data: 'complètes', models: 'concordants', location: 'fiable', observations: '1 station', freshness: 'fraîche' }, community: 'indisponible' } });

function sandbox(view) {
  const store = new Map(), writes = [];
  const c = {
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [c.now])); } static now() { return c.now; } },
    Math, JSON, Object, Number, Array, String, Set, now: T0,
    S: { flags: {} }, UI: { loc: 'lieu-a', evOpen: false }, DEMO: { on: false }, APP_CONTEXT: { rendering: false },
    lsGet: k => (store.has(k) ? store.get(k) : null),
    lsSet: (k, v) => { writes.push(k); store.set(k, String(v)); },
    esc: s => String(s), hmLocal: () => '08:00', offlineNow: () => false, WXD_EMO: ['🟢', '🟡', '🟠', '🔴'],
    evNowResult: verdict()
  };
  vm.createContext(c);
  vm.runInContext(evidenceBlock(view) + '\n;evNow = () => this.evNowResult; evInput = () => null;'
    + '\nthis.api = { evidenceHtml, evWeatherReceived, shadowLoad, EV_FLAG };', c);
  return { c, store, writes, api: c.api };
}
let n = 0;
const check = (label, fn) => { fn(); n++; console.log('✅ ' + label); };

function run(view, app, { quiet = false } = {}) {
  let count = 0;
  const step = (label, fn) => { try { fn(); } catch (e) { e.scenario = label; throw e; } count++; if (!quiet) console.log('✅ ' + label); };
  for (const flag of ['on', 'shadow']) {
    step(`${flag} · ${N} rendus de l'onglet Météo : 0 écriture, journal identique à l'octet près`, () => {
      const t = sandbox(view); t.c.S.flags.weatherEvidenceV2 = flag;
      // Dernière entrée automatique vieille de 2 h : l'ancien code (écriture au rendu) aurait écrit dès le premier rendu.
      const seed = JSON.stringify([{ at: T0 - 2 * H, loc: 'lieu-a', v1: 0, v2: 1, trust: 1, contra: false }]);
      t.store.set(SHADOW_KEY, seed); t.writes.length = 0;
      const html = [];
      for (let k = 0; k < N; k++) { t.c.now = T0 + k * 10 * 60e3; html.push(t.api.evidenceHtml()); }   // rendus étalés sur plus de 8 h
      assert(html.every(h => /Preuves météo · moteur v2/.test(h)), 'chaque rendu produit bien la carte « Preuves » (test non aveugle)');
      assert.equal(t.writes.length, 0, 'aucune écriture de stockage pendant les rendus : ' + t.writes.join(','));
      assert.equal(Buffer.compare(Buffer.from(t.store.get(SHADOW_KEY)), Buffer.from(seed)), 0, 'journal identique (octets)');
    });
    step(`${flag} · témoin positif : l'arrivée d'une nouvelle météo écrit une entrée, une seule par heure et par lieu`, () => {
      const t = sandbox(view); t.c.S.flags.weatherEvidenceV2 = flag;
      t.store.set(SHADOW_KEY, JSON.stringify([{ at: T0 - 2 * H, loc: 'lieu-a', v1: 0, v2: 1 }])); t.writes.length = 0;
      t.api.evWeatherReceived();
      assert.deepEqual(t.writes, [SHADOW_KEY], 'nouvelle météo reçue : une écriture du journal');
      const L = t.api.shadowLoad(), e = L[L.length - 1];
      assert.equal(L.length, 2); assert.equal(e.at, T0); assert.equal(e.loc, 'lieu-a'); assert.equal(e.v2, 2); assert.equal(e.obs, 1); assert.equal(e.src, 'station');
      t.c.now = T0 + 20 * 60e3; t.api.evWeatherReceived();
      assert.equal(t.writes.length, 1, 'nouvelle météo 20 min plus tard : espacement de 60 min conservé');
      t.c.now = T0 + 61 * 60e3; t.api.evWeatherReceived();
      assert.equal(t.writes.length, 2, 'nouvelle météo 61 min plus tard : nouvelle entrée');
    });
  }
  step('moteur désactivé, rendu en cours ou démonstration : la nouvelle météo n’écrit rien', () => {
    for (const set of [c => { c.S.flags.weatherEvidenceV2 = 'off'; }, c => { c.APP_CONTEXT.rendering = true; }, c => { c.DEMO.on = true; }, c => { c.evNowResult = null; }]) {
      const t = sandbox(view); set(t.c); t.api.evWeatherReceived();
      assert.equal(t.writes.length, 0);
    }
  });
  step('refreshAll : evWeatherReceived appelé une fois, APRÈS le rendu, seulement si une météo valide est arrivée', () => {
    const body = app.slice(app.indexOf('async function refreshAll('), app.indexOf('\nfunction startDemo('));
    assert(body.length > 100, 'refreshAll introuvable');
    const calls = body.match(/evWeatherReceived\(\)/g) || [];
    assert.equal(calls.length, 1, 'un seul déclencheur dans refreshAll');
    const render = body.lastIndexOf('rebuild(); renderAll();'), call = body.indexOf('evWeatherReceived()');
    assert(render > 0 && call > render, 'écriture après le rendu, jamais avant ni pendant');
    assert(/if \(received\) \{ try \{ evWeatherReceived\(\);/.test(body), 'écriture conditionnée à une nouvelle météo reçue');
    assert(/received = ok;/.test(body), 'received = nombre de lieux dont la météo valide vient d’arriver');
  });
  step('aucun autre appel du journal automatique : evShadowTick n’est appelé que par evWeatherReceived', () => {
    const block = evidenceBlock(view), html = block.slice(block.indexOf('function evidenceHtml('));
    assert(!/evShadowTick\(|shadowPush\(|lsSet\(/.test(html), 'evidenceHtml ne contient aucune écriture');
    const uses = (block.match(/evShadowTick\(/g) || []).length;
    assert.equal(uses, 2, 'définition + appel unique dans evWeatherReceived');
  });
  return count;
}

const view = fs.readFileSync(VIEW, 'utf8'), app = fs.readFileSync(APP, 'utf8');
const total = run(view, app);
// Contre-tests : chaque régression doit être rejetée, sinon le test serait aveugle.
const mutations = [
  { name: 'écriture rétablie pendant le rendu (D2)', file: 'view', from: '  // Lecture seule : aucune écriture pendant un rendu (le journal est tenu par evWeatherReceived).\n', to: '  evShadowTick(v);\n' },
  { name: 'nouvelle météo sans écriture du journal', file: 'view', from: '  evShadowTick(evNow());\n', to: '  evNow();\n' },
  { name: 'déclencheur retiré de refreshAll', file: 'app', from: 'if (received) { try { evWeatherReceived(); }', to: 'if (received) { try { }' },
  { name: 'écriture avant le rendu', file: 'app', from: '  rebuild(); renderAll();\n  // Journal de preuves', to: '  if (received) evWeatherReceived();\n  rebuild(); renderAll();\n  // Journal de preuves' },
  { name: 'espacement horaire supprimé', file: 'view', from: 'if (last && Date.now() - last.at < SHADOW_AUTO_EVERY_MS) return;', to: '' }
];
for (const m of mutations) {
  const source = m.file === 'view' ? view : app;
  assert.equal(source.split(m.from).length, 2, 'Mutation introuvable ou ambiguë : ' + m.name);
  let rejected = null;
  try { run(m.file === 'view' ? view.replace(m.from, m.to) : view, m.file === 'app' ? app.replace(m.from, m.to) : app, { quiet: true }); } catch (e) { rejected = e; }
  check(`contre-test rejeté : ${m.name}${rejected && rejected.scenario ? ' → ' + rejected.scenario : ''}`, () => assert(rejected && rejected.scenario, 'mutation non détectée : ' + m.name));
}
console.log(`${total + n}/${total + n} scénarios OK · ${mutations.length}/${mutations.length} régressions rejetées`);
