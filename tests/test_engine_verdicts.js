// Scénarios métier du verdict GO / NO GO : chaque cas fige une vérité de sécurité, pas un score exact.
// Météo horaire construite à la main (aucun hasard, aucune horloge implicite) ; également utilisés par les contre-tests.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const sourcePath = path.join(__dirname, '../src/engine.js');
function runTests(source = fs.readFileSync(sourcePath, 'utf8'), options = {}) {
  const ctx = { Math, Date, Intl, Map, Set, JSON }; vm.createContext(ctx);
  vm.runInContext(source + '\nthis.E = { buildHours, windowAssess, hourVerdict, iceRisk, LV, makeModel, nowIn, validForecast, mergeArome };', ctx);
  const E = ctx.E;
  const GO = 0, CAUTION = 1, RISK = 2, NOGO = 3;
  // 24 h d'historique (inertie de la chaussée) puis 12 h évaluées ; `at(h)` décrit l'heure h (négative = passé).
  const FIELDS = { T: 'temperature_2m', RH: 'relative_humidity_2m', P: 'precipitation', snow: 'snowfall', code: 'weather_code',
    cloud: 'cloud_cover', vis: 'visibility', wind: 'wind_speed_10m', gust: 'wind_gusts_10m', rad: 'shortwave_radiation' };
  const BASE = { T: 15, RH: 70, P: 0, snow: 0, code: 3, cloud: 80, vis: 20000, wind: 10, gust: 20, rad: null };
  const hours = at => {
    const hourly = { time: [] }; Object.values(FIELDS).forEach(k => { hourly[k] = []; });
    for (let h = -24; h <= 12; h++) {
      const d = new Date(Date.UTC(2026, 0, 15, 8 + h));
      hourly.time.push(d.toISOString().slice(0, 13) + ':00');
      const x = { ...BASE, ...at(h) };
      for (const [k, name] of Object.entries(FIELDS)) hourly[name].push(x[k]);
    }
    return E.buildHours({ hourly });
  };
  const seq = (hs, n = 3) => Array.from({ length: n + 1 }, (_, k) => ({ hs, i: 24 + k }));
  const car = (type, extra = {}) => ({ id: type, short: type, sporty: false, tire: { type, size: '205/55 R16 91V', tread: null, ...extra } });
  const verdict = (type, at, opts = {}) => E.windowAssess(car(type, opts.tire), seq(hours(at), opts.n), opts.mode || 'trip');
  const level = (type, at, opts) => verdict(type, at, opts).level;
  const TYPES = ['summer', 'allseason', 'winter'];
  let count = 0;
  const test = (name, fn) => {
    try { fn(); } catch (error) { error.scenario = name; throw error; }
    count++; if (!options.quiet) console.log('✅ ' + name);
  };

  // — référence : aucune alerte inventée
  test('doux et sec : GO en pneus été et 4 saisons', () => {
    for (const type of ['summer', 'allseason']) assert.equal(level(type, () => ({})), GO, type);
  });
  test('doux et sec : pneus hiver jamais au-delà de CAUTION', () => assert(level('winter', () => ({})) <= CAUTION));
  test('sans pneus montés : aucun verdict', () => assert.equal(verdict('none', () => ({})), null));

  // — dangers absolus : quel que soit le pneu
  test('pluie verglaçante imminente : NO GO pour tous les pneus', () => {
    for (const type of TYPES) assert.equal(level(type, () => ({ T: -1, RH: 95, P: 0.4, code: 66 })), NOGO, type);
  });
  test('pluie verglaçante au-delà de 6 h : au moins HIGH RISK', () => {
    for (const type of TYPES) assert(level(type, h => h === 8 ? { T: -1, RH: 95, P: 0.4, code: 66 } : {}, { n: 10 }) >= RISK, type);
  });
  test('brouillard < 200 m : au moins HIGH RISK pour tous les pneus', () => {
    for (const type of TYPES) assert(level(type, h => h >= 0 ? { vis: 150, code: 45 } : {}) >= RISK, type);
  });
  test('rafales ≥ 90 km/h : au moins HIGH RISK pour tous les pneus', () => {
    for (const type of TYPES) assert(level(type, h => h >= 0 ? { gust: 95, wind: 50 } : {}) >= RISK, type);
  });

  // — pneus été : le cœur du risque
  const snow = () => ({ T: -1, RH: 95, P: 1, snow: 1.2, code: 73, cloud: 100 });
  test('neige : NO GO en pneus été', () => assert.equal(level('summer', snow), NOGO));
  test('neige : les pneus hiver restent sous NO GO', () => assert(level('winter', snow) < NOGO));
  test('neige : ordre de sécurité hiver ≥ 4 saisons ≥ été', () => {
    const s = type => verdict(type, snow).score;
    assert(s('winter') >= s('allseason') && s('allseason') >= s('summer'), [s('winter'), s('allseason'), s('summer')].join(' / '));
  });
  const rainOnFrozen = h => h < 0 ? { T: -3, RH: 80, cloud: 0, wind: 2 } : { T: 0.5, RH: 95, P: 0.6, code: 61, cloud: 100, wind: 5 };
  test('pluie sur chaussée gelée : verglas probable (≥ 70/100)', () => {
    const hs = hours(rainOnFrozen); assert(hs[24].Tr <= -0.5, 'chaussée ' + hs[24].Tr); assert(E.iceRisk(hs, 24).score >= 70, 'score ' + E.iceRisk(hs, 24).score);
  });
  test('pluie sur chaussée gelée : NO GO en pneus été', () => assert.equal(level('summer', rainOnFrozen), NOGO));
  const coldWet = () => ({ T: 2, RH: 95, P: 1, code: 61, cloud: 100 });
  test('froid humide (2 °C, pluie) : pneus été au moins HIGH RISK', () => assert(level('summer', coldWet) >= RISK));
  test('froid humide : ordre de sécurité hiver ≥ 4 saisons ≥ été', () => {
    const s = type => verdict(type, coldWet).score;
    assert(s('winter') >= s('allseason') && s('allseason') >= s('summer'), [s('winter'), s('allseason'), s('summer')].join(' / '));
  });
  test('pneus été : refroidir l’air n’améliore jamais le verdict (15 → −5 °C, sec)', () => {
    let prev = null;
    for (let T = 15; T >= -5; T--) {
      const w = verdict('summer', () => ({ T, RH: 60 }));
      if (prev) assert(w.score <= prev.score && w.level >= prev.level, `${T} °C : ${w.score} après ${prev.score}`);
      prev = w;
    }
  });
  test('pneus été : mouiller la chaussée froide n’améliore jamais le verdict', () => {
    const dry = verdict('summer', () => ({ T: 3, RH: 60 })), wet = verdict('summer', () => ({ T: 3, RH: 95, P: 1, code: 61 }));
    assert(wet.score <= dry.score, `${wet.score} > ${dry.score}`);
  });
  test('type de pneu inconnu : analysé aussi prudemment que des pneus été', () => {
    for (const at of [snow, rainOnFrozen, coldWet]) assert.equal(level('unknown', at), level('summer', at));
  });

  // — usure
  test('profondeur sous 1,6 mm : jamais GO', () => {
    for (const type of TYPES) assert(level(type, () => ({}), { tire: { tread: 1.4 } }) >= CAUTION, type);
  });
  test('profondeur < 3 mm sous la pluie : verdict jamais meilleur qu’avec une gomme neuve', () => {
    const rain = () => ({ T: 12, RH: 90, P: 5, code: 63, cloud: 100 });
    for (const type of TYPES) assert(verdict(type, rain, { tire: { tread: 2.5 } }).score <= verdict(type, rain, { tire: { tread: 7 } }).score, type);
  });

  // — cohérence du score et du niveau
  test('le score affiché reste dans la bande de son niveau', () => {
    const band = [[80, 100], [60, 79], [40, 59], [0, 39]];
    for (const at of [() => ({}), snow, rainOnFrozen, coldWet, () => ({ T: -1, code: 66, P: 0.4 }), () => ({ vis: 150 })])
      for (const type of TYPES) { const w = verdict(type, at), [lo, hi] = band[w.level]; assert(w.score >= lo && w.score <= hi, `${type} ${w.score} niveau ${w.level}`); }
  });
  test('trajet : la pire heure décide, même en fin de fenêtre', () => {
    const late = h => h === 3 ? snow() : {};
    assert.equal(level('summer', late), NOGO);
    assert(verdict('summer', late).kMax === 3);
  });
  test('verdict horaire cohérent avec le trajet d’une seule heure', () => {
    for (const at of [() => ({}), snow, coldWet]) {
      const hs = hours(at), one = E.windowAssess(car('summer'), [{ hs, i: 24 }], 'trip'), hv = E.hourVerdict(car('summer'), hs, 24);
      assert.equal(one.level, hv.level); assert.equal(one.score, hv.score);
    }
  });
  // — « maintenant » du modèle : jamais dans le passé à cause d'une réponse obsolète
  const shift = (ts, min) => new Date(Date.parse(ts + 'Z') + min * 60000).toISOString().slice(0, 16);
  // 48 h de données horaires autour de l'horloge, comme une vraie réponse
  const payloadAt = (cur, around = E.nowIn('Europe/Paris')) => { const time = [], temperature_2m = [], h0 = around.slice(0, 13) + ':00';
    for (let h = -24; h < 24; h++) { time.push(shift(h0, h * 60)); temperature_2m.push(10); } return { timezone: 'Europe/Paris', current: { time: cur }, hourly: { time, temperature_2m } }; };
  test('réponse live concordante : l’heure du fournisseur est retenue', () => {
    const now = E.nowIn('Europe/Paris'), cur = shift(now, -15);
    assert.equal(E.makeModel(payloadAt(cur), 'live', {}).nowStr, cur);
  });
  test('réponse live obsolète (3 h) : « maintenant » reste l’horloge', () => {
    const now = E.nowIn('Europe/Paris'), m = E.makeModel(payloadAt(shift(now, -180)), 'live', {});
    assert(Math.abs(Date.parse(m.nowStr + 'Z') - Date.parse(now + 'Z')) <= 60e3, m.nowStr + ' vs ' + now);
  });
  test('horloge de l’appareil hors des données (horloge aberrante) : l’heure du fournisseur est conservée', () => {
    const now = E.nowIn('Europe/Paris'), far = shift(now, 30 * 24 * 60), m = E.makeModel(payloadAt(far, far), 'live', {});
    assert.equal(m.nowStr, far); assert(m.nowI >= 0, 'index « maintenant » dans les données');
  });
  test('cache : « maintenant » est toujours l’horloge', () => {
    const now = E.nowIn('Europe/Paris'), m = E.makeModel(payloadAt(shift(now, -15)), 'cache', {});
    assert(Math.abs(Date.parse(m.nowStr + 'Z') - Date.parse(now + 'Z')) <= 60e3, m.nowStr + ' vs ' + now);
  });
  // — validation des réponses : une réponse inexploitable ne remplace jamais la dernière météo valide
  const good = () => { const time = [], t2 = []; for (let h = 0; h < 48; h++) { time.push(new Date(Date.UTC(2026, 9, 3, h)).toISOString().slice(0, 16)); t2.push(10 + h % 5); } return { hourly: { time, temperature_2m: t2 } }; };
  test('prévision complète : acceptée', () => assert.equal(E.validForecast(good()), null));
  test('réponses vides, tronquées ou d’un portail : refusées', () => {
    const cut = good(); cut.hourly.time = cut.hourly.time.slice(0, 10); cut.hourly.temperature_2m = cut.hourly.temperature_2m.slice(0, 10);
    const holes = good(); holes.hourly.temperature_2m = holes.hourly.temperature_2m.map((v, i) => i % 3 ? null : v);
    const order = good(); order.hourly.time[5] = order.hourly.time[4];
    const short = good(); short.hourly.temperature_2m.pop();
    for (const [what, p] of [['null', null], ['{}', {}], ['texte', '<html>'], ['heures vides', { hourly: { time: [] } }], ['10 h', cut], ['températures trouées', holes], ['heures non croissantes', order], ['colonne plus courte', short]])
      assert.notEqual(E.validForecast(p), null, what);
  });
  test('AROME malformé : ignoré sans casser la prévision de base', () => {
    const b = good(); E.mergeArome(b, { hourly: { time: 'x' } }); E.mergeArome(b, { hourly: { time: b.hourly.time, temperature_2m: null } });
    assert.equal(E.validForecast(b), null); assert.equal(b.hourly.temperature_2m[0], 10);
  });
  test('AROME : réponse de base intacte, quantité du modèle de base et source AROME conservées par heure (audit A03)', () => {
    const b = good(); b.hourly.precipitation = b.hourly.time.map(() => 0.8); b.hourly.precipitation_probability = b.hourly.time.map(() => 90);
    const before = JSON.stringify(b), t = b.hourly.time;
    const ar = { hourly: { time: t.slice(0, 6), precipitation: [0, 0, 0, 0, 0, 0], temperature_2m: [5, 5, 5, 5, 5, 5] } };
    const m = E.mergeArome(b, ar);
    assert.equal(JSON.stringify(b), before, 'la réponse de base (cache de requêtes) n’est jamais modifiée');
    assert.equal(m.hourly.precipitation[0], 0); assert.equal(m.hourly.precipitation_base[0], 0.8); assert.equal(m.hourly.precipitation_arome[0], 1);
    assert.equal(m.hourly.precipitation_base[10], null); assert.equal(m.hourly.precipitation_arome[10], 0); assert.equal(m.__arome.hours, 6);
    const hs = E.buildHours(m);
    assert.deepEqual([hs[0].P, hs[0].Pb, hs[0].ar, hs[0].pp], [0, 0.8, true, 90]); assert.deepEqual([hs[10].P, hs[10].Pb, hs[10].ar], [0.8, null, false]);
    const none = E.buildHours(E.mergeArome(good(), null)); assert.deepEqual([none[0].Pb, none[0].ar], [null, false]);
  });
  if (!options.quiet) console.log(count + '/' + count + ' scénarios OK');
  return count;
}
module.exports = { runTests, sourcePath };
if (require.main === module) runTests();
