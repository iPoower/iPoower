// Ouvre un coffre chiffré (texte brut de twrc.vault.v2) avec le VRAI module src/session-vault.js, hors de la page :
// la comparaison ne dépend ni du rendu ni des écritures de l'onglet testé. Stockage isolé, données fictives.
// isDevice = SyncMerge.device, importé de src/sync-merge.js (jamais recopié) : clés propres à l'appareil.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), { webcrypto } = require('node:crypto');
const SRC = path.join(__dirname, '../../src');
function load(files, exports) {
  const ctx = { console, setTimeout, clearTimeout, TextEncoder, TextDecoder, atob, btoa, Event: class { constructor(t) { this.type = t; } } };
  vm.createContext(ctx);
  vm.runInContext(files.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n') + ';' + exports, ctx);
  return ctx;
}
const { SyncMerge } = load(['journal-archive.js', 'sync-merge.js'], 'this.SyncMerge=SyncMerge;');
const isDevice = key => SyncMerge.device(key);
const memory = () => { const m = new Map(); return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null,
  getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
// Contenu déchiffré du coffre : { clé: valeur }.
async function openVault(sealed, pass) {
  const ctx = load(['journal-archive.js', 'device-storage.js', 'remember-device.js', 'session-vault.js'], 'this.SV=SessionVault;this.RD=RememberDevice;');
  ctx.indexedDB = require('./indexeddb.fake')();
  const raw = memory(); raw.setItem(ctx.SV.VAULT, sealed);
  let tail = Promise.resolve();
  const locks = { request: (name, options, fn) => { const task = tail.then(fn); tail = task.catch(() => {}); return task; } };
  const vs = ctx.SV.create({ raw, session: memory(), crypto: webcrypto, target: null, sessionKeys: ctx.RD.sessions, locks });
  if (await vs.boot() !== 'locked') throw new Error('Coffre attendu verrouillé avant ouverture.');
  await vs.unlock(pass);
  const out = {}; for (let i = 0; i < vs.store.length; i++) { const k = vs.store.key(i); if (ctx.SV.secret(k)) out[k] = vs.store.getItem(k); }
  return out;
}
// Garde-fou du prédicat : les clés des données de l'utilisateur (réglages = voitures, pneus, compteur, profondeurs ;
// contexte et journal ; débriefs ; horodatages ; trajets clos ou annulés ; signalements ; preuves) ne sont JAMAIS
// des clés d'appareil. Un préfixe élargi dans SyncMerge.device rendrait sinon la comparaison aveugle.
// Et la clé de l'échec CI est bien une clé d'appareil (sinon le test ne prouverait pas la bonne chose).
const USER_KEYS = ['twrc.settings.v1', 'twrc.context.v1', 'twrc.debrief.v1', 'twrc.editstamps.v1', 'twrc.tripdone', 'twrc.tripcancel', 'twrc.reports.v1', 'twrc.shadow.v1', 'twrc.temoin.e2e73'];
function assertPredicate(device = isDevice) {
  const wrong = USER_KEYS.filter(k => device(k) !== false);
  if (wrong.length) throw new Error('Prédicat SyncMerge.device trop large : clés utilisateur classées « appareil » · ' + wrong.join(', '));
  if (device('twrc.weather.incidents.v1') !== true) throw new Error('Prédicat SyncMerge.device : twrc.weather.incidents.v1 doit rester une clé d’appareil.');
  return USER_KEYS.length;
}
// Clés dont la valeur diffère, clés propres à l'appareil exclues (triées).
const userDiff = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => !isDevice(k) && a[k] !== b[k]).sort();
module.exports = { openVault, userDiff, isDevice, assertPredicate, USER_KEYS };
