/* Carnet de pleins : module PUR (aucun stockage, réseau ni horloge).
 * Données : S.cars[i].fuel = liste de pleins, chacun avec un identifiant propre et une révision.
 *   plein : { id, rev, at, d, km, cl, cents, ppl, full, station?, gauge?, range?, calc }
 *     cl = centilitres, cents = centimes d'euro, ppl = millièmes d'euro par litre (entiers : aucun arrondi flottant stocké),
 *     calc = la valeur calculée parmi 'cl' | 'cents' | 'ppl' (null si les trois sont saisies).
 *   suppression : tombstone { id, rev, at, del } conservé pour toujours (un plein supprimé ne revient jamais).
 * Kilométrage : le km d'un plein vit UNIQUEMENT dans le plein, jamais copié dans car.odo.
 * readings(car) est la seule lecture des relevés compteur pour toute l'app : relevés manuels + km des pleins.
 * Sans plein utilisable, elle renvoie car.odo tel quel (même référence) : lecteurs strictement inchangés.
 */
'use strict';
const Fuel = (() => {
  const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const int = v => Number.isSafeInteger(v);
  const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T12:00:00Z')) &&
    new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d;
  const validId = id => typeof id === 'string' && /^[0-9a-z-]{8,64}$/.test(id);
  const optInt = (v, min, max) => v == null || (int(v) && v >= min && v <= max);
  const dead = e => obj(e) && validId(e.id) && int(e.rev) && e.rev >= 1 && int(e.del) && e.del > 0;
  // Un plein exploitable : identifiant, révision, date ; chaque mesure absente ou entière dans des bornes physiques.
  function valid(e) {
    if (!obj(e) || !validId(e.id) || !int(e.rev) || e.rev < 1 || !int(e.at) || e.at < 0 || e.del != null || !validDate(e.d)) return false;
    return optInt(e.km, 0, 9999999) && optInt(e.cl, 1, 50000) && optInt(e.cents, 0, 10000000) && optInt(e.ppl, 1, 100000) &&
      typeof e.full === 'boolean' && optInt(e.gauge, 0, 100) && optInt(e.range, 0, 5000) &&
      (e.station == null || typeof e.station === 'string' && e.station.length <= 80) && [null, undefined, 'cl', 'cents', 'ppl'].includes(e.calc);
  }
  const list = car => obj(car) && Array.isArray(car.fuel) ? car.fuel : [];
  // Pleins visibles : valides et non supprimés, dans l'ordre canonique (date, compteur, identifiant).
  const live = car => list(car).filter(valid).sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : (a.km ?? -1) - (b.km ?? -1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  function readings(car) {
    const odo = obj(car) ? car.odo || [] : [], fills = live(car).filter(e => e.km != null);
    if (!fills.length) return odo;
    const manual = Array.isArray(odo) ? odo : [];
    // Même jour et même km qu'un relevé manuel : un seul relevé (saisi deux fois), affiché une fois.
    const extra = fills.filter(e => !manual.some(o => o && o.d === e.d && o.km === e.km)).map(e => ({ d: e.d, km: e.km, src: 'plein', id: e.id }));
    return [...manual, ...extra];
  }
  return Object.freeze({ valid, dead, live, readings, validDate });
})();
