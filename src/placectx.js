/* Lieu courant (localisation métier) : moteur pur, sans réseau, stockage ni horloge (l'instant est fourni).
   LOCALISATION PHYSIQUE BRUTE ≠ LOCALISATION MÉTIER. Race Control décide « où l'utilisateur est dans son contexte » à partir
   des meilleures preuves disponibles, et une source moins fiable n'écrase jamais une source plus fiable encore valide :
     1. confirmation manuelle (« Bien arrivé », « Je suis déjà au travail », « Je suis chez moi »)  → Confirmée
     2. trajet vivant en cours (mouvement confirmé par des relevés précis)                          → Fiable
     3. relevé précis récent et cohérent (précision ≤ 100 m, moins de 10 min)                     → Fiable
     4. relevé approximatif récent (≤ 1,5 km, Wi-Fi typiquement)                                   → Estimée
     5. dernier lieu fiable connu (moins de 12 h)                                                   → Estimée
     6. position réseau (précision > 1,5 km : IP, VPN, antenne)                                    → Incertaine, jamais le lieu métier
   Sur ordinateur, le navigateur estime la position par le Wi-Fi ou, à défaut, par l'adresse IP : derrière un VPN, c'est l'IP
   de sortie du VPN (une ville à des dizaines de kilomètres), avec une précision de plusieurs kilomètres. Cette position indique
   le réseau utilisé, pas la position physique : elle reste une donnée technique (diagnostic, badge « réseau »).
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
  const a = fix && Number.isFinite(fix.acc) ? fix.acc : Infinity;
  return !fix ? null : a <= PLACE_ACC_GPS ? 'gps' : a <= PLACE_ACC_APPROX ? 'approx' : 'network';
}
function placeContext(input) {
  const inp = input || {}, now = inp.now, places = (inp.places || []).filter(p => p && p.id && Number.isFinite(p.lat) && Number.isFinite(p.lon));
  const R = Math.PI / 180, km = (a, b) => { const h = Math.sin((b.lat - a.lat) * R / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin((b.lon - a.lon) * R / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
  const byId = id => places.find(p => p.id === id) || null;
  const hm = ms => inp.fmt ? inp.fmt(ms) : new Date(ms).toISOString().slice(11, 16);
  const rejected = [], fix = inp.fix && Number.isFinite(inp.fix.lat) && Number.isFinite(inp.fix.lon) && Number.isFinite(inp.fix.ts) ? inp.fix : null;
  const cls = placeFixClass(fix), age = fix ? now - fix.ts : Infinity;
  const net = inp.net && Number.isFinite(inp.net.ts) ? inp.net : null;
  if (net && (!fix || net.ts >= fix.ts - 1)) rejected.push({ source: 'réseau', name: net.name || null, acc: net.acc, reason: 'précision insuffisante (± ' + Math.round(net.acc / 1000) + ' km) : réseau, IP ou VPN, pas une position physique' });
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
      } else if (far) rejected.push({ source: cls === 'approx' ? 'position approximative' : 'réseau', acc: fix.acc, reason: 'contredit un lieu confirmé avec une précision insuffisante' });
    }
    if (ended) conf = null;
  }
  const out = (o) => ({ rejected, ended, fixClass: cls, ...o });
  if (conf) {
    const p = byId(conf.placeId), k = PLACE_KIND[p.kind] || PLACE_KIND.custom;
    return out({ place: p, source: 'manual', trust: 'Confirmée', confirmed: conf, originLock: p.id,
      title: `${k.icon} ${k.at}`, badge: `Confirmé à ${hm(conf.at)} · source : confirmation utilisateur`, net: rejected.length ? 'VPN/réseau ignoré pour la position physique' : null });
  }
  if (inp.moving) return out({ place: null, source: 'trip', trust: 'Fiable', originLock: null, title: '🚗 EN ROUTE', badge: 'Trajet en cours · GPS' });
  const last = inp.last && byId(inp.last.placeId) && Number.isFinite(inp.last.at) ? inp.last : null;
  const lastOk = last && now - last.at <= PLACE_LAST_AGE ? last : null;
  const snap = (f, r) => places.map(p => ({ p, d: km(p, f) })).filter(x => x.d <= r).sort((a, b) => a.d - b.d)[0] || null;
  if (fix && (cls === 'gps' && age <= PLACE_GPS_AGE || cls === 'approx' && age <= PLACE_APPROX_AGE)) {
    // garde de cohérence : un saut impossible depuis le dernier lieu fiable est écarté, même s'il paraît précis
    const lp = lastOk && byId(lastOk.placeId);
    if (lp && fix.ts > lastOk.at && speedFrom(lp, lastOk.at, fix) > PLACE_VMAX && km(lp, fix) > Math.max(0.5, 3 * fix.acc / 1000)) {
      rejected.push({ source: cls === 'gps' ? 'GPS' : 'position approximative', acc: fix.acc, reason: `saut impossible depuis le dernier lieu fiable (${Math.round(km(lp, fix))} km)` });
    } else {
      const s = snap(fix, cls === 'gps' ? Math.max(0.3, 2 * fix.acc / 1000) : 1.5);
      if (cls === 'gps') return out({ place: s ? s.p : null, coords: { lat: fix.lat, lon: fix.lon }, source: 'gps', trust: 'Fiable', originLock: s ? s.p.id : null,
        title: s ? `${(PLACE_KIND[s.p.kind] || PLACE_KIND.custom).icon} ${s.p.name}` : '📍 Ma position', badge: `GPS · ± ${Math.round(fix.acc)} m` });
      return out({ place: s ? s.p : null, coords: { lat: fix.lat, lon: fix.lon }, source: 'approx', trust: 'Estimée', originLock: null,
        title: s ? `${(PLACE_KIND[s.p.kind] || PLACE_KIND.custom).icon} ${s.p.name}` : '📍 Ma position', badge: `Position approximative · ± ${Math.round(fix.acc)} m` });
    }
  }
  if (lastOk) { const p = byId(lastOk.placeId); return out({ place: p, source: 'last', trust: 'Estimée', originLock: null, title: `${(PLACE_KIND[p.kind] || PLACE_KIND.custom).icon} ${p.name}`, badge: `Dernier lieu fiable · ${hm(lastOk.at)}` }); }
  if (net) return out({ place: null, source: 'network', trust: 'Incertaine', originLock: null, title: '📍 Localisation physique indisponible',
    badge: net.name ? `Position réseau approximative : ${net.name} · fiabilité faible — VPN possible` : 'Position réseau seulement · fiabilité faible — VPN possible' });
  return out({ place: null, source: 'none', trust: 'Indisponible', originLock: null, title: '📍 Localisation physique indisponible', badge: 'Aucune position fiable' });
}
