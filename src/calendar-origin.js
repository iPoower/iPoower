/* Préférences d'origine par occurrence/sens. Aucun trajet, météo ou état GPS ici. */
const CalendarOrigin = (() => {
  const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const text = (x, max = 180) => typeof x === 'string' ? x.trim().slice(0, max) : '';
  const point = p => object(p) && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
  function choice(x) {
    if (x === null) return null; // Réinitialisation datée : une ancienne sauvegarde ne la ressuscite pas.
    if (!object(x)) return undefined;
    if (x.kind === 'home') return { kind: 'home' };
    if (x.kind === 'saved' && text(x.placeId, 80)) return { kind: 'saved', placeId: text(x.placeId, 80) };
    if (!['address', 'gps'].includes(x.kind) || !point(x.point)) return undefined;
    const p = x.point, name = text(p.name) || (x.kind === 'gps' ? 'Ma position choisie' : 'Adresse choisie');
    return { kind: x.kind, point: { lat: p.lat, lon: p.lon, name,
      ...(text(p.address, 240) ? { address: text(p.address, 240) } : {}),
      ...(text(p.provider, 40) ? { provider: text(p.provider, 40) } : {}),
      ...(text(p.precision, 40) ? { precision: text(p.precision, 40) } : {}) } };
  }
  function clean(value, now = Date.now()) {
    const out = {};
    if (!object(value)) return out;
    Object.keys(value).filter(id => /^cal-[0-9a-f]{32}$/.test(id)).sort((a, b) => {
      const at = id => Math.max(...['go', 'ret'].map(k => value[id] && value[id][k] && value[id][k].at || 0));
      return at(b) - at(a) || a.localeCompare(b);
    }).slice(0, 256).forEach(id => {
      if (!object(value[id])) return;
      for (const k of ['go', 'ret']) {
        const v = value[id][k], c = v && choice(v.choice);
        if (!object(v) || !Number.isFinite(v.at) || v.at < 0 || v.at > now + 60e3
          || !Number.isFinite(v.exp) || v.exp <= now || v.exp <= v.at || c === undefined) continue;
        (out[id] || (out[id] = {}))[k] = { at: v.at, exp: v.exp, choice: c };
      }
    });
    return out;
  }
  function merge(a, b, now = Date.now()) {
    const out = clean(a, now);
    Object.entries(clean(b, now)).forEach(([id, legs]) => Object.entries(legs).forEach(([k, v]) => {
      const old = out[id] && out[id][k];
      if (!old || v.at > old.at || v.at === old.at && v.choice === null) (out[id] || (out[id] = {}))[k] = v;
    }));
    return clean(out, now);
  }
  function update(value, id, k, selected, exp, now = Date.now()) {
    const out = clean(value, now), c = choice(selected);
    if (!/^cal-[0-9a-f]{32}$/.test(id) || !['go', 'ret'].includes(k) || c === undefined || !Number.isFinite(exp) || exp <= now) return out;
    const old = out[id] && out[id][k], at = Math.max(now, old ? old.at + 1 : now);
    (out[id] || (out[id] = {}))[k] = { at, exp: Math.max(exp, at + 1), choice: c };
    return out;
  }
  function get(value, id, k, now = Date.now()) {
    const e = clean(value, now)[id]; return e && e[k] ? e[k].choice : null;
  }
  function resolve(c, settings) {
    if (!c) return null;
    const p = c.kind === 'home' ? (settings.locs || [])[0] : c.kind === 'saved'
      ? [...(settings.locs || []), ...(settings.customs || [])].find(p => p.id === c.placeId) : c.point;
    if (!point(p)) return null;
    const name = c.kind === 'home' ? 'Domicile' : p.name || p.label || p.city || 'Départ choisi';
    return { ...p, name, label: name, city: name };
  }
  function apply(leg, c, settings) {
    if (!leg || !c) return leg;
    const p = resolve(c, settings), same = point(p) && point(leg.from)
      && Math.abs(p.lat - leg.from.lat) < .00005 && Math.abs(p.lon - leg.from.lon) < .00005;
    const out = { ...leg, from: p, fromKind: c.kind, originExplicit: true,
      originName: p ? p.name : 'Lieu enregistré indisponible', originRecalc: true, originPlannedDep: leg.originPlannedDep || leg.dep };
    if (same) return out;
    return { ...out, originPending: true, originUncertain: !point(p) || !point(leg.to), rebuildFrom: p,
      targetArr: leg.k === 'go' ? leg.targetArr || leg.arr : null,
      km: null, min: null, pts: [], g: [], routed: false, byTime: false };
  }
  return { choice, clean, merge, update, get, resolve, apply };
})();
