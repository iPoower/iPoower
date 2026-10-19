'use strict';
// Vrai gestionnaire d'import + vrai DeviceStorage, stockage et panne fictifs.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
async function run() {
  const source = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  const begin = source.indexOf('async function backupApplyPlan(plan) {'), end = source.indexOf('\nasync function backupImport(', begin);
  assert(begin >= 0 && end > begin, 'gestionnaire réel retrouvé');
  const make = (concurrent, fail = true) => {
    const map = new Map([['twrc.settings.v1', 'avant-réglages'], ['twrc.context.v1', 'avant-contexte']]);
    const storage = { get length() { return map.size; }, key: i => [...map.keys()][i] ?? null,
      getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
    let calls = 0;
    const vault = { mode: 'vault', error: null, async flush() {
      if (++calls === 1) { if (concurrent) concurrent(storage); if (fail) this.error = 'panne fictive'; }
    } };
    const ctx = { window: { TWRC_VAULT: vault }, localStorage: storage }; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/device-storage.js'), 'utf8') + '\n' + source.slice(begin, end) + ';this.apply=backupApplyPlan;', ctx);
    return { storage, apply: ctx.apply, calls: () => calls };
  };
  const plan = () => ({ writes: { 'twrc.settings.v1': 'import-réglages' }, remove: ['twrc.context.v1'], removePrefixes: [] });
  for (const key of ['twrc.settings.v1', 'twrc.context.v1']) {
    const t = make(s => { s.setItem(key, 'ajout-concurrent'); s.setItem('twrc.unrelated', 'autre-ajout'); });
    let error; try { await t.apply(plan()); } catch (e) { error = e; }
    assert(error, 'aucun succès sur panne');
    assert.equal(t.storage.getItem(key), 'ajout-concurrent', key + ' concurrent conservé');
    assert.equal(t.storage.getItem('twrc.unrelated'), 'autre-ajout');
    assert.equal(error.restoreConflict, true, 'conflit distingué du retour exact');
    assert.equal(t.storage.getItem(key === 'twrc.settings.v1' ? 'twrc.context.v1' : 'twrc.settings.v1'), key === 'twrc.settings.v1' ? 'avant-contexte' : 'avant-réglages');
  }
  const t = make(null); await assert.rejects(t.apply(plan()));
  assert.equal(t.storage.getItem('twrc.settings.v1'), 'avant-réglages'); assert.equal(t.storage.getItem('twrc.context.v1'), 'avant-contexte');
  const ok = make(null, false); await ok.apply(plan());
  assert.equal(ok.storage.getItem('twrc.settings.v1'), 'import-réglages'); assert.equal(ok.storage.getItem('twrc.context.v1'), null); assert.equal(ok.calls(), 1);
  // Deux sélections de fichier ne doivent pas démarrer deux restaurations.
  // Fonction d'entrée réelle ; lecture lente et fichiers invalides fictifs.
  const importStart = source.indexOf('async function backupImport(f) {'), importEnd = source.indexOf('/* ---------- astuces', importStart);
  assert(importStart >= 0 && importEnd > importStart);
  const entry = { window: { TWRC_VAULT: { mode: 'vault', journalNeedsRecovery: false } },
    SessionVault: { validVault: () => false }, bkMsg: () => {} };
  vm.createContext(entry);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/device-storage.js'), 'utf8') +
    '\nlet backupImportBusy = false;\n' + source.slice(importStart, importEnd) + ';this.restore=backupImport;this.storage=DeviceStorage;', entry);
  let finish, reads = 0;
  const gate = new Promise(resolve => { finish = resolve; });
  const firstImport = entry.restore({ text: () => { reads++; return gate; } });
  const file = { text: async () => { reads++; return '{}'; } };
  await entry.restore(file); assert.equal(reads, 1, 'second import refusé avant lecture du fichier');
  finish('{}'); await firstImport;
  await entry.restore(file); assert.equal(reads, 2, 'refus de fichier libère le verrou');
  await entry.restore({ text: async () => { throw new Error('lecture fictive interrompue'); } });
  await entry.restore(file); assert.equal(reads, 3, 'lecture interrompue libère le verrou');
  entry.storage.freeze(true); await entry.restore(file); assert.equal(reads, 3, 'rechargement/stockage gelé interdit tout nouvel import');
  entry.storage.freeze(false); await entry.restore(file); assert.equal(reads, 4);
  console.log('✅ Import : rollback exact sans conflit, ajouts concurrents préservés et absence de faux succès');
}
module.exports = run;
if (require.main === module) run().catch(e => { console.error('❌ ' + e.message); process.exitCode = 1; });
