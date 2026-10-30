'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../src/reliability.js'), 'utf8');
const ctx = { console, Date, JSON, String }; vm.createContext(ctx); vm.runInContext(source + ';this.R=Reliability;', ctx);
const R = ctx.R; let n = 0; const check = (label, fn) => { fn(); n++; console.log('✅ ' + label); };
check('version identique : aucune action', () => assert.equal(R.versionDecision({ loaded: 'a', published: 'a' }), 'current'));
check('version différente pendant trajet : rechargement différé', () => assert.equal(R.versionDecision({ loaded: 'a', published: 'b', travelling: true }), 'deferred'));
check('version différente hors ligne : aucun rechargement', () => assert.equal(R.versionDecision({ loaded: 'a', published: 'b', online: false }), 'offline'));
check('version différente au repos : un rechargement autorisé', () => assert.equal(R.versionDecision({ loaded: 'a', published: 'b' }), 'reload'));
check('même cible déjà tentée : aucune boucle de rechargement', () => assert.equal(R.versionDecision({ loaded: 'a', published: 'b', attempted: true }), 'stale'));
check('métadonnées anciennes sans build : garde neutre', () => assert.equal(R.versionDecision({ loaded: 'a', published: null }), 'unknown'));
check('journal limité et persistant, sans URL ni coordonnées précises', () => {
  const data = new Map(), listeners = {};
  const storage = { getItem:k=>data.get(k)||null, setItem:(k,v)=>data.set(k,v), removeItem:k=>data.delete(k) };
  const target = { addEventListener:(k,f)=>listeners[k]=f, removeEventListener:k=>delete listeners[k] };
  let at = 100; const rec = R.runtimeRecorder({ target, storage, now:()=>++at, limit:3 });
  listeners.error({ message:'boom https://example.test/x?lat=48.8566,2.3522' });
  listeners.unhandledrejection({ reason:new Error('raté 48.8566, 2.3522') });
  rec.record('manual', 'trois'); rec.record('manual', 'quatre');
  assert.equal(rec.count(), 3); assert.equal(rec.last().message, 'quatre');
  const raw = data.get(rec.key); assert(!/https?:|48\.8566|2\.3522/.test(raw), raw);
  const restored = R.runtimeRecorder({ target:null, storage, now:()=>200, limit:3 });
  assert.equal(restored.count(), 3);
});
// Fraîcheur honnête : un horodatage dans le futur (horloge reculée, relais falsifié) est un âge INCONNU, jamais « 0 minute ».
const NOW = Date.parse('2026-10-14T12:00:00Z'), MIN = 60000;
check('âge : passé, présent et dérive d’horloge tolérée (≤ 60 s) donnent un âge fini', () => {
  assert.equal(R.ageMin(NOW - 5 * MIN, NOW), 5); assert.equal(R.ageMin(NOW, NOW), 0);
  assert.equal(R.ageMin(NOW + 59000, NOW), 0, 'petite dérive d’horloge : âge nul');
  assert.equal(R.ageMin(new Date(NOW - 20 * MIN).toISOString(), NOW), 20, 'chaîne ISO acceptée');
});
check('âge : futur, illisible ou absent donne null (inconnu), jamais 0', () => {
  for (const bad of [NOW + 61000, NOW + 3 * 3600e3, '2099-01-01T00:00:00Z', new Date(NOW + 3 * 3600e3).toISOString(), NaN, Infinity, undefined, null, '', 'pas une date', {}, []])
    assert.equal(R.ageMin(bad, NOW), null, String(bad));
});
check('LIVE expiré : plus de 15 min, futur ou inconnu → expiré ; 15 min pile reste LIVE', () => {
  const max = 15 * MIN;
  assert.equal(R.liveExpired(NOW - 14 * MIN, NOW, max), false); assert.equal(R.liveExpired(NOW - 15 * MIN, NOW, max), false);
  assert.equal(R.liveExpired(NOW - 15 * MIN - 1000, NOW, max), true);
  for (const bad of [NOW + 3 * 3600e3, NOW + 61000, NaN, undefined, null]) assert.equal(R.liveExpired(bad, NOW, max), true, String(bad));
});
check('échéance : une horloge reculée ne repousse jamais une actualisation', () => {
  assert.equal(R.isDue(NOW - 6 * MIN, 5 * MIN, NOW), true); assert.equal(R.isDue(NOW - 4 * MIN, 5 * MIN, NOW), false);
  assert.equal(R.isDue(NOW, 5 * MIN, NOW), false);
  assert.equal(R.isDue(NOW + 3 * 3600e3, 5 * MIN, NOW), true, 'dernier essai « dans le futur » : échéance atteinte');
  assert.equal(R.isDue(0, 5 * MIN, NOW), true); assert.equal(R.isDue(null, 5 * MIN, NOW), true); assert.equal(R.isDue(NaN, 5 * MIN, NOW), true);
});
// Contrat de source : chaque calcul d'âge ou d'échéance de l'application passe par les mêmes fonctions (aucun `Date.now() - t` nu).
const rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const FRESH_FILES = ['src/app/live-status.js', 'src/app.js', 'src/app/lifecycle.js', 'src/app/weather-station.js', 'src/app/diagnostics.js', 'src/app/weather-view.js', 'src/app/analysis-view.js'];
const FRESH_RULES = [
  ['src/app.js', 'const relayAgeMin = ts => {', 'Reliability.ageMin(ts)', "l'âge du relais (obs.json, agenda) borne le futur"],
  ['src/app.js', 'function expireLive(', 'Reliability.liveExpired(r.t, now)', 'expireLive utilise l’âge connu'],
  ['src/app.js', 'for (const c of Object.values(CALM))', 'Reliability.liveExpired(c.t)', 'prévisions secondaires (CALM) requalifiées'],
  ['src/app.js', 'for (const c of Object.values(LEGM))', 'Reliability.liveExpired(c.t)', 'prévisions de parcours (LEGM) requalifiées'],
  ['src/app.js', 'const ageMin = value => {', 'Reliability.ageMin(value, now)', 'décision : âges bornés'],
  ['src/app/weather-station.js', "RAW[id] = { ...r, mode:", 'Reliability.liveExpired(r.t)', 'reprise inter-onglets'],
  ['src/app/live-status.js', 'const ref = Math.max(lastSuccess || 0, lastAttempt || 0);', 'Reliability.isDue(ref || null, interval, now)', 'actualisation automatique due malgré une horloge reculée'],
  ['src/app/lifecycle.js', 'if (navigator.onLine !== false', 'Reliability.isDue(VER_CHECK_AT, AUTO_MS)', 'contrôle de version dû malgré une horloge reculée'],
  ['src/app/diagnostics.js', 'const ageOf = t =>', 'Reliability.ageMin(t)', 'diagnostic : âge inconnu si futur'],
  ['src/app/weather-view.js', 'const raw = RAW[UI.loc], ageMin =', 'Reliability.ageMin(raw.t)', 'vue Météo'],
  ['src/app/analysis-view.js', 'const raw = RAW[UI.loc], ageMin =', 'Reliability.ageMin(raw.t)', 'vue Analyse'],
  ['src/app/weather-view.js', 'location: { trust: evLocTrust() }', 'Reliability.ageMin(raw.t)', 'preuves : même garde du futur que les autres vues']
];
const BARE = [/Date\.now\(\) - [cr]\.t > LIVE_MAX_MS/, /!\(now - r\.t <= LIVE_MAX_MS\)/, /Date\.now\(\) - ref >= AUTO_MS/, /Date\.now\(\) - VER_CHECK_AT >= AUTO_MS/];
function freshnessContract(read) {
  const bad = [];
  for (const [file, anchor, needle, why] of FRESH_RULES) {
    const text = read(file), i = text.indexOf(anchor);
    if (i < 0) { bad.push(`${file} : ancre « ${anchor} » absente`); continue; }
    if (!text.slice(i, i + 700).includes(needle)) bad.push(`${file} : ${why} (« ${needle} » attendu)`);
  }
  for (const f of FRESH_FILES) for (const re of BARE) if (re.test(read(f))) bad.push(`${f} : calcul d’âge sans borne (${re})`);
  return bad;
}
check('contrat : tous les âges et échéances de fraîcheur passent par Reliability', () => assert.deepEqual(freshnessContract(rd), []));
check('contre-tests : un retour aux calculs nus est détecté', () => {
  const real = rd, mutate = (file, from, to) => f => { const t = real(f); if (f !== file) return t; assert(t.includes(from), from); return t.replace(from, to); };
  const mutations = [
    mutate('src/app.js', 'Reliability.ageMin(ts)', 'Math.max(0, (Date.now() - Date.parse(ts || "")) / 60000)'),
    mutate('src/app.js', 'Reliability.liveExpired(r.t, now)', '!(now - r.t <= LIVE_MAX_MS)'),
    mutate('src/app.js', 'Reliability.liveExpired(c.t)', 'Date.now() - c.t > LIVE_MAX_MS'),
    mutate('src/app/live-status.js', 'Reliability.isDue(ref || null, interval, now)', 'Date.now() - ref >= AUTO_MS'),
    mutate('src/app/diagnostics.js', 'Reliability.ageMin(t)', 'Math.max(0, (Date.now() - t) / 60000)'),
    mutate('src/app/weather-station.js', 'Reliability.liveExpired(r.t)', 'Date.now() - r.t > LIVE_MAX_MS')
  ];
  for (const m of mutations) assert(freshnessContract(m).length > 0, 'mutation non détectée');
});
// Politique de fraîcheur unique : FRESH ≤ 15 min (LIVE, décision possible) · AGING ≤ 60 min (à confirmer) · STALE au-delà · UNAVAILABLE sans âge connu.
check('politique : seuils centraux immuables et états aux limites exactes', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(R.FRESHNESS)), { freshMaxMin: 15, agingMaxMin: 60 });
  assert(Object.isFrozen(R.FRESHNESS), 'la politique ne se modifie pas à l’exécution');
  const cases = [[0, 'FRESH'], [15, 'FRESH'], [15.01, 'AGING'], [60, 'AGING'], [60.01, 'STALE'], [240, 'STALE'],
    [null, 'UNAVAILABLE'], [undefined, 'UNAVAILABLE'], [NaN, 'UNAVAILABLE'], [Infinity, 'UNAVAILABLE'], [-1, 'UNAVAILABLE'], ['15', 'UNAVAILABLE']];
  for (const [age, state] of cases) assert.equal(R.freshState(age), state, String(age));
});
const POLICY_VALUES = [['src/decision.js', 'FRESH_MAX_MIN', 'freshMaxMin'], ['src/decision.js', 'STALE_AFTER_MIN', 'agingMaxMin'],
  ['src/wxdesk.js', 'WXD_STALE_AFTER_MIN', 'agingMaxMin'], ['src/tyrelab.js', 'TL_STALE_AFTER_MIN', 'agingMaxMin'],
  ['src/f1-pure.js', 'STALE_AFTER_MIN', 'agingMaxMin'], ['src/weather-watch.js', 'FRESH_MAX_MIN', 'freshMaxMin'],
  ['src/evidence.js', 'EV_STALE_AFTER_MIN', 'agingMaxMin']];
const POLICY_USES = [['src/app.js', 'LIVE_MAX_MS = Reliability.FRESHNESS.freshMaxMin * 60e3'], ['src/app/diagnostics.js', 'Reliability.freshState('],
  ['src/app/race-views.js', 'Reliability.FRESHNESS.agingMaxMin']];
// Zéro valide le domaine d'un âge ; les seuils de péremption positifs doivent rester nommés.
const LITERAL_AGE = /ageMin\s*(?:<=|>=|<|>)\s*[1-9]\d*\b(?!\s*\*)/;
function policyContract(read) {
  const bad = [];
  for (const [file, name, key] of POLICY_VALUES) {
    const m = new RegExp('\\b' + name + '\\s*=\\s*(\\d+)\\b').exec(read(file));
    if (!m) bad.push(`${file} : constante ${name} absente`);
    else if (+m[1] !== R.FRESHNESS[key]) bad.push(`${file} : ${name} = ${m[1]} au lieu de ${R.FRESHNESS[key]}`);
    if (LITERAL_AGE.test(read(file))) bad.push(`${file} : seuil d’âge en littéral (utiliser la constante de politique)`);
  }
  for (const [file, text] of POLICY_USES) if (!read(file).includes(text)) bad.push(`${file} : « ${text} » attendu`);
  const race = read('src/app/race-views.js');
  if (/\b90\s*\*\s*60000\b|ageMin\s*<=\s*90\b/.test(race)) bad.push('src/app/race-views.js : seuil de 90 min conservé');
  return bad;
}
check('contrat : tous les modules partagent les mêmes seuils de fraîcheur (aucune dérive 60/90)', () => assert.deepEqual(policyContract(rd), []));
check('contre-tests : une dérive de seuil ou un littéral est détecté', () => {
  const mutate = (file, from, to) => f => { const t = rd(f); if (f !== file) return t; assert(t.includes(from), from); return t.replace(from, to); };
  const mutations = [
    mutate('src/tyrelab.js', 'TL_STALE_AFTER_MIN = 60', 'TL_STALE_AFTER_MIN = 90'),
    mutate('src/f1-pure.js', 'STALE_AFTER_MIN = 60', 'STALE_AFTER_MIN = 90'),
    mutate('src/evidence.js', 'EV_STALE_AFTER_MIN = 60', 'EV_STALE_AFTER_MIN = 90'),
    mutate('src/decision.js', 'FRESH_MAX_MIN = 15', 'FRESH_MAX_MIN = 20'),
    mutate('src/wxdesk.js', 'ageMin > WXD_STALE_AFTER_MIN', 'ageMin > 60'),
    mutate('src/weather-watch.js', 'ageMin <= FRESH_MAX_MIN', 'ageMin <= 15'),
    mutate('src/app/diagnostics.js', 'Reliability.freshState(', 'freshStateLocal('),
    mutate('src/app.js', 'LIVE_MAX_MS = Reliability.FRESHNESS.freshMaxMin * 60e3', 'LIVE_MAX_MS = 15 * 60e3'),
    mutate('src/app/race-views.js', 'Reliability.FRESHNESS.agingMaxMin', '90')
  ];
  for (const m of mutations) assert(policyContract(m).length > 0, 'mutation non détectée');
});
// Santé du relais (obs.json) : ok tant que les observations restent utilisables, en retard au-delà, à l'arrêt possible bien au-delà.
check('relais : états ok / en retard / à l’arrêt / inconnu aux limites exactes', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(R.RELAY)), { warnMin: 20, obsMaxMin: 35, outageMin: 90 }); assert(Object.isFrozen(R.RELAY));
  const cases = [[0, 'ok'], [20, 'ok'], [35, 'ok'], [35.01, 'late'], [90, 'late'], [90.01, 'down'], [600, 'down'],
    [null, 'unknown'], [undefined, 'unknown'], [NaN, 'unknown'], [Infinity, 'unknown'], [-1, 'unknown'], ['40', 'unknown']];
  for (const [age, state] of cases) assert.equal(R.relayState(age), state, String(age));
});
const RELAY_USES = [['src/app.js', 'RELAY_WARN_MIN = Reliability.RELAY.warnMin'], ['src/app.js', 'RELAY_OBS_MAX_MIN = Reliability.RELAY.obsMaxMin'],
  ['src/app.js', 'Reliability.relayState(relayAgeMin(RELAY_AT))'], ['src/app.js', "data-k=\"relay\""]];
function relayContract(read) { const bad = []; for (const [file, text] of RELAY_USES) if (!read(file).includes(text)) bad.push(`${file} : « ${text} » attendu`); return bad; }
check('contrat : le bandeau « relais en retard » dérive des mêmes seuils que le reste de l’application', () => assert.deepEqual(relayContract(rd), []));
check('contre-tests : seuil relais recopié en littéral, état non dérivé ou bandeau retiré est détecté', () => {
  const mutate = (from, to) => f => { const t = rd(f); if (f !== 'src/app.js') return t; assert(t.includes(from), from); return t.split(from).join(to); };   // toutes les occurrences
  for (const m of [mutate('RELAY_OBS_MAX_MIN = Reliability.RELAY.obsMaxMin', 'RELAY_OBS_MAX_MIN = 35'), mutate('RELAY_WARN_MIN = Reliability.RELAY.warnMin', 'RELAY_WARN_MIN = 20'),
    mutate('Reliability.relayState(relayAgeMin(RELAY_AT))', 'null'), mutate('data-k="relay"', 'data-k="x"')]) assert(relayContract(m).length > 0, 'mutation non détectée');
});
check('texte runtime borné', () => assert(R.clip('x'.repeat(500)).length <= 180));
const diagnosticSource = fs.readFileSync(path.join(__dirname, '../src/app/diagnostics.js'), 'utf8');
function agendaDiagnostic(options = {}, input = diagnosticSource) {
  const row = input.split('\n').find(line => line.includes("['Agenda',"));
  assert(row, 'la vraie ligne Agenda du diagnostic doit être testée');
  const expression = row.trim().replace(/^\['Agenda', /, '').replace(/\],$/, '');
  const state = { console, Date, JSON, String, Reliability: R, CAL: null, CALDONE: false, CALFAIL: null,
    location: { protocol: 'https:' }, crypto: { subtle: {} },
    lsGet: () => 'fixture-passphrase', hmLocal: () => '07:00', ...options };
  vm.createContext(state);
  vm.runInContext(input + ';this.status=(' + expression + ');', state);
  return state.status;
}
check('agenda verrouillé : aucun faux chargement sans code disponible', () => {
  for (const done of [false, true]) {
    const status = agendaDiagnostic({ lsGet: () => null, CALDONE: done });
    assert.match(status, /verrouillé.*déverrouille/i); assert.doesNotMatch(status, /chargement|événements/i);
  }
});
check('agenda sécurisé : vraie lecture en cours et échec distingués', () => {
  assert.equal(agendaDiagnostic(), 'chargement…');
  assert.equal(agendaDiagnostic({ CALDONE: true }), 'indisponible');
  assert.equal(agendaDiagnostic({ CALDONE: true, CALFAIL: { at: 0, kind: 'timeout' } }), 'indisponible · timeout à 07:00');
});
check('agenda non pris en charge : aucun chargement sur HTTP ou sans Web Crypto', () => {
  for (const options of [{ location: { protocol: 'http:' } }, { crypto: {} }, { crypto: { subtle: null } }]) {
    const status = agendaDiagnostic(options); assert.match(status, /indisponible.*sécurisé/i); assert.doesNotMatch(status, /chargement/i);
  }
});
check('agenda chargé : fraîcheur, événements et copie hors ligne conservés', () => {
  const current = { updated: new Date().toISOString(), events: [{}, {}] };
  assert.match(agendaDiagnostic({ CAL: current }), /FRESH.*2 événements/);
  assert.match(agendaDiagnostic({ CAL: current, lsGet: () => null }), /FRESH.*2 événements/);
  const cached = { ...current, updated: new Date(Date.now() - 120 * 60000).toISOString(), offline: true, cacheAt: Date.now() };
  assert.match(agendaDiagnostic({ CAL: cached }), /STALE.*2 événements.*copie locale du 07:00/);
});
check('diagnostic agenda : trois mutations de statut rejetées', () => {
  const mutations = [
    [diagnosticSource.replace("if (!lsGet('twrc.key'))", 'if (false)'), { lsGet: () => null }, /verrouillé/],
    [diagnosticSource.replace("if (location.protocol !== 'https:' || !crypto.subtle)", 'if (false)'), { crypto: {} }, /indisponible.*sécurisé/],
    [diagnosticSource.replace("return CALDONE ? 'indisponible' + (CALFAIL ? ' · ' + CALFAIL.kind + ' à ' + hmLocal(CALFAIL.at) : '') : 'chargement…';", "return 'chargement…';"), { CALDONE: true }, /^indisponible$/]
  ];
  for (const [mutant, options, expected] of mutations) {
    assert.notEqual(mutant, diagnosticSource, 'mutation appliquée');
    assert.throws(() => assert.match(agendaDiagnostic(options, mutant), expected), assert.AssertionError);
  }
});
console.log(n + '/' + n + ' scénarios OK');
