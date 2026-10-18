#!/usr/bin/env node
'use strict';
// Mesure reproductible du coffre et de la projection, données fictives uniquement.
// Ni DOM, ni limite mémoire/CPU mobile, ni quota physique : ce n'est pas une recette iPhone.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const c = { TextEncoder, TextDecoder, Uint8Array, atob, btoa, setTimeout, clearTimeout };
vm.createContext(c);
vm.runInContext(['journal-archive', 'debrief', 'session-vault'].map(f => fs.readFileSync(path.join(__dirname, '../src/' + f + '.js'), 'utf8')).join('\n') + ';this.api={JournalArchive,Debrief,SessionVault};', c);
const { JournalArchive: J, Debrief: D, SessionVault: V } = c.api, PASS = 'benchmark-journal-fiction-only', T = Date.now();
const stamp = () => process.hrtime.bigint(), elapsed = start => Number(process.hrtime.bigint() - start) / 1e6;
const median = xs => +xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)].toFixed(1);
function storage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
(async () => {
  for (const trips of [500, 1000]) {
    const sources = Array.from({ length: trips }, (_, i) => [0, 1].map(version => ({ key: 'benchmark-fiction-' + i,
      at: T - (i === 0 ? 365 : i === 1 ? 91 : 1) * 86400000 - i, how: 'confirmé', name: 'Trajet fictif', from: 'Lieu A', to: 'Lieu B',
      start: { key: 'benchmark-fiction-' + i, at: T - 366 * 86400000 - i, car: 'Véhicule fictif', prediction: { known: false, conditions: [] } },
      feedback: { at: T - 500 + version, conditions: [version ? 'fog' : 'wet'], grip: 'normal' } }))).flat();
    const projectionStart = stamp(), state = D.clean({ entries: sources }, T), projectionMs = elapsed(projectionStart);
    const raw = storage({ 'twrc.key': PASS, [J.KEY]: JSON.stringify(state.archive), [J.CONTEXT]: JSON.stringify({ v: 1, debrief: state }), 'twrc.debrief.v1': JSON.stringify(state) });
    const make = () => V.create({ raw, session: storage(), crypto: webcrypto, target: null, locks: { request: (_, __, fn) => fn() } });
    await make().boot(); const opens = [], saves = [];
    for (let sample = 0; sample < 3; sample++) {
      const client = make(); await client.boot(); let start = stamp(); await client.unlock(PASS); opens.push(elapsed(start));
      const body = JSON.parse(client.store.getItem(J.CONTEXT)); start = stamp();
      body.debrief = D.reply(body.debrief, 'benchmark-fiction-2', { conditions: ['ice'], grip: 'normal', id: sample.toString(16).padStart(32, '0') }, T + sample);
      client.store.setItem(J.CONTEXT, JSON.stringify(body)); await client.flush(); saves.push(elapsed(start));
      assert.equal(client.error, null); assert.equal(client.pendingWrites, false);
      const kept = new Set(J.read(client.store.getItem(J.KEY)).records);
      assert(sources.every(row => kept.has(J.encode(row))), 'les mesures doivent conserver toutes les sources');
      assert.equal(D.clean(JSON.parse(client.store.getItem(J.CONTEXT)).debrief, T + 10).entries.length, trips);
    }
    const text = raw.getItem(V.VAULT), bytes = Buffer.byteLength(text, 'utf8');
    console.log(JSON.stringify({ environment: 'Node ' + process.version, trips, sourceVersions: sources.length, samples: 3,
      projectionMs: +projectionMs.toFixed(1), openMedianMs: median(opens), saveMedianMs: median(saves),
      encryptedFileBytes: bytes, vaultUtf16BytesEstimate: 2 * (V.VAULT.length + text.length) }));
  }
})().catch(e => { console.error('❌ benchmark fictif : ' + e.message); process.exitCode = 1; });
