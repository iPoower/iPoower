/* Fusion PC ↔ iPhone : PURE, sans réseau, sans stockage, sans chiffrement.
 * Entrées : les valeurs déjà déchiffrées par Race Control de deux coffres (clé → texte JSON),
 * celles de cet appareil (local) et celles de l'autre (distant). Sortie : valeurs fusionnées et rapport.
 * Règles, dans l'ordre :
 *  1. Aucune donnée humaine additive n'est perdue : journal des trajets (archive cumulative), trajets clos,
 *     relevés de compteur et de profondeur, retours terrain, jours du journal météo.
 *  2. Un réglage modifié suit la modification la plus récente, chemin par chemin (horodatages STAMPS).
 *     Sans preuve de fraîcheur (horodatage absent ou égal), la valeur de cet appareil reste et le
 *     chemin est signalé comme conflit : jamais de gagnant deviné.
 *  3. L'état propre à l'appareil (lieu, GPS, trajet en cours, caches, clés de session) n'est jamais importé.
 * Limite connue : une suppression (relevé effacé, réinitialisation) n'est pas propagée ; l'union la
 * ferait réapparaître. Le choix est volontaire : en cas de doute, conserver plutôt que perdre.
 */
'use strict';
const SyncMerge = (() => {
  const SETTINGS = 'twrc.settings.v1', STAMPS = 'twrc.editstamps.v1', CONTEXT = 'twrc.context.v1';
  const DONE = 'twrc.tripdone', CANCEL = 'twrc.tripcancel', REPORTS = 'twrc.reports.v1', SHADOW = 'twrc.shadow.v1';
  // Propre à l'appareil ou recalculable : la valeur locale reste, celle de l'autre appareil est ignorée.
  const DEVICE = new Set(['twrc.key', 'twrc.plain', 'twrc.plain.v', 'twrc.gps', 'twrc.place.v1', 'twrc.tripstart.v1',
    'twrc.tripend.v1', 'twrc.returnhome.v1', 'twrc.trend', 'twrc.tripmap', 'twrc.calendar.sealed.v1', 'twrc.weather.limit.v1',
    'twrc.decision.latest.v1', 'twrc.weather.incidents.v1', 'twrc.lastbackup', 'twrc.tyretherm.v1', 'twrc.view', 'twrc.presetv']);
  const device = k => DEVICE.has(k) || /^twrc\.(cache\.|croute|road\.|session|restore\.)/.test(k);
  const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const stamp = v => Number.isFinite(v) && v > 0 ? v : 0;
  const parse = (text, what) => {
    if (text == null) return null;
    try { return JSON.parse(text); } catch (e) { throw new Error('Copie illisible : ' + what + '. Fusion refusée sans écriture.'); }
  };
  const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
  // Les chemins viennent d'une copie distante : aucun prototype ni champ hérité.
  function parts(path) {
    if (typeof path !== 'string' || !path || path.length > 512) throw new Error('Chemin de réglage invalide : fusion refusée.');
    const keys = path.split('.');
    if (keys.length > 16 || keys.some(k => !k || k === '__proto__' || k === 'constructor' || k === 'prototype'))
      throw new Error('Chemin de réglage interdit : fusion refusée.');
    return keys;
  }
  function get(o, path) { return parts(path).reduce((t, k) => own(t, k) ? t[k] : undefined, o); }
  function validate(value, depth = 0) {
    if (depth > 64) throw new Error('Copie trop imbriquée : fusion refusée.');
    if (value && typeof value === 'object') for (const k of Object.keys(value)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') throw new Error('Propriété interdite : fusion refusée.');
      validate(value[k], depth + 1);
    }
  }
  function set(o, path, value) {
    const p = parts(path); let t = o;
    for (let i = 0; i < p.length; i++) {
      const k = p[i];
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') throw new Error('Chemin interdit.');
      if (i === p.length - 1) { t[k] = value; break; }
      if (!own(t, k) || !obj(t[k]) && !Array.isArray(t[k])) t[k] = /^\d+$/.test(p[i + 1]) ? [] : Object.create(null);
      t = t[k];
    }
  }
  // Les chemins « cars.N… » ne s'appliquent que si la voiture N est la même des deux côtés.
  function aligned(a, b, path) {
    const m = /^cars\.(\d+)(\.|$)/.exec(path); if (!m) return true;
    const x = a.cars && a.cars[+m[1]], y = b.cars && b.cars[+m[1]];
    return !!x && !!y && x.id === y.id;
  }
  const unionBy = (a, b, key) => {
    const seen = new Map(); [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].forEach(x => { const k = key(x); if (!seen.has(k)) seen.set(k, x); });
    return [...seen.values()];
  };

  function settings(local, remote, stampsLocal = {}, stampsRemote = {}) {
    validate(local); validate(remote); validate(stampsLocal); validate(stampsRemote);
    if (!obj(local)) throw new Error('Réglages de cet appareil absents : fusion refusée.');
    const out = clone(local), report = { fromRemote: [], conflicts: [], added: { odo: 0, treads: 0, calib: 0, days: 0 } };
    if (!obj(remote)) return { settings: out, stamps: { ...stampsLocal }, report };
    if (!obj(stampsLocal) || !obj(stampsRemote) || !Array.isArray(local.cars) || !Array.isArray(remote.cars)) throw new Error('Réglages incomplets : fusion refusée.');
    const blocked = new Set();
    const paths = [...new Set([...Object.keys(local.edits || {}), ...Object.keys(remote.edits || {}),
      ...Object.keys(stampsLocal), ...Object.keys(stampsRemote)])].sort();   // parent avant enfant
    for (const p of paths) {
      parts(p);
      // Une liste complète pourrait supprimer des véhicules et leurs historiques.
      if (p === 'cars' || /^cars\.\d+$/.test(p)) { report.conflicts.push(p); blocked.add(p); continue; }
      const lv = get(local, p), rv = get(remote, p), a = stamp(stampsLocal[p]), b = stamp(stampsRemote[p]);
      if (!aligned(local, remote, p)) { report.conflicts.push(p); blocked.add(p); continue; }
      if (same(lv, rv)) continue;
      if (rv === undefined && b > a) { report.conflicts.push(p); blocked.add(p); continue; }
      if (b > a && rv !== undefined) { set(out, p, clone(rv)); report.fromRemote.push(p); }
      else { if (lv !== undefined) set(out, p, clone(lv)); if (a === b) report.conflicts.push(p); }
    }
    out.edits = { ...(obj(remote.edits) ? remote.edits : {}), ...(obj(local.edits) ? local.edits : {}) };
    for (const car of remote.cars) if (!car || !local.cars.some(c => c && c.id === car.id)) report.conflicts.push('cars');
    // Mesures additives, voiture par voiture (identité = id, jamais la position).
    (out.cars || []).forEach(car => {
      if (!obj(car) || !car.id) throw new Error('Véhicule incomplet : fusion refusée.');
      const l = (local.cars || []).find(c => c && c.id === car.id), r = (remote.cars || []).find(c => c && c.id === car.id);
      if (!car || !r) return;
      if (l && l.odo != null && !Array.isArray(l.odo) || r.odo != null && !Array.isArray(r.odo)) throw new Error('Relevés incomplets : fusion refusée.');
      if ([...(l && l.odo || []), ...(r.odo || [])].some(x => !obj(x) || !x.d)) throw new Error('Relevé invalide : fusion refusée.');
      const odo = unionBy(l && l.odo, r.odo, x => JournalArchive.encode(x)).sort((x, y) => String(x.d).localeCompare(String(y.d)));
      report.added.odo += odo.length - (Array.isArray(l && l.odo) ? l.odo.length : 0); car.odo = odo;
      if (car.tire || r.tire) {
        const lt = l && l.tire && l.tire.treads, rt = r.tire && r.tire.treads;
        if (lt != null && !Array.isArray(lt) || rt != null && !Array.isArray(rt)) throw new Error('Profondeurs incomplètes : fusion refusée.');
        if (Array.isArray(lt) || Array.isArray(rt)) {
          const treads = unionBy(lt, rt, x => JSON.stringify(x));
          report.added.treads += treads.length - (Array.isArray(lt) ? lt.length : 0);
          car.tire = { ...(car.tire || {}), treads };
        }
      }
    });
    if (local.calib != null && !Array.isArray(local.calib) || remote.calib != null && !Array.isArray(remote.calib)) throw new Error('Retours incomplets : fusion refusée.');
    const calib = unionBy(local.calib, remote.calib, x => JSON.stringify(x));
    report.added.calib = calib.length - (Array.isArray(local.calib) ? local.calib.length : 0); out.calib = calib;
    for (const k of Object.keys(remote.journal || {})) if (own(local.journal, k) && !same(local.journal[k], remote.journal[k])) report.conflicts.push('journal.' + k);
    const days = { ...(obj(remote.journal) ? remote.journal : {}), ...(obj(local.journal) ? local.journal : {}) };
    report.added.days = Object.keys(days).length - Object.keys(obj(local.journal) ? local.journal : {}).length; out.journal = days;
    const stamps = { ...stampsLocal };
    Object.entries(stampsRemote).forEach(([p, t]) => { if (!blocked.has(p) && stamp(t) > stamp(stamps[p])) stamps[p] = t; });
    return { settings: out, stamps, report };
  }

  // Trajets clos, annulations : par identifiant, l'enregistrement le plus récent l'emporte, aucun n'est perdu.
  function later(a, b) {
    const out = { ...(obj(a) ? a : {}) };
    Object.entries(obj(b) ? b : {}).forEach(([k, d]) => { if (!out[k] || (obj(d) && stamp(d.at) > stamp(out[k] && out[k].at))) out[k] = d; });
    return out;
  }
  function journal(local, remote) {
    if (local != null && !obj(local) || remote != null && !obj(remote)) throw new Error('Journal incomplet : fusion refusée.');
    const l = obj(local) ? local : {}, r = obj(remote) ? remote : {};
    const archive = JournalArchive.union(JournalArchive.collect(l), JournalArchive.collect(r));
    const clean = Debrief.clean({ ...l, entries: [...(l.entries || []), ...(r.entries || [])], archive }, Number.MAX_SAFE_INTEGER);
    return { ...l, entries: clean.entries, archive: JournalArchive.union(archive, clean.archive) };
  }

  function values(local, remote) {
    if (!obj(local) || !obj(remote)) throw new Error('Deux coffres déchiffrés sont nécessaires : fusion refusée.');
    validate(local); validate(remote);
    const out = { ...local }, report = { settings: null, journal: { before: 0, after: 0 }, keysAdded: [], keysKept: [] };
    const sl = parse(local[STAMPS], 'horodatages locaux') || {}, sr = parse(remote[STAMPS], 'horodatages distants') || {};
    const ls = parse(local[SETTINGS], 'réglages locaux'), rs = parse(remote[SETTINGS], 'réglages distants');
    if (ls) {
      const m = settings(ls, rs, sl, sr);
      out[SETTINGS] = JSON.stringify(m.settings); out[STAMPS] = JSON.stringify(m.stamps); report.settings = m.report;
    } else if (rs) throw new Error('Profil local absent : restauration contrôlée nécessaire avant synchronisation.');
    let archive = JournalArchive.union(JournalArchive.capture(local), JournalArchive.capture(remote));
    const lc = parse(local[CONTEXT], 'contexte local'), rc = parse(remote[CONTEXT], 'contexte distant');
    const base = obj(lc) ? lc : { v: 1 };   // le contexte du jour, le lieu et le trajet en cours restent ceux de cet appareil
    const debrief = lc || rc ? journal(base.debrief, rc && rc.debrief) : null;
    const mirror = local[JournalArchive.MIRROR] != null || remote[JournalArchive.MIRROR] != null
      ? journal(parse(local[JournalArchive.MIRROR], 'journal local'), parse(remote[JournalArchive.MIRROR], 'journal distant')) : null;
    // L'archive inclut aussi les entrées telles que normalisées ci-dessus : une deuxième fusion n'ajoute rien.
    archive = JournalArchive.union(archive, ...[debrief, mirror].filter(Boolean).map(d => JournalArchive.collect(d)));
    report.journal.before = JournalArchive.capture(local).records.length; report.journal.after = archive.records.length;
    out[JournalArchive.KEY] = JSON.stringify(archive);
    if (debrief) out[CONTEXT] = JSON.stringify({ ...base, debrief: { ...debrief, archive }, done: later(base.done, rc && rc.done) });
    if (mirror) out[JournalArchive.MIRROR] = JSON.stringify({ ...mirror, archive });
    for (const k of [DONE, CANCEL]) if (local[k] != null || remote[k] != null) out[k] = JSON.stringify(later(parse(local[k], k), parse(remote[k], k)));
    // Refus intégral au-delà des capacités actuelles : aucune troncature silencieuse.
    for (const [k, limit] of [[REPORTS, 30], [SHADOW, 200]]) if (local[k] != null || remote[k] != null) {
      const a = parse(local[k], k), b = parse(remote[k], k);
      if (a != null && !Array.isArray(a) || b != null && !Array.isArray(b)) throw new Error('Observations incomplètes : fusion refusée.');
      const rows = unionBy(a, b, x => JSON.stringify(x)).sort((a, b) => stamp(a && a.at) - stamp(b && b.at));
      if (rows.length > limit) throw new Error('Fusion sans perte impossible : capacité des observations dépassée.');
      out[k] = JSON.stringify(rows);
    }
    const handled = new Set([SETTINGS, STAMPS, CONTEXT, DONE, CANCEL, REPORTS, SHADOW, JournalArchive.KEY, JournalArchive.MIRROR]);
    Object.keys(remote).forEach(k => {
      if (handled.has(k) || device(k)) return;
      if (local[k] !== remote[k]) report.keysKept.push(k);   // donnée inconnue différente : la valeur locale reste, signalée
    });
    if (report.journal.after < report.journal.before) throw new Error('Fusion refusée : le journal perdrait des trajets.');
    return { values: out, report };
  }
  return { SETTINGS, STAMPS, device, settings, values, get };
})();
