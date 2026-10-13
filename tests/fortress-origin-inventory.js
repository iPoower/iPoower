#!/usr/bin/env node
// Forteresse II — couverture statique des clés twrc.* du code, sans lire un profil utilisateur.
// Important : ce contrôle est un garde-fou source, PAS un inventaire runtime du navigateur.
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.join(__dirname, '../src');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : e.isFile() && e.name.endsWith('.js') ? [full] : [];
  });
}
const groups = {
  durable: [
    'twrc.settings.v1', 'twrc.context.v1', 'twrc.tyretherm.v1', 'twrc.tripcancel',
    'twrc.view', 'twrc.outfit.occasion'
  ],
  // Ces valeurs sont présentes dans le coffre mais ne sont PAS couvertes en intégralité
  // par Backup V2. Elles exigent classification approfondie et règle de consentement.
  review_before_export: [
    'twrc.reports.v1', 'twrc.shadow.v1', 'twrc.weather.incidents.v1', 'twrc.trend'
  ],
  ephemeral: [
    'twrc.gps', 'twrc.place.v1', 'twrc.tripstart.v1', 'twrc.tripend.v1',
    'twrc.returnhome.v1', 'twrc.tripdone', 'twrc.debrief.v1',
    'twrc.runtime.v1', 'twrc.weather.limit.v1', 'twrc.nocode',
    'twrc.presetv', 'twrc.cfghash', 'twrc.lastbackup', 'twrc.tripmap',
    'twrc.calendar.sealed.v1', 'twrc.decision.latest.v1'
  ],
  confidential_metadata: [
    'twrc.vault.v2', 'twrc.session.v2', 'twrc.device.vault.v1',
    'twrc.restore.pending.v1', 'twrc.lock.signal', 'twrc.remember-device.v1',
    'twrc.key', 'twrc.plain', 'twrc.plain.v'
  ],
  cache_prefix: ['twrc.cache.', 'twrc.croute', 'twrc.croute.', 'twrc.road.', 'twrc.reload.'],
  not_a_storage_key: ['twrc.weather.station.', 'twrc.tripcancel.']
};
const exact = new Map();
for (const [group, names] of Object.entries(groups)) {
  for (const name of names) {
    if (exact.has(name)) throw Error('classification dupliquée : ' + name);
    exact.set(name, group);
  }
}
function groupOf(k) {
  if (exact.has(k)) return exact.get(k);
  // Préfixes de cache : une clé dérivée ne devient pas durable par son nom.
  if (groups.cache_prefix.some(p => k.startsWith(p))) return 'cache_prefix';
  return null;
}
const uses = new Map();
for (const f of walk(root)) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const match of txt.matchAll(/twrc\.[A-Za-z0-9._-]+/g)) {
    const k = match[0];
    if (!uses.has(k)) uses.set(k, new Set());
    uses.get(k).add(path.relative(path.dirname(root), f));
  }
}
const unclassified = [...uses.keys()].filter(k => groupOf(k) == null);
assert.deepEqual(unclassified, [], 'référence twrc.* absente du registre statique : ' + unclassified.join(', '));
for (const required of ['twrc.settings.v1', 'twrc.context.v1', 'twrc.reports.v1', 'twrc.shadow.v1']) {
  assert(uses.has(required), 'référence attendue manquante : ' + required);
}
assert.equal(groupOf('twrc.vault.v2'), 'confidential_metadata');
assert.equal(groupOf('twrc.reports.v1'), 'review_before_export');
assert.equal(groupOf('twrc.shadow.v1'), 'review_before_export');
assert.equal(groupOf('twrc.cache.fiction'), 'cache_prefix');
assert.equal(groupOf('twrc.unknown.v9'), null, 'inconnue doit entraîner le blocage');
console.log('✅ inventaire statique : ' + walk(root).length + ' JS analysés · ' +
  uses.size + ' références distinctes classifiées ; ' +
  groups.review_before_export.length + ' classes en attente de décision');
console.log('ℹ️ Aucune valeur navigateur, IDB, clé cryptographique ou permission n’a été consultée.');
