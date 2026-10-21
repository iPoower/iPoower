'use strict';
// Propriétaire de test : vrais modules métier RC, uniquement données fictives.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const names = ['journal-archive.js', 'debrief.js', 'calendar-origin.js', 'backup.js', 'config-import.js', 'control-vault-packet.js'];
const source = names.map(n => fs.readFileSync(path.join(__dirname, '../../src', n), 'utf8')).join('\n');
const exportsSource = ';this.owner={ P:ControlVaultPacket, B:Backup, J:JournalArchive, C:ConfigImport };';
function load(crypto = webcrypto) {
  const context = { Date, JSON, Math, Number, Object, Array, RegExp, Set, Map, String, Uint8Array, TextEncoder, TextDecoder, atob, btoa, crypto };
  vm.createContext(context); vm.runInContext(source + exportsSource, context);
  const owner = context.owner;
  const validateBusiness = data => {
    const wanted = data.v === 1 ? ['app', 'v', 'at', 'settings', 'view'] : ['app', 'v', 'at', 'settings', 'view', 'durable'];
    if (Object.keys(data).length !== wanted.length || !wanted.every(k => Object.hasOwn(data, k)) ||
      !owner.C.validateTyreExtensions(data.settings)) return false;
    if (data.v === 2) {
      const c = data.durable?.context;
      if (!c || c.gps !== null || c.tripStart !== null || c.tripEnd !== null || c.returnHome !== null || c.debrief?.active !== null) return false;
      owner.J.read(c.debrief.archive);
    }
    return !!owner.B.restorePlan(data, Date.parse(data.at));
  };
  return { ...owner, codec: owner.P.create({ crypto, validateBusiness }), validateBusiness };
}
const at = '2026-10-21T10:00:00.000Z', code = 'synthetic-owner-code';
const json = v => JSON.parse(JSON.stringify(v));
function business(owner, count = 120) {
  const epoch = Date.parse(at);
  const entries = Array.from({ length: count }, (_, i) => ({ key: 'fixture-' + i, at: epoch - (i === 0 ? 365 : 91) * 86400000 - i,
    how: 'confirmé', name: 'Trajet fictif', from: 'Lieu A', to: 'Lieu B', start: null, end: null,
    feedback: { at: epoch - i, conditions: ['rain'], grip: 'normal' }, deferred: false }));
  entries.push({ ...entries[0], feedback: { at: epoch + 1, conditions: ['fog'], grip: 'reduced' } });
  // Version ancienne non affichable : l'archive brute ne doit pas être remplacée
  // par la projection normalisée Backup/Debrief.
  const historical = { ...entries[0], oldField: { answers: ['ancien retour', 'autre version'] } };
  const values = { [owner.J.KEY]: JSON.stringify({ v: 1, records: [owner.J.encode(historical)] }),
    [owner.J.CONTEXT]: JSON.stringify({ debrief: { entries, active: { key: 'actif', gps: { lat: 1, lon: 2 } } }, gps: { lat: 1, lon: 2 } }) };
  const archive = owner.J.capture(values);
  const data = owner.B.make({ settings: { cars: [{ id: 'voitureA', odo: [{ d: '2026-10-20', km: 44000 }],
    tire: { treads: [{ d: '2026-10-20', mm: 6.2, ax: 'av' }] }, maintenance: [{ id: 'fictif', at }] }] },
    view: 'garage', context: JSON.parse(values[owner.J.CONTEXT]), at });
  data.durable.context.debrief.archive = archive;
  return { data: json(data), archive: json(archive), values };
}
module.exports = { source, exportsSource, load, business, at, code, json };
