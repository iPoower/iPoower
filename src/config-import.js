/* Liens historiques de configuration : validation bornée, URL nettoyée dès la
 * capture, contenu en mémoire uniquement jusqu'à l'authentification du coffre.
 * Aucun code personnel, nouvelle clé, réseau ou diagnostic de contenu ici. */
const ConfigImport = (() => {
  const SETTINGS = 'twrc.settings.v1', IDENTIFIER = 'twrc.cfghash';
  const MAX_BYTES = 128 * 1024, MAX_ENCODED = Math.ceil(MAX_BYTES / 3) * 4;
  const ID = /^sha256:[0-9a-f]{64}$/;
  const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const obj = o => !!o && typeof o === 'object' && !Array.isArray(o);
  const text = (v, n = 1200) => typeof v === 'string' && v.length <= n;
  const number = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const flag = v => v === 0 || v === 1 || v === false || v === true;
  const optional = (o, k, f) => !own(o, k) || f(o[k]);
  const fields = (o, allowed) => obj(o) && Object.keys(o).every(k => allowed.includes(k));
  const stringFields = (o, keys, nullable = false) => keys.every(k => optional(o, k, v => nullable && v === null || text(v)));
  const date = v => v === '' || typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v + 'T12:00:00Z')) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
  const time = v => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
  const boundedArray = (v, max, f) => Array.isArray(v) && v.length <= max && v.every(f);

  function safeTree(value) {
    let nodes = 0;
    function visit(v, depth) {
      if (++nodes > 8192 || depth > 12) return false;
      if (v === null || typeof v === 'boolean') return true;
      if (typeof v === 'number') return Number.isFinite(v);
      if (typeof v === 'string') return v.length <= MAX_BYTES;
      if (Array.isArray(v)) return v.length <= 400 && v.every(x => visit(x, depth + 1));
      return obj(v) && Object.entries(v).every(([k, x]) => k.length <= 160 &&
        !k.split('.').some(p => forbidden.has(p)) && visit(x, depth + 1));
    }
    return visit(value, 0);
  }
  function place(v) {
    return fields(v, ['id', 'name', 'label', 'sub', 'lat', 'lon', 'dept', 'deptCode', 'city', 'cityCode', 'address', 'provider', 'precision', 'country', 'countryCode']) &&
      text(v.id, 120) && v.id.length > 0 && text(v.name || v.label, 220) &&
      stringFields(v, ['name', 'label', 'sub', 'dept', 'deptCode', 'city', 'cityCode', 'address', 'provider', 'precision', 'country', 'countryCode']) &&
      (number(v.lat, -90, 90) && number(v.lon, -180, 180) || v.lat === null && v.lon === null);
  }
  const TIRE_FIELDS = ['type', 'brand', 'model', 'variant', 'homologation', 'size', 'tread', 'treadAv', 'treadAr', 'treadEst', 'press', 'mounted', 'dot', 'pchk', 'info', 'treads', 'mountKm', 'lastRot'];
  function tire(v) {
    return fields(v, TIRE_FIELDS) && stringFields(v, ['brand', 'model', 'variant', 'homologation', 'size', 'press', 'dot', 'info'], true) &&
      optional(v, 'type', x => ['summer', 'winter', 'allseason', 'unknown', 'none'].includes(x)) &&
      ['tread', 'treadAv', 'treadAr'].every(k => optional(v, k, x => x === null || number(x, 0, 20))) &&
      optional(v, 'treadEst', x => x === null || flag(x)) && optional(v, 'mounted', x => x === null || date(x)) &&
      ['mountKm', 'lastRot'].every(k => optional(v, k, x => x === null || number(x, 0, 10000000))) &&
      optional(v, 'pchk', x => x === null || fields(x, ['date', 'T', 'av', 'ar']) && date(x.date) && (x.T === null || number(x.T, -100, 100)) &&
        ['av', 'ar'].every(k => optional(x, k, a => a === null || number(a, 0, 6)))) &&
      optional(v, 'treads', x => x === null || boundedArray(x, 30, r => fields(r, ['d', 'mm', 'km', 'ax', 'est', 'pos', 'wheel']) && date(r.d) && r.d !== '' &&
        number(r.mm, 0, 20) && (r.km === null || number(r.km, 0, 10000000)) && optional(r, 'ax', a => ['av', 'ar', 'both'].includes(a)) && optional(r, 'est', flag) &&
        optional(r, 'pos', a => ['unknown', 'shoulders', 'centre', 'inner', 'outer'].includes(a)) &&
        optional(r, 'wheel', a => a === null || ['front-left', 'front-right', 'rear-left', 'rear-right'].includes(a) && (r.ax === 'av' ? a.startsWith('front-') : r.ax === 'ar' ? a.startsWith('rear-') : false))));
  }
  function plan(v) {
    return fields(v, ['on', 'brand', 'model', 'size', 'date', 'ordered', 'etaFrom', 'etaTo', 'etaChecked', 'appointmentDate', 'appointmentConfirmed']) &&
      stringFields(v, ['brand', 'model', 'size']) && optional(v, 'on', flag) && optional(v, 'appointmentConfirmed', flag) &&
      ['date', 'ordered', 'etaFrom', 'etaTo', 'etaChecked', 'appointmentDate'].every(k => optional(v, k, date));
  }
  function car(v) {
    return fields(v, ['id', 'name', 'short', 'spec', 'sporty', 'tire', 'plan', 'sets', 'odo', 'photo']) &&
      text(v.id, 120) && v.id.length > 0 && text(v.name, 220) && stringFields(v, ['short', 'spec']) &&
      optional(v, 'sporty', flag) && optional(v, 'tire', tire) && optional(v, 'plan', plan) &&
      optional(v, 'sets', x => fields(x, ['summer', 'winter', 'allseason', 'unknown', 'none']) && Object.values(x).every(tire)) &&
      optional(v, 'odo', x => boundedArray(x, 60, r => fields(r, ['d', 'km']) && date(r.d) && r.d !== '' && number(r.km, 0, 10000000))) &&
      optional(v, 'photo', x => text(x, 96000) && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(x));
  }
  const ROOT_FIELDS = ['v', 'configured', 'locs', 'customs', 'work', 'cars', 'dept', 'horizon', 'rainThr', 'alerts', 'flags', 'gpsAuto', 'road', 'calib', 'journal', 'edits', 'calOrigins', 'calDirect', 'ntfy'];
  const ALERTS = ['t7', 't5s', 't0', 'ice', 'snow', 'rain', 'fog', 'vis', 'frost', 'drop', 'pre', 'press', 'age', 'glare', 'mont', 'vigi', 'ens', 'rain15'];
  const FLAGS = ['weatherEvidenceV2', 'f1RaceEngineer', 'f1TrackConditions', 'f1TyreManagement', 'f1StrategyAB', 'f1TheGarage', 'f1TelemetryReplay'];
  function journal(v) {
    return obj(v) && Object.keys(v).length <= 400 && Object.entries(v).every(([d, r]) => date(d) && d !== '' &&
      fields(r, ['T', 'Tr', 'ice', 'vis', 'lv']) && number(r.T, -100, 100) && number(r.Tr, -100, 150) &&
      number(r.ice, 0, 3) && number(r.vis, 0, 1000000) && obj(r.lv) && Object.entries(r.lv).every(([id, x]) => text(id, 120) && number(x, 0, 4)));
  }
  function calOrigins(v) {
    return obj(v) && Object.keys(v).length <= 256 && Object.entries(v).every(([id, legs]) => /^cal-[0-9a-f]{32}$/.test(id) &&
      fields(legs, ['go', 'ret']) && Object.values(legs).every(r => fields(r, ['at', 'exp', 'choice']) && number(r.at, 0, 1e15) && number(r.exp, r.at, 1e15) &&
        (r.choice === null || fields(r.choice, ['kind', 'placeId', 'point']) && ['home', 'saved', 'address', 'gps'].includes(r.choice.kind) &&
          optional(r.choice, 'placeId', x => text(x, 120)) && optional(r.choice, 'point', p => fields(p, ['lat', 'lon', 'name', 'address', 'provider', 'precision']) &&
            number(p.lat, -90, 90) && number(p.lon, -180, 180) && stringFields(p, ['name', 'address', 'provider', 'precision'])))));
  }
  function validate(v) {
    try {
      if (!safeTree(v) || !fields(v, ROOT_FIELDS) || !Array.isArray(v.locs) || v.locs.length !== 2 || !v.locs.every(place) ||
        !Array.isArray(v.cars) || v.cars.length !== 2 || !v.cars.every(car) ||
        new Set(v.cars.map(c => c.id)).size !== 2 || new Set(v.locs.map(l => l.id)).size !== 2) return false;
      if (!optional(v, 'customs', x => boundedArray(x, 4, place)) ||
        !fields(v.work, ['from', 'to', 'durMin', 'dep', 'ret', 'days']) || !stringFields(v.work, ['from', 'to']) ||
        !optional(v.work, 'durMin', x => number(x, 1, 1440)) || !optional(v.work, 'dep', time) || !optional(v.work, 'ret', time) ||
        !optional(v.work, 'days', x => boundedArray(x, 7, d => Number.isInteger(d) && d >= 1 && d <= 7) && new Set(x).size === x.length)) return false;
      const locs = [...v.locs, ...(v.customs || [])], ids = new Set(locs.map(l => l.id));
      if (ids.size !== locs.length || ['from', 'to'].some(k => own(v.work, k) && !ids.has(v.work[k]))) return false;
      return optional(v, 'v', x => x === 1) && optional(v, 'configured', flag) && optional(v, 'gpsAuto', flag) &&
        optional(v, 'horizon', x => [6, 12, 24].includes(x)) && optional(v, 'rainThr', x => number(x, 1, 30)) &&
        optional(v, 'road', x => fields(x, ['on']) && optional(x, 'on', flag)) &&
        optional(v, 'dept', x => fields(x, ['code', 'name']) && stringFields(x, ['code', 'name'])) && optional(v, 'ntfy', x => text(x, 220)) &&
        optional(v, 'alerts', x => fields(x, ALERTS) && Object.values(x).every(flag)) &&
        optional(v, 'flags', x => fields(x, FLAGS) && Object.entries(x).every(([k, a]) => k === 'weatherEvidenceV2' ? ['off', 'shadow', 'on'].includes(a) : flag(a))) &&
        optional(v, 'journal', journal) && optional(v, 'calib', x => boundedArray(x, 30, r => fields(r, ['t', 'loc', 'kind', 'Tr', 'T']) &&
          text(r.t, 40) && text(r.loc, 120) && ['ice', 'wet', 'dry'].includes(r.kind) && (r.Tr === null || number(r.Tr, -100, 150)) && number(r.T, -100, 100))) &&
        optional(v, 'edits', x => obj(x) && Object.entries(x).every(([k, a]) => ROOT_FIELDS.includes(k.split('.')[0]) && flag(a))) &&
        optional(v, 'calOrigins', calOrigins) && optional(v, 'calDirect', x => obj(x) && Object.entries(x).every(([k, a]) => text(k, 120) && flag(a))) &&
        new TextEncoder().encode(JSON.stringify(v)).length <= MAX_BYTES;
    } catch (e) { return false; }
  }
  function decode(raw) {
    try {
      if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_ENCODED || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) return null;
      const b = raw.replace(/-/g, '+').replace(/_/g, '/');
      if (b.length % 4 === 1) return null;
      const bin = atob(b + '='.repeat((4 - b.length % 4) % 4));
      if (bin.length > MAX_BYTES) return null;
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
      return validate(value) ? value : null;
    } catch (e) { return null; }
  }
  function canonical(v) {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (obj(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
    return JSON.stringify(v);
  }
  async function identifier(cfg, crypto) {
    if (!validate(cfg) || !crypto || !crypto.subtle) throw new Error('Import non vérifiable.');
    const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('twrc-config-import-v1\n' + canonical(cfg))));
    return 'sha256:' + Array.from(sum, b => b.toString(16).padStart(2, '0')).join('');
  }
  async function legacyIdentifier(raw, crypto) { const cfg = decode(raw); return cfg ? identifier(cfg, crypto) : null; }

  // Un profil générique peut avoir enregistré des matins sans jamais avoir été
  // configuré. Les conserver ; toute saisie humaine interdit le remplacement.
  function initialSettings(cfg, before, baseline = null) {
    if (!validate(cfg)) return null;
    let old = null;
    if (before != null) {
      try { old = JSON.parse(before); } catch (e) { return null; }
      if (!obj(old) || old.configured !== 0 || !obj(baseline)) return null;
      const projection = value => {
        const out = { ...value }; delete out.journal;
        for (const k of ['edits', 'calOrigins', 'calDirect']) if (obj(out[k]) && !Object.keys(out[k]).length) delete out[k];
        return out;
      };
      // Ne pas faire confiance au seul drapeau configured=0 : chaque réglage
      // doit encore être exactement celui du profil générique de l'app.
      if (canonical(projection(old)) !== canonical(projection(baseline))) return null;
    }
    const next = JSON.parse(JSON.stringify(cfg)); next.configured = 1;
    next.edits = { ...(next.edits || {}) };
    Object.keys(cfg).filter(k => !['v', 'configured', 'edits'].includes(k)).forEach(k => { next.edits[k] = 1; });
    if (old && old.journal) { next.journal = { ...(next.journal || {}), ...old.journal }; next.edits.journal = 1; }
    return validate(next) ? next : null;
  }
  const message = result => ({
    applied: 'Configuration importée et enregistrement chiffré vérifié sur cet appareil.',
    duplicate: 'Ce lien a déjà été traité. Tes modifications et ton historique restent conservés.',
    configured: 'Import refusé : cet appareil possède déjà des réglages. Tes données restent conservées ; utilise les paramètres pour les modifier.',
    invalid: 'Lien de configuration ignoré : format ancien, invalide ou trop volumineux. Tes données restent conservées et le lien a été retiré de l’adresse. Si ce message revient à chaque ouverture, remplace le favori ou l’icône d’écran d’accueil par l’adresse simple de Race Control.',
    locked: 'Lien retiré de l’URL. L’import attend le déverrouillage de cet appareil et reste uniquement dans cet onglet.',
    unavailable: 'Import non appliqué : vérification ou sauvegarde indisponible. Tes données restent conservées.',
    url: 'Import refusé : le lien privé n’a pas pu être retiré de l’URL. Ne partage pas cette adresse.'
  }[result && result.state] || '');

  function create(target) {
    let pending = null, generation = 0, status = { state: 'none' }, chain = Promise.resolve(), rawBlocked = false;
    function capture() {
      const hash = target.location.hash || '', parts = hash.slice(1).split('&'), found = [], keep = [];
      for (const part of parts) {
        const at = part.indexOf('='), key = at < 0 ? part : part.slice(0, at);
        let decoded; try { decoded = decodeURIComponent(key); } catch (e) { decoded = key; }
        if (decoded === 'cfg') found.push(at < 0 ? '' : part.slice(at + 1)); else keep.push(part);
      }
      if (!found.length) return false;
      generation++; pending = null;
      try {
        const cleanHash = keep.filter(Boolean).length ? '#' + keep.filter(Boolean).join('&') : '';
        target.history.replaceState(target.history.state, '', target.location.pathname + target.location.search + cleanHash);
        if (target.location.hash !== cleanHash) throw new Error('URL non confirmée');
      } catch (e) { status = { state: 'url' }; return true; }
      let raw = null;
      try { if (found.length === 1 && found[0].length <= MAX_ENCODED * 3) raw = decodeURIComponent(found[0]); } catch (e) { /* valeur refusée */ }
      pending = decode(raw); status = { state: pending ? 'locked' : 'invalid' };
      return true;
    }
    function process(vault, baseline = null) {
      chain = chain.then(async () => {
        if (rawBlocked) { pending = null; status = { state: 'unavailable' }; return status; }
        if (!vault || vault.mode !== 'vault' || vault.expired() || vault.pendingRecovery || vault.error) return status;
        const rev = generation, cfg = pending;
        try {
          const result = await vault.importConfig(cfg, () => rev === generation, baseline);
          if (rev === generation) { pending = null; if (cfg || status.state === 'none') status = result; }
        } catch (e) { if (rev === generation) { pending = null; status = { state: 'unavailable' }; } }
        return status;
      });
      return chain;
    }
    function cleanup(raw) {
      if (removePlainIdentifier(raw)) return true;
      generation++; pending = null; rawBlocked = true; status = { state: 'unavailable' }; return false;
    }
    return { capture, process, cleanup, get pending() { return !!pending; }, get status() { return { ...status }; } };
  }
  // Supprimer seulement une ancienne copie brute de l'identifiant, après le
  // boot du coffre. Le coffre et tous les réglages/journaux restent inchangés.
  function removePlainIdentifier(raw) {
    try {
      if (raw.getItem(IDENTIFIER) === null) return true;
      raw.removeItem(IDENTIFIER); return raw.getItem(IDENTIFIER) === null;
    } catch (e) { return false; }
  }
  return { SETTINGS, IDENTIFIER, MAX_BYTES, MAX_ENCODED, ID, validate, decode, identifier, legacyIdentifier, initialSettings, message, create, removePlainIdentifier };
})();
