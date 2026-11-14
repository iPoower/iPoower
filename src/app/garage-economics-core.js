/* Garage · coûts et pleins (reprise de #231) : calculs purs, sans stockage, sans réseau, sans horloge implicite.
 * Fiche canonique d'une voiture : S.cars[i].economics = { ref, entries, removed }, dans les réglages déjà chiffrés.
 *  - ref     : références déclarées (prix payé, date et compteur d'achat, distance annuelle prévue, revente estimée) ;
 *  - entries : journal des dépenses datées, chacune avec un identifiant unique et stable ;
 *  - removed : identifiants retirés (une suppression est mémorisée, pour qu'une fusion PC ↔ iPhone ne la fasse pas revenir).
 * Montants en centimes entiers, volumes en millilitres entiers. Inconnu n'est jamais assimilé à zéro.
 * Amortir le prix d'achat n'est pas mesurer une rentabilité : les dépenses saisies ne sont jamais présumées complètes. */
const GarageEconomics = (() => {
  const CATEGORIES = Object.freeze([['fuel', 'Carburant'], ['insurance', 'Assurance'], ['maintenance', 'Entretien'], ['repairs', 'Réparations'],
    ['tyres', 'Pneus'], ['tolls', 'Péages'], ['lease', 'Loyer LOA/LLD'], ['other', 'Autres']]);
  // Carburants DÉCLARÉS par l'utilisateur, jamais déduits d'un ticket ambigu.
  const FUELS = Object.freeze([['unknown', 'À confirmer'], ['diesel', 'Gazole (B7)'], ['diesel-premium', 'Gazole premium'], ['sp98', 'SP98 E5'],
    ['sp95-e5', 'SP95 E5'], ['sp95-e10', 'SP95 E10'], ['e85', 'Superéthanol E85'], ['other', 'Autre carburant']]);
  const MAX_ENTRIES = 600, MAX_ML = 200000, MAX_CENTS = 99999999;   // 600 lignes ≈ 10 ans de pleins hebdomadaires ; 999 999,99 € par ligne
  const isCat = c => CATEGORIES.some(x => x[0] === c), isFuel = f => FUELS.some(x => x[0] === f);
  const cents = n => Number.isSafeInteger(n) && n >= 0 && n <= MAX_CENTS ? n : null;
  const km = n => Number.isSafeInteger(n) && n >= 0 && n <= 9999999 ? n : null;
  const ml = n => Number.isSafeInteger(n) && n > 0 && n <= MAX_ML ? n : null;
  const day = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d ? d : null;
  const obj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  // Saisie (texte du formulaire) → valeur stockée. Vide = inconnu (null) ; invalide = erreur explicite, jamais une valeur devinée.
  function parseMoney(value) {
    const s = String(value == null ? '' : value).trim().replace(/\s/g, '').replace(',', '.');
    if (!s) return null;
    if (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(s)) throw new Error('Montant invalide : euros, deux décimales au plus.');
    const [whole, fraction = ''] = s.split('.');
    return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  }
  function parseKm(value) {
    const s = String(value == null ? '' : value).trim().replace(/\s/g, '');
    if (!s) return null;
    if (!/^(?:0|[1-9]\d{0,6})$/.test(s)) throw new Error('Kilométrage invalide : nombre entier de kilomètres.');
    return Number(s);
  }
  function parseLitres(value) {
    const s = String(value == null ? '' : value).trim().replace(',', '.');
    if (!s) return null;
    if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,3})?$/.test(s)) throw new Error('Volume invalide : litres, trois décimales au plus.');
    const [whole, fraction = ''] = s.split('.'), v = Number(whole) * 1000 + Number((fraction + '000').slice(0, 3));
    if (!ml(v)) throw new Error('Volume de carburant hors limites (0 à 200 L).');
    return v;
  }
  function parseDay(value) {
    const s = String(value == null ? '' : value).trim();
    if (!s) return null;
    if (!day(s)) throw new Error('Date invalide.');
    return s;
  }
  // Journal valide : lignes complètes, identifiants uniques, sans les lignes retirées. Les lignes illisibles sont comptées, jamais effacées.
  function ledger(econ) {
    const e = obj(econ) ? econ : {}, rows = Array.isArray(e.entries) ? e.entries : [];
    const removed = new Set(Array.isArray(e.removed) ? e.removed.filter(x => typeof x === 'string') : []), seen = new Set(), valid = [];
    let invalid = 0;
    for (const x of rows) {
      if (!obj(x) || typeof x.id !== 'string' || !x.id || seen.has(x.id) || !isCat(x.category) || cents(x.amountCents) === null || !day(x.date)) { invalid++; continue; }
      seen.add(x.id); if (!removed.has(x.id)) valid.push(x);
    }
    return { rows: valid.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)), invalid };
  }
  // Nouvelle fiche (copie) : une dépense ajoutée. Le journal d'origine n'est jamais modifié en place.
  function addEntry(econ, entry, id) {
    const e = obj(econ) ? econ : {}, entries = Array.isArray(e.entries) ? e.entries : [];
    if (typeof id !== 'string' || !/^[a-z0-9-]{8,40}$/.test(id) || entries.some(x => obj(x) && x.id === id)) throw new Error('Identifiant de dépense invalide.');
    if (entries.length >= MAX_ENTRIES) throw new Error('Journal plein (' + MAX_ENTRIES + ' lignes) : exporte une sauvegarde avant de continuer.');
    if (!obj(entry) || !day(entry.date) || !isCat(entry.category) || cents(entry.amountCents) === null) throw new Error('Date, catégorie ou montant manquant.');
    const row = { id, date: entry.date, category: entry.category, amountCents: entry.amountCents };
    if (km(entry.km) !== null) row.km = entry.km;
    const note = typeof entry.note === 'string' ? entry.note.trim().slice(0, 80) : '';
    if (note) row.note = note;
    if (entry.category === 'fuel') {
      if (ml(entry.volumeMl)) row.volumeMl = entry.volumeMl;
      row.fuelType = isFuel(entry.fuelType) ? entry.fuelType : 'unknown';
      row.fullTank = entry.fullTank === true;
      if (row.fullTank && (!row.volumeMl || row.km == null)) throw new Error('Plein complet : renseigne les litres et le compteur au moment du plein.');
    }
    return { ...e, entries: entries.concat([row]), removed: Array.isArray(e.removed) ? e.removed.slice() : [] };
  }
  // Retrait : la ligne disparaît du journal ET son identifiant est mémorisé (une fusion avec un autre appareil ne la fera pas revenir).
  function removeEntry(econ, id) {
    const e = obj(econ) ? econ : {}, entries = Array.isArray(e.entries) ? e.entries : [];
    if (!entries.some(x => obj(x) && x.id === id)) throw new Error('Dépense introuvable.');
    const removed = new Set(Array.isArray(e.removed) ? e.removed : []); removed.add(id);
    return { ...e, entries: entries.filter(x => !(obj(x) && x.id === id)), removed: [...removed].sort() };
  }
  // Fusion de deux journaux (PC ↔ iPhone) : union par identifiant, moins les retraits connus d'un côté ou de l'autre.
  // Fonction pure, prête pour la synchronisation ; elle n'est raccordée à aucune synchronisation dans ce module.
  function mergeJournal(a, b) {
    const ea = obj(a) ? a : {}, eb = obj(b) ? b : {};
    const removed = [...new Set([...(Array.isArray(ea.removed) ? ea.removed : []), ...(Array.isArray(eb.removed) ? eb.removed : [])].filter(x => typeof x === 'string'))].sort();
    const gone = new Set(removed), byId = new Map();
    for (const x of [...(Array.isArray(ea.entries) ? ea.entries : []), ...(Array.isArray(eb.entries) ? eb.entries : [])])
      if (obj(x) && typeof x.id === 'string' && !gone.has(x.id) && (!byId.has(x.id) || JSON.stringify(x) > JSON.stringify(byId.get(x.id)))) byId.set(x.id, x);
    return { entries: [...byId.values()].sort((x, y) => String(x.date).localeCompare(String(y.date)) || x.id.localeCompare(y.id)), removed };
  }
  function fuelSummary(rows) {
    const fuel = rows.filter(x => x.category === 'fuel'), measured = fuel.filter(x => ml(x.volumeMl));
    const totalMl = measured.reduce((n, x) => n + x.volumeMl, 0), measuredCents = measured.reduce((n, x) => n + x.amountCents, 0);
    return { count: fuel.length, measured: measured.length, missingVolume: fuel.length - measured.length, litres: totalMl / 1000,
      costCents: fuel.reduce((n, x) => n + x.amountCents, 0), euroPerLitre: totalMl ? measuredCents * 10 / totalMl : null };
  }
  // Consommation réelle entre les deux derniers pleins complets : seulement si tous les ravitaillements entre eux ont un volume,
  // des compteurs cohérents, et aucune date en double (deux pleins le même jour ne s'ordonnent pas sans heure).
  function fullToFull(rows) {
    const fuel = rows.filter(x => x.category === 'fuel');
    if (fuel.length < 2 || new Set(fuel.map(x => x.date)).size !== fuel.length) return null;
    const full = fuel.flatMap((x, i) => x.fullTank === true && km(x.km) !== null && ml(x.volumeMl) ? [i] : []);
    if (full.length < 2) return null;
    const i0 = full[full.length - 2], i1 = full[full.length - 1], start = fuel[i0], end = fuel[i1], distanceKm = end.km - start.km;
    if (distanceKm <= 0 || distanceKm > 50000) return null;
    const between = fuel.slice(i0 + 1, i1 + 1);
    if (between.some(x => !ml(x.volumeMl))) return null;
    let prior = start.km;
    for (const x of between) { if (x.km == null) continue; if (km(x.km) === null || x.km < prior || x.km > end.km) return null; prior = x.km; }
    const volume = between.reduce((n, x) => n + x.volumeMl, 0), spent = between.reduce((n, x) => n + x.amountCents, 0);
    return { startDate: start.date, endDate: end.date, distanceKm, litres: volume / 1000, litresPer100: volume / 10 / distanceKm, eurosPer100: spent / distanceKm };
  }
  // Bilan d'une voiture à une date donnée (today, AAAA-MM-JJ) et pour le dernier compteur déclaré (currentKm, facultatif).
  function project(econ, { today = null, currentKm = null } = {}) {
    const e = obj(econ) ? econ : {}, ref = obj(e.ref) ? e.ref : {}, j = ledger(e);
    const price = cents(ref.purchasePriceCents), bought = day(ref.purchaseDate), at = day(today);
    const startKm = km(ref.purchaseOdometerKm), nowKm = km(currentKm), annualKm = km(ref.annualDistanceKm), resale = cents(ref.estimatedResaleCents);
    const spentCents = j.rows.reduce((n, x) => n + x.amountCents, 0), byCategory = {}, byMonth = {};
    for (const x of j.rows) { byCategory[x.category] = (byCategory[x.category] || 0) + x.amountCents; byMonth[x.date.slice(0, 7)] = (byMonth[x.date.slice(0, 7)] || 0) + x.amountCents; }
    const days = bought && at && at >= bought ? Math.round((Date.parse(at + 'T00:00:00Z') - Date.parse(bought + 'T00:00:00Z')) / 864e5) : null;
    const distanceKm = startKm !== null && nowKm !== null && nowKm >= startKm ? nowKm - startKm : null;
    const perMonth = months => price === null ? null : Math.round((price - (resale !== null && resale <= price ? resale : 0)) / months);
    return {
      price, resale, spentCents, entries: j.rows.length, invalid: j.invalid, byCategory, byMonth, days, distanceKm,
      amortized36: perMonth(36), amortized60: perMonth(60), resaleUsed: resale !== null && price !== null && resale <= price,
      // Coût au km DÉCLARÉ : prix payé + dépenses saisies, sur les km parcourus depuis l'achat (≥ 1 000 km pour être affiché).
      costPerKmCents: price !== null && distanceKm !== null && distanceKm >= 1000 ? Math.round((price + spentCents) / distanceKm) : null,
      plannedPerKmCents: price !== null && annualKm ? Math.round((price - (resale !== null && resale <= price ? resale : 0)) / (annualKm * 5)) : null,
      shortHistory: days === null || days < 30 || distanceKm === null || distanceKm < 1000,
      fuel: fuelSummary(j.rows), consumption: fullToFull(j.rows)
    };
  }
  return Object.freeze({ CATEGORIES, FUELS, MAX_ENTRIES, parseMoney, parseKm, parseLitres, parseDay, ledger, addEntry, removeEntry, mergeJournal, project });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = GarageEconomics;
