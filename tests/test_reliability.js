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
check('texte runtime borné', () => assert(R.clip('x'.repeat(500)).length <= 180));
const diagnosticSource = fs.readFileSync(path.join(__dirname, '../src/app/diagnostics.js'), 'utf8');
function agendaDiagnostic(options = {}, input = diagnosticSource) {
  const row = input.split('\n').find(line => line.includes("['Agenda',"));
  assert(row, 'la vraie ligne Agenda du diagnostic doit être testée');
  const expression = row.trim().replace(/^\['Agenda', /, '').replace(/\],$/, '');
  const state = { console, Date, JSON, String, CAL: null, CALDONE: false,
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
    [diagnosticSource.replace("return CALDONE ? 'indisponible' : 'chargement…';", "return 'chargement…';"), { CALDONE: true }, /^indisponible$/]
  ];
  for (const [mutant, options, expected] of mutations) {
    assert.notEqual(mutant, diagnosticSource, 'mutation appliquée');
    assert.throws(() => assert.match(agendaDiagnostic(options, mutant), expected), assert.AssertionError);
  }
});
console.log(n + '/' + n + ' scénarios OK');
