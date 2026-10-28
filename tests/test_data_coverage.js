'use strict';
// NOESIS 13.4 — politique de couverture des données : chaque clé `twrc.*` du code est classée,
// et le classement doit correspondre au comportement RÉEL du coffre (export) et de Drive (sync).
// Une nouvelle clé non classée, ou une donnée utilisateur exclue sans justification, fait échouer la CI.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const src = path.resolve(__dirname, '../src');
const read = f => fs.readFileSync(path.join(src, f), 'utf8');

// Règles réelles : SessionVault (export/coffre) et SyncMerge.device (Drive).
const sv = read('session-vault.js'), grab = re => { const m = sv.match(re); assert(m, 'règle introuvable : ' + re); return m[0]; };
const rules = vm.runInNewContext([grab(/const VAULT = [^;]+;/), grab(/const PUBLIC = new Set\([^;]+;/), grab(/const isPublic = [^;]+;/),
  grab(/const isApp = [^;]+;/), grab(/const META = new Set\([^;]+;/), grab(/const secret = [^;]+;/), '({ secret })'].join('\n'));
const ctx = vm.createContext({}); vm.runInContext(read('sync-merge.js') + ';globalThis.M=SyncMerge;', ctx);
const exported = k => rules.secret(k), synced = k => rules.secret(k) && !ctx.M.device(k);

// Classes : user = saisie durable (export ET Drive obligatoires) ; device = propre à l'appareil
// (position, trajet en cours) ; derived = recalculable / estimation / diagnostic ; secret = jamais
// sur Drive ; preference = interface en clair ; meta = enveloppe du stockage brut.
const POLICY = {
  'twrc.settings.v1': ['user', 'véhicules, réglages, journal météo, relevés'],
  'twrc.editstamps.v1': ['user', 'horodatages de modification nécessaires à la fusion'],
  'twrc.context.v1': ['user', 'débriefs et trajets clos (contexte du jour exclu à la fusion)'],
  'twrc.debrief.v1': ['user', 'débriefs'], 'twrc.debrief.archive.v1': ['user', 'archive cumulative du journal'],
  'twrc.reports.v1': ['user', 'retours terrain'], 'twrc.shadow.v1': ['user', 'copies de comparaison'],
  'twrc.tripdone': ['user', 'trajets clos'], 'twrc.tripcancel': ['user', 'annulations'],
  'twrc.tyretherm.v1': ['derived', 'estimation thermique calculée (tyreLab), valable quelques heures, propre au véhicule conduit depuis cet appareil ; restaurée par la copie complète (backup.js DURABLE_KEYS), jamais par Drive'],
  'twrc.weather.incidents.v1': ['derived', 'journal de diagnostic des 20 dernières requêtes météo, sans saisie utilisateur'],
  'twrc.gps': ['device', 'position courante'], 'twrc.place.v1': ['device', 'lieu courant'],
  'twrc.tripstart.v1': ['device', 'trajet en cours sur cet appareil'], 'twrc.tripend.v1': ['device', 'fin du trajet en cours'],
  'twrc.returnhome.v1': ['device', 'retour en cours'],
  'twrc.cache.gps': ['derived', 'cache'], 'twrc.croute': ['derived', 'cache d’itinéraire'], 'twrc.trend': ['derived', 'tendance recalculée'],
  'twrc.decision.latest.v1': ['derived', 'dernière décision recalculée'], 'twrc.runtime.v1': ['derived', 'diagnostic d’exécution'],
  'twrc.lastbackup': ['derived', 'date du dernier export de cet appareil'], 'twrc.cfghash': ['derived', 'empreinte du lien de configuration importé'],
  'twrc.calendar.sealed.v1': ['derived', 'agenda chiffré re-téléchargé depuis la publication'],
  'twrc.key': ['secret', 'code de l’app : jamais sur Drive'], 'twrc.plain': ['secret', 'préréglage déchiffré, re-déchiffrable depuis la publication'],
  'twrc.plain.v': ['secret', 'version du préréglage'],
  'twrc.view': ['preference', ''], 'twrc.nocode': ['preference', ''], 'twrc.tripmap': ['preference', ''], 'twrc.presetv': ['preference', ''],
  'twrc.outfit.occasion': ['preference', ''], 'twrc.weather.limit.v1': ['preference', ''], 'twrc.lock.signal': ['preference', ''],
  'twrc.vault.v2': ['meta', ''], 'twrc.session.v2': ['meta', ''], 'twrc.device.vault.v1': ['meta', ''], 'twrc.restore.pending.v1': ['meta', ''],
};
// Noms de bases IndexedDB (hors coffre) : file Drive, clé de sync, « appareil personnel ».
const INDEXED_DB = new Set(['twrc.drive.sync.v1', 'twrc.sync-key.v1', 'twrc.remember-device.v1']);

const keys = new Set();
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) { if (e.name !== 'vendor') walk(p); }
  else if (/\.(js|html)$/.test(e.name)) for (const m of fs.readFileSync(p, 'utf8').matchAll(/['"`](twrc\.[A-Za-z0-9_.-]*[A-Za-z0-9_-])['"`]/g)) keys.add(m[1]);
});
walk(src);

let n = 0; const check = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
check('chaque clé du code est classée (aucune donnée oubliée silencieusement)', () => {
  const missing = [...keys].filter(k => !INDEXED_DB.has(k) && !POLICY[k]);
  assert.deepEqual(missing, [], 'clés à classer dans tests/test_data_coverage.js : ' + missing.join(', '));
});
check('le classement correspond au comportement réel du coffre et de Drive', () => {
  for (const [k, [cls]] of Object.entries(POLICY)) {
    const want = { user: [true, true], device: [true, false], derived: [true, false], secret: [true, false], preference: [false, false], meta: [false, false] }[cls];
    assert.deepEqual([exported(k), synced(k)], want, k + ' : classe ' + cls + ' attendue export/Drive ' + want);
  }
});
check('toute exclusion de Drive d’une donnée exportée est justifiée', () => {
  for (const [k, [cls, why]] of Object.entries(POLICY)) if (exported(k) && !synced(k)) assert(why && why.length >= 5, k + ' : justification manquante (' + cls + ')');
});
check('backup.js : chaque donnée « durable » de la copie complète est soit synchronisée, soit une exclusion justifiée', () => {
  const m = read('backup.js').match(/const DURABLE_KEYS = \[([^\]]*)\]/); assert(m, 'DURABLE_KEYS introuvable');
  for (const k of [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])) {
    assert(POLICY[k], k + ' non classée');
    if (!synced(k)) assert(/copie complète/.test(POLICY[k][1]), k + ' : exclue de Drive sans mention de la copie complète');
  }
});
console.log(`\n✅ ${n} contrôles de couverture · ${keys.size} clés relevées dans src/`);
