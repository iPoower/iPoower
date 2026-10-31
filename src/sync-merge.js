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
 *  4. Carnet de pleins (cars.N.fuel) : union par identifiant de plein. Une suppression (tombstone) est
 *     définitive ; sinon la révision la plus haute, puis la modification la plus récente, puis le texte.
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
    'twrc.decision.latest.v1', 'twrc.weather.incidents.v1', 'twrc.lastbackup', 'twrc.tyretherm.v1', 'twrc.view', 'twrc.presetv',
    // Diagnostic d'exécution, lien de configuration importé sur cet appareil, état de synchronisation local.
    'twrc.runtime.v1', 'twrc.cfghash']);
  const device = k => DEVICE.has(k) || /^twrc\.(cache\.|croute|road\.|session|restore\.|sync\.)/.test(k);
  const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Couvrir aussi les anciens réglages sans `edits` et les champs saisis sans
  // markEdit (photo, fiche...). Un écart non horodaté ne doit jamais disparaître.
  function differences(a, b, prefix = '') {
    if (same(a, b) || /^(edits|calib|journal)(\.|$)/.test(prefix) || /^cars\.\d+\.(odo|tire\.treads|fuel)(\.|$)/.test(prefix)) return [];
    if (prefix === 'cars' && Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((c, i) => c && b[i] && c.id === b[i].id))
      return a.flatMap((c, i) => differences(c, b[i], 'cars.' + i));
    // Voiture ajoutée d'un seul côté (liste prolongée) : seules les voitures communes se comparent champ
    // par champ ; l'ajout lui-même est une union par identifiant (carsAppended), jamais un horodatage de liste.
    if (prefix === 'cars' && carsAppended(a, b)) return a.slice(0, Math.min(a.length, b.length)).flatMap((c, i) => differences(c, b[i], 'cars.' + i));
    if (obj(a) && obj(b)) return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().flatMap(k => differences(a[k], b[k], prefix ? prefix + '.' + k : k));
    return prefix ? [prefix] : [];
  }
  function edits(before, after, previous, at) {
    validate(before); validate(after); validate(previous);
    const out = { ...previous };
    for (const path of differences(before, after)) { parts(path); out[path] = Math.max(stamp(at), stamp(out[path]) + 1); }
    return out;
  }
  const stamp = v => Number.isFinite(v) && v > 0 ? v : 0;
  const stampAt = (stamps, path) => { const p = parts(path); return Math.max(0, ...p.map((_, i) => stamp(stamps[p.slice(0, i + 1).join('.')]))); };
  // Modifié depuis la base : n'importe quel horodatage de la chaîne (chemin et parents) diffère de la
  // base. Jamais un maximum : un parent daté par une horloge en avance masquerait l'enfant (A1).
  const changedSince = (stamps, base, path) => { const p = parts(path); return p.some((_, i) => { const k = p.slice(0, i + 1).join('.'); return stamp(stamps[k]) !== stamp(base[k]); }); };
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
  function arrayKey(o, k) {
    if (Array.isArray(o) && !/^(0|[1-9][0-9]{0,5})$/.test(k)) throw new Error('Indice de liste interdit : fusion refusée.');
  }
  function get(o, path) { return parts(path).reduce((t, k) => { arrayKey(t, k); return own(t, k) ? t[k] : undefined; }, o); }
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
      arrayKey(t, k);
      if (i === p.length - 1) { t[k] = value; break; }
      if (!own(t, k) || !obj(t[k]) && !Array.isArray(t[k])) t[k] = /^\d+$/.test(p[i + 1]) ? [] : Object.create(null);
      t = t[k];
    }
  }
  function unset(o, path) {
    const p = parts(path), parent = p.length > 1 ? get(o, p.slice(0, -1).join('.')) : o, k = p[p.length - 1];
    if (parent != null && typeof parent === 'object' && !Array.isArray(parent) && own(parent, k)) delete parent[k];
  }
  // Les chemins « cars.N… » ne s'appliquent que si la voiture N est la même des deux côtés.
  // Vrai si l'une des listes prolonge l'autre par des voitures créées dans l'app : mêmes identifiants aux mêmes
  // places sur la partie commune, identifiants uniques. Seul cas fusionné automatiquement (ajout, jamais de suppression).
  function carsAppended(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length === b.length) return false;
    const ids = [...a, ...b].map(c => obj(c) && typeof c.id === 'string' && c.id ? c.id : null);
    if (ids.includes(null) || new Set(a.map(c => c.id)).size !== a.length || new Set(b.map(c => c.id)).size !== b.length) return false;
    const n = Math.min(a.length, b.length), tail = (a.length > b.length ? a : b).slice(n);
    // Seule une voiture créée dans l'app (userAdded) prolonge la liste : une liste distante raccourcie
    // ou vidée reste un conflit (suppression jamais déduite).
    return a.slice(0, n).every((c, i) => c.id === b[i].id) && tail.every(c => c.userAdded === 1);
  }
  function aligned(a, b, path) {
    const m = /^cars\.(\d+)(\.|$)/.exec(path); if (!m) return true;
    const x = a.cars && a.cars[+m[1]], y = b.cars && b.cars[+m[1]];
    return !!x && !!y && x.id === y.id;
  }
  // Pleins : l'enregistrement b remplace-t-il a ? Suppression d'abord (jamais de retour), puis révision,
  // date de modification et texte canonique : même gagnant quel que soit l'appareil qui fusionne.
  const fuelDead = e => Number.isSafeInteger(e.del) && e.del > 0, fuelRev = e => Number.isSafeInteger(e.rev) ? e.rev : 0;
  // Comparaison binaire (jamais localeCompare, qui dépend de la langue du système).
  const fuelCmp = (a, b) => a < b ? -1 : a > b ? 1 : 0, fuelText = (x, y) => fuelCmp(String(JSON.stringify(x)), String(JSON.stringify(y)));
  function fuelWins(a, b) {
    if (fuelDead(a) !== fuelDead(b)) return fuelDead(b);
    return (fuelRev(b) - fuelRev(a) || stamp(b.at) - stamp(a.at) || fuelText(b, a)) > 0;
  }
  function fuelUnion(a, b) {
    for (const list of [a, b]) if (list != null && (!Array.isArray(list) || list.some(e => !obj(e) || typeof e.id !== 'string' || !e.id || e.id.length > 64)))
      throw new Error('Pleins incomplets : fusion refusée.');
    const byId = new Map();
    [...(a || []), ...(b || [])].forEach(e => { if (!byId.has(e.id) || fuelWins(byId.get(e.id), e)) byId.set(e.id, e); });
    return [...byId.values()].sort((x, y) => fuelCmp(String(x.d || ''), String(y.d || '')) || fuelCmp(x.id, y.id)).map(clone);
  }
  const unionBy = (a, b, key) => {
    const seen = new Map(); [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].forEach(x => { const k = key(x); if (!seen.has(k)) seen.set(k, x); });
    return [...seen.values()];
  };

  // Fusion à trois voies. `options.base` : horodatages de l'ancêtre commun (null = inconnu).
  // Les horodatages servent seulement à savoir QUI a modifié depuis la base, jamais à comparer
  // les horloges de deux appareils. Sans base, deux modifications horodatées divergentes sont un
  // conflit. `options.resolutions` : choix explicites { chemin: 'local' | 'remote' }.
  function settings(local, remote, stampsLocal = {}, stampsRemote = {}, options = {}) {
    validate(local); validate(remote); validate(stampsLocal); validate(stampsRemote);
    if (!obj(local)) throw new Error('Réglages de cet appareil absents : fusion refusée.');
    const base = obj(options) && obj(options.base) ? options.base : null;
    const resolutions = obj(options) && obj(options.resolutions) ? options.resolutions : {};
    if (base) validate(base);
    validate(resolutions);
    const out = clone(local), report = { fromRemote: [], conflicts: [], resolved: [], added: { odo: 0, treads: 0, calib: 0, days: 0, cars: 0, fuel: 0 } };
    const fuelStamps = {};
    const chosen = {};
    if (!obj(remote)) return { settings: out, stamps: { ...stampsLocal }, report };
    if (!obj(stampsLocal) || !obj(stampsRemote) || !Array.isArray(local.cars) || !Array.isArray(remote.cars)) throw new Error('Réglages incomplets : fusion refusée.');
    for (const cars of [local.cars, remote.cars]) if (cars.some(c => !obj(c) || typeof c.id !== 'string' || !c.id) || new Set(cars.map(c => c.id)).size !== cars.length) throw new Error('Identités de véhicules ambiguës : fusion refusée.');
    const blocked = new Set();
    const paths = [...new Set([...Object.keys(local.edits || {}), ...Object.keys(remote.edits || {}),
      ...Object.keys(stampsLocal), ...Object.keys(stampsRemote), ...differences(local, remote)])].sort();   // parent avant enfant
    const appended = carsAppended(local.cars, remote.cars), shared = Math.min(local.cars.length, remote.cars.length);
    for (const p of paths) {
      parts(p);
      // Voiture ajoutée d'un seul côté : reprise entière par l'union ci-dessous, ses champs ne se comparent pas encore.
      const at = /^cars\.(\d+)(\.|$)/.exec(p);
      if (appended && (p === 'cars' || at && +at[1] >= shared)) continue;
      // Carnet de pleins : fusionné plein par plein ci-dessous, jamais arbitré comme un réglage.
      if (/^cars\.\d+\.fuel(\.|$)/.test(p)) continue;
      // Une liste complète pourrait supprimer des véhicules et leurs historiques.
      if (p === 'cars' || /^cars\.\d+$/.test(p)) { report.conflicts.push(p); blocked.add(p); continue; }
      const lv = get(local, p), rv = get(remote, p), a = stampAt(stampsLocal, p), b = stampAt(stampsRemote, p);
      if (!aligned(local, remote, p)) { report.conflicts.push(p); blocked.add(p); continue; }
      if (same(lv, rv)) continue;
      // Objet des deux côtés et jamais remplacé en tant que tel : l'écart vient de chemins enfants,
      // énumérés séparément (differences) ; ce sont eux qui décident, pas le parent.
      if (obj(lv) && obj(rv) && (base ? !changedSince(stampsLocal, base, p) && !changedSince(stampsRemote, base, p) : a === b)) continue;
      let verdict;
      if (base) {
        const mine = changedSince(stampsLocal, base, p), theirs = changedSince(stampsRemote, base, p);
        verdict = theirs && !mine ? 'remote' : mine && !theirs ? 'local' : 'conflict';
      } else verdict = a > 0 && b > 0 ? 'conflict' : b > a ? 'remote' : a > b ? 'local' : 'conflict';
      if (verdict === 'remote' && rv === undefined) verdict = 'conflict';
      if (verdict === 'conflict' && (resolutions[p] === 'local' || resolutions[p] === 'remote')) {
        verdict = resolutions[p]; report.resolved.push(p); chosen[p] = Math.max(a, b) + 1;
      }
      // Une absence distante ne s'applique que sur choix explicite (jamais par déduction).
      if (verdict === 'remote' && rv === undefined) { unset(out, p); }
      else if (verdict === 'remote') { set(out, p, clone(rv)); if (!chosen[p]) report.fromRemote.push(p); }
      else {
        if (lv !== undefined) set(out, p, clone(lv));
        if (verdict === 'conflict') { report.conflicts.push(p); blocked.add(p); }
      }
    }
    out.edits = { ...(obj(remote.edits) ? remote.edits : {}), ...(obj(local.edits) ? local.edits : {}) };
    // Ajout seulement : la voiture créée sur l'autre appareil est reprise entière à la fin de la liste.
    // Toute autre divergence de liste (suppression, ajouts concurrents différents) reste un conflit, rien n'est perdu.
    if (appended && remote.cars.length > local.cars.length) { out.cars = [...out.cars, ...clone(remote.cars.slice(local.cars.length))]; report.added.cars = remote.cars.length - local.cars.length; }
    else for (const car of remote.cars) if (!car || !local.cars.some(c => c && c.id === car.id)) report.conflicts.push('cars');
    // Mesures additives, voiture par voiture (identité = id, jamais la position).
    (out.cars || []).forEach(car => {
      if (!obj(car) || !car.id) throw new Error('Véhicule incomplet : fusion refusée.');
      const l = (local.cars || []).find(c => c && c.id === car.id), r = (remote.cars || []).find(c => c && c.id === car.id);
      if (!car || !r) return;
      if (l && l.odo != null && !Array.isArray(l.odo) || r.odo != null && !Array.isArray(r.odo)) throw new Error('Relevés incomplets : fusion refusée.');
      if ([...(l && l.odo || []), ...(r.odo || [])].some(x => !obj(x) || !x.d)) throw new Error('Relevé invalide : fusion refusée.');
      // Ordre canonique (date, puis contenu) : deux relevés du même jour gardent le même ordre sur les
      // deux appareils, sinon chacun republierait sans fin la liste permutée (NOESIS 13.5).
      const canon = (x, y) => String(x.d).localeCompare(String(y.d)) || (JSON.stringify(x) < JSON.stringify(y) ? -1 : JSON.stringify(x) > JSON.stringify(y) ? 1 : 0);
      const odo = unionBy(l && l.odo, r.odo, x => JournalArchive.encode(x)).sort(canon);
      report.added.odo += odo.length - (Array.isArray(l && l.odo) ? l.odo.length : 0); car.odo = odo;
      if (car.tire || r.tire) {
        const lt = l && l.tire && l.tire.treads, rt = r.tire && r.tire.treads;
        if (lt != null && !Array.isArray(lt) || rt != null && !Array.isArray(rt)) throw new Error('Profondeurs incomplètes : fusion refusée.');
        if (Array.isArray(lt) || Array.isArray(rt)) {
          const treads = unionBy(lt, rt, x => JSON.stringify(x)).sort(canon);
          report.added.treads += treads.length - (Array.isArray(lt) ? lt.length : 0);
          car.tire = { ...(car.tire || {}), treads };
        }
      }
      if ((l && l.fuel != null) || r.fuel != null) {
        const fuel = fuelUnion(l && l.fuel, r.fuel), p = 'cars.' + out.cars.indexOf(car) + '.fuel';
        report.added.fuel += fuel.length - (Array.isArray(l && l.fuel) ? l.fuel.length : 0); car.fuel = fuel;
        // Résultat différent de la copie distante : horodatage strictement plus récent que les DEUX copies d'origine.
        // Un appareil resté sur une version antérieure (qui ne connaît pas les pleins) voit alors une modification
        // datée par rapport à n'importe quel ancêtre commun et l'adopte, sans conflit.
        if (!same(fuel, Array.isArray(r.fuel) ? r.fuel : [])) fuelStamps[p] = Math.max(stamp(stampsLocal[p]), stamp(stampsRemote[p])) + 1;
      }
    });
    if (local.calib != null && !Array.isArray(local.calib) || remote.calib != null && !Array.isArray(remote.calib)) throw new Error('Retours incomplets : fusion refusée.');
    const calib = unionBy(local.calib, remote.calib, x => JSON.stringify(x));
    report.added.calib = calib.length - (Array.isArray(local.calib) ? local.calib.length : 0); out.calib = calib;
    // Journal de saison : résumés météo DÉRIVÉS (minimum du matin calculé par chaque appareil), jamais une
    // saisie. Un même matin enregistré différemment ne demande aucun arbitrage : choix déterministe, identique
    // sur les deux appareils (le relevé le plus froid, prudent pour les repères pneus hiver). Aucun jour perdu.
    const days = { ...(obj(remote.journal) ? remote.journal : {}), ...(obj(local.journal) ? local.journal : {}) };
    const cold = r => [obj(r) && Number.isFinite(r.T) ? r.T : Infinity, obj(r) && Number.isFinite(r.Tr) ? r.Tr : Infinity, JSON.stringify(r)];
    const colder = (x, y) => { const a = cold(x), b = cold(y); for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? x : y; return x; };
    for (const k of Object.keys(obj(remote.journal) ? remote.journal : {})) if (own(local.journal, k) && !same(local.journal[k], remote.journal[k])) days[k] = clone(colder(local.journal[k], remote.journal[k]));
    report.added.days = Object.keys(days).length - Object.keys(obj(local.journal) ? local.journal : {}).length; out.journal = days;
    const stamps = { ...stampsLocal };
    Object.entries(stampsRemote).forEach(([p, t]) => { if (!blocked.has(p) && stamp(t) > stamp(stamps[p])) stamps[p] = t; });
    Object.assign(stamps, chosen);   // un choix explicite devient la modification la plus récente des deux côtés
    Object.entries(fuelStamps).forEach(([p, t]) => { stamps[p] = Math.max(stamp(stamps[p]), t); });
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

  // `options.base` : valeurs déchiffrées de l'ancêtre commun (absent = base inconnue).
  function values(local, remote, options = {}) {
    if (!obj(local) || !obj(remote)) throw new Error('Deux coffres déchiffrés sont nécessaires : fusion refusée.');
    validate(local); validate(remote);
    const out = { ...local }, report = { settings: null, journal: { before: 0, after: 0 }, keysAdded: [], keysKept: [] };
    const sl = parse(local[STAMPS], 'horodatages locaux') || {}, sr = parse(remote[STAMPS], 'horodatages distants') || {};
    const ls = parse(local[SETTINGS], 'réglages locaux'), rs = parse(remote[SETTINGS], 'réglages distants');
    const baseStamps = obj(options) && obj(options.base) ? parse(options.base[STAMPS], 'horodatages de base') || {} : null;
    if (ls) {
      const m = settings(ls, rs, sl, sr, { base: baseStamps, resolutions: obj(options) ? options.resolutions : undefined });
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
    // Même fenêtre glissante que chaque appareil (weather-view : 30 signalements, 200 comparaisons).
    // Deux appareils pleins doivent pouvoir se synchroniser ; les révisions Drive précédentes gardent l'historique complet.
    for (const [k, limit] of [[REPORTS, 30], [SHADOW, 200]]) if (local[k] != null || remote[k] != null) {
      const a = parse(local[k], k), b = parse(remote[k], k);
      if (a != null && !Array.isArray(a) || b != null && !Array.isArray(b)) throw new Error('Observations incomplètes : fusion refusée.');
      const rows = unionBy(a, b, x => JSON.stringify(x)).sort((a, b) => stamp(a && a.at) - stamp(b && b.at));
      out[k] = JSON.stringify(rows.slice(-limit));
    }
    const handled = new Set([SETTINGS, STAMPS, CONTEXT, DONE, CANCEL, REPORTS, SHADOW, JournalArchive.KEY, JournalArchive.MIRROR]);
    Object.keys(remote).forEach(k => {
      if (handled.has(k) || device(k)) return;
      if (local[k] !== remote[k]) report.keysKept.push(k);   // donnée inconnue différente : la valeur locale reste, signalée
    });
    if (report.journal.after < report.journal.before) throw new Error('Fusion refusée : le journal perdrait des trajets.');
    return { values: out, report };
  }
  // Consultation d'un conflit : les deux versions d'un chemin de réglage. Une liste de véhicules
  // ou une clé entière n'est jamais résoluble par un simple choix (historiques à préserver).
  function conflictValues(local, remote, paths) {
    const ls = obj(local) ? parse(local[SETTINGS], 'réglages locaux') : null, rs = obj(remote) ? parse(remote[SETTINGS], 'réglages distants') : null;
    return (Array.isArray(paths) ? paths : []).map(p => {
      if (typeof p !== 'string' || p.startsWith('clé:') || p === 'cars' || /^cars\.\d+$/.test(p) || !obj(ls) || !obj(rs)) return { path: String(p), resolvable: false };
      try { return { path: p, local: clone(get(ls, p)), remote: clone(get(rs, p)), resolvable: true }; }
      catch { return { path: p, resolvable: false }; }
    });
  }
  return { SETTINGS, STAMPS, device, settings, values, get, differences, edits, conflictValues };
})();
