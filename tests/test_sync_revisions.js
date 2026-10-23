'use strict';
// Lot D2 : révisions, têtes concurrentes et conflits, de bout en bout avec les VRAIS modules
// (codec, clé de synchronisation reprise, fusion). Catalogue Drive simulé en mémoire, données fictives.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const read = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const names = ['journal-archive.js', 'debrief.js', 'calendar-origin.js', 'backup.js', 'config-import.js', 'control-vault-packet.js', 'sync-key.js', 'sync-merge.js', 'sync-revisions.js'];
const ctx = { Date, JSON, Math, Number, Object, Array, RegExp, Set, Map, String, Uint8Array, TextEncoder, TextDecoder, atob, btoa, crypto: webcrypto, Promise, Error };
vm.createContext(ctx);
vm.runInContext(names.map(read).join('\n') + ';this.X={ P:ControlVaultPacket, K:SyncKey, M:SyncMerge, R:SyncRevisions, J:JournalArchive };', ctx);
const { P, K, M, R, J } = ctx.X;
const json = v => JSON.parse(JSON.stringify(v)), sha = b => createHash('sha256').update(b).digest('hex');
const codec = P.create({ validateBusiness(data) {
  if (data.app !== R.APP) return false;
  R.content(data, M.device);
  if (data.values[J.KEY] != null) J.read(data.values[J.KEY]);
  return true;
} });
const reject = (fn, c) => assert.throws(fn, e => e.code === c);
let n = 0;
const check = async (name, fn) => { await fn(); n++; console.log('✅ ' + name); };
const T = Date.parse('2026-10-22T08:00:00.000Z'), at = '2026-10-22T08:00:00.000Z', code = 'synthetic-sync-code';
const trip = (key, dt) => ({ key, at: T + dt, how: 'confirmé', name: 'Trajet fictif', from: 'Lieu A', to: 'Lieu B', start: null, end: null, feedback: null, deferred: false });
const car = id => ({ id, short: id, tire: { type: 'summer', dot: '', treads: [] }, odo: [] });
function profile(entries, stamps) {
  const values = { 'twrc.settings.v1': JSON.stringify({ v: 1, configured: 1, cars: [car('voitureA'), car('voitureB')], calib: [], journal: {}, edits: {} }),
    'twrc.context.v1': JSON.stringify({ v: 1, debrief: { active: null, entries }, done: {} }),
    'twrc.gps': JSON.stringify({ lat: 1, lon: 2 }), 'twrc.cache.lieuA': '{"t":1}', 'twrc.runtime.v1': '{"n":1}', 'twrc.sync.state': '{}' };
  if (stamps) values['twrc.editstamps.v1'] = JSON.stringify(stamps);
  values[J.KEY] = JSON.stringify(J.capture(values));
  return values;
}
const hex = () => [...webcrypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
// Drive simulé : fichiers immuables (octets + propriétés en clair), jamais modifiés ni supprimés.
const drive = [];
function device(name, values) {
  return { name, id: hex(), seq: 0, base: [], dirty: true, values, handle: null, seen: new Map() };
}
async function confirmed(d) {
  const out = [];
  for (const f of drive) {
    if (sha(f.bytes) !== f.sha) continue;               // relecture des octets avant tout usage
    if (!d.seen.has(f.sha)) {
      try { const data = await codec.openWith(f.bytes, d.handle, 'prod-156', f.sha); d.seen.set(f.sha, { meta: R.confirm(R.fromProperties(f.props), data, f.sha, M.device), data }); }
      catch (e) { d.seen.set(f.sha, { refused: e.code }); }
    }
    const s = d.seen.get(f.sha); if (s.meta) out.push(s.meta);
  }
  return out;
}
async function publish(d, parents) {
  const rev = R.next({ device: d.id, seq: d.seq, parents }, webcrypto);
  const bytes = await codec.sealWith(json(R.snapshot(d.values, rev, M.device, at)), d.handle, 'prod-156', at);
  drive.push({ props: R.properties(rev), bytes, sha: sha(bytes) });
  d.seq = rev.seq; d.base = [rev.id]; d.dirty = false;
  return rev;
}
// Un cycle complet : lire, fusionner sans perte, publier seulement ce qui est intégré.
async function sync(d) {
  const all = await confirmed(d), planned = json(R.plan(all, { device: d.id, seq: d.seq, base: d.base, dirty: d.dirty }));
  if (planned.action === 'blocked') return { planned };
  const merged = [], durable = v => JSON.stringify(Object.keys(v).filter(k => !M.device(k)).sort().map(k => [k, v[k]])), before = durable(d.values);
  for (const id of planned.integrate) {
    const remote = [...d.seen.values()].find(s => s.meta && s.meta.id === id).data;
    const r = M.values(d.values, remote.values); d.values = r.values; merged.push({ id, report: json(r.report) });
  }
  // Publier si l'état durable local diffère de sa base : modification locale ou apport distant.
  const settled = json(R.settle(planned, merged, d.dirty || durable(d.values) !== before));
  if (settled.publish) await publish(d, settled.parents);
  else d.base = settled.parents;   // tête adoptée telle quelle
  return { planned, settled };
}
const trips = d => json(J.capture(d.values).records).map(r => JSON.parse(r).key).sort();
(async () => {
  const { descriptor, handle } = await K.create(code, webcrypto, at);
  const pc = device('PC', profile([trip('pc-1', 0)])), phone = device('iPhone', profile([trip('tel-1', 60000)]));
  pc.handle = handle; phone.handle = await K.derive(descriptor, code, webcrypto);

  await check('premier envoi puis intégration de part et d’autre : convergence sans perte', async () => {
    assert.equal((await sync(pc)).planned.action, 'push');
    const p = await sync(phone);
    assert.deepEqual(p.planned.integrate.length, 1); assert.deepEqual(p.settled.conflicts, []);
    const q = await sync(pc);
    assert.equal(q.planned.action, 'integrate');
    assert.deepEqual(trips(pc), ['pc-1', 'tel-1']); assert.deepEqual(trips(phone), ['pc-1', 'tel-1']);
    assert.equal(pc.values['twrc.gps'], JSON.stringify({ lat: 1, lon: 2 })); // état propre à l'appareil conservé localement
  });
  await check('contenu chiffré : valeurs durables seulement, GPS, caches, diagnostic et état local exclus', async () => {
    const data = [...pc.seen.values()].find(s => s.meta).data;
    assert.deepEqual(Object.keys(data.values).sort(), ['twrc.context.v1', 'twrc.debrief.archive.v1', 'twrc.settings.v1']);
    assert(!new TextDecoder().decode(drive[0].bytes).includes('pc-1'));
    reject(() => R.content({ ...json(data), values: { ...data.values, 'twrc.gps': '{}' } }, M.device), 'CONSERVATION_BLOCKED');
  });
  await check('saisies des deux côtés, synchronisées tour à tour : histoire linéaire, aucune perte', async () => {
    pc.values = M.values(pc.values, profile([trip('pc-2', 120000)])).values; pc.dirty = true;
    phone.values = M.values(phone.values, profile([trip('tel-2', 180000)])).values; phone.dirty = true;
    const ps = await sync(pc);                       // PC publie avant de voir l'iPhone
    assert.equal(ps.planned.action, 'push');
    const ts = await sync(phone);                    // l'iPhone intègre le PC et publie sa fusion
    assert.equal(ts.planned.integrate.length, 1); assert.equal(ts.settled.parents.length, 1);
    await sync(pc);
    assert.deepEqual(trips(pc), ['pc-1', 'pc-2', 'tel-1', 'tel-2']); assert.deepEqual(trips(pc), trips(phone));
    const all = await confirmed(pc), heads = R.plan(all, { device: pc.id, seq: pc.seq, base: pc.base, dirty: false });
    assert.equal(heads.heads.length, 1); assert.equal(heads.action, 'up-to-date');
  });
  await check('vraie concurrence : chaque appareil publie sans voir l’autre, aucune tête perdue', async () => {
    pc.values = M.values(pc.values, profile([trip('pc-3', 240000)])).values; pc.dirty = true;
    phone.values = M.values(phone.values, profile([trip('tel-3', 300000)])).values; phone.dirty = true;
    const pcBase = pc.base.slice();
    await publish(pc, pcBase); await publish(phone, phone.base.slice());
    const plan = R.plan(await confirmed(pc), { device: pc.id, seq: pc.seq, base: pc.base, dirty: false });
    assert.equal(plan.heads.length, 2); assert.equal(plan.integrate.length, 1);
    await sync(pc); await sync(phone);
    assert.deepEqual(trips(pc), ['pc-1', 'pc-2', 'pc-3', 'tel-1', 'tel-2', 'tel-3']); assert.deepEqual(trips(pc), trips(phone));
    // Convergence finie : après stabilisation, plus aucune nouvelle révision (pas de ping-pong).
    await sync(pc); await sync(phone); const stable = drive.length;
    for (let i = 0; i < 3; i++) { assert.equal((await sync(pc)).planned.action, 'up-to-date'); assert.equal((await sync(phone)).planned.action, 'up-to-date'); }
    assert.equal(drive.length, stable);
    // Toutes les versions restent récupérables, chacune ouvrable et intacte.
    for (const f of drive) assert.equal((await codec.openWith(f.bytes, handle, 'prod-156', f.sha)).app, 'twrc-sync');
  });
  await check('conflit de réglage sans preuve de fraîcheur : valeur locale gardée, tête distante jamais absorbée', async () => {
    const stamp = { 'cars.0.tire.type': T };
    const edit = (d, type) => { const s = JSON.parse(d.values['twrc.settings.v1']); s.cars[0].tire.type = type; s.edits = { 'cars.0.tire.type': T };
      d.values = { ...d.values, 'twrc.settings.v1': JSON.stringify(s), 'twrc.editstamps.v1': JSON.stringify(stamp) }; d.dirty = true; };
    edit(pc, 'winter'); edit(phone, 'allseason');
    await publish(pc, pc.base.slice()); await publish(phone, phone.base.slice());
    const r = await sync(pc);
    assert.deepEqual(r.settled.conflicts.map(c => c.paths), [['cars.0.tire.type']]);
    assert.deepEqual(r.settled.integrated, []);
    assert.equal(JSON.parse(pc.values['twrc.settings.v1']).cars[0].tire.type, 'winter');
    const again = R.plan(await confirmed(pc), { device: pc.id, seq: pc.seq, base: pc.base, dirty: false });
    assert.equal(again.action, 'integrate'); assert.equal(again.heads.length, 2); // toujours visible, à arbitrer
  });
  await check('catalogue falsifié : une révision ne peut pas masquer une autre tête', async () => {
    const victim = drive[drive.length - 1], forgedRev = R.next({ device: pc.id, seq: 99, parents: [R.fromProperties(victim.props).id] }, webcrypto);
    const honest = R.next({ device: pc.id, seq: 99, parents: [] }, webcrypto);
    const bytes = await codec.sealWith(json(R.snapshot(pc.values, honest, M.device, at)), handle, 'prod-156', at);
    drive.push({ props: R.properties({ ...forgedRev, id: honest.id }), bytes, sha: sha(bytes) });
    const fresh = device('PC rouvert', pc.values); fresh.handle = handle;
    const list = await confirmed(fresh);
    assert(!list.some(m => m.id === honest.id));
    assert.equal([...fresh.seen.values()].filter(s => s.refused === 'REVISION_MISMATCH').length, 1);
    drive.pop();
  });
  await check('même révision authentifiée, contenus différents : bloquer dans les deux ordres sans choisir une copie', async () => {
    const rev = R.next({ device: hex() }, webcrypto), copies = [];
    for (const key of ['copie-a', 'copie-b']) {
      const data = json(R.snapshot(profile([trip(key, 0)]), rev, M.device, at));
      const bytes = await codec.sealWith(data, handle, 'prod-156', at), digest = sha(bytes);
      const opened = await codec.openWith(bytes, handle, 'prod-156', digest);
      copies.push(R.confirm(R.fromProperties(R.properties(rev)), opened, digest, M.device));
    }
    assert.notEqual(copies[0].fileSha256, copies[1].fileSha256);
    const before = JSON.stringify(copies);
    for (const dirty of [false, true]) for (const base of [[], [rev.id]]) {
      const local = { device: hex(), seq: 0, base, dirty }, localBefore = JSON.stringify(local);
      for (const order of [copies, [...copies].reverse()]) {
        const plan = json(R.plan(order, local));
        assert.equal(plan.action, 'blocked'); assert.equal(plan.reason, 'DUPLICATE_REVISION');
        assert.deepEqual(plan.heads, []); assert.deepEqual(plan.integrate, []);
      }
      assert.equal(JSON.stringify(local), localBefore);
    }
    assert.equal(JSON.stringify(copies), before); // aucune version altérée ni supprimée
  });
  await check('deux références aux mêmes octets restent une seule révision', async () => {
    const f = drive[0], opened = await codec.openWith(f.bytes, handle, 'prod-156', f.sha);
    const copy = R.confirm(R.fromProperties(f.props), opened, f.sha, M.device);
    const local = { device: hex(), seq: 0, base: [], dirty: false };
    assert.deepEqual(json(R.plan([copy, json(copy)], local)), json(R.plan([copy], local)));
  });
  await check('graphe : refuser une empreinte absente ou mal formée plutôt que perdre la référence des octets', async () => {
    const f = drive[0], opened = await codec.openWith(f.bytes, handle, 'prod-156', f.sha);
    const copy = R.confirm(R.fromProperties(f.props), opened, f.sha, M.device);
    const local = { device: hex(), seq: 0, base: [], dirty: false };
    for (const invalid of [undefined, null, '', 'f'.repeat(63), 'F'.repeat(64), 123, 'a'.repeat(64) + '\n'])
      reject(() => R.plan([{ ...copy, fileSha256: invalid }], local), 'INVALID_REVISION');
  });
  await check('graphe : cycle et doublon bloqués, parent manquant et appareil en avance signalés', async () => {
    const a = hex(), b = hex(), d = hex(), m = (id, parents, seq = 1) => ({ id, parents: parents.sort(), device: d, seq, fileSha256: sha(id) });
    assert.equal(R.plan([m(a, [b]), m(b, [a])], { device: d, seq: 0, base: [], dirty: false }).reason, 'REVISION_CYCLE');
    assert.equal(R.plan([m(a, []), { ...m(a, []), seq: 2 }], { device: d, seq: 0, base: [], dirty: false }).reason, 'DUPLICATE_REVISION');
    const p = json(R.plan([m(a, [b], 5)], { device: d, seq: 1, base: [hex()], dirty: false }));
    assert.deepEqual(p.warnings.map(w => w.code).sort(), ['BASE_UNAVAILABLE', 'DEVICE_AHEAD', 'MISSING_PARENT']);
    assert.equal(p.nextSeq, 6);
  });
  await check('métadonnées Drive bornées, aller-retour exact et refus des formes ambiguës', async () => {
    const parents = Array.from({ length: 8 }, hex).sort(), rev = R.meta({ id: hex(), parents, device: hex(), seq: 42 });
    const props = json(R.properties(rev));
    assert(Object.entries(props).every(([k, v]) => k.length + v.length <= 124));
    assert.deepEqual(json(R.fromProperties(props)), json(rev));
    for (const bad of [{ ...props, rcs: '0' }, { ...props, rcp0: undefined }, { ...props, rcx: '1' }, { ...props, rcs: '01' }])
      reject(() => R.fromProperties(json(bad)), 'INVALID_REVISION');
    reject(() => R.meta({ ...json(rev), parents: [...parents].reverse() }), 'INVALID_REVISION');
    reject(() => R.meta({ ...json(rev), parents: [rev.id] }), 'INVALID_REVISION');
    reject(() => R.meta({ ...json(rev), parents: [...parents, hex()] }), 'INVALID_REVISION');
  });
  await check('non assemblé : ni build, ni réseau, ni stockage', async () => {
    const build = fs.readFileSync(path.join(__dirname, '../tools/build.js'), 'utf8'), src = read('sync-revisions.js');
    assert(!build.includes('sync-revisions.js'));
    assert(!/fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB/.test(src));
  });
  console.log(n + '/' + n + ' scénarios OK · révisions PC/iPhone sur catalogue simulé, aucune synchronisation activée');
})().catch(e => { console.error(e); process.exitCode = 1; });
