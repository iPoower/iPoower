/* Domaine pur V1 : catalogue public + monte privée + météo déjà chargée -> preuves et règles explicables.
 * Aucune horloge implicite, mutation, persistance, requête, coefficient d'adhérence ou distance personnalisée.
 * Migration de lecture uniquement : l'ancien relevé reste un relevé de position inconnue, jamais une mesure de toutes les rainures.
 */
const TyreIntelligence = (() => {
  const SCHEMA = 1;
  const FACETS = { dryBraking: ['Freinage sec', 'm'], wetBraking: ['Freinage mouillé', 'm'],
    dryHandling: ['Tenue de route sèche', 's'], wetHandling: ['Tenue de route humide', 's'],
    aquaLongitudinal: ['Aquaplaning longitudinal', 'km/h'], aquaLateral: ['Aquaplaning transversal', 'm/s²'],
    cold: ['Comportement au froid', 'm'], noise: ['Bruit', 'dB'], comfort: ['Confort', 'points'],
    rollingResistance: ['Résistance au roulement', 'kg/t'], wear: ['Usure / kilométrage projeté', 'km'], snowBraking: ['Freinage neige', 'm'] };
  const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
  const obj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = v => typeof v === 'number' && Number.isFinite(v);
  const range = (v, a, b) => num(v) && v >= a && v <= b;
  const str = (v, n = 500) => typeof v === 'string' && v.length <= n;
  const keys = (v, names) => obj(v) && Object.keys(v).every(k => names.includes(k));
  const date = v => str(v, 10) && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
  const nullable = (v, fn) => v === null || fn(v);
  const safeTree = (v, depth = 0) => depth <= 16 && (!v || typeof v !== 'object' || Object.entries(v).every(([k, a]) => !['__proto__', 'prototype', 'constructor'].includes(k) && safeTree(a, depth + 1)));
  const normal = v => typeof v === 'string' ? v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s-]/g, '') : '';
  function model(catalog, tire) {
    if (!tire || !str(tire.brand) || !str(tire.model)) return null;
    // Seules les annotations de position AV/AR sont neutres, jamais une génération, SUV, homologation ou variante.
    const raw = tire.model.replace(/\s*\(AV\s*\+\s*AR\)\s*$/i, '');
    if (/[()]/.test(raw)) return null;
    return catalog.models.find(m => normal(m.brand) === normal(tire.brand) && [m.model, ...m.aliases].some(x => normal(x) === normal(raw))) || null;
  }
  function size(text) {
    const m = /^(\d{3})\/(\d{2})\s*(Z?R)\s*(\d{2})(?:\s+(\d{2,3})([A-Z]))?(?:\s+(XL))?(?:\s+(FP))?$/.exec(String(text || '').trim().toUpperCase());
    return m ? { dimension: `${m[1]}/${m[2]} R${m[4]}`, li: m[5] ? +m[5] : null, si: m[6] || null, xl: m[7] ? true : null, zr: m[3] === 'ZR' } : null;
  }
  function validate(c) {
    try {
      if (!safeTree(c) || !keys(c, ['schemaVersion', 'revision', 'reviewedOn', 'models', 'tests']) || c.schemaVersion !== SCHEMA || !Number.isSafeInteger(c.revision) || c.revision < 1 || !date(c.reviewedOn)) return false;
      if (!Array.isArray(c.models) || c.models.length > 500 || !Array.isArray(c.tests) || c.tests.length > 2000) return false;
      const ids = new Set(), rows = new Set();
      for (const m of c.models) {
        if (!keys(m, ['id', 'brand', 'model', 'aliases', 'type', 'gap']) || !str(m.id, 100) || !m.id || ids.has(m.id) || !str(m.brand, 100) || !m.brand || !str(m.model, 150) || !m.model ||
          !Array.isArray(m.aliases) || m.aliases.length > 20 || !m.aliases.every(x => str(x, 150)) || !['summer', 'winter', 'allseason'].includes(m.type) || !nullable(m.gap, x => str(x))) return false;
        ids.add(m.id);
      }
      const aliases = c.models.flatMap(m => [...new Set([m.model, ...m.aliases].map(x => normal(m.brand) + '|' + normal(x)))]);
      if (new Set(aliases).size !== aliases.length) return false;
      for (const t of c.tests) {
        if (!keys(t, ['id', 'testId', 'modelId', 'size', 'variant', 'loadIndex', 'speedIndex', 'xl', 'homologation', 'tyreState', 'treadMm', 'airC', 'roadC', 'track', 'source', 'vehicle', 'metrics', 'limitations']) ||
          !str(t.id, 100) || !t.id || rows.has(t.id) || !str(t.testId, 100) || !t.testId || !ids.has(t.modelId) || !size(t.size)) return false;
        rows.add(t.id);
        const parsed = size(t.size);
        if (parsed.li !== null && parsed.li !== t.loadIndex || parsed.si !== null && parsed.si !== t.speedIndex || parsed.xl !== null && parsed.xl !== t.xl) return false;
        if (!['variant', 'homologation', 'vehicle', 'track'].every(k => nullable(t[k], x => str(x, 240))) || !nullable(t.xl, x => typeof x === 'boolean') ||
          !nullable(t.loadIndex, x => Number.isInteger(x) && range(x, 40, 150)) || !nullable(t.speedIndex, x => /^[A-Z]$/.test(x)) ||
          !nullable(t.tyreState, x => ['new', 'worn', 'other'].includes(x)) || !nullable(t.treadMm, x => range(x, 0, 20)) || !['airC', 'roadC'].every(k => nullable(t[k], x => range(x, -80, 100)))) return false;
        const s = t.source;
        if (!keys(s, ['organisation', 'url', 'primary', 'year', 'publishedOn', 'checkedOn']) || !str(s.organisation, 100) || !str(s.url, 1200) || s.primary !== true || !Number.isInteger(s.year) || !range(s.year, 1980, 2200) || !nullable(s.publishedOn, date) || !date(s.checkedOn)) return false;
        const u = new URL(s.url);
        if (u.protocol !== 'https:' || u.username || u.password || !['www.adac.de', 'www.tyrereviews.com', 'www.autobild.de', 'www.oeamtc.at', 'www.tcs.ch'].includes(u.hostname)) return false;
        if (!Array.isArray(t.limitations) || t.limitations.length > 20 || !t.limitations.every(x => str(x, 600)) || !Array.isArray(t.metrics) || t.metrics.length > 40) return false;
        for (const m of t.metrics) {
          if (!keys(m, ['id', 'value', 'unit', 'rank', 'count', 'protocol', 'startKmh', 'endKmh', 'temperatureC', 'temperatureKind', 'surface', 'waterMm', 'kind']) || !own(FACETS, m.id) ||
            !nullable(m.value, x => range(x, 0, 1000000)) || !nullable(m.unit, x => x === FACETS[m.id][1]) || m.value !== null && m.unit === null || !str(m.protocol, 500) || !m.protocol ||
            !nullable(m.count, x => Number.isInteger(x) && range(x, 1, 1000)) || !nullable(m.rank, x => Number.isInteger(x) && range(x, 1, m.count || 0)) ||
            !['startKmh', 'endKmh'].every(k => nullable(m[k], x => range(x, 0, 400))) || m.endKmh !== null && (m.startKmh === null || m.endKmh >= m.startKmh) ||
            !nullable(m.temperatureC, x => Array.isArray(x) && x.length === 2 && x.every(n => range(n, -80, 100)) && x[0] <= x[1]) || !nullable(m.temperatureKind, x => ['air', 'road', 'unspecified'].includes(x)) ||
            !nullable(m.surface, x => str(x, 80)) || !nullable(m.waterMm, x => range(x, 0, 100)) || !['measured', 'subjective', 'projection'].includes(m.kind)) return false;
        }
      }
      return true;
    } catch (e) { return false; }
  }
  function comparable(tire, test, catalog) {
    const m = model(catalog, tire), d = size(tire && tire.size), td = size(test.size);
    if (!m || test.modelId !== m.id) return { kind: 'insufficient', quality: 'indisponible', reasons: ['Le modèle exact ne correspond pas.'] };
    const reasons = [], variantMismatch = tire.variant && test.variant && normal(tire.variant) !== normal(test.variant) || tire.homologation && test.homologation && normal(tire.homologation) !== normal(test.homologation);
    if (variantMismatch) return { kind: 'indirect', quality: 'faible', reasons: ['Variante ou homologation différente : aucune transposition.'] };
    if (!!tire.homologation !== !!test.homologation) return { kind: 'indirect', quality: 'faible', reasons: ['Homologation non confirmée dans les deux références : aucune correspondance exacte affirmée.'] };
    if (!d || !td) return { kind: 'indirect', quality: 'faible', reasons: ['Dimension de la monte non vérifiable.'] };
    if (d.dimension !== td.dimension) reasons.push(`Dimension différente : essai ${test.size}, monte ${tire.size}.`);
    const indicesKnown = [d.li, d.si, d.xl, test.loadIndex, test.speedIndex, test.xl].every(x => x !== null);
    const indicesEqual = indicesKnown && d.li === test.loadIndex && d.si === test.speedIndex && d.xl === test.xl;
    if (!indicesKnown) reasons.push('Indices ou renfort non documentés dans les deux références.');
    else if (!indicesEqual) reasons.push('Indices de charge/vitesse ou renfort différents.');
    const variantsKnown = str(tire.variant, 240) && !!tire.variant && str(test.variant, 240) && !!test.variant;
    if (!variantsKnown) reasons.push('Variante exacte non confirmée.');
    if (d.dimension !== td.dimension) return { kind: 'same-model', quality: 'faible', reasons };
    if (!indicesEqual || !variantsKnown) return { kind: 'indirect', quality: 'faible', reasons };
    const complete = !!test.vehicle && test.tyreState !== null && test.airC !== null && test.roadC !== null && test.metrics.filter(x => /Braking$/.test(x.id) && x.value !== null).every(x => x.startKmh !== null && x.endKmh !== null);
    return { kind: 'exact', quality: complete ? 'élevée' : 'moyenne', reasons: ['Dimension et variante identiques.', ...(complete ? [] : ['Conditions ou état initial partiellement documentés.'])] };
  }
  const age = (d, now) => date(d) && date(now) ? Math.floor((Date.parse(now) - Date.parse(d)) / 864e5) : null;
  function readings(tire, today) {
    const mm = v => num(v) ? v : typeof v === 'string' && /^\d+(?:[.,]\d+)?$/.test(v.trim()) ? Number(v.trim().replace(',', '.')) : NaN;
    const history = (Array.isArray(tire.treads) ? tire.treads : []).filter(r => obj(r) && range(mm(r.mm), 0, 20)).map((r, i) => ({
      id: 'history-' + i, mm: mm(r.mm), date: date(r.d) ? r.d : null, ageDays: age(r.d, today), axle: r.ax || 'unknown',
      position: r.pos || 'unknown', wheel: r.wheel || null, estimated: !!r.est, source: r.est ? 'USER_ESTIMATED' : 'USER_MEASURED', km: num(r.km) ? r.km : null
    }));
    // Pas de profondeur arrière copiée à l'avant. L'ancien scalaire est affiché une seule fois, portée inconnue.
    const current = ['Av', 'Ar'].some(k => range(mm(tire['tread' + k]), 0, 20))
      ? ['Av', 'Ar'].filter(k => range(mm(tire['tread' + k]), 0, 20)).map(k => ({ axle: k === 'Av' ? 'av' : 'ar', mm: mm(tire['tread' + k]) }))
      : range(mm(tire.tread), 0, 20) ? [{ axle: 'unknown', mm: mm(tire.tread) }] : [];
    for (const c of current) {
      const match = history.filter(h => (h.axle === c.axle || h.axle === 'both') && h.mm === c.mm && h.estimated === !!tire.treadEst && h.ageDays !== null && h.ageDays >= 0).sort((a, b) => b.date.localeCompare(a.date))[0];
      Object.assign(c, { date: match ? match.date : null, ageDays: match ? match.ageDays : null, estimated: !!tire.treadEst, position: 'unknown', source: tire.treadEst ? 'USER_ESTIMATED' : 'USER_MEASURED' });
    }
    return { schemaVersion: 1, current, history, min: current.length ? Math.min(...current.map(x => x.mm)) : null,
      coverage: 'Valeurs limitées aux points renseignés : aucune couverture de toutes les rainures ou des deux roues déduite.', notes: typeof tire.info === 'string' ? tire.info : null };
  }
  function analyse(input, supplied = TYRE_TEST_EVIDENCE) {
    const c = validate(supplied) ? supplied : { schemaVersion: 1, revision: 0, reviewedOn: null, models: [], tests: [] };
    const car = input.car || {}, t = car.tire || {}, today = input.today || null, active = ['summer', 'winter', 'allseason'].includes(t.type);
    const m = active ? model(c, t) : null, rows = m ? c.tests.filter(x => x.modelId === m.id).map(test => ({ test, comparison: comparable(t, test, c) })) : [];
    const facts = readings(t, today), pc = obj(t.pchk) ? t.pchk : {}, pressureAge = age(pc.date, today);
    const pressure = { target: t.press || null, date: date(pc.date) ? pc.date : null, ageDays: pressureAge,
      av: range(pc.av, 0, 6) ? pc.av : null, ar: range(pc.ar, 0, 6) ? pc.ar : null,
      recent: pressureAge !== null && pressureAge >= 0 && pressureAge <= 30, source: 'USER_ENTERED' };
    const weather = input.weather || {}, samples = Array.isArray(weather.samples) ? weather.samples : [];
    const fresh = num(weather.ageMin) && weather.ageMin >= 0 && weather.ageMin <= 60;
    const valid = samples.filter(x => obj(x) && typeof x.t === 'string' && x.t.length >= 16 && (num(x.T) || num(x.P) || num(x.Pl) || num(x.snow) || num(x.Tr)));
    const wet = valid.filter(x => (num(x.Pl) ? x.Pl : num(x.P) ? x.P : 0) > 0);
    const frost = valid.filter(x => num(x.T) && x.T <= 0 || num(x.Tr) && x.Tr <= 0);
    const wx = { ...weather, samples: valid, fresh, rainPossible: wet.length > 0, frostPossible: frost.length > 0, roadState: 'unknown' };
    const rules = [];
    const rule = (id, state, text, triggers, sources, uncertainties = []) => rules.push({ id, state, text, triggers, sources, date: today, uncertainties });
    const evidenceSources = rows.map(x => ({ kind: 'published', url: x.test.source.url, date: x.test.source.publishedOn, checkedOn: x.test.source.checkedOn }));
    rule('evidence-coverage', rows.length ? 'Information' : 'Données insuffisantes', rows.length ? `${rows.length} essai(s) documenté(s) du modèle ; consulter dimensions et protocoles.` : (m && m.gap || 'Données d’essais insuffisantes pour le modèle exact monté.'),
      { model: m && m.model, mounted: active }, evidenceSources, ['Aucune adhérence instantanée mesurée ; aucune distance personnalisée calculée.']);
    if (!active) rule('no-mounted-tyre', 'Données insuffisantes', 'Aucune monte active confirmée : un projet hiver ne remplace jamais les pneus montés.', { type: t.type || null }, [{ kind: 'user', date: null }]);
    if (!valid.length || !fresh) rule('weather-missing', 'Données insuffisantes', valid.length ? 'Météo ancienne ou fraîcheur inconnue : contexte actuel à confirmer.' : 'Météo du contexte indisponible.',
      { ageMin: num(weather.ageMin) ? weather.ageMin : null, samples: valid.length }, [{ kind: 'weather', source: weather.source || null, date: weather.fetchedAt || null }], ['Aucun état sec, mouillé ou gelé de la route déduit avec certitude.']);
    if (active && fresh && wet.length) {
      rule('rain-context', 'Vigilance', 'Précipitations prévues : consulter séparément freinage mouillé et aquaplaning. Adapter allure et distances aux conditions observées.',
        { times: wet.map(x => x.t), maxMmH: Math.max(...wet.map(x => num(x.Pl) ? x.Pl : num(x.P) ? x.P : 0)), measuredDepths: facts.current },
        [{ kind: 'weather', source: weather.source || null, date: weather.fetchedAt || null }, ...evidenceSources], ['Une prévision de pluie ne prouve ni la présence ni l’épaisseur d’eau sur la chaussée.', 'Résultats d’essais non extrapolés aux sculptures actuelles.']);
      if (facts.min !== null && facts.min < 3) rule('wet-shallow-tread', 'Vigilance', 'Profondeur renseignée inférieure au repère de vigilance de 3 mm et pluie prévue : contrôler les rainures et redoubler de prudence.',
        { thresholdMm: 3, policy: 'Repère d’entretien interne ; aucune conversion en perte d’adhérence', readings: facts.current }, [{ kind: 'user', date: facts.current.find(x => x.mm === facts.min).date }, { kind: 'weather', source: weather.source || null, date: weather.fetchedAt || null }], ['La profondeur n’est connue qu’aux points renseignés ; aucune distance de freinage déduite.']);
    }
    if (active && fresh && frost.length) rule('cold-context', 'Vigilance', 'Températures proches du gel ou négatives dans les prévisions : vérifier les conditions locales. Le gel de la chaussée n’est pas établi par la seule température de l’air.',
      { points: frost.map(x => ({ t: x.t, airC: num(x.T) ? x.T : null, roadEstimatedC: num(x.Tr) ? x.Tr : null })) }, [{ kind: 'weather', source: weather.source || null, date: weather.fetchedAt || null }], ['Aucun seuil universel de perte d’adhérence à 7 °C.', 'Comportement au froid propre au modèle non déterminé hors essais documentés.']);
    if (active && !facts.current.length) rule('depth-missing', 'Données insuffisantes', 'Aucune profondeur de sculpture renseignée pour la monte active : mesurer les rainures et préciser leur portée.',
      { readings: [] }, [{ kind: 'user', date: null }], ['Une absence de mesure ne permet aucune conclusion sur la conformité des pneus.']);
    if (facts.current.some(x => x.ageDays === null || x.ageDays > 60 || x.ageDays < 0)) rule('depth-age', 'Données insuffisantes', 'Mesure de sculpture ancienne ou date non vérifiable : les valeurs affichées ne sont pas une observation en temps réel.',
      { readings: facts.current }, [{ kind: 'user', date: null }]);
    if (!pressure.recent || pressure.av === null || pressure.ar === null) rule('pressure-check', 'Données insuffisantes', 'Pression réelle récente non documentée pour les deux essieux : contrôler à froid. La cible recommandée n’est pas une mesure.',
      { pressure }, [{ kind: 'user', date: pressure.date }]);
    if (active && facts.min !== null && facts.current.some(x => !x.estimated && x.mm < 1.6)) rule('critical-depth', 'Risque documenté', 'Sculpture mesurée sous 1,6 mm : faire remplacer les pneus concernés avant de circuler.',
      { readings: facts.current.filter(x => !x.estimated && x.mm < 1.6), thresholdMm: 1.6 }, [{ kind: 'user', date: facts.current.find(x => !x.estimated && x.mm < 1.6).date }], ['Portée limitée aux points mesurés ; les autres points peuvent être plus usés.']);
    if (active && facts.current.some(x => x.estimated && x.mm < 1.6)) rule('estimated-critical-depth', 'Vigilance', 'Sculpture estimée sous 1,6 mm : vérifier à la jauge avant de circuler ; une estimation ne prouve pas la conformité.',
      { readings: facts.current.filter(x => x.estimated && x.mm < 1.6), thresholdMm: 1.6 }, [{ kind: 'user', date: facts.current.find(x => x.estimated && x.mm < 1.6).date }], ['Estimation utilisateur, sans diagnostic de non-conformité mesuré.', 'Le seuil de 3 mm reste un repère interne distinct du minimum réglementaire.']);
    const facets = Object.entries(FACETS).map(([id, [label]]) => ({ id, label, results: rows.flatMap(({ test, comparison }) => test.metrics.filter(x => x.id === id && x.value !== null).map(metric => ({ test, metric, comparison }))) }));
    // La météo sélectionne les disciplines pertinentes DU modèle, sans extrapoler leurs valeurs au véhicule.
    if (active && fresh && wet.length) {
      const missing = [];
      for (const f of facets.filter(x => ['wetBraking', 'aquaLongitudinal', 'aquaLateral'].includes(x.id))) {
        if (!f.results.length) { missing.push(f.label); continue; }
        rule('rain-evidence-' + f.id, 'Information', `${f.label} documenté pour ce modèle : ${f.results.map(x => `${String(x.metric.value).replace('.', ',')} ${x.metric.unit} · ${x.test.source.organisation} ${x.test.source.year} · ${x.test.size}`).join(' ; ')}. Valeurs historiques du protocole, non prédictions pour ce véhicule.`,
          { forecastTimes: wet.map(x => x.t), evidence: f.results.map(x => ({ testId: x.test.testId, value: x.metric.value, unit: x.metric.unit, protocol: x.metric.protocol, comparison: x.comparison.kind, quality: x.comparison.quality })) },
          f.results.map(x => ({ kind: 'published', url: x.test.source.url, date: x.test.source.publishedOn })),
          ['Aucune conversion selon la profondeur actuelle ; consulter dimension, variante et conditions de chaque essai.']);
      }
      if (missing.length) rule('rain-evidence-gap', 'Données insuffisantes', 'Preuves manquantes pour ce modèle : ' + missing.join(', ') + '. Une discipline ne remplace pas les autres.', { missing, forecastTimes: wet.map(x => x.t) }, evidenceSources);
    }
    if (active && fresh && frost.length && !facets.find(x => x.id === 'cold').results.length) rule('cold-evidence-gap', 'Données insuffisantes', 'Les essais disponibles ne caractérisent pas le freinage de ce modèle au froid dans les conditions prévues.',
      { airC: frost.map(x => x.T ?? null), roadEstimatedC: frost.map(x => x.Tr ?? null) }, evidenceSources, ['Ne pas assimiler un essai sec à 8–9 °C à un essai sur chaussée froide et mouillée.']);
    const pressureTargets = /([0-9]+(?:[.,][0-9]+)?)\s*(?:bar\s*)?AV\b[^]*?([0-9]+(?:[.,][0-9]+)?)\s*(?:bar\s*)?AR\b/i.exec(String(t.press || ''));
    const below = pressureTargets && pressure.recent ? ['av', 'ar'].filter((k, i) => pressure[k] !== null && pressure[k] < Number(pressureTargets[i + 1].replace(',', '.'))) : [];
    if (active && below && below.length) rule('pressure-target-gap', 'Vigilance', 'Une pression mesurée est inférieure à la cible saisie : vérifier à froid selon la plaque et la charge du véhicule.',
      { axles: below, pressure, targetText: t.press }, [{ kind: 'user', date: pressure.date }], ['Température, charge et précision du manomètre peuvent limiter cette comparaison ; aucune adhérence calculée.']);
    if (active && pressure.recent && [pressure.av, pressure.ar].some(x => x === 0)) rule('zero-pressure', 'Risque documenté', 'Le dernier contrôle consigne une pression de 0 bar : vérifier la mesure et faire intervenir un professionnel avant de circuler.',
      { pressure }, [{ kind: 'user', date: pressure.date }], ['Il s’agit du contrôle daté saisi, sans capteur temps réel.']);
    if (active && !pressure.recent && [pressure.av, pressure.ar].some(x => x === 0)) rule('historical-zero-pressure', 'Vigilance', 'Un relevé de fraîcheur non vérifiable indique 0 bar : vérifier la pression à froid avant de conclure sur l’état actuel.',
      { pressure }, [{ kind: 'user', date: pressure.date }], ['Valeur historique ou date non vérifiable ; aucune pression actuelle de 0 bar affirmée.']);
    // Valeurs contradictoires pour le MÊME essai et protocole : aucune moyenne ni choix silencieux.
    const conflicts = [];
    for (const f of facets) { const groups = new Map(); for (const r of f.results) { const t = r.test, m = r.metric;
      const key = JSON.stringify([t.testId, t.size, t.variant, t.loadIndex, t.speedIndex, t.xl, t.homologation, t.vehicle, t.airC, t.roadC, t.tyreState, t.treadMm, m.protocol, m.unit, m.startKmh, m.endKmh, m.temperatureC, m.temperatureKind, m.surface, m.waterMm]);
      const a = groups.get(key) || []; a.push(r); groups.set(key, a); }
      for (const a of groups.values()) if (new Set(a.map(x => x.metric.value)).size > 1) conflicts.push({ facet: f.id, tests: a.map(x => x.test.id) }); }
    if (conflicts.length) rule('source-conflict', 'Données insuffisantes', 'Sources contradictoires pour un même protocole : résultats conservés séparément, conclusion suspendue.', { conflicts }, evidenceSources);
    const planModel = car.plan && car.plan.on ? model(c, car.plan) : null;
    const planned = planModel ? { model: planModel, size: car.plan.size || null, status: 'planned', tests: c.tests.filter(x => x.modelId === planModel.id).map(test => ({ test, comparison: comparable(car.plan, test, c) })) } : null;
    const qualities = rows.map(x => x.comparison.quality), quality = conflicts.length ? 'faible' : qualities.includes('élevée') ? 'élevée' : qualities.includes('moyenne') ? 'moyenne' : qualities.length ? 'faible' : 'indisponible';
    // Synthèse indépendante : une mesure manquante ne transforme pas un essai publié en essai absent.
    // Les règles de risque et de vigilance restent prioritaires, même lorsque les preuves sont indirectes.
    const measurementRuleIds = rules.filter(x => ['depth-missing', 'depth-age', 'pressure-check'].includes(x.id)).map(x => x.id);
    const weatherMissing = rules.some(x => x.id === 'weather-missing');
    const risk = rules.some(x => x.state === 'Risque documenté'), caution = rules.some(x => x.state === 'Vigilance');
    const overview = {
      safety: risk ? 'Risque documenté' : caution ? 'Vigilance' : weatherMissing || !active ? 'Évaluation limitée' : 'Aucune alerte déclenchée',
      evidence: !active ? 'Monte active non confirmée' : conflicts.length ? 'Essais contradictoires' : !rows.length ? 'Essais indisponibles' :
        rows.some(x => x.comparison.kind === 'exact') ? 'Preuves directes pour la monte' : 'Essais du même modèle, non directement transposables',
      measurements: measurementRuleIds.length ? `À vérifier (${measurementRuleIds.length})` : 'Aucune lacune détectée',
      weather: weatherMissing ? 'Contexte à vérifier' : 'Prévisions récentes',
      measurementRuleIds
    };
    const status = risk ? 'Risque documenté' : caution ? 'Vigilance' :
      measurementRuleIds.length || weatherMissing || !rows.length || conflicts.length || !active ? 'Analyse limitée' : 'Information';
    return { schemaVersion: SCHEMA, catalogRevision: c.revision, reviewedOn: c.reviewedOn, active, model: m, title: [t.brand, t.model].filter(Boolean).join(' ') || 'Modèle non renseigné', size: t.size || null,
      facts, pressure, dot: t.dot || null, weather: wx, tests: rows, facets, rules, conflicts, planned, quality, overview,
      qualityReasons: [...new Set(rows.flatMap(x => x.comparison.reasons))], status };
  }
  return Object.freeze({ SCHEMA, FACETS, validate, model, size, comparable, readings, analyse });
})();
