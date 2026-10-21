'use strict';
// Oracles indépendants : comparaison des sources AVANT nettoyage/projection.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), { webcrypto } = require('node:crypto'), { isDeepStrictEqual } = require('node:util');
const T = Date.parse('2026-10-16T12:00:00Z'), PASS = 'journal-fiction-only-1234';
const ctx = { TextEncoder, TextDecoder, atob, btoa, Uint8Array, setTimeout, clearTimeout };
vm.createContext(ctx);
vm.runInContext(['journal-archive', 'debrief', 'userctx', 'backup', 'device-storage', 'session-vault'].map(f => fs.readFileSync(path.join(__dirname, '../src/' + f + '.js'), 'utf8')).join('\n') + ';this.api={JournalArchive,Debrief,Backup,SessionVault,userContextStore};', ctx);
const { JournalArchive: J, Debrief: D, Backup: B, SessionVault: V } = ctx.api;
const json = v => JSON.parse(JSON.stringify(v));
const entry = (key, at = T - 1000, conditions = ['wet']) => ({ key, at, how: 'confirmé', name: 'Trajet fictif', from: 'Lieu A', to: 'Lieu B',
  start: { key, at: at - 60000, car: 'Véhicule fictif', prediction: { known: true, conditions: ['wet'], fetchedAt: at - 120000 } },
  feedback: { at: at + 100, conditions, grip: 'normal' } });
const source = Array.from({ length: 120 }, (_, i) => entry('fiction-' + i, T - (i === 0 ? 365 : i === 1 ? 91 : 1) * 86400000 - i));
source.push({ ...entry('fiction-2', source[2].at, ['fog']), start: null });
// Une source non affichable ne peut être détruite par la projection.
source.push({ legacyUnrecognized: 'source fictive à préserver', key: 'opaque' });
const sourceBytes = source.map(r => J.encode(r));
// Oracle indépendant : égalité structurelle des sources brutes, sans appeler
// le canonicaliseur, le nettoyeur ou le sélecteur de champs de production.
const containsSources = archive => source.every(original => archive.records.some(r => isDeepStrictEqual(JSON.parse(r), original)));
let count = 0;
const check = async (name, fn) => { await fn(); count++; console.log('✅ conservation : ' + name); };
function storage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { map, refused: false, ignored: false,
    get length() { return map.size; }, key: i => [...map.keys()][i] ?? null,
    getItem: k => map.get(k) ?? null,
    setItem(k, value) { if (this.refused && k === V.VAULT) throw Object.assign(new Error('quota fictif'), { name: 'QuotaExceededError' }); if (!this.ignored) map.set(k, String(value)); },
    removeItem: k => map.delete(k) };
}
module.exports = (async () => {
  await require('./test_journal_actions');
  await check('120 trajets, 91/365 jours, versions et source opaque sans troncature', () => {
    const before = JSON.stringify(source), state = D.clean({ entries: source }, T);
    assert.equal(state.entries.length, 120);
    assert.equal(JSON.stringify(source), before);
    assert(sourceBytes.every(r => state.archive.records.includes(r))); assert(containsSources(state.archive));
    assert(state.entries.find(e => e.key === 'fiction-2').start, 'le retour sans départ ne détruit pas la prévision');
    const reloaded = D.clean(json(state), T + 400 * 86400000);
    assert(sourceBytes.every(r => reloaded.archive.records.includes(r))); assert(containsSources(reloaded.archive));
  });
  await check('union commutative, associative, idempotente ; réponses à la même milliseconde', () => {
    const a = D.reply(D.clean({ entries: [source[2]] }, T), 'fiction-2', { conditions: ['ice'], grip: 'reduced' }, T);
    const b = D.reply(D.clean({ entries: [source[2]] }, T), 'fiction-2', { conditions: ['fog'], grip: 'slip' }, T);
    const union = J.union(a.archive, b.archive), reverse = J.union(b.archive, a.archive);
    assert.deepEqual(json(union), json(reverse)); assert.deepEqual(json(union), json(J.union(union, union)));
    assert.deepEqual(json(J.union(J.union(a.archive, b.archive), a.archive)), json(J.union(a.archive, J.union(b.archive, a.archive))));
    const result = D.clean({ archive: union }, T);
    assert.equal(new Set(result.archive.records.map(r => JSON.parse(r)).filter(e => e.feedback).map(e => JSON.stringify(e.feedback))).size, 3);
    assert.deepEqual(json(result), json(D.clean({ archive: reverse }, T)));
  });
  await check('V1/V2 historiques conservent tous les retours locaux ; futur refusé', () => {
    const phone = { context: { debrief: D.clean({ entries: source }, T) } };
    for (const v of [1, 2]) {
      const plan = B.restorePlan({ app: 'twrc', v, settings: {}, durable: v === 2 ? { context: { debrief: { entries: [entry('import-fiction')] } } } : undefined }, T, phone);
      assert(plan); const restored = JSON.parse(plan.writes[J.CONTEXT]);
      assert.equal(restored.debrief.entries.length, v === 1 ? 120 : 121);
      assert.equal(restored.debrief.archive.records.filter(r => JSON.parse(r)?.key === 'fiction-2' && JSON.parse(r)?.feedback).length >= 2, true);
    }
    assert.equal(B.restorePlan({ app: 'twrc', v: 999, settings: {} }, T, phone), null);
    assert.throws(() => J.read({ v: 999, records: [] }), /Archive/);
    assert.throws(() => J.read({ v: 1, records: ['{'] }));
  });
  await check('réponses identiques à la même milliseconde : deux identifiants, deux versions', () => {
    const state = D.clean({ entries: [source[2]] }, T);
    const first = D.reply(state, 'fiction-2', { conditions: ['ice'], grip: 'normal', id: 'a'.repeat(32) }, T);
    const second = D.reply(state, 'fiction-2', { conditions: ['ice'], grip: 'normal', id: 'b'.repeat(32) }, T);
    const archive = J.union(first.archive, second.archive);
    assert.equal(archive.records.map(r => JSON.parse(r)).filter(e => e?.feedback?.id).length, 2);
    assert.equal(J.union(first.archive, first.archive).records.length, first.archive.records.length);
  });
  await check('un contexte initialisé ne déclenche jamais v3, même sur un profil neuf', async () => {
    for (const entries of [[], source]) {
      const isolated = storage({
        'twrc.key': PASS,
        'twrc.settings.v1': JSON.stringify({ configured: 1, cars: [] }),
        [J.CONTEXT]: JSON.stringify({ v: 1, debrief: { entries } })
      });
      const locks = { request(name, opts, fn) { assert.equal(name, V.VAULT); return fn(); } };
      const vault = V.create({ raw: isolated, session: storage(), crypto: webcrypto, locks, target: null, now: () => T });
      assert.equal(await vault.boot(), 'vault');
      assert.equal(JSON.parse(isolated.getItem(V.VAULT)).v, 2);
      const profile = ctx.api.userContextStore({
        read: key => vault.store.getItem(key),
        write: (key, value) => value == null ? vault.store.removeItem(key) : vault.store.setItem(key, value),
        now: () => T,
        journalReadOnly: () => vault.journalNeedsRecovery
      });
      assert(profile.state.debrief.archive, 'la projection contient bien une archive');
      await vault.flush();
      assert.equal(vault.error, null, 'une projection historique ne doit pas bloquer le coffre');
      profile.state.dayContext.activeCarId = 'vehicule-fictif'; profile.flush();
      vault.store.setItem('twrc.settings.v1', JSON.stringify({ configured: 1, cars: [], ordinary: 'modifié' }));
      await vault.flush();
      assert.equal(vault.error, null, 'réglages et contexte hors journal enregistrables en v2');
      const recovered = await V.readRecovery(await vault.recoverySnapshot(), PASS, webcrypto);
      assert.equal(JSON.parse(recovered['twrc.settings.v1']).ordinary, 'modifié');
      assert.equal(JSON.parse(recovered[J.CONTEXT]).dayContext.activeCarId, 'vehicule-fictif');
      assert.deepEqual(JSON.parse(recovered[J.CONTEXT]).debrief.entries, entries, 'sources historiques inchangées avant activation');
      assert.equal(profile.retry(), true, 'relecture cohérente malgré une projection distincte des sources');
      const reopened = V.create({ raw: isolated, session: storage(), crypto: webcrypto, locks, target: null, now: () => T });
      assert.equal(await reopened.boot(), 'locked'); await reopened.unlock(PASS);
      const reloaded = ctx.api.userContextStore({ read: key => reopened.store.getItem(key),
        write: (key, value) => value == null ? reopened.store.removeItem(key) : reopened.store.setItem(key, value),
        now: () => T, journalReadOnly: () => reopened.journalNeedsRecovery });
      reloaded.state.debrief = D.clean(reloaded.state.debrief, T); reloaded.flush(); await reopened.flush();
      assert.equal(reopened.error, null); assert.equal(JSON.parse(isolated.getItem(V.VAULT)).v, 2);
      assert.deepEqual(JSON.parse(reopened.store.getItem(J.CONTEXT)).debrief.entries, entries);
      assert.equal(JSON.parse(isolated.getItem(V.VAULT)).v, 2, 'l’initialisation doit garder v2');
      assert.equal(vault.store.getItem(J.KEY), null, 'aucune clé archive créée sans action explicite');
      assert.equal(vault.journalNeedsRecovery, true, 'écriture du journal désactivée avant copie vérifiée');
      if (!entries.length) {
        const before = isolated.getItem(V.VAULT);
        vault.store.setItem(J.CONTEXT, JSON.stringify({ v: 1, debrief: { entries: [source[2]] } }));
        await vault.flush();
        assert(vault.error, 'premier débrief refusé avant activation');
        assert.equal(isolated.getItem(V.VAULT), before, 'aucun coffre modifié après refus');
      }
    }
  });
  let tail = Promise.resolve();
  const locks = { request(name, opts, fn) { assert.equal(name, V.VAULT); const result = tail.then(fn); tail = result.catch(() => {}); return result; } };
  const raw = storage({ 'twrc.key': PASS, 'twrc.settings.v1': JSON.stringify({ configured: 1, cars: [] }), [J.CONTEXT]: JSON.stringify({ v: 1, debrief: { entries: source } }) });
  const make = crypto => V.create({ raw, session: storage(), crypto: crypto || webcrypto, locks, target: null, now: () => T });
  const a = make(); await a.boot();
  const oldContext = { ...ctx }; vm.createContext(oldContext);
  vm.runInContext(require('./lib/legacy-vault-fixture').source + ';this.oldAPI=SessionVault;', oldContext);
  const oldReader = () => oldContext.oldAPI.create({ raw, session: storage(), crypto: webcrypto, locks, target: null, now: () => T });
  const old = oldReader(); await old.boot(); await old.unlock(PASS);
  let copy;
  await check('aucune migration implicite ; copie différente ou quota = octets précédents intacts', async () => {
    copy = await a.recoverySnapshot();
    assert.equal(V.validVault({ ...JSON.parse(copy), app: 'twrc-backup' }), false, 'une sauvegarde historique V2 n’est pas un coffre de récupération');
    // Tester le refus sans laisser une modification fictive en attente dans
    // le profil qui sera réellement activé avec la copie suivante.
    const original = { [J.CONTEXT]: JSON.stringify({ v: 1, debrief: { entries: source } }) };
    const modified = { [J.CONTEXT]: JSON.stringify({ v: 1, debrief: D.clean({ entries: [...source, entry('sans-copie')] }, T) }) };
    assert.throws(() => J.protect(original, modified), /Copie de récupération/);
    assert.equal(raw.getItem(V.VAULT), copy);
    await assert.rejects(a.activateJournal(copy + ' '), /copie/); assert.equal(raw.getItem(V.VAULT), copy);
    raw.refused = true; await assert.rejects(a.activateJournal(copy)); raw.refused = false;
    assert.equal(raw.getItem(V.VAULT), copy);
    // Copie plus ancienne que le coffre (réglage, météo ou GPS réécrits depuis l'export) : acceptée si elle
    // s'ouvre avec le code de l'appareil et contient tout le journal ; refusée sinon, sans aucune écriture.
    a.store.setItem('twrc.settings.v1', JSON.stringify({ configured: 1, cars: [], ordinary: 'réécrit après la copie' })); await a.flush();
    const rewritten = raw.getItem(V.VAULT); assert.notEqual(rewritten, copy);
    await assert.rejects(a.activateJournal(copy, 'code-fictif-incorrect'), /copie est illisible/); assert.equal(raw.getItem(V.VAULT), rewritten);
    const fewerRaw = storage({ 'twrc.key': PASS, 'twrc.settings.v1': JSON.stringify({ configured: 1, cars: [] }), [J.CONTEXT]: JSON.stringify({ v: 1, debrief: { entries: source.slice(0, 100) } }) });
    const fewer = V.create({ raw: fewerRaw, session: storage(), crypto: webcrypto, locks: { request: (n, o, fn) => fn() }, target: null, now: () => T });
    await fewer.boot(); const fewerCopy = await fewer.recoverySnapshot();
    await assert.rejects(a.activateJournal(fewerCopy, PASS), /ne contient pas \d+ trajets du journal actuel/); assert.equal(raw.getItem(V.VAULT), rewritten);
    await a.activateJournal(copy, PASS); assert.equal(JSON.parse(raw.getItem(V.VAULT)).v, 3);
    assert.equal(JSON.parse((await V.readRecovery(raw.getItem(V.VAULT), PASS, webcrypto))['twrc.settings.v1']).ordinary, 'réécrit après la copie', 'les données plus récentes que la copie sont conservées');
    const values = await V.readRecovery(copy, PASS, webcrypto);
    assert.deepEqual(JSON.parse(values[J.CONTEXT]).debrief.entries, source);
    assert(sourceBytes.every(r => J.capture(values).records.includes(r)), 'copie pré-migration récupérable et exhaustive');
    await assert.rejects(V.readRecovery(copy, 'code-fictif-incorrect', webcrypto));
  });
  await check('lecteur historique exact : ancien onglet ouvert, retour logiciel et réouverture refusent v3 sans écriture', async () => {
    const before = raw.getItem(V.VAULT);
    old.store.setItem(J.CONTEXT, JSON.stringify({ v: 1, debrief: { entries: [entry('ancien-onglet')] } }));
    await old.flush(); assert(old.error); assert.equal(raw.getItem(V.VAULT), before);
    const cold = oldReader(); assert.equal(await cold.boot(), 'locked'); assert.match(cold.warn, /conservé/);
    await assert.rejects(cold.unlock(PASS), /illisible/); assert.equal(raw.getItem(V.VAULT), before);
    const returned = make(); await returned.boot(); await returned.unlock(PASS);
    assert(containsSources(J.capture({ [J.KEY]: returned.store.getItem(J.KEY) })));
  });
  await check('deux contextes, même clé canonique et réponses concurrentes : union durable après réouverture', async () => {
    const b = make(); await b.boot(); await b.unlock(PASS);
    const stateA = D.clean(JSON.parse(a.store.getItem(J.CONTEXT)).debrief, T);
    const stateB = D.clean(JSON.parse(b.store.getItem(J.CONTEXT)).debrief, T);
    a.store.setItem(J.CONTEXT, JSON.stringify({ v: 1, debrief: D.reply(D.close(stateA, { key: 'onglet-A', how: 'confirmé' }, T), 'fiction-2', { conditions: ['ice'], grip: 'reduced' }, T) }));
    b.store.setItem(J.CONTEXT, JSON.stringify({ v: 1, debrief: D.reply(D.close(stateB, { key: 'onglet-B', how: 'confirmé' }, T), 'fiction-2', { conditions: ['rain'], grip: 'slip' }, T) }));
    await Promise.all([a.flush(), b.flush()]); assert.equal(a.error, null); assert.equal(b.error, null);
    const c = make(); await c.boot(); await c.unlock(PASS);
    const archive = J.capture(Object.fromEntries([...Array(c.store.length)].map((_, i) => c.store.key(i)).filter(V.secret).map(k => [k, c.store.getItem(k)])));
    assert(sourceBytes.every(r => archive.records.includes(r))); assert(containsSources(archive));
    const final = D.clean({ archive }, T); assert.equal(final.entries.length, 122);
    const replies = new Set(archive.records.map(r => JSON.parse(r)).filter(e => e?.key === 'fiction-2' && e.feedback).map(e => JSON.stringify(e.feedback)));
    assert.equal(replies.size, 4);
  });
  await check('copie complète export/import par plan vérifié, quota et interruption sans nettoyage', async () => {
    const latest = make(); await latest.boot(); await latest.unlock(PASS);
    const file = await latest.recoverySnapshot(), values = await V.readRecovery(file, PASS, webcrypto);
    const { plan } = B.recoveryPlan(values, T, { context: { debrief: { entries: [] } } });
    const restored = storage(); // adaptateur brut : protocole de rollback existant
    vm.runInContext(';this.apply=DeviceStorage.apply;', ctx); ctx.apply(restored, plan);
    assert(sourceBytes.every(r => J.read(restored.getItem(J.KEY)).records.includes(r))); assert(containsSources(J.read(restored.getItem(J.KEY))));
    const previous = raw.getItem(V.VAULT); raw.refused = true;
    latest.store.setItem(J.CONTEXT, JSON.stringify({ v: 1, debrief: D.close(JSON.parse(latest.store.getItem(J.CONTEXT)).debrief, { key: 'refus-quota', how: 'auto' }, T) }));
    await latest.flush(); assert(latest.error); assert.equal(raw.getItem(V.VAULT), previous);
    // Une fermeture à ce point ne confirme pas l'ajout ; le journal durable précédent reste complet.
    raw.refused = false; const reopened = make(); await reopened.boot(); await reopened.unlock(PASS);
    assert.equal(D.clean(JSON.parse(reopened.store.getItem(J.CONTEXT)).debrief, T).entries.length, 122);
    await latest.flush(); assert.equal(latest.error, null);
  });
  await check('échec de vérification après écriture : rollback exact, refus puis retry sans perte', async () => {
    let fail = false, previous = null;
    const faulty = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, { get(target, name) {
      if (name === 'decrypt') return (...args) => fail && raw.getItem(V.VAULT) !== previous ? Promise.reject(new Error('Interruption de relecture fictive')) : target.decrypt(...args);
      const value = target[name]; return typeof value === 'function' ? value.bind(target) : value;
    } }) };
    const client = make(faulty); await client.boot(); await client.unlock(PASS);
    previous = raw.getItem(V.VAULT); fail = true;
    client.store.setItem(J.CONTEXT, JSON.stringify({ v: 1, debrief: D.close(JSON.parse(client.store.getItem(J.CONTEXT)).debrief, { key: 'relecture-interrompue', how: 'auto' }, T) }));
    await client.flush(); assert(client.error); assert.equal(raw.getItem(V.VAULT), previous);
    fail = false; await client.flush(); assert.equal(client.error, null);
    const values = await V.readRecovery(await client.recoverySnapshot(), PASS, webcrypto);
    assert(sourceBytes.every(r => J.capture(values).records.includes(r)));
  });
  await check('profil sans code : copie chiffrée indépendante, refus sans perte, activation seulement après réouverture', async () => {
    const plain = storage({ 'twrc.settings.v1': JSON.stringify({ configured: 1 }), [J.CONTEXT]: JSON.stringify({ v: 1, debrief: { entries: source } }) });
    const client = V.create({ raw: plain, session: storage(), crypto: webcrypto, locks, target: null, now: () => T });
    assert.equal(await client.boot(), 'plain');
    const before = [...plain.map]; await assert.rejects(client.plainRecovery('court'), /8/);
    const file = await client.plainRecovery(PASS); assert.deepEqual([...plain.map], before);
    await assert.rejects(client.activateJournal(file, 'mauvais-code-fictif')); assert.deepEqual([...plain.map], before);
    plain.refused = true; await assert.rejects(client.activateJournal(file, PASS)); plain.refused = false;
    assert.equal(plain.getItem(J.CONTEXT), before.find(([k]) => k === J.CONTEXT)[1]);
    await client.activateJournal(file, PASS); assert.equal(client.mode, 'vault'); assert.equal(plain.getItem(J.CONTEXT), null);
    assert.equal(JSON.parse(plain.getItem(V.VAULT)).v, 3);
    assert(sourceBytes.every(r => J.read(client.store.getItem(J.KEY)).records.includes(r)));
  });
  console.log(`${count}/${count} scénarios de conservation OK`);
})().catch(e => { console.error('❌ conservation : ' + e.stack); process.exitCode = 1; });
