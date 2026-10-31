/* Carnet de pleins : module PUR (aucun stockage, réseau ni horloge).
 * Données : S.cars[i].fuel = objet { <id>: plein }, l'identifiant étant la clé (un chemin de réglage par plein :
 * deux pleins saisis sur deux appareils ne touchent jamais le même chemin, y compris pour une version antérieure).
 *   identifiant : « f_ » + 8 à 40 caractères [0-9a-z] — ni point, ni caractère spécial, jamais purement numérique.
 *   plein : { rev, at, d, km, cl, cents, ppl, full, station, gauge, range, calc } — TOUS les champs toujours présents
 *     (null si inconnus) : une version antérieure fusionne champ par champ et refuse toute disparition de champ.
 *     cl = centilitres, cents = centimes d'euro, ppl = millièmes d'euro par litre (entiers : aucun arrondi flottant stocké),
 *     calc = la valeur calculée parmi 'cl' | 'cents' | 'ppl' (null si les trois sont saisies).
 *   suppression : la clé et tous ses champs restent, avec del (horodatage) et rev + 1 (tombstone) ; il ne revient jamais.
 * Kilométrage : le km d'un plein vit UNIQUEMENT dans le plein, jamais copié dans car.odo.
 * readings(car) est la seule lecture des relevés compteur pour toute l'app : relevés manuels + km des pleins.
 * Sans plein utilisable, elle renvoie car.odo tel quel (même référence) : lecteurs strictement inchangés.
 */
'use strict';
const Fuel = (() => {
  const ID = /^f_[0-9a-z]{8,40}$/;
  const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const int = v => Number.isSafeInteger(v);
  const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T12:00:00Z')) &&
    new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d;
  const validId = id => typeof id === 'string' && ID.test(id);
  const optInt = (v, min, max) => v == null || (int(v) && v >= min && v <= max);
  const KEYS = ['rev', 'at', 'd', 'km', 'cl', 'cents', 'ppl', 'full', 'station', 'gauge', 'range', 'calc'];
  const shaped = e => obj(e) && KEYS.every(k => Object.prototype.hasOwnProperty.call(e, k));
  const dead = e => shaped(e) && int(e.rev) && e.rev >= 1 && int(e.del) && e.del > 0;
  // Un plein exploitable : forme complète, révision, date ; chaque mesure nulle ou entière dans des bornes physiques.
  function valid(e) {
    if (!shaped(e) || !int(e.rev) || e.rev < 1 || !int(e.at) || e.at < 0 || e.del != null || !validDate(e.d)) return false;
    return optInt(e.km, 0, 9999999) && optInt(e.cl, 1, 50000) && optInt(e.cents, 0, 10000000) && optInt(e.ppl, 1, 100000) &&
      typeof e.full === 'boolean' && optInt(e.gauge, 0, 100) && optInt(e.range, 0, 5000) &&
      (e.station == null || typeof e.station === 'string' && e.station.length <= 80) && [null, undefined, 'cl', 'cents', 'ppl'].includes(e.calc);
  }
  const map = car => obj(car) && obj(car.fuel) ? car.fuel : {};
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  // Pleins visibles : valides et non supprimés, dans l'ordre canonique (date, compteur, identifiant).
  const live = car => Object.keys(map(car)).filter(id => validId(id) && valid(map(car)[id])).map(id => ({ id, ...map(car)[id] }))
    .sort((a, b) => cmp(a.d, b.d) || (a.km ?? -1) - (b.km ?? -1) || cmp(a.id, b.id));
  function readings(car) {
    const odo = obj(car) ? car.odo || [] : [], fills = live(car).filter(e => e.km != null);
    if (!fills.length) return odo;
    const manual = Array.isArray(odo) ? odo : [];
    // Même jour et même km qu'un relevé manuel : un seul relevé (saisi deux fois), affiché une fois.
    const extra = fills.filter(e => !manual.some(o => o && o.d === e.d && o.km === e.km)).map(e => ({ d: e.d, km: e.km, src: 'plein', id: e.id }));
    return [...manual, ...extra];
  }
  // Migration v1 : un carnet vide par voiture, créé UNE fois (contenu identique sur tous les appareils : jamais de conflit).
  function ensure(settings) {
    let changed = false;
    (obj(settings) && Array.isArray(settings.cars) ? settings.cars : []).forEach(c => { if (obj(c) && !obj(c.fuel)) { c.fuel = {}; changed = true; } });
    return changed;
  }
  // Suppression définitive : mêmes champs, révision suivante, horodatage de suppression.
  const remove = (e, at) => ({ ...e, rev: e.rev + 1, at, del: at });
  return Object.freeze({ ID, KEYS, valid, validId, dead, live, readings, ensure, remove, validDate });
})();
