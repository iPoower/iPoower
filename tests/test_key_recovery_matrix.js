'use strict';
// NOESIS 13.4 — matrice de récupération des clés, codes ENTIÈREMENT FICTIFS, modules de production.
// Chaque « nouvel appareil » est un contexte vm neuf : aucun état partagé hors des éléments légitimes
// de récupération (code + copie exportée, ou code + descripteur/paquets Drive).
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), { webcrypto } = require('node:crypto');
const modules = ['journal-archive', 'debrief', 'device-storage', 'remember-device', 'session-vault', 'sync-merge', 'sync-revisions', 'sync-outbox', 'sync-key', 'control-vault-packet', 'drive-store', 'drive-transport', 'drive-sync'];
const source = modules.map(n => fs.readFileSync(path.resolve(__dirname, '../src/' + n + '.js'), 'utf8')).join('\n');
const plain = v => JSON.parse(JSON.stringify(v));
const OLD = 'code-fictif-ancien-2026', NEW = 'code-fictif-nouveau-2027', WRONG = 'code-fictif-faux';
function storage() {
  const m = new Map();
  return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.get(k) ?? null,
    setItem(k, v) { m.set(k, String(v)); }, removeItem(k) { m.delete(k); }, dump: () => Object.fromEntries(m) };
}
function lock() { let chain = Promise.resolve(); return { request(name, options, fn) { if (typeof options === 'function') fn = options; const p = chain.then(() => fn({ name })); chain = p.catch(() => {}); return p; } }; }
// Un appareil = un contexte neuf + ses propres stockages.
function device() {
  const ctx = { crypto: webcrypto, navigator: { locks: lock(), onLine: true }, structuredClone, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
    URL, atob, btoa, JSON, Object, Array, Map, Set, Proxy, Reflect, console, setTimeout, clearTimeout };
  vm.createContext(ctx); vm.runInContext(source + ';this.A={SessionVault,SyncKey,ControlVaultPacket,DriveSync,JournalArchive,SyncRevisions};', ctx);
  const raw = storage(), ses = storage();
  return { A: ctx.A, raw, ses, vault: () => ctx.A.SessionVault.create({ raw, session: ses, crypto: webcrypto, target: null, locks: ctx.navigator.locks }) };
}
const business = { 'twrc.settings.v1': JSON.stringify({ cars: [{ id: 'carA', odo: [{ d: '2026-10-20', km: 12345 }], tire: { dot: '0126', treads: [{ d: '2026-10-20', mm: 6 }] } }], edits: {}, calib: [], journal: {} }),
  'twrc.context.v1': JSON.stringify({ v: 1, debrief: { active: null, entries: [] }, done: {} }), 'twrc.tyretherm.v1': JSON.stringify({ carA: { at: 1, T: 21.5 } }) };
const results = [];
const scenario = async (id, name, level, fn) => {
  try { await fn(); results.push({ id, name, level, verdict: 'OK' }); console.log('✅ ' + id + ' ' + name); }
  catch (e) { results.push({ id, name, level, verdict: 'ÉCHEC', error: e.message }); console.error('❌ ' + id + ' ' + name + ' · ' + e.message); throw e; }
};

(async () => {
  // Appareil d'origine : coffre créé avec l'ANCIEN code, données métier fictives.
  const pc = device(), v = pc.vault();
  for (const [k, val] of Object.entries(business)) pc.raw.setItem(k, val);
  await v.unlock(OLD, { 'twrc.plain': '{"preset":"fictif"}', 'twrc.plain.v': '1' });
  const exportFile = pc.raw.getItem(pc.A.SessionVault.VAULT);   // copie complète chiffrée = coffre lui-même
  assert(exportFile && !exportFile.includes('12345') && !exportFile.includes(OLD), 'copie exportée chiffrée, sans code ni donnée en clair');

  await scenario('K1', 'iPhone perdu : nouvel appareil, copie exportée + code ⇒ toutes les valeurs restaurées', 'L2', async () => {
    const phone = device(), values = await phone.A.SessionVault.readRecovery(exportFile, OLD, webcrypto);
    for (const [k, val] of Object.entries(business)) assert.equal(values[k], val, k);
    assert.equal(values['twrc.key'], OLD, 'le code est dans le coffre, jamais en clair hors coffre');
  });
  await scenario('K2', 'Windows réinstallé : profil navigateur vierge, même procédure, aucune dépendance au PC d’origine', 'L2', async () => {
    const fresh = device(); assert.equal(fresh.raw.length, 0);
    const values = await fresh.A.SessionVault.readRecovery(exportFile, OLD, webcrypto); assert.equal(values['twrc.settings.v1'], business['twrc.settings.v1']);
  });
  await scenario('K3', 'mauvais code : refus, aucune valeur, copie intacte', 'L2', async () => {
    const other = device(); await assert.rejects(other.A.SessionVault.readRecovery(exportFile, WRONG, webcrypto));
    assert.equal(pc.raw.getItem(pc.A.SessionVault.VAULT), exportFile);
  });
  await scenario('K4', 'code du préréglage ≠ code du coffre (rotation APP_KEY) : nouveau code refusé SANS écriture, ancien code ouvre toujours le coffre', 'L2', async () => {
    const before = JSON.stringify(pc.raw.dump());
    await assert.rejects(pc.vault().unlock(NEW, null), e => e.name === 'OperationError' || /OperationError|déchiffr/i.test(String(e)));
    assert.equal(JSON.stringify(pc.raw.dump()), before, 'aucun octet du stockage modifié');
    const reopened = pc.vault(); await reopened.unlock(OLD, null);   // aucune exception : coffre rouvert avec l'ancien code
    const values = await pc.A.SessionVault.readRecovery(pc.raw.getItem(pc.A.SessionVault.VAULT), OLD, webcrypto);
    assert.equal(values['twrc.settings.v1'], business['twrc.settings.v1'], 'contenu intact');
  });
  // Synchronisation Drive : descripteur public (sel, contrôle GCM) + code ⇒ clé de sync, sur appareil neuf.
  const origin = device(), created = await origin.A.SyncKey.create(OLD, webcrypto);
  const codecA = origin.A.ControlVaultPacket.create({ validateBusiness: origin.A.DriveSync.validateBusiness, crypto: webcrypto });
  const withArchive = { ...business }; withArchive[origin.A.JournalArchive.KEY] = JSON.stringify(origin.A.JournalArchive.capture(business));
  const projected = plain(origin.A.DriveSync.projection(withArchive));
  const data = plain(origin.A.SyncRevisions.snapshot(projected, { id: '1'.repeat(32), parents: [], device: '2'.repeat(32), seq: 1 }, () => false, '2026-10-28T10:00:00.000Z'));
  const packet = await codecA.sealWith(data, created.handle, 'prod-999', data.at);
  await scenario('K5', 'perte simultanée PC + iPhone : descripteur Drive + code ⇒ clé de sync re-dérivée sur appareil vierge, paquet déchiffré', 'L2', async () => {
    assert(packet, 'paquet de synchronisation fictif scellé');
    const blank = device(), descriptor = blank.A.SyncKey.parse(new TextEncoder().encode(JSON.stringify(created.descriptor)));
    const handle = await blank.A.SyncKey.derive(descriptor, OLD, webcrypto);
    const codecB = blank.A.ControlVaultPacket.create({ validateBusiness: blank.A.DriveSync.validateBusiness, crypto: webcrypto });
    const opened = await codecB.openWith(packet, handle, 'prod-999');
    assert.equal(opened.values['twrc.settings.v1'], business['twrc.settings.v1']);
    assert(!JSON.stringify(created.descriptor).includes(OLD), 'le descripteur public ne contient pas le code');
  });
  await scenario('K6', 'Drive avec mauvais code ou code après rotation : clé refusée par le contrôle GCM, rien déchiffré', 'L2', async () => {
    const blank = device(), descriptor = blank.A.SyncKey.parse(new TextEncoder().encode(JSON.stringify(created.descriptor)));
    for (const code of [WRONG, NEW]) await assert.rejects(blank.A.SyncKey.derive(descriptor, code, webcrypto));
  });
  await scenario('K7', 'Control Vault ne détient jamais de quoi déchiffrer : le transport embarqué ne contient ni decrypt ni dérivation', 'L1', async () => {
    const vendor = fs.readFileSync(path.resolve(__dirname, '../src/drive-transport.js'), 'utf8');
    assert.equal((vendor.match(/subtle\.(decrypt|deriveKey|deriveBits|importKey|unwrapKey)/g) || []).length, 0);
  });
  await scenario('K8', 'sauvegarde ancienne : coffre v2/v3 relu par readRecovery (formats acceptés : v2, v3 ; 600 000 itérations)', 'L2', async () => {
    const vault = JSON.parse(exportFile); assert([2, 3].includes(vault.v)); assert.equal(vault.it, 600000);
    const forged = JSON.stringify({ ...vault, it: 100000 });
    await assert.rejects(device().A.SessionVault.readRecovery(forged, OLD, webcrypto), /inconnue/, 'itérations affaiblies refusées');
  });
  if (process.env.NOESIS_OUT) fs.writeFileSync(process.env.NOESIS_OUT, JSON.stringify(results, null, 1));   // preuve hors dépôt, sur demande
  console.log(`\n✅ ${results.length} scénarios de récupération des clés, codes fictifs uniquement`);
})().catch(e => { console.error(e); process.exitCode = 1; });
