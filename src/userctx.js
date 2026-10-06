/* Contexte utilisateur canonique. Aucun moteur météo, DOM ou appel réseau ici.
 * Les anciennes clés sont des miroirs de compatibilité écrits ensemble ; elles
 * ne sont lues qu'à la migration. Une transaction publie un seul changement.
 */
function userContextStore({ read, write, now = () => Date.now() }) {
  const key = 'twrc.context.v1', listeners = new Set();
  const parse = k => { try { return JSON.parse(read(k) || 'null'); } catch (e) { return null; } };
  const obj = v => v && typeof v === 'object' && !Array.isArray(v);
  const time = t => Number.isFinite(t) && t >= 0 && t <= now() + 60000;
  const point = p => obj(p) && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
  const trip = t => obj(t) && typeof t.key === 'string' && t.key.length <= 1200 && time(t.at) && now() - t.at < 12 * 3600e3;
  function normalize(v) {
    const p = obj(v.place) ? v.place : {}, done = {};
    if (obj(v.done)) Object.entries(v.done).slice(-256).forEach(([k, d]) => {
      if (obj(d) && time(d.at) && Number.isFinite(d.exp) && d.exp > now() && typeof d.how === 'string') done[k] = d;
    });
    return { v: 1, revision: Number.isSafeInteger(v.revision) && v.revision >= 0 ? v.revision : 0,
      updatedAt: time(v.updatedAt) ? v.updatedAt : now(),
      place: { conf: obj(p.conf) && typeof p.conf.placeId === 'string' && time(p.conf.at) ? p.conf : null,
        last: obj(p.last) && typeof p.last.placeId === 'string' && time(p.last.at) ? p.last : null,
        extra: point(p.extra) && time(p.extra.at) ? p.extra : null },
      gps: point(v.gps) && time(v.gps.t) && Number.isFinite(v.gps.acc) && v.gps.acc >= 0 ? v.gps : null,
      tripStart: trip(v.tripStart) ? v.tripStart : null,
      tripEnd: obj(v.tripEnd) && time(v.tripEnd.at) ? v.tripEnd : null,
      returnHome: trip(v.returnHome) && Number.isFinite(v.returnHome.exp) && v.returnHome.exp > now() ? v.returnHome : null,
      done, lastArrival: obj(v.lastArrival) && time(v.lastArrival.at) ? v.lastArrival : null,
      lastDeparture: obj(v.lastDeparture) && typeof v.lastDeparture.placeId === 'string' && time(v.lastDeparture.at) && now() - v.lastDeparture.at < 20 * 3600e3 ? v.lastDeparture : null };
  }
  const saved = parse(key), legacy = !saved ? { place: parse('twrc.place.v1'), gps: parse('twrc.gps'),
    tripStart: parse('twrc.tripstart.v1'), tripEnd: parse('twrc.tripend.v1'), returnHome: parse('twrc.returnhome.v1'), done: parse('twrc.tripdone') } : null;
  let state = normalize(saved && saved.v === 1 ? saved : legacy || {}), depth = 0, baseline = '', publishing = false;
  const encode = v => v == null ? null : JSON.stringify(v);
  function persist() {
    // Une écriture atomique du document canonique précède les anciens miroirs.
    // Un stockage refusé conserve exactement le même contexte en mémoire.
    try { write(key, JSON.stringify(state)); } catch (e) { return; }
    const mirrors = { 'twrc.place.v1': { conf: state.place.conf, last: state.place.last }, 'twrc.gps': state.gps,
      'twrc.tripstart.v1': state.tripStart, 'twrc.tripend.v1': state.tripEnd, 'twrc.returnhome.v1': state.returnHome,
      'twrc.tripdone': Object.keys(state.done).length ? state.done : null };
    Object.entries(mirrors).forEach(([k, v]) => { try { write(k, encode(v)); } catch (e) { /* compatibilité facultative */ } });
  }
  function flush() {
    if (depth) return false;
    const next = JSON.stringify(state); if (next === baseline) return false;
    const durable = parse(key);
    state.revision = Math.max(state.revision, durable && Number.isSafeInteger(durable.revision) ? durable.revision : 0) + 1;
    state.updatedAt = Math.max(state.updatedAt, now()); baseline = JSON.stringify(state); persist();
    if (!publishing) { publishing = true; try { listeners.forEach(fn => fn(state)); } finally { publishing = false; } }
    return true;
  }
  function transaction(fn) {
    depth++; try { return fn(state); } finally { depth--; if (!depth) flush(); }
  }
  function receive(value) {
    let incoming; try { incoming = JSON.parse(value || 'null'); } catch (e) { return false; }
    if (!incoming || incoming.v !== 1) return false;
    // Le dernier document réellement stocké gagne, même avec deux clics dans
    // la même milliseconde. Un ancien événement storage retardé est écarté.
    const durable = read(key); if (durable && durable !== value) return false;
    if (JSON.stringify(normalize(incoming)) === baseline) return false;
    state = normalize(incoming); baseline = JSON.stringify(state); listeners.forEach(fn => fn(state)); return true;
  }
  baseline = JSON.stringify(state); persist();
  return { key, get state() { return state; }, transaction, flush, receive,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
}
