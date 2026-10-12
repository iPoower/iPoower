// Alertes et journal : valeurs du vrai moteur, révisions comparables, aucune observation fictive.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), c = { console, Intl, Date, Math, Map, Set, JSON };
vm.createContext(c);
vm.runInContext(['engine.js', 'wxdesk.js', 'weather-watch.js'].map(f => fs.readFileSync(path.join(root, 'src', f), 'utf8')).join('\n') + ';this.W=WeatherWatch;this.desk=wxDesk;', c);
const copy = o => JSON.parse(JSON.stringify(o)), NOW = Date.parse('2026-10-12T08:00:00+02:00');
const hours = Array.from({ length: 25 }, (_, i) => ({ t: '2026-10-12T' + String(i).padStart(2, '0') + ':00', T: 12 - i / 4, Tapp: 10 - i / 4, Pl: 0, P: 0, pp: 5, wind: 12, gust: 24, vis: 10000, Tr: 11 - i / 4, ice: { level: 0 }, RH: 65, code: 2 }));
hours[24].t = '2026-10-13T00:00';
const input = { now: '2026-10-12T08:00', hours, cur: { T: 12, Tapp: 10 }, trips: [], ageMin: 0 }, desk = c.desk(input);
const model = { id: 'test', mode: 'live', cur: { time: input.now }, payload: {}, obs: null };
const build = extra => c.W.snapshot({ input, desk, model, raw: { t: NOW, mode: 'live' }, place: { id: 'test', name: 'Lieu fictif', lat: 48.85, lon: 2.35 }, nowMs: NOW, ...extra });
const base = () => ({ ...copy(build()), current: { T: 12, Tapp: 10, source: 'current' }, vis: 5000, gust: 25, ice: 0, road: { score: 100, level: 0 }, fresh: true, mode: 'LIVE' });
let n = 0;
const check = (label, fn) => { fn(); n++; console.log('✅ ' + label); };
check('même température et même risque que le moteur Météo, sans mutation', () => {
  const before = JSON.stringify({ input, desk, model }), s = build();
  assert.equal(s.current.T, desk.current.T); assert.equal(s.road, desk.road); assert.equal(s.roadT, hours[8].Tr);
  assert.equal(s.timeline.length, 13); assert.equal(s.timeline[12].t, '2026-10-12T20:00');
  assert.equal(s.pp, hours[8].pp); assert.equal(s.rain, 0); assert.equal(JSON.stringify({ input, desk, model }), before);
});
check('sources exactes et aucun pourcentage ou score inventé', () => {
  const s = build({ model: { ...model, payload: { __arome: { hours: 2 } } } });
  assert(s.modelSource.includes('AROME')); assert(s.rainSource.includes('base')); assert.equal(s.vis, 10000);
});
check('hors ligne, cache ancien, réponse fournisseur ancienne et données absentes restent non LIVE', () => {
  assert.equal(build({ offline: true }).fresh, false); assert.equal(build({ offline: true }).mode, 'HORS LIGNE');
  assert.equal(build({ nowMs: NOW + 16 * 60000 }).mode, 'CACHE');
  assert.equal(build({ model: { ...model, cur: { time: '2026-10-12T05:00' } } }).fresh, false);
  assert.equal(build({ raw: null }).expired, true);
  const expired = build({ input: { ...input, now: '2026-11-12T08:00' } }); assert.equal(expired.current.T, null); assert.equal(expired.timeline.length, 0);
});
check('les cinq franchissements explicites sont détectés et dédupliqués', () => {
  const m = c.W.monitor(), s = base(); m.ingest(s, { enabled: true });
  const t = { ...s, nowMs: NOW + 60000, current: { ...s.current, T: -1 }, vis: 300 };
  const r = m.ingest(t, { enabled: true }); assert.equal(r.emitted.filter(x => /^(t7|t3|t0|vis1000|vis500)$/.test(x.id)).length, 5);
  assert.equal(m.ingest(t, { enabled: true }).emitted.length, 0);
});
check('hystérésis : un rebond de 0,2 °C ne réarme pas le seuil de 7 °C', () => {
  const m = c.W.monitor(), s = base(); m.ingest(s, { enabled: true });
  const send = (T, minutes) => m.ingest({ ...s, current: { ...s.current, T }, nowMs: NOW + minutes * 60000 }, { enabled: true });
  assert.equal(send(6.9, 1).emitted.length, 1); assert.equal(send(7.2, 18).emitted.length, 0); assert.equal(send(6.8, 20).emitted.length, 0);
  send(7.6, 21); assert.equal(send(6.8, 23).emitted.length, 1);
});
check('temporisation configurable : réarmement physique sans répétition avant échéance', () => {
  const m = c.W.monitor(), s = base(); m.ingest(s, { enabled: true });
  const send = (T, minutes) => m.ingest({ ...s, current: { ...s.current, T }, nowMs: NOW + minutes * 60000 }, { enabled: true, cooldownMin: 30 });
  send(6.9, 1); send(8, 2); assert.equal(send(6.8, 4).emitted.length, 0); send(8, 31); assert.equal(send(6.8, 32).emitted.length, 1);
});
check('permission indépendante : alertes OFF, cache et reconnexion ne notifient pas rétroactivement', () => {
  const m = c.W.monitor(), s = base(); m.ingest(s, { enabled: true });
  const cold = { ...s, current: { ...s.current, T: -1 }, fresh: false, mode: 'HORS LIGNE', nowMs: NOW + 60000 };
  assert.equal(m.ingest(cold, { enabled: true }).emitted.length, 0);
  assert.equal(m.ingest({ ...cold, fresh: true, mode: 'LIVE' }, { enabled: true }).emitted.length, 0);
  assert.equal(m.ingest({ ...s, current: { T: -2 } }, { enabled: false }).emitted.length, 0);
});
check('gel, rafales, pluie imminente et risque routier proviennent des données existantes', () => {
  const m = c.W.monitor(), s = base(); m.ingest(s, { enabled: true });
  const t = { ...s, nowMs: NOW + 60000, ice: 1, gust: 60, road: { score: 50, level: 2 }, timeline: s.timeline.map((x, i) => i === 1 ? { ...x, pp: 65 } : x) };
  const ids = m.ingest(t, { enabled: true }).emitted.map(x => x.id).sort(); assert.deepEqual(Array.from(ids), ['gust', 'ice', 'rain', 'road']);
});
check('l’écoulement du temps ou un téléchargement identique ne crée pas d’observation ni de révision', () => {
  const m = c.W.monitor(), s = base(); const first = m.ingest(s).events.length;
  assert.equal(m.ingest({ ...s, nowMs: NOW + 60000 }).events.length, first);
  assert.equal(m.ingest({ ...s, nowMs: NOW + 120000, fetchedAt: NOW + 120000 }).events.length, first);
  assert.equal(m.ingest({ ...s, now: '2026-10-12T09:00', hourTime: '2026-10-12T09:00', roadT: 2, nowMs: NOW + 3600000 }).events.length, first);
});
check('une révision compare une même échéance et est séparée d’une estimation', () => {
  const m = c.W.monitor(), s = base(); m.ingest(s);
  const t = { ...s, nowMs: NOW + 60000, fetchedAt: NOW + 60000, roadT: s.roadT + 1, timeline: s.timeline.map((x, i) => i === 1 ? { ...x, T: x.T + .8 } : x) };
  const r = m.ingest(t); assert(r.events.some(x => x.kind === 'prévision' && x.text.includes('09:00'))); assert(r.events.some(x => x.kind === 'estimation'));
  assert(!r.events.some(x => x.kind === 'observation'));
});
check('une station observée est datée et journalisée une seule fois par relevé', () => {
  const m = c.W.monitor(), s = { ...base(), observation: { id: 'TEST', name: 'Station fictive', t: '2026-10-12T06:00:00Z', T: 8, vis: 3000 } };
  assert.equal(m.ingest(s).events.filter(x => x.kind === 'observation').length, 1);
  assert.equal(m.ingest({ ...s, nowMs: NOW + 60000 }).events.filter(x => x.kind === 'observation').length, 1);
  assert.equal(m.ingest({ ...s, observation: { ...s.observation, t: '2026-10-12T06:15:00Z' } }).events.filter(x => x.kind === 'observation').length, 2);
});
check('changement de lieu : aucune comparaison de températures entre deux villes', () => {
  const m = c.W.monitor(), s = base(); m.ingest(s, { enabled: true });
  assert.equal(m.ingest({ ...s, key: 'other', current: { T: -5 } }, { enabled: true }).emitted.length, 0);
});
check('historique, alertes et nombre de lieux restent bornés pendant une longue session', () => {
  const m = c.W.monitor(), s = base(); let r;
  for (let k = 0; k < 20; k++) for (let i = 0; i < 150; i++) r = m.ingest({ ...s, key: String(k), mode: i % 2 ? 'CACHE' : 'LIVE', fresh: false, nowMs: NOW + i * 60000 });
  assert.equal(m.size(), 8); assert.equal(r.events.length, 60); assert(r.alerts.length <= 12);
});
check('champ manquant : aucun zéro ou franchissement fictif', () => {
  const m = c.W.monitor(), s = base(); m.ingest(s, { enabled: true });
  assert.equal(m.ingest({ ...s, current: { T: null }, vis: null, gust: null, ice: null }, { enabled: true }).emitted.length, 0);
});
check('moteur LIVE avec données partielles : aucun risque routier présenté comme calculé ou notifié', () => {
  const m = c.W.monitor(), s = base(); m.ingest(s, { enabled: true });
  assert.equal(m.ingest({ ...s, road: { level: 3, score: null, missing: ['vis'] } }, { enabled: true }).emitted.length, 0);
});
check('source horaire datée et mode CACHE canonique restent distincts d’une valeur actuelle fraîche', () => {
  const inputHourly = { ...input, cur: {} }, hourly = c.desk(inputHourly);
  const s = build({ input: inputHourly, desk: hourly, model: { ...model, mode: 'cache', cur: { time: '2026-10-12T05:00' } } });
  assert.equal(s.currentTime, '2026-10-12T08:00'); assert.equal(s.mode, 'CACHE'); assert.equal(s.fresh, false);
});
console.log(`${n}/${n} scénarios OK`);
