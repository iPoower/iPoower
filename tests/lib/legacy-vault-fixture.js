'use strict';
// Copie exacte du lecteur antérieur à #176 ; aucune reconstitution de sa logique.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../fixtures/session-vault.prod-124.js'), 'utf8');
assert.equal(crypto.createHash('sha256').update(source).digest('hex'), '0ba3aed0a56c01a9310da7dd3df067609cac0da53ec204ad1a28b4f463c5d892');
exports.source = source;
exports.html = '<!doctype html><meta charset="utf-8"><title>Lecteur fictif historique</title><p>Lecteur antérieur à #176</p><script>' + source + `
  window.legacy = SessionVault.create({ raw: localStorage, session: sessionStorage, crypto, target: window });
  window.legacyReady = false; legacy.boot().then(() => { window.legacyReady = true; });
  addEventListener('storage', e => legacy.onStorage(e));
</script>`;
