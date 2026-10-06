/* Débrief d'arrivée : instantané immuable d'un trajet clos + ressenti du conducteur.
 * Module pur : aucun DOM, réseau, horloge ni stockage direct (now et le texte stocké sont passés en paramètres).
 * Ne possède ni le trajet, ni la localisation, ni la météo : il consomme l'instantané transmis par closeTrip().
 * Confidentialité : liste blanche stricte. Jamais de coordonnées, de titre d'événement ni d'adresse.
 */
const Debrief = (() => {
  const KEY = 'twrc.debrief.v1', V = 1;
  const CARD_MS = 2 * 3600e3;          // carte visible dans Pneus
  const UNDO_MS = 10 * 60e3;           // même fenêtre que « Annuler l'arrivée » (LIVE.noAuto)
  const MAX = 200, KEEP_MS = 365 * 24 * 3600e3;
  const VERDICTS = ['better', 'expected', 'worse'];
  const CAUSES = ['fog', 'rain', 'wet', 'slippery', 'wind', 'traffic', 'temperature', 'other'];
  const SOURCES = ['work', 'cal'];
  const HOWS = ['auto', 'confirmé'];
  // identifiants logiques de l'app : domicile, travail, destination ajoutée (« c » + base 36), position GPS, lieu d'arrivée
  const PLACE = /^(home|work|gps|arrival|c[0-9a-z]{1,16})$/;
  const TRIP_KEY = /^(commute|leg)\|[\x21-\x7e]{1,300}$/;

  const obj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi ? v : null;
  const pick = (v, list) => list.includes(v) ? v : null;
  const time = (t, now) => Number.isFinite(t) && t > 0 && t <= now + 60e3 ? t : null;
  const range = r => Array.isArray(r) && r.length === 2 && r.every(x => Number.isFinite(x) && x > -60 && x < 200) && r[0] <= r[1] ? [r[0], r[1]] : null;

  // Une mesure absente reste null : rien n'est reconstruit.
  function cleanPlanned(p) {
    if (!obj(p)) return null;
    const o = { min: num(p.min, 0, 1440), km: num(p.km, 0, 2000), tyreScore: num(p.tyreScore, 0, 100),
      level: pick(p.level, ['go', 'caution', 'risk', 'nogo']) };
    return Object.values(o).some(v => v !== null) ? o : null;
  }
  function cleanObserved(o) {
    if (!obj(o)) return null;
    const r = { min: num(o.min, 0, 1440), km: num(o.km, 0, 2000), kmSrc: pick(o.kmSrc, ['route', 'estimate', 'time']) };
    return r.min !== null || r.km !== null ? r : null;
  }
  // Confiance du MODÈLE THERMIQUE uniquement : jamais une confiance globale du verdict.
  function cleanThermal(t) {
    if (!obj(t)) return null;
    // s = indice de TL_STATES (0 froid · 1 sous la plage · 2 fenêtre favorable · 3 chaud · 4 très chaud), comme tyrelab.js
    const s = Number.isInteger(t.s) && t.s >= 0 && t.s <= 4 ? t.s : null;
    const r = { range: range(t.range), s, confidence: pick(t.confidence, ['faible', 'moyenne', 'élevée']) };
    return r.range || r.s !== null ? r : null;
  }
  // Observation météo : indice, jamais une preuve. Source, heure et distance obligatoires.
  function cleanEvidence(e, now) {
    if (!obj(e)) return null;
    const at = time(e.at, now), dist = num(e.distKm, 0, 60), source = pick(e.source, ['metar', 'synop', 'model']);
    if (!at || dist === null || !source) return null;
    const flags = Array.isArray(e.flags) ? [...new Set(e.flags.filter(f => ['saturated', 'mist', 'fog', 'rain', 'gust', 'freezing'].includes(f)))] : [];
    return { source, at, distKm: Math.round(dist * 10) / 10, visM: num(e.visM, 0, 100000), spreadC: num(e.spreadC, 0, 40), flags };
  }

  function normalizeRecord(r, now) {
    if (!obj(r) || typeof r.tripKey !== 'string' || !TRIP_KEY.test(r.tripKey)) return null;
    const createdAt = time(r.createdAt, now), endedAt = time(r.endedAt, now);
    if (!createdAt || !endedAt || now - endedAt > KEEP_MS) return null;
    const fb = obj(r.feedback) ? r.feedback : null;
    let feedback = null;
    if (fb && pick(fb.verdict, VERDICTS) && time(fb.at, now)) {
      const causes = fb.verdict === 'worse' && Array.isArray(fb.causes) ? [...new Set(fb.causes.filter(c => CAUSES.includes(c)))] : [];
      if (fb.verdict !== 'worse' || causes.length) feedback = { verdict: fb.verdict, causes, at: fb.at };
    }
    return { tripKey: r.tripKey, src: pick(r.src, SOURCES), leg: pick(r.leg, ['go', 'ret']),
      origin: typeof r.origin === 'string' && PLACE.test(r.origin) ? r.origin : null,
      destination: typeof r.destination === 'string' && PLACE.test(r.destination) ? r.destination : null,
      how: pick(r.how, HOWS), startedAt: time(r.startedAt, now), endedAt, createdAt,
      planned: cleanPlanned(r.planned), observed: cleanObserved(r.observed), thermal: cleanThermal(r.thermal),
      evidence: cleanEvidence(r.evidence, now), feedback };
  }

  function empty() { return { v: V, items: {} }; }
  function prune(items, now) {
    const kept = Object.values(items).map(r => normalizeRecord(r, now)).filter(Boolean)
      .sort((a, b) => b.endedAt - a.endedAt).slice(0, MAX);
    return Object.fromEntries(kept.map(r => [r.tripKey, r]));
  }
  function load(raw, now) {
    let v; try { v = JSON.parse(raw || 'null'); } catch (e) { return empty(); }
    return obj(v) && v.v === V && obj(v.items) ? { v: V, items: prune(v.items, now) } : empty();
  }
  const serialize = state => JSON.stringify(state);

  // Idempotent par tripKey, indépendamment de l'expiration de done[key] (24 h) : un trajet = un débrief.
  function create(state, snapshot, now) {
    const existing = obj(snapshot) && state.items[snapshot.tripKey];
    if (existing) return { state, record: existing, created: false };
    const record = normalizeRecord({ ...(obj(snapshot) ? snapshot : {}), createdAt: now, feedback: null }, now);
    if (!record) return { state, record: null, created: false };
    return { state: { v: V, items: prune({ ...state.items, [record.tripKey]: record }, now) }, record, created: true };
  }
  // « Annuler l'arrivée » : le trajet n'est plus clos, son débrief disparaît (fenêtre de 10 min seulement).
  function revoke(state, tripKey, now) {
    const r = state.items[tripKey];
    if (!r || now - r.createdAt > UNDO_MS) return { state, revoked: false };
    const items = { ...state.items }; delete items[tripKey];
    return { state: { v: V, items }, revoked: true };
  }
  // Le ressenti ne modifie que feedback : l'instantané reste immuable. Une réponse peut être corrigée.
  function answer(state, tripKey, verdict, causes, now) {
    const r = state.items[tripKey];
    if (!r || !VERDICTS.includes(verdict)) return { state, ok: false };
    const c = verdict === 'worse' && Array.isArray(causes) ? [...new Set(causes.filter(x => CAUSES.includes(x)))] : [];
    if (verdict === 'worse' && !c.length) return { state, ok: false };
    const next = { ...r, feedback: { verdict, causes: c, at: now } };
    return { state: { v: V, items: { ...state.items, [tripKey]: next } }, ok: true };
  }
  const status = (r, now) => r.feedback ? 'answered' : now - r.endedAt <= CARD_MS ? 'pending' : 'toComplete';
  // Carte de l'onglet Pneus : le débrief non répondu le plus récent, pendant 2 h.
  function card(state, now) {
    return Object.values(state.items).filter(r => status(r, now) === 'pending').sort((a, b) => b.endedAt - a.endedAt)[0] || null;
  }
  function journal(state, now) {
    return Object.values(state.items).sort((a, b) => b.endedAt - a.endedAt).map(r => ({ ...r, status: status(r, now) }));
  }
  // Motifs : un rapport, jamais une règle. 1 observation · 2 motif · 3–4 signal · 5+ suggestion.
  const level = n => n >= 5 ? 'suggestion' : n >= 3 ? 'signal' : n === 2 ? 'motif' : 'observation';
  function patterns(state) {
    const counts = {};
    Object.values(state.items).forEach(r => { if (r.feedback && r.feedback.verdict === 'worse') r.feedback.causes.forEach(c => { counts[c] = (counts[c] || 0) + 1; }); });
    return Object.entries(counts).map(([cause, n]) => ({ cause, n, level: level(n) })).sort((a, b) => b.n - a.n || (a.cause < b.cause ? -1 : 1));
  }
  function summary(state) {
    const s = { better: 0, expected: 0, worse: 0, unanswered: 0 };
    Object.values(state.items).forEach(r => { if (r.feedback) s[r.feedback.verdict]++; else s.unanswered++; });
    const answered = s.better + s.expected + s.worse;
    return { ...s, conformity: answered ? Math.round(100 * s.expected / answered) : null };
  }
  return { KEY, CARD_MS, UNDO_MS, MAX, CAUSES, VERDICTS, load, serialize, create, revoke, answer, card, journal, patterns, summary, status };
})();
