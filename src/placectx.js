/* Lieu courant (localisation métier) : moteur pur, sans réseau, stockage ni horloge (l'instant est fourni).
   LOCALISATION PHYSIQUE BRUTE ≠ LOCALISATION MÉTIER. Race Control décide « où l'utilisateur est dans son contexte » à partir
   des meilleures preuves disponibles, et une source moins fiable n'écrase jamais une source plus fiable encore valide :
     1. confirmation manuelle (« Bien arrivé », « Je suis déjà au travail », « Je suis chez moi »)  → Confirmée
     2. trajet vivant en cours (mouvement confirmé par des relevés précis)                          → Fiable
     3. relevé précis récent et cohérent (précision ≤ 100 m, moins de 10 min)                     → Fiable
     4. relevé approximatif récent (≤ 1,5 km, fournisseur non exposé)                                   → Estimée
     5. dernier lieu fiable connu (moins de 12 h)                                                   → Estimée
     6. position réseau indépendante, si disponible                                               → Incertaine, jamais le lieu métier
   L'API navigateur ne révèle pas son fournisseur (GPS, Wi-Fi, antennes…). L'accuracy mesure une incertitude,
   pas une origine IP ni la présence d'un VPN. Un relevé navigateur trop large reste un relevé navigateur.
   Fin d'une confirmation, sans durée arbitraire tant que le contexte suffit : action « Je quitte », départ détecté (trajet
   vivant parti après la confirmation), relevé précis cohérent loin du lieu ; plafonds de sécurité : travail → fin de la
   journée de la confirmation, domicile ou autre lieu → 20 h.
   Garde de cohérence : un relevé qui impliquerait plus de 200 km/h depuis le dernier état fiable est rejeté, même précis. */
const PLACE_ACC_GPS = 100, PLACE_ACC_APPROX = 1500, PLACE_GPS_AGE = 10 * 60e3, PLACE_APPROX_AGE = 30 * 60e3, PLACE_LAST_AGE = 12 * 3600e3;
const PLACE_VMAX = 200, PLACE_HOME_CAP = 20 * 3600e3;
const PLACE_KIND = { work: { icon: '🏢', at: 'AU TRAVAIL', arrive: 'Bien arrivé', already: 'Je suis déjà au travail', leave: 'Je quitte le travail' },
  home: { icon: '🏠', at: 'À LA MAISON', arrive: 'Bien rentré', already: 'Je suis déjà chez moi', leave: 'Je pars de chez moi' },
  custom: { icon: '📍', at: 'SUR PLACE', arrive: 'Bien arrivé', already: 'Je suis sur place', leave: 'Je pars' } };
function placeFixClass(fix) {
  const a = fix && Number.isFinite(fix.acc) && fix.acc >= 0 ? fix.acc : Infinity;
  return !fix ? null : a <= PLACE_ACC_GPS ? 'gps' : a <= PLACE_ACC_APPROX ? 'approx' : 'coarse';
}
function placeDistance(a, b) {
  const R = Math.PI / 180, h = Math.sin((b.lat - a.lat) * R / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin((b.lon - a.lon) * R / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
}
// Entrée des observations : qualité physique et hystérésis du lieu sont distinctes. Un premier point de départ
// reste disponible pour l'automate de mouvement, mais ne suffit pas à déplacer le lieu logique.
function placeObserve({ fix, previous, logical, context, pending, places, now }) {
  const no = reason => ({ accept: false, reason, pending: null, logical });
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lon) || Math.abs(fix.lat) > 90 || Math.abs(fix.lon) > 180 || !Number.isFinite(fix.acc) || fix.acc < 0 || !Number.isFinite(fix.ts)) return no('relevé navigateur invalide');
  if (fix.ts > now + 60e3) return no('horodatage futur');
  if (now - fix.ts > PLACE_GPS_AGE) return no('relevé périmé : nouvelle position nécessaire');
  if (previous && fix.ts < previous.ts) return no('relevé antérieur à la position retenue');
  const cls = placeFixClass(fix);
  if (cls === 'coarse') return no('précision insuffisante pour reconnaître un lieu ou suivre un trajet');
  if (previous && now - previous.ts <= PLACE_GPS_AGE && placeFixClass(previous) === 'gps' && cls !== 'gps') return no('relevé précis récent conservé : nouvelle position moins précise');
  if (Number.isFinite(fix.speed) && (fix.speed < 0 || fix.speed * 3.6 > PLACE_VMAX)) return no('vitesse navigateur incohérente');
  if (previous && cls === 'gps' && placeFixClass(previous) === 'gps' && fix.ts > previous.ts) {
    const d = Math.max(0, placeDistance(previous, fix) - 2 * (previous.acc + fix.acc) / 1000);
    if (d / ((fix.ts - previous.ts) / 3600e3) > PLACE_VMAX) return no('saut GPS impossible entre deux observations');
  }
  if (cls !== 'gps') return { accept: true, logical: fix, pending: null, reason: 'position navigateur approximative, lieu à confirmer' };
  const current = context && context.place, close = (places || []).map(p => ({ p, d: placeDistance(p, fix) }))
    .filter(x => x.d <= Math.max(0.15, 2 * fix.acc / 1000)).sort((a, b) => a.d - b.d);
  // Deux géofences qui se recouvrent ne permettent pas de choisir silencieusement l'une des adresses.
  const target = close.length === 1 ? close[0].p.id : null;
  const retained = context && context.confirmed || current && logical && placeDistance(current, logical) > 0.35 ? null : logical;
  const held = (reason, next) => ({ accept: true, hold: true, logical: retained, pending: next, reason });
  if (current && target !== current.id && placeDistance(current, fix) <= Math.max(0.35, 3 * fix.acc / 1000)) return held('hystérésis : bord de la géofence, lieu conservé', null);
  const changing = current && target !== current.id || !current && target;
  if (changing) {
    const key = target || 'other', coherent = pending && pending.key === key && fix.ts > pending.fix.ts && fix.ts - pending.fix.ts <= 2 * 60e3
      && placeDistance(pending.fix, fix) <= Math.max(0.5, (fix.ts - pending.fix.ts) / 3600e3 * PLACE_VMAX + (pending.fix.acc + fix.acc) / 1000);
    if (!coherent) return held('changement de lieu à confirmer par un second relevé', { key, fix });
  }
  return { accept: true, logical: fix, pending: null, reason: target ? 'position précise dans la géofence' : close.length > 1 ? 'lieux proches : confirmation manuelle disponible' : 'position précise hors des lieux connus' };
}
function placeContext(input) {
  const inp = input || {}, now = inp.now, places = (inp.places || []).filter(p => p && p.id && Number.isFinite(p.lat) && Number.isFinite(p.lon));
  const R = Math.PI / 180, km = (a, b) => { const h = Math.sin((b.lat - a.lat) * R / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin((b.lon - a.lon) * R / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
  const byId = id => places.find(p => p.id === id) || null;
  const hm = ms => inp.fmt ? inp.fmt(ms) : new Date(ms).toISOString().slice(11, 16);
  const rejected = [], fix = inp.fix && Number.isFinite(inp.fix.lat) && Number.isFinite(inp.fix.lon) && Number.isFinite(inp.fix.ts) && inp.fix.ts <= now + 60e3 ? inp.fix : null;
  const cls = placeFixClass(fix), age = fix ? now - fix.ts : Infinity;
  const net = inp.net && Number.isFinite(inp.net.ts) && inp.net.ts <= now + 60e3 && now - inp.net.ts <= PLACE_APPROX_AGE ? inp.net : null;
  if (net && (!fix || net.ts >= fix.ts - 1)) rejected.push({ source: 'réseau', name: net.name || null, acc: net.acc, reason: 'position réseau approximative : ne permet pas de reconnaître un lieu' });
  // vitesse implicite entre un état fiable (lieu connu à l'instant t) et un relevé
  const speedFrom = (place, t, f) => { const h = Math.max(1 / 60, (f.ts - t) / 3600e3); return Math.max(0, km(place, f) - Math.max(0, (f.acc || 0) / 1000)) / h; };
  let ended = null, conf = inp.conf && byId(inp.conf.placeId) && Number.isFinite(inp.conf.at) && inp.conf.at <= now + 60e3 ? inp.conf : null;
  if (conf) {
    const p = byId(conf.placeId), kind = p.kind || 'custom';
    if (kind === 'work' && inp.today && conf.day && conf.day !== inp.today) ended = { reason: 'fin de la journée de travail' };
    else if (kind !== 'work' && now - conf.at > PLACE_HOME_CAP) ended = { reason: 'confirmation ancienne (plus de 20 h)' };
    else if (inp.moving && Number.isFinite(inp.movingSince) && inp.movingSince > conf.at) ended = { reason: 'départ détecté (trajet en cours)' };
    else if (fix && fix.ts > conf.at) {
      const d = km(p, fix), far = d > Math.max(0.5, 3 * (fix.acc || 0) / 1000);
      if (far && cls === 'gps' && age <= PLACE_GPS_AGE) {
        if (speedFrom(p, conf.at, fix) > PLACE_VMAX) rejected.push({ source: 'GPS', acc: fix.acc, reason: `déplacement impossible depuis la confirmation (${Math.round(d)} km en ${Math.max(1, Math.round((fix.ts - conf.at) / 60e3))} min)` });
        else ended = { reason: 'position précise ailleurs (départ réel)' };
      } else if (far) rejected.push({ source: 'position navigateur approximative', acc: fix.acc, reason: 'contredit un lieu confirmé avec une précision insuffisante' });
    }
    if (ended) conf = null;
  }
  const out = (o) => ({ rejected, ended, fixClass: cls, ...o });
  if (conf) {
    const p = byId(conf.placeId), k = PLACE_KIND[p.kind] || PLACE_KIND.custom;
    return out({ place: p, source: 'manual', trust: 'Confirmée', confirmed: conf, originLock: p.id,
      title: `${k.icon} ${k.at}`, badge: `Confirmé à ${hm(conf.at)} · source : confirmation utilisateur`, net: rejected.length ? 'Position approximative ignorée pour le lieu confirmé' : null });
  }
  if (inp.moving) return out({ place: null, source: 'trip', trust: 'Fiable', originLock: null, title: '🚗 EN ROUTE', badge: 'Trajet en cours · GPS' });
  const last = inp.last && byId(inp.last.placeId) && Number.isFinite(inp.last.at) ? inp.last : null;
  const lastOk = last && now - last.at <= PLACE_LAST_AGE ? last : null;
  const snap = (f, r) => { const hits = places.map(p => ({ p, d: km(p, f) })).filter(x => x.d <= r).sort((a, b) => a.d - b.d); return r < 1.5 && hits.length !== 1 ? null : hits[0] || null; };
  if (fix && (cls === 'gps' && age <= PLACE_GPS_AGE || cls === 'approx' && age <= PLACE_APPROX_AGE)) {
    // garde de cohérence : un saut impossible depuis le dernier lieu fiable est écarté, même s'il paraît précis
    const lp = lastOk && byId(lastOk.placeId);
    if (lp && fix.ts > lastOk.at && speedFrom(lp, lastOk.at, fix) > PLACE_VMAX && km(lp, fix) > Math.max(0.5, 3 * fix.acc / 1000)) {
      rejected.push({ source: cls === 'gps' ? 'GPS' : 'position approximative', acc: fix.acc, reason: `saut impossible depuis le dernier lieu fiable (${Math.round(km(lp, fix))} km)` });
    } else {
      const s = snap(fix, cls === 'gps' ? Math.max(0.15, 2 * fix.acc / 1000) : 1.5);
      if (cls === 'gps') return out({ place: s ? s.p : null, coords: { lat: fix.lat, lon: fix.lon }, source: 'gps', trust: 'Fiable', originLock: s ? s.p.id : null,
        title: s ? `${(PLACE_KIND[s.p.kind] || PLACE_KIND.custom).icon} ${s.p.name}` : '📍 Ma position', badge: `GPS navigateur · ± ${Math.round(fix.acc)} m` });
      return out({ place: s ? s.p : null, coords: { lat: fix.lat, lon: fix.lon }, source: 'approx', trust: 'Estimée', originLock: null,
        title: s ? `${(PLACE_KIND[s.p.kind] || PLACE_KIND.custom).icon} ${s.p.name}` : '📍 Ma position', badge: `Position approximative · ± ${Math.round(fix.acc)} m` });
    }
  }
  if (lastOk) { const p = byId(lastOk.placeId); return out({ place: p, source: 'last', trust: 'Estimée', originLock: null, title: `${(PLACE_KIND[p.kind] || PLACE_KIND.custom).icon} ${p.name}`, badge: `Dernier lieu fiable · ${hm(lastOk.at)}` }); }
  if (net) return out({ place: null, source: 'network', trust: 'Incertaine', originLock: null, title: '📍 Localisation physique indisponible',
    badge: `Position réseau approximative · précision ~${Math.round(net.acc / 1000)} km${net.name ? ' · ' + net.name : ''}` });
  if (fix && cls === 'coarse' && age >= -60e3 && age <= PLACE_APPROX_AGE) return out({ place: null, source: 'coarse', trust: 'Incertaine', originLock: null, title: '📍 Localisation physique indisponible',
    badge: `Localisation navigateur approximative · précision ~${Math.round(fix.acc / 1000)} km · confirmation manuelle disponible` });
  return out({ place: null, source: 'none', trust: 'Indisponible', originLock: null, title: '📍 Localisation physique indisponible', badge: 'Aucune position fiable' });
}
