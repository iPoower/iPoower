/* Profil suffisant pour un conseil personnel ? (audit A06) Moteur pur : aucun DOM, stockage ni réseau.
   Seuls les paramètres NÉCESSAIRES comptent : vrais lieux (pas les exemples du code neutre), monte réellement renseignée
   (marque + modèle) et trajet domicile-travail plausible. Dimension, DOT, profondeur, pression, montage : facultatifs.
   Profil générique → les vues affichent « Aperçu générique » au niveau des conclusions, jamais GO ni un score /100.
   Trajet incohérent (vitesse moyenne impossible) → aucune échéance de chauffe calculée sur ce planning. */
const ProfileCheck = (() => {
  // lieux d'exemple du réglage neutre (BASE) : Paris et Lille, jamais un domicile réel présumé
  const EXAMPLE = [[48.8566, 2.3522], [50.6292, 3.0573]];
  const ROAD = 1.25, MAX_KMH = 130;   // détour routier moyen sur la distance à vol d'oiseau ; moyenne au-delà = planning impossible
  const has = l => !!l && Number.isFinite(l.lat) && Number.isFinite(l.lon) && Math.abs(l.lat) <= 90 && Math.abs(l.lon) <= 180;
  const isExample = l => has(l) && EXAMPLE.some(([a, o]) => Math.abs(l.lat - a) < 1e-3 && Math.abs(l.lon - o) < 1e-3);
  const txt = v => typeof v === 'string' ? v.trim() : '';
  function km(a, b) {
    const R = 6371, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // cohérence distance/durée : distance routière estimée (vol d'oiseau × 1,25) ou distance routière connue
  function commute(a, b, durMin, roadKm) {
    if (!has(a) || !has(b)) return null;
    const dist = Number.isFinite(roadKm) && roadKm > 0 ? roadKm : km(a, b) * ROAD, d = Math.round(dist), min = Number(durMin);
    if (!(min > 0)) return { km: d, min: null, kmh: null, ok: false, why: `durée du trajet domicile-travail non renseignée (≈ ${d} km)` };
    const kmh = Math.round(dist / (min / 60)), ok = kmh <= MAX_KMH;
    return { km: d, min, kmh, ok, why: ok ? '' : `trajet domicile-travail incohérent : ≈ ${d} km en ${min} min, soit ≈ ${kmh} km/h de moyenne` };
  }
  const monteKnown = car => !!(car && car.tire && txt(car.tire.brand) && txt(car.tire.model));
  function check(input) {
    const o = input || {}, locs = Array.isArray(o.locs) ? o.locs : [], w = o.work || {};
    const byId = id => locs.find(l => l && l.id === id) || null;
    const from = w.from ? byId(w.from) : locs[0] || null, to = w.to ? byId(w.to) : locs[1] || null;
    const gaps = [];
    if (o.locked) gaps.push({ id: 'locked', text: 'appareil verrouillé : réglages personnels non chargés' });
    const ex = [from, to].filter(isExample);
    if (ex.length) gaps.push({ id: 'places', text: ex.length > 1 ? 'domicile et travail sont les lieux d’exemple' : `${ex[0] === from ? 'domicile' : 'travail'} : lieu d’exemple` });
    const missing = !has(from) || !has(to);
    if (missing) gaps.push({ id: 'places', text: 'lieux du trajet incomplets : coordonnées du départ et de l’arrivée à renseigner' });
    const c = commute(from, to, w.durMin, o.roadKm);
    if (c && !c.ok) gaps.push({ id: 'commute', text: c.why });
    const generic = !!o.locked || ex.length > 0 || missing;
    const car = x => {
      const g = gaps.filter(z => z.id !== 'commute');
      if (!monteKnown(x)) g.push({ id: 'monte', text: `${txt(x && (x.short || x.name)) || 'voiture'} : marque et modèle des pneus montés à renseigner` });
      return { generic: generic || !monteKnown(x), gaps: g };
    };
    return { generic, gaps, commute: c, commuteOk: !!c && c.ok, car };
  }
  return { check, commute, monteKnown, isExample, EXAMPLE, MAX_KMH };
})();
