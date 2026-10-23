/* Révisions de synchronisation — lot D2 (addendum A2), PUR : ni réseau, ni stockage, ni écran.
 * Chaque copie est un fichier immuable. Ses métadonnées de révision (identifiant aléatoire, parents,
 * appareil, numéro d'ordre) existent en clair dans le catalogue ET dans le contenu chiffré ; seules les
 * métadonnées authentifiées, identiques au catalogue, entrent dans le graphe. Une tête n'est jamais
 * déclarée intégrée par une révision non authentifiée : aucune copie ne peut être masquée ainsi.
 * Deux têtes concurrentes restent deux versions récupérables jusqu'à une fusion sans conflit.
 */
'use strict';
const SyncRevisions = (() => {
  const ID = /^[0-9a-f]{32}$/, SHA = /^[0-9a-f]{64}$/, MAX_PARENTS = 8, APP = 'twrc-sync';
  const fail = code => { throw Object.assign(new Error(code), { code }); };
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const fields = (v, keys) => Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k));
  const iso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
    Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
  // Métadonnées minimales : aucun lieu, véhicule ou contenu.
  function meta(m) {
    if (!object(m) || !fields(m, ['id', 'parents', 'device', 'seq']) || !ID.test(m.id) || !ID.test(m.device) ||
      !Number.isSafeInteger(m.seq) || m.seq < 1 || !Array.isArray(m.parents) || m.parents.length > MAX_PARENTS ||
      m.parents.some(p => typeof p !== 'string' || !ID.test(p) || p === m.id) || new Set(m.parents).size !== m.parents.length ||
      m.parents.some((p, i) => i && m.parents[i - 1] > p)) return fail('INVALID_REVISION');
    return Object.freeze({ id: m.id, parents: Object.freeze([...m.parents]), device: m.device, seq: m.seq });
  }
  const same = (a, b) => a.id === b.id && a.device === b.device && a.seq === b.seq && a.parents.join() === b.parents.join();
  function next({ device, seq = 0, parents = [] }, crypto = globalThis.crypto) {
    const hex = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
    return meta({ id: hex, parents: [...new Set(parents)].sort(), device, seq: seq + 1 });
  }

  // Contenu chiffré : toutes les valeurs durables du coffre, sans l'état propre à l'appareil.
  function snapshot(values, rev, deviceKey, at = new Date().toISOString()) {
    if (!object(values) || typeof deviceKey !== 'function' || !iso(at)) return fail('CONSERVATION_BLOCKED');
    const kept = {};
    for (const k of Object.keys(values).sort()) {
      if (typeof k !== 'string' || !k.startsWith('twrc.') || typeof values[k] !== 'string') return fail('CONSERVATION_BLOCKED');
      if (!deviceKey(k)) kept[k] = values[k];
    }
    return { app: APP, v: 1, at, rev: { ...meta(rev), parents: [...rev.parents] }, values: kept };
  }
  function content(data, deviceKey) {
    if (!object(data) || data.app !== APP || data.v !== 1 || !fields(data, ['app', 'v', 'at', 'rev', 'values']) || !iso(data.at) || !object(data.values))
      return fail('CONSERVATION_BLOCKED');
    for (const [k, v] of Object.entries(data.values))
      if (!k.startsWith('twrc.') || typeof v !== 'string' || (typeof deviceKey === 'function' && deviceKey(k))) return fail('CONSERVATION_BLOCKED');
    return meta(data.rev);
  }
  // Une entrée de catalogue en clair n'est utilisable qu'après lecture authentifiée identique.
  function confirm(claimed, data, fileSha256, deviceKey) {
    const clear = meta(claimed), inner = content(data, deviceKey);
    if (typeof fileSha256 !== 'string' || !SHA.test(fileSha256) || !same(clear, inner)) return fail('REVISION_MISMATCH');
    return Object.freeze({ ...inner, fileSha256 });
  }

  // Propriétés de fichier Drive (≤ 124 octets clé + valeur) : reconstructibles, jamais l'arbitre seul.
  function properties(m) {
    const r = meta(m), out = { rcr: r.id, rcd: r.device, rcs: String(r.seq) };
    for (let i = 0; i * 3 < r.parents.length; i++) out['rcp' + i] = r.parents.slice(i * 3, i * 3 + 3).join(',');
    return out;
  }
  function fromProperties(p) {
    if (!object(p)) return fail('INVALID_REVISION');
    const keys = Object.keys(p).filter(k => k.startsWith('rc'));
    if (keys.some(k => !/^rc[rds]$|^rcp[0-2]$/.test(k)) || keys.some(k => typeof p[k] !== 'string' || k.length + p[k].length > 124) ||
      !/^[1-9][0-9]{0,15}$/.test(p.rcs || '')) return fail('INVALID_REVISION');
    const groups = [0, 1, 2].map(i => p['rcp' + i]);
    if (groups.some((g, i) => g === undefined && groups.slice(i + 1).some(x => x !== undefined))) return fail('INVALID_REVISION');
    const parents = groups.filter(g => g !== undefined).flatMap(g => g.split(','));
    return meta({ id: p.rcr, parents, device: p.rcd, seq: Number(p.rcs) });
  }

  // Plan déterministe sur les seules révisions confirmées. Aucune suppression n'est jamais proposée.
  function plan(confirmed, local) {
    if (!Array.isArray(confirmed) || !object(local) || !ID.test(local.device) || !Number.isSafeInteger(local.seq) || local.seq < 0 ||
      !Array.isArray(local.base) || local.base.some(b => !ID.test(b)) || typeof local.dirty !== 'boolean') return fail('INVALID_REVISION');
    const by = new Map(), warnings = [];
    for (const c of confirmed) {
      if (!object(c) || typeof c.fileSha256 !== 'string' || !SHA.test(c.fileSha256)) return fail('INVALID_REVISION');
      const m = { ...meta({ id: c.id, parents: c.parents, device: c.device, seq: c.seq }), fileSha256: c.fileSha256 };
      // Deux fichiers authentifiés peuvent partager toutes les métadonnées mais porter des octets différents.
      // Garder leur empreinte : choisir arbitrairement la première copie ferait disparaître l'autre contenu.
      if (by.has(m.id)) { if (!same(by.get(m.id), m) || by.get(m.id).fileSha256 !== m.fileSha256)
        return { action: 'blocked', reason: 'DUPLICATE_REVISION', heads: [], integrate: [], warnings }; continue; }
      by.set(m.id, m);
    }
    // Un graphe cyclique ne vient pas d'un producteur conforme : arrêt sans écriture.
    const state = new Map();
    const visit = id => {
      if (state.get(id) === 2 || !by.has(id)) return true;
      if (state.get(id) === 1) return false;
      state.set(id, 1);
      const ok = by.get(id).parents.every(visit);
      state.set(id, 2); return ok;
    };
    for (const id of by.keys()) if (!visit(id)) return { action: 'blocked', reason: 'REVISION_CYCLE', heads: [], integrate: [], warnings };
    const children = new Set();
    for (const m of by.values()) for (const p of m.parents) { if (by.has(p)) children.add(p); else warnings.push({ code: 'MISSING_PARENT', id: m.id, parent: p }); }
    const order = (a, b) => a.seq - b.seq || (a.device < b.device ? -1 : a.device > b.device ? 1 : a.id < b.id ? -1 : 1);
    const heads = [...by.values()].filter(m => !children.has(m.id)).sort(order);
    const covered = new Set(), stack = [...local.base];
    for (const b of local.base) if (!by.has(b)) warnings.push({ code: 'BASE_UNAVAILABLE', id: b });
    while (stack.length) {
      const id = stack.pop(); if (covered.has(id)) continue;
      covered.add(id); if (by.has(id)) stack.push(...by.get(id).parents);
    }
    const mine = [...by.values()].filter(m => m.device === local.device);
    const latest = mine.reduce((n, m) => Math.max(n, m.seq), 0);
    // Révision de cet appareil inconnue localement : profil restauré ou copié, jamais réutiliser le numéro.
    if (latest > local.seq) warnings.push({ code: 'DEVICE_AHEAD', seq: latest });
    const integrate = heads.filter(h => !covered.has(h.id)).map(h => h.id);
    const parents = heads.filter(h => covered.has(h.id)).map(h => h.id);
    const action = integrate.length ? 'integrate' : local.dirty ? 'push' : 'up-to-date';
    return { action, heads: heads.map(h => h.id), integrate, parents, nextSeq: Math.max(local.seq, latest) + 1, warnings };
  }
  // Après fusion locale : un conflit signalé interdit de déclarer la tête distante intégrée.
  // `changed` : l'état durable local diffère de sa base (saisie locale ou apport distant partiel).
  function settle(planned, merged, changed) {
    if (!object(planned) || !Array.isArray(merged) || typeof changed !== 'boolean') return fail('INVALID_REVISION');
    const integrated = [], conflicts = [];
    for (const m of merged) {
      if (!object(m) || !ID.test(m.id) || !planned.integrate.includes(m.id) || !object(m.report)) return fail('INVALID_REVISION');
      const r = m.report, list = [...((r.settings && r.settings.conflicts) || []), ...(r.keysKept || []).map(k => 'clé:' + k)];
      if (list.length) conflicts.push({ id: m.id, paths: [...new Set(list)].sort() }); else integrated.push(m.id);
    }
    const parents = [...new Set([...planned.parents, ...integrated])].sort();
    // Adopter une seule tête identique n'ajoute rien : pas de révision, sinon aller-retour sans fin.
    return { parents, integrated, conflicts, publish: changed || parents.length > 1 };
  }
  return Object.freeze({ APP, MAX_PARENTS, meta, next, snapshot, content, confirm, properties, fromProperties, plan, settle });
})();
