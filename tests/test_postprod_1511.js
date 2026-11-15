'use strict';
// PR 4 « post-prod 15/11 » : une cause racine = un scénario (vidéo du 15/11/2026, prod-210), puis contre-tests (les régressions
// volontaires doivent être rejetées). Données entièrement fictives : « Voiture été », « Voiture hiver », « Station test (ZZZZ) ».
//   P1 alertes « voiture » limitées à la voiture évaluée (l'autre voiture nommée à part) · P2 briefing = verdict du trajet
//   P3 tuile gel = règle unique · P4 tendance = risque global, indice pneus nommé · P5 modèles en désaccord ⇒ VIGILANCE
//   P6 précipitation observée à la station, jamais masquée ni présentée comme locale · P7 formateur unique du jour relatif
//   C1 référence air/chaussée de la pression · C2 plage de gomme expliquée · C3 ressenti recalé comme la température
//   C4 périodes des minimums et maximums écrites.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const FILES = { engine: 'engine.js', app: 'app.js', f1: 'f1-pure.js', desk: 'wxdesk.js', race: 'app/race-views.js', wx: 'app/weather-view.js',
  station: 'app/weather-station.js', lab: 'tyrelab.js', analysis: 'app/analysis-view.js', rel: 'reliability.js' };
const SRC0 = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, read(f)]));
const grab = (s, re) => { const m = re.exec(s); if (!m) throw new Error('extrait introuvable : ' + re); return m[0]; };
const plain = v => JSON.parse(JSON.stringify(v));

function load(S) {
  const ctx = { Math, JSON, Date, Intl, Map, Set, Number, String, Array, Object, RegExp, console, Infinity, NaN, isNaN, parseFloat }; vm.createContext(ctx);
  // Moteur, F1Pure, Reliability et poste Météo entiers ; fonctions de l'app extraites telles quelles (aucune copie réécrite).
  const appFns = [
    /^function frostBand\(x\) \{[\s\S]*?\n\}/m, /^function tripRisk\(t\) \{[\s\S]*?\n\}/m, /^const CAR_TYPE_ALERTS = .*$/m, /^const carArt = .*$/m,
    /^function carScopedAlerts\([\s\S]*?\n\}/m, /^const otherCarText = .*$/m, /^const OBS_PRECIP_KM = .*$/m, /^function obsPrecip\([\s\S]*?\n\}/m,
    /^const tappNow = m => \{[\s\S]*?\n\};/m, /^function trendStore\(\) .*$/m, /^function trendOf\([\s\S]*?\n\}/m, /^function trendHtml\([\s\S]*?\n\}/m,
    /^const snapOf = .*\n.*$/m].map(re => grab(S.app, re)).join('\n')
    .replace("nowIn('Europe/Paris')", 'TEST_NOW()');   // horloge du test injectée dans trendOf (seul appel), rien d'autre n'est réécrit
  vm.runInContext(S.rel + '\n' + S.engine + '\n' + S.f1 + '\n' + S.desk + `
    const carProfile = c => ({ generic: false }); const esc = s => String(s);
    let CARS = []; const TCARS = () => CARS.filter(hasTires); const S = { alerts: { t5s: 1, snow: 1, t7: 1, t0: 1 } };
    let TREND = null, LS = {}; const lsGet = k => LS[k] ?? null, lsSet = (k, v) => { LS[k] = v; }; let NOW = '2026-11-15T07:18'; const TEST_NOW = () => NOW;
    ${appFns}
    this.X = { computeAlerts, carScopedAlerts, otherCarText, F1Pure, tripRisk, summarize, wxDesk, obsPrecip, tappNow, trendOf, trendHtml, snapOf, relDayFr, relHmFr,
      setCars: c => { CARS = c; }, setNow: n => { NOW = n; }, ls: () => LS, resetTrend: () => { TREND = null; LS = {}; } };`, ctx);
  return ctx.X;
}

// Heures fictives de la vidéo : 4 °C, chaussée estimée 3,1 °C, humide, couvert, sans pluie mesurable (heure locale Europe/Paris).
const hourAt = (t, x = {}) => ({ t, T: 4, Tapp: -1.1, Tr: 3.1, RH: 97, Td: 3.6, P: 0, Pl: 0, pp: 10, snow: 0, code: 3, vis: 20000, wind: 17, gust: 30, ice: { level: 0, score: 0 }, ...x });
const hoursFrom = (from, n, f = () => ({})) => Array.from({ length: n }, (_, k) => {
  const t = new Date(Date.parse(from + ':00Z') + k * 3600e3).toISOString().slice(0, 16); return hourAt(t, f(k, t)); });
const car = (id, type) => ({ id, short: id, name: id, tire: { type, brand: 'Marque test', model: 'Modèle test' } });

function scenarios(X, out) {
  let ok = 0; const t = (name, cond, detail = '') => { if (cond) ok++; else out.push(name + ' · ' + String(detail).slice(0, 400)); };
  const summer = car('Voiture été', 'summer'), winter = car('Voiture hiver', 'winter');
  X.setCars([winter, summer]);
  const model = { hs: hoursFrom('2026-11-15T07:00', 30), nowI: 0 };

  // ---------- P1 : verdict de la voiture évaluée ----------
  { const fleet = Object.values(X.computeAlerts(model, [winter, summer], { alerts: {} }, {}, 3));
    const byCar = { [winter.id]: X.computeAlerts(model, [winter], { alerts: {} }, {}, 3), [summer.id]: X.computeAlerts(model, [summer], { alerts: {} }, {}, 3) };
    const sc = X.carScopedAlerts(fleet, byCar, winter), ids = sc.alerts.map(a => a.id);
    t('P1 · reproduction : sur le garage entier, « < 5 °C avec pneus été » est bien en PRUDENCE', fleet.some(a => a.id === 't5s' && a.sev === 2), JSON.stringify(fleet));
    t('P1 · voiture hiver évaluée : l’alerte pneus été de l’autre voiture ne fixe plus son verdict', !ids.includes('t5s') && Math.max(0, ...sc.alerts.map(a => a.sev)) < 2, JSON.stringify(sc.alerts));
    t('P1 · l’autre voiture reste nommée : « Si tu prends la Voiture été : PRUDENCE · 4,0 °C avec pneus été »',
      sc.others.length === 1 && /^Si tu prends la Voiture été : PRUDENCE · 4,0 °C avec pneus été$/.test(X.otherCarText(sc.others[0])), JSON.stringify(sc.others.map(X.otherCarText)));
    const ss = X.carScopedAlerts(fleet, byCar, summer);
    t('P1 · voiture été évaluée : le risque qui la concerne n’est jamais masqué (PRUDENCE conservée)', ss.alerts.some(a => a.id === 't5s' && a.sev === 2) && !ss.others.length, JSON.stringify(ss));
    const none = X.carScopedAlerts(fleet, byCar, null);
    t('P1 · aucune voiture évaluée : alertes de tout le garage, inchangées', none.alerts === fleet && !none.others.length);
    const noTyre = X.carScopedAlerts(fleet, byCar, { id: 'Sans pneus', tire: {} });
    t('P1 · voiture sans pneus renseignés : prudence du garage entier conservée', noTyre.alerts === fleet);
    const snowModel = { hs: hoursFrom('2026-11-15T07:00', 30, k => k === 1 ? { snow: 0.5, code: 71 } : {}), nowI: 0 };
    const fleetS = Object.values(X.computeAlerts(snowModel, [winter, summer], { alerts: {} }, {}, 3));
    const byS = { [winter.id]: X.computeAlerts(snowModel, [winter], { alerts: {} }, {}, 3), [summer.id]: X.computeAlerts(snowModel, [summer], { alerts: {} }, {}, 3) };
    const sw = X.carScopedAlerts(fleetS, byS, winter), snowW = sw.alerts.find(a => a.id === 'snow');
    t('P1 · neige : la voiture hiver garde SON niveau (PRUDENCE), pas le DANGER calculé pour la voiture été', snowW && snowW.sev === 2 && sw.others.some(o => o.id === 'snow' && o.sev === 3), JSON.stringify(sw)); }

  // ---------- P2 : Ingénieur de course ----------
  { const e = X.F1Pure.raceEngineer({ decision: { displayLevel: 0, reason: 'risque global du trajet : aucune cause identifiée · indice pneus RAS', scope: 'trip' },
      confidence: { level: 0, label: 'SOLIDE' }, trip: { to: 'Lieu B', dep: '2026-11-16T06:30' }, car: winter, when: 'lun. 16/11 · 06:30' });
    t('P2 · trajet RAS : titre RAS (plus le PRUDENCE du bandeau) et portée écrite', e.title === 'RAS' && e.lines[0] === 'Verdict : risque global du trajet avec Voiture hiver', JSON.stringify(e));
    const i = X.F1Pure.raceEngineer({ decision: { displayLevel: 0, indet: true, reason: 'gel indéterminé : chaussée et air non fournis', scope: 'trip' }, confidence: { level: 0, label: 'SOLIDE' }, trip: { to: 'Lieu B' }, car: winter });
    t('P2 · trajet INDÉTERMINÉ : jamais lu comme RAS', i.title === 'INDÉTERMINÉ' && i.state === 'prudence' && /indéterminée/.test(i.action), JSON.stringify(i));
    const n = X.F1Pure.raceEngineer({ decision: { displayLevel: 2, reason: 'x', scope: 'now' }, confidence: { level: 0, label: 'SOLIDE' } });
    t('P2 · sans trajet analysé : le verdict « ici, maintenant » est nommé comme tel', n.title === 'PRUDENCE' && /ici, maintenant \(aucun trajet analysé\)/.test(n.lines[0]), JSON.stringify(n)); }

  // ---------- P3 : tuile gel ----------
  { const d = X.wxDesk(plain({ now: '2026-11-15T07:18', hours: hoursFrom('2026-11-15T07:00', 26), cur: {}, trips: [] })), ice = d.phen.find(p => p.id === 'ice');
    t('P3 · chaussée min 3,1 °C : la tuile dit la règle (« Pas de gel attendu (marge faible) »), jamais « Aucun risque estimé »',
      /^Pas de gel attendu \(marge faible\) · chaussée estimée min 3,1 °C vers 07:00$/.test(ice.line), ice.line);
    const d2 = X.wxDesk(plain({ now: '2026-11-15T07:18', hours: hoursFrom('2026-11-15T07:00', 26, () => ({ Tr: 6.5, T: 8 })), cur: {}, trips: [] }));
    t('P3 · chaussée min 6,5 °C : « Aucun risque de gel » (distinct de la marge faible)', /^Aucun risque de gel · chaussée estimée min 6,5 °C/.test(d2.phen.find(p => p.id === 'ice').line), d2.phen.find(p => p.id === 'ice').line);
    const d3 = X.wxDesk(plain({ now: '2026-11-15T07:18', hours: hoursFrom('2026-11-15T07:00', 26, k => k === 3 ? { T: null, Tr: null } : {}), cur: {}, trips: [] }));
    t('P3 · heure sans chaussée ni air : INDÉTERMINÉ conservé', /Gel INDÉTERMINÉ/.test(d3.phen.find(p => p.id === 'ice').line), d3.phen.find(p => p.id === 'ice').line); }

  // ---------- P4 : tendance de l'agenda ----------
  { X.resetTrend(); X.setNow('2026-11-15T07:18');
    const key = 'leg|2026-11-20T16:46|test', dep = '2026-11-20T16:46';
    // relevé ANTÉRIEUR (format d'avant la PR : pas de `g`), jamais réinterprété : indice pneus DANGER, probabilité 100 %.
    X.ls()['twrc.trend'] = JSON.stringify({ [key]: { dep, at: '2026-11-14T19:18', lv: 3, pp: 100, vis: 24000, tr: 8 } });
    const legacyBefore = X.ls()['twrc.trend'];
    const h = X.trendHtml(X.trendOf(key, dep, { lv: 0, pp: 79, vis: 24000, tr: 8, g: 1, gi: false }));
    t('P4 · reproduction corrigée : l’amélioration est celle de l’indice pneus, nommée ; le risque global actuel (VIGILANCE) est rappelé',
      /↗ indicateurs plus favorables/.test(h) && !/s’améliore/.test(h) && /indice pneus DANGER → RAS/.test(h) && /probabilité de pluie −21 pts/.test(h) && /risque global actuel : VIGILANCE/.test(h) && !/: DANGER → RAS/.test(h.replace('indice pneus DANGER', '')), h);
    t('P4 · relevé existant non modifié (aucune migration, aucune réécriture)', X.ls()['twrc.trend'] === legacyBefore);
    X.resetTrend(); X.ls()['twrc.trend'] = JSON.stringify({ [key]: { dep, at: '2026-11-15T06:00', lv: 2, pp: 10, vis: 24000, tr: 8, g: 1, gi: false } });
    const ty = X.trendHtml(X.trendOf(key, dep, { lv: 0, pp: 10, vis: 24000, tr: 8, g: 1, gi: false }));
    t('P4 · seul l’indice pneus change : « indice pneus : s’améliore », risque global inchangé rappelé', /↗ indice pneus : s’améliore/.test(ty) && /risque global inchangé : VIGILANCE/.test(ty), ty);
    X.resetTrend(); X.ls()['twrc.trend'] = JSON.stringify({ [key]: { dep, at: '2026-11-15T06:00', lv: 0, pp: 10, vis: 24000, tr: 8, g: 0, gi: false } });
    const g = X.trendHtml(X.trendOf(key, dep, { lv: 0, pp: 15, vis: 24000, tr: 8, g: 1, gi: false }));
    t('P4 · risque global RAS → VIGILANCE (pluie) avec indice pneus inchangé : « se dégrade · risque global RAS → VIGILANCE »', /↘ se dégrade/.test(g) && /risque global RAS → VIGILANCE/.test(g), g);
    X.resetTrend(); X.ls()['twrc.trend'] = JSON.stringify({ [key]: { dep, at: '2026-11-15T06:00', lv: 0, pp: 10, vis: 24000, tr: 8, g: 1, gi: false } });
    const st = X.trendHtml(X.trendOf(key, dep, { lv: 0, pp: 10, vis: 24000, tr: 8, g: 1, gi: false }));
    t('P4 · rien ne change : « conditions stables »', /conditions stables/.test(st), st);
    X.resetTrend(); X.ls()['twrc.trend'] = JSON.stringify({ [key]: { dep, at: '2026-11-15T06:00', lv: 0, pp: 10, vis: 24000, tr: 8, g: 0, gi: false } });
    const ind = X.trendHtml(X.trendOf(key, dep, { lv: 0, pp: 10, vis: 24000, tr: 8, g: 0, gi: true }));
    t('P4 · RAS → INDÉTERMINÉ : signalé comme une dégradation, jamais comme un RAS', /se dégrade/.test(ind) && /risque global RAS → INDÉTERMINÉ/.test(ind), ind);
    X.resetTrend(); X.ls()['twrc.trend'] = JSON.stringify({ [key]: { dep: '2026-11-20T16:30', at: '2026-11-15T06:00', lv: 3, pp: 100, vis: 24000, tr: 8 } });
    const before = X.ls()['twrc.trend'], inc = X.trendHtml(X.trendOf(key, dep, { lv: 0, pp: 10, vis: 24000, tr: 8, g: 0, gi: false }));
    t('P4 · horaire modifié : pas de comparaison entre fenêtres différentes, relevé intact', /horaire modifié/.test(inc) && X.ls()['twrc.trend'] === before, inc);
    const hs = hoursFrom('2026-11-20T16:00', 3, k => k === 1 ? { P: 0.2, Pl: 0.2 } : {}), seq = hs.map((x, i) => ({ hs, i })), sum = X.summarize(seq);
    const sn = X.snapOf([{ c: winter, w: { level: 0, worst: { parts: [] } } }], sum, seq);
    t('P4 · relevé de tendance : risque global de la même fenêtre (pluie 0,2 mm/h ⇒ VIGILANCE) à côté de l’indice pneus', sn.g === 1 && sn.lv === 0 && sn.gi === false, JSON.stringify(sn)); }

  // ---------- P5 : modèles en désaccord ----------
  { const split = { Pb: 2.3, Pl: 0, P: 0, ar: true }, D = X.F1Pure.rainDisagree;
    t('P5 · base 2,3 mm/h, AROME 0,0 mm/h (même heure, AROME frais) ⇒ désaccord matériel', D(split) === true);
    t('P5 · désaccord mineur (base 0,5 mm/h) : pas de VIGILANCE systématique', D({ Pb: 0.5, Pl: 0, ar: true }) === false);
    t('P5 · heure hors AROME (ar faux) : aucun désaccord inventé', D({ Pb: 2.3, Pl: 0 }) === false && D({ Pb: 2.3, Pl: 0, ar: false }) === false);
    t('P5 · AROME humide (0,3 mm/h) : la pluie prévue décide déjà, pas de double compte', D({ Pb: 2.3, Pl: 0.3, ar: true }) === false);
    const hs = hoursFrom('2026-11-16T06:00', 3, k => k === 0 ? { Pb: 2.3, ar: true } : {}), seq = hs.map((x, i) => ({ hs, i })), sum = X.summarize(seq);
    const r = X.tripRisk({ res: [{ c: winter, w: { level: 0, worst: { parts: [] } } }], sum, seq, worst: 0 });
    t('P5 · risque global du trajet : VIGILANCE « modèles en désaccord », valeurs et heure citées', r.lv === 1 && r.k === 'rain' && /modèles en désaccord \(base 2,3 mm\/h, AROME 0,0 mm\/h\) vers 06:00/.test(r.why), JSON.stringify(r));
    const r0 = X.tripRisk({ res: [{ c: winter, w: { level: 0, worst: { parts: [] } } }], sum, worst: 0 });
    t('P5 · sans fenêtre détaillée (seq absente) : aucun désaccord supposé', r0.lv === 0, JSON.stringify(r0));
    const tc = X.F1Pure.trackConditions(seq), lvTrack = Math.max(...tc.sectors.map(s => s.level));
    t('P5 · État de la route = risque global (même fenêtre, même règle)', lvTrack === 1 && tc.sectors.some(s => s.notes.includes('Pluie : modèles en désaccord')), JSON.stringify(tc));
    const d = X.wxDesk(plain({ now: '2026-11-15T07:18', hours: hoursFrom('2026-11-15T07:00', 26, k => k === 2 ? { Pb: 2.3, ar: true } : {}), cur: {}, trips: [] }));
    const rain = d.phen.find(p => p.id === 'rain');
    t('P5 · poste Météo : « pluie possible » en VIGILANCE avec « modèles en désaccord » (plus en vert)', rain.lv === 1 && /modèles en désaccord/.test(rain.detail.join(' ') + rain.line + JSON.stringify(d.matters)), JSON.stringify(rain)); }

  // ---------- P6 : observation de la station ----------
  { const now = Date.parse('2026-11-15T06:18:00Z'), o = (x = {}) => ({ id: 'ZZZZ', name: 'Station test', dist: 6, t: '2026-11-15T06:00:00Z', wx: '-DZ', ...x });
    const op = X.obsPrecip(o(), now);
    t('P6 · bruine fraîche à 6 km : VIGILANCE, écrite comme une observation DE LA STATION (heure de Paris)',
      op && op.sev === 1 && op.text === 'Observation à la station Station test (6 km, 07:00) : faible bruine', JSON.stringify(op));
    t('P6 · relevé de plus de 60 min : non représentatif, ignoré', X.obsPrecip(o({ t: '2026-11-15T05:00:00Z' }), now) === null);
    t('P6 · station au-delà de 25 km : aucune extrapolation géographique', X.obsPrecip(o({ dist: 30 }), now) === null);
    t('P6 · phénomène « au voisinage » (VC) : pas une précipitation sur la station', X.obsPrecip(o({ wx: 'VCSH' }), now) === null && X.obsPrecip(o({ wx: 'VCSHRA' }), now) === null);
    t('P6 · brouillard seul (BR) : pas une précipitation', X.obsPrecip(o({ wx: 'BR' }), now) === null);
    t('P6 · paliers : pluie verglaçante DANGER, neige PRUDENCE, pluie modérée PRUDENCE, pluie faible VIGILANCE',
      X.obsPrecip(o({ wx: '-FZRA' }), now).sev === 3 && X.obsPrecip(o({ wx: 'SN' }), now).sev === 2 && X.obsPrecip(o({ wx: 'RA' }), now).sev === 2 && X.obsPrecip(o({ wx: '-RA' }), now).sev === 1);
    const base = { now: '2026-11-15T07:18', hours: hoursFrom('2026-11-15T07:00', 26, k => k >= 7 && k <= 12 ? { P: 0.8, Pl: 0.8, pp: 90, code: 61 } : {}), cur: {}, trips: [] };
    const d = X.wxDesk(plain({ ...base, obs: op }));
    t('P6 · héros : la mesure passe avant la prévision et n’est jamais présentée comme locale',
      d.hero.lines[0] === 'Observation à la station Station test (6 km, 07:00) : faible bruine · mesure de la station, pas au lieu consulté' && /À PARTIR DE 14:00/.test(d.hero.title), JSON.stringify(d.hero));
    t('P6 · tuile Pluie : observation puis prévision, distinguées', /^Observation à la station Station test .* · prévision : /.test(d.phen.find(p => p.id === 'rain').line), d.phen.find(p => p.id === 'rain').line);
    const q = X.wxDesk(plain({ now: '2026-11-15T07:18', hours: hoursFrom('2026-11-15T07:00', 26), cur: {}, trips: [], obs: op }));
    t('P6 · sans phénomène prévu : « CONDITIONS NORMALES PRÉVUES », la mesure reste en tête', q.hero.title === 'CONDITIONS NORMALES PRÉVUES' && /^Observation à la station/.test(q.hero.lines[0]), JSON.stringify(q.hero));
    const q0 = X.wxDesk(plain({ now: '2026-11-15T07:18', hours: hoursFrom('2026-11-15T07:00', 26), cur: {}, trips: [] }));
    t('P6 · sans observation : titre inchangé', q0.hero.title === 'CONDITIONS NORMALES', q0.hero.title); }

  // ---------- P7 : jour relatif ----------
  { const R = X.relDayFr, H = X.relHmFr;
    t('P7 · aujourd’hui : heure seule', H('2026-11-15T22:00', '2026-11-15T07:18') === '22:00');
    t('P7 · lendemain : « demain 02:00 » ; forme courte « dem. »', H('2026-11-16T02:00', '2026-11-15T07:18') === 'demain 02:00' && R('2026-11-16T02:00', '2026-11-15', true) === 'dem.');
    t('P7 · autre jour : « ven. 20/11 16:46 »', H('2026-11-20T16:46', '2026-11-15T07:18') === 'ven. 20/11 16:46', H('2026-11-20T16:46', '2026-11-15T07:18'));
    t('P7 · passage à l’heure d’hiver (25/10/2026) : le lendemain reste « demain »', R('2026-10-25T01:00', '2026-10-24T23:30') === 'demain');
    t('P7 · passage à l’heure d’été (28/03/2027) et changement d’année : « demain »', R('2027-03-28T03:00', '2027-03-27') === 'demain' && R('2027-01-01T00:30', '2026-12-31T23:00') === 'demain');
    t('P7 · entrée invalide : jamais de jour inventé', R('', '2026-11-15') === '' && R('2026-11-16T02:00', '') === '');
    const d = X.wxDesk(plain({ now: '2026-11-15T20:30', hours: hoursFrom('2026-11-15T20:00', 26, k => k === 6 ? { P: 0.8, Pl: 0.8, pp: 90, code: 61 } : {}), cur: {}, trips: [] }));
    const moms = d.timeline.moments.filter(m => m.ts.slice(0, 10) === '2026-11-16');
    t('P7 · chronologie : « demain 02:00 », une seule fois le jour', moms.length > 0 && moms.every(m => /^demain \d\d:\d\d$/.test(m.t)), JSON.stringify(moms)); }

  // ---------- C3 : ressenti recalé comme la température ----------
  { const m = { hs: [hourAt('2026-11-15T07:00', { T: 6, Tapp: 2 })], nowI: 0, cur: { Tapp: 1.5 }, obs: { dT: 2 } };
    t('C3 · station +2,0 °C sur l’heure : ressenti du modèle décalé d’autant (2,0 → 4,0 °C)', X.tappNow(m) === 4, X.tappNow(m));
    t('C3 · sans station : ressenti du modèle inchangé (aucune autre formule)', X.tappNow({ ...m, obs: null }) === 2);
    t('C3 · décalage nul (vidéo : +0,0 °C) : −1,1 °C reste −1,1 °C', X.tappNow({ hs: [hourAt('2026-11-15T07:00')], nowI: 0, cur: {}, obs: { dT: 0 } }) === -1.1); }

  // ---------- C1, C2, C4 : libellés et périodes (sources) ----------
  { const S = X.__S;
    t('C1 · pression : la référence est nommée « air/chaussée », avec l’air et la chaussée', /À froid maintenant \(air\/chaussée ≈ \$\{r1\(eNow\.Tenv\)\} °C : air \$\{r1\(eNow\.Ta\)\} °C, chaussée estimée \$\{r1\(eNow\.Tr\)\} °C\)/.test(S.lab));
    t('C2 · gomme « supposée ambiante » : la plage est expliquée (incertitude prudente, pas une mesure)', /r\.phase === 'unknown'[^\n]*data-gum-band>Plage d’incertitude prudente, pas une mesure/.test(S.analysis));
    t('C4 · tuile Température : « min / max d’ici <fin de l’horizon> »', /min \$\{r0\(tmin\)\} \/ max \$\{r0\(tmax\)\} d’ici \$\{hmd\(endTs\)\}/.test(S.desk));
    t('C4 · calendrier des saisons et prévisions 7 jours : journée entière, nuit passée comprise', (S.app.match(/journée entière \(00 h–24 h, nuit passée comprise/g) || []).length === 2);
    t('P7 · vue Météo : aucun préfixe ajouté devant une heure déjà datée par le poste', !/const tday = /.test(S.wx) && /<time class="num">\$\{esc\(x\.t\)\}<\/time>/.test(S.wx));
    t('P2 · panneau et lecture vocale lisent la même décision du trajet (f1BriefDecision)', (S.race.match(/decision: f1BriefDecision\(/g) || []).length === 2);
    t('P1 · verdict et bandeaux passent par carScopedAlerts', /carScopedAlerts\(Object\.values\(CX\.alertsNow \|\| CX\.alerts \|\| \{\}\), CX\.alertsNowByCar, shownCar\)/.test(S.app) && /carScopedAlerts\(Object\.values\(alerts\), CX\.alertsByCar, appDisplayedCar\(\)\)/.test(S.app));
    t('P6 · alerte « pluie imminente » : la précipitation observée n’est plus masquée', /const op = obsPrecip\(m\.obs\);/.test(S.app) && /obs: DEMO\.on \|\| typeof obsPrecip !== 'function' \? null : obsPrecip\(m\.obs\)/.test(S.wx)); }
  return ok;
}
function run(S) { const X = load(S); X.__S = S; const out = []; const ok = scenarios(X, out); return { ok, out }; }

const base = run(SRC0);
base.out.forEach(x => console.log('❌ ' + x));
console.log(`${base.ok} contrôle(s) conforme(s) · ${base.out.length} écart(s)`);
if (base.out.length) process.exit(1);

// Contre-tests : chaque régression doit faire échouer au moins un contrôle.
const MUT = [
  { name: 'P1 · verdict sur le garage entier', f: 'app', from: 'if (!own) return { alerts: fleet, others: [] };', to: 'return { alerts: fleet, others: [] };' },
  { name: 'P1 · autre voiture tue', f: 'app', from: 'if (a && S.alerts[id] && Number.isFinite(a.sev) && a.sev > (mine ? mine.sev : 0))', to: 'if (false)' },
  { name: 'P2 · trajet INDÉTERMINÉ lu comme RAS', f: 'f1', from: "title: indet ? 'INDÉTERMINÉ' : risk == null", to: "title: risk == null" },
  { name: 'P3 · « Aucun risque estimé » rétabli', f: 'desk', from: ': quietFrostTxt() || ', to: ": 'Aucun risque estimé' || " },
  { name: 'P4 · tendance sur l’indice pneus présentée comme globale', f: 'app', from: "t: `indice pneus ${LV[r.lv].name} → ${LV[snap.lv].name}`, tyre: true", to: "t: `${LV[r.lv].name} → ${LV[snap.lv].name}`" },
  { name: 'P4 · comparaison malgré un horaire modifié', f: 'app', from: 'if (r.dep && dep && r.dep !== dep) return', to: 'if (false) return' },
  { name: 'P5 · modèle le plus rassurant retenu', f: 'f1', from: '&& x.Pb >= RAIN_STRONG_MMH &&', to: '&& x.Pb >= 99 &&' },
  { name: 'P5 · désaccord mineur en VIGILANCE', f: 'f1', from: '&& x.Pb >= RAIN_STRONG_MMH &&', to: '&& x.Pb >= RAIN_MMH &&' },
  { name: 'P5 · poste Météo resté vert', f: 'desk', from: 'lv: (pp != null && pp >= 60) || split ? 1 : 0', to: 'lv: pp != null && pp >= 60 ? 1 : 0' },
  { name: 'P6 · observation lointaine acceptée', f: 'app', from: 'const OBS_PRECIP_KM = 25;', to: 'const OBS_PRECIP_KM = 99;' },
  { name: 'P6 · voisinage (VC) pris pour une précipitation', f: 'app', from: "!/^VC/.test(t) && ", to: '' },
  { name: 'P6 · observation présentée comme locale', f: 'desk', from: ' · mesure de la station, pas au lieu consulté', to: '' },
  { name: 'P7 · « dem. demain » rétabli', f: 'desk', from: "return short ? 'dem.' : 'demain';", to: "return short ? 'dem.' : 'dem. demain';" },
  { name: 'P7 · écart de jours sensible au changement d’heure', f: 'desk', from: "Date.parse(d + 'T12:00:00Z')", to: "Date.parse(d + 'T00:30:00+02:00')" },
  { name: 'C3 · ressenti non recalé', f: 'app', from: 'Math.round((t + m.obs.dT) * 10) / 10 : t;', to: 't : t;' }
];
let rejected = 0;
for (const mu of MUT) {
  const S = { ...SRC0 }; if (!S[mu.f].includes(mu.from)) { console.log('❌ mutation introuvable : ' + mu.name); process.exit(1); }
  S[mu.f] = S[mu.f].split(mu.from).join(mu.to);
  let failed; try { failed = run(S).out.length > 0; } catch (e) { failed = true; }
  if (failed) { rejected++; console.log('✅ Contre-test rejeté : ' + mu.name); } else console.log('❌ Contre-test NON rejeté : ' + mu.name);
}
console.log(`✅ ${rejected}/${MUT.length} mutations rejetées (contre-tests)`);
if (rejected !== MUT.length) process.exit(1);
