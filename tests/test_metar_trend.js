'use strict';
// Relevés METAR (relais et moteur de preuves) : seule la partie OBSERVÉE est une mesure. La tendance (TEMPO, BECMG, NOSIG,
// PROBxx, FM/TL/AT) et les remarques (RMK) sont des prévisions ou des notes. Rejeu du METAR public LFAQ du 18/11/2026 08:30 UTC
// (obs.json du relais) où « TEMPO … -TSRA BKN008 » était publié comme un orage observé ; points fictifs.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
// parseMetar (et ses aides) extraits de relay.js sans exécuter le relais (aucun réseau, aucun secret).
const relay = read('relay.js'), from = ['const METAR_TREND', 'function parseMetar'].map(k => relay.indexOf(k)).filter(i => i >= 0).sort((a, b) => a - b)[0];
const to = relay.indexOf('async function getJSON', from); assert(from >= 0 && to > from, 'parseMetar introuvable dans relay.js');
const rc = {}; vm.createContext(rc); vm.runInContext(relay.slice(from, to) + ';this.parse = parseMetar;', rc);
const P = raw => JSON.parse(JSON.stringify(rc.parse(raw)));
const ec = {}; vm.createContext(ec); vm.runInContext(read('evidence.js') + ';this.ev = evidenceEngine;', ec);
const NOW = Date.parse('2026-11-18T06:30:00Z'), HOME = { lat: 49.90, lon: 2.60 };   // point fictif, ≈ 10 km de la station
const clear = { T: 9, Td: 6, RH: 81, vis: 24000, wind: 9, gust: 15, code: 1, P: 0, Pl: 0, Tr: 9, ice: { level: 0 } };
const E = obs => JSON.parse(JSON.stringify(ec.ev({ now: NOW, points: [{ ...HOME, label: 'départ', t: '2026-11-18T07:30', ms: NOW, x: { ...clear } }],
  stations: [{ id: 'LFAQ', name: 'Albert-Bray', lat: 49.9715, lon: 2.6976, obs: [obs] }], reports: [], location: { trust: 'Confirmée' }, fresh: { modelAgeMin: 10 } })));
let n = 0; const check = (name, fn) => { fn(); n++; console.log('✅ ' + name); };

const REAL = 'METAR LFAQ 180830Z AUTO 24020KT 9999 FEW041/// SCT150/// ///TCU 10/08 Q0989 TEMPO VRB20G35KT 2500 -TSRA BKN008 BKN014CB';
check('rejeu LFAQ 18/11 08:30 : aucun orage observé (le « -TSRA » est dans la TEMPO), mesures de la partie observée conservées', () => {
  const o = P(REAL);
  assert.equal(o.wx, ''); assert.equal(o.vis, 10000); assert.equal(o.T, 10); assert.equal(o.Td, 8); assert.equal(o.wind, 37); assert.equal(o.gust, undefined); assert.equal(o.qnh, 989);
});
check('pluie observée gardée, orage de la tendance écarté', () => {
  assert.equal(P('METAR LFAQ 180730Z AUTO 25018KT 9999 -RA FEW030 BKN046 10/09 Q0988 TEMPO VRB20G35KT 2500 -TSRA BKN008').wx, '-RA');
});
check('TEMPO brouillard : ni brouillard, ni visibilité de 300 m attribués à l’observation', () => {
  const o = P('METAR XXXX 180600Z 22005KT 9999 FEW040 08/07 Q1020 TEMPO 0300 FG BKN002');
  assert.equal(o.wx, ''); assert.equal(o.vis, 10000);
});
check('BECMG, PROB, FM, NOSIG et RMK : seule la partie observée compte', () => {
  assert.deepEqual([P('METAR XXXX 180600Z 22005KT 6000 BR SCT010 08/07 Q1020 BECMG 9999 NSW').wx, P('METAR XXXX 180600Z 22005KT 6000 BR SCT010 08/07 Q1020 BECMG 9999 NSW').vis], ['BR', 6000]);
  assert.equal(P('METAR XXXX 180600Z 22005KT 9999 NSC 08/07 Q1020 PROB30 0500 FG').wx, '');
  assert.equal(P('METAR XXXX 180600Z 22005KT 9999 NSC 08/07 Q1020 NOSIG').wx, '');
  assert.equal(P('METAR XXXX 180600Z 22005KT CAVOK 08/07 Q1020 RMK FG BANK').wx, '');
});
check('sans tendance : décodage inchangé (incident réel du 05/10, brume observée)', () => {
  const o = P('METAR LFAQ 050430Z AUTO 33005KT 2100 BR FEW003 OVC140 08/08 Q1025');
  assert.deepEqual([o.wx, o.vis, o.T, o.Td, o.wind, o.qnh], ['BR', 2100, 8, 8, 9, 1025]);
});
check('moteur de preuves : nuages bas de la TEMPO jamais pris pour un plafond observé (aucun brouillard tiré de la prévision)', () => {
  const raw = 'METAR LFAQ 180600Z 22005KT 9999 FEW040 08/08 Q1020 TEMPO 0300 FG BKN002';
  const r = E({ t: '2026-11-18T06:00:00Z', ...P(raw), raw });
  assert.equal(r.worst.obsLv, 0, JSON.stringify(r.worst));
  const proof = JSON.stringify(r);
  assert(/nuages 4000 ft/.test(proof) && !/nuages 200 ft/.test(proof), 'plafond de la partie observée affiché');
});
check('moteur de preuves : nuages bas OBSERVÉS et air saturé → indice de brouillard conservé', () => {
  const raw = 'METAR LFAQ 180600Z 22003KT 3000 BR BKN002 08/08 Q1020 NOSIG';
  const r = E({ t: '2026-11-18T06:00:00Z', ...P(raw), raw });
  assert.equal(r.worst.obsLv, 2, JSON.stringify(r.worst));
});
console.log(`${n}/${n} scénarios OK`);
