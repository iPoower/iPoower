/* Trajets imprévus (20/11/2026, maquettes validées) : quelqu'un d'autre part avec une des voitures.
 * Module PUR : aucune lecture ni écriture de stockage, aucun réseau ; l'heure est fournie (« now », ms ; « nowTs », heure locale).
 * Un trajet imprévu n'est JAMAIS un trajet de l'utilisateur : il ne touche ni sa position, ni sa journée, ni son suivi GPS.
 * Données saisies = NON FIABLES (formulaire, plus tard boîte de dépôt) : champs fermés, tailles bornées, rien d'inventé. */
const RcLoans = (() => {
  const MAX = 10, KEEP_BACK_MS = 48 * 3600e3, KEEP_OPEN_MS = 7 * 24 * 3600e3;
  const finite = Number.isFinite, obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const ts = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + ':00Z'));
  const txt = (v, max) => typeof v === 'string' && v.trim() && v.trim().length <= max && !/[\u0000-\u001f\u007f<>]/.test(v) ? v.trim() : null;
  const point = p => obj(p) && finite(p.lat) && finite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && txt(p.name, 80)
    ? { name: txt(p.name, 80), lat: +(+p.lat).toFixed(5), lon: +(+p.lon).toFixed(5), ...(txt(p.address, 160) ? { address: txt(p.address, 160) } : {}), ...(txt(p.id, 120) ? { id: txt(p.id, 120) } : {}) } : null;
  // Une entrée valide, sinon null (jamais réparée en silence).
  function one(v) {
    if (!obj(v)) return null;
    const id = txt(v.id, 40), carId = txt(v.carId, 120), driver = txt(v.driver, 40), from = point(v.from), to = point(v.to);
    if (!id || !/^loan-[a-z0-9]{4,32}$/.test(id) || !carId || !driver || !from || !to || !ts(v.dep)) return null;
    const ret = v.ret == null ? null : ts(v.ret) && v.ret > v.dep ? v.ret : undefined;
    if (ret === undefined) return null;
    const back = v.back == null ? null : finite(v.back) && v.back > 0 ? v.back : undefined, at = finite(v.at) ? v.at : null;
    if (back === undefined || at == null) return null;
    return { id, carId, driver, from, to, dep: v.dep, ret, back, at };
  }
  // Liste nettoyée : entrées valides, voitures connues, rentrées de moins de 48 h, ouvertes de moins de 7 jours, 10 au plus.
  function clean(list, carIds, now) {
    const ids = new Set(carIds || []), seen = new Set();
    return (Array.isArray(list) ? list : []).map(one).filter(x => x && ids.has(x.carId) && !seen.has(x.id) && seen.add(x.id))
      .filter(x => x.back ? now - x.back < KEEP_BACK_MS : now - x.at < KEEP_OPEN_MS).slice(-MAX);
  }
  const open = list => (list || []).filter(x => !x.back);
  // Voiture occupée : prêt ouvert dont le départ est passé (ou imminent, 30 min) — jamais une voiture « partie » à l'avance d'un jour.
  function busy(list, carId, nowTs) {
    return open(list).find(x => x.carId === carId && x.dep <= addMinutes(nowTs, 30)) || null;
  }
  function addMinutes(t, m) { const d = new Date(Date.parse(t + ':00Z') + m * 60e3); return d.toISOString().slice(0, 16); }
  // Trajets d'un prêt : l'aller, puis le retour s'il a une heure prévue. Clés stables (« loan|id|go »).
  function legs(x) {
    if (!x) return [];
    const out = [{ k: 'go', key: 'loan|' + x.id + '|go', dep: x.dep, from: x.from, to: x.to }];
    if (x.ret) out.push({ k: 'ret', key: 'loan|' + x.id + '|ret', dep: x.ret, from: x.to, to: x.from });
    return out;
  }
  function make({ carId, driver, from, to, dep, ret = null }, now) {
    const x = one({ id: 'loan-' + Math.floor(now).toString(36), carId, driver, from, to, dep, ret, back: null, at: now });
    if (!x) throw new Error('Trajet imprévu incomplet ou invalide');
    return x;
  }
  return { MAX, clean, one, open, busy, legs, make, addMinutes };
})();
if (typeof module !== 'undefined') module.exports = RcLoans;
