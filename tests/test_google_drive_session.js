'use strict';
const path = require('node:path');
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), { webcrypto } = require('node:crypto');
const source = fs.readFileSync(path.resolve(__dirname, '../src/google-drive-session.js'), 'utf8');
const context = { URL, console, TextEncoder, TextDecoder, Uint8Array, AbortSignal, setTimeout, clearTimeout, Date };
vm.createContext(context); vm.runInContext(source + ';this.G=GoogleDriveSession;', context);
const G = context.G, scope = G.SCOPE;
const config = { approved: true, clientId: ['123456', 'fake.apps.googleusercontent.com'].join('-'), apiKey: 'AIza' + 'a'.repeat(35), appId: '123456', raceOrigin: 'https://race.example.com', vaultOrigin: 'https://vault.example.com' };
(async () => {
  for (const origin of ['https://ipoower.github.io', 'http://race.example.com', 'https://other.example.com']) assert.throws(() => G.config(config, origin));
  for (const extra of [{ code: 'forbidden' }, { token: 'forbidden' }, { folder: 'forbidden' }]) assert.throws(() => G.config({ ...config, ...extra }, config.raceOrigin));
  assert.throws(() => G.config({ ...config, appId: '999999' }, config.raceOrigin));
  console.log('✅ origines séparées, même projet OAuth et schéma public strict ; github.io refusé avant tout chargement');
  const clients = [], connections = []; let pick;
  class Picker {
    addView() { return this; } setOAuthToken() { return this; } setDeveloperKey() { return this; } setAppId() { return this; }
    setOrigin() { return this; } setCallback(callback) { pick = callback; return this; } build() { return this; } setVisible() {}
  }
  class View { setIncludeFolders() { return this; } setSelectFolderEnabled() { return this; } }
  const host = { location: { origin: config.raceOrigin }, crypto: webcrypto, gapi: { load(_, options) { options.callback(); } },
    google: { accounts: { oauth2: { initTokenClient(options) { clients.push(options); return { requestAccessToken(arg) { assert.equal(arg.prompt, 'select_account'); } }; }, hasGrantedAllScopes: () => true } },
      picker: { DocsView: View, PickerBuilder: Picker, ViewId: { FOLDERS: 'folders' }, Action: { PICKED: 'picked', CANCEL: 'cancel' } } } };
  const provider = { connect(...args) { connections.push(args); }, disconnect() {}, folder: async () => {}, account: async () => 'synthetic_account', identity: async () => ({id:'synthetic_account', label:'fixture-backup@example.invalid'}) };
  const session = G.create(config, provider, host); await session.prepare();
  let first = session.connect().catch(e => e.code); assert.equal(clients.length, 1, 'demande ouverte dans le geste onclick');
  session.disconnect(); assert.equal(await first, 'cancelled');
  const second = session.connect(); clients[0].callback({ access_token: 'old_token', scope, expires_in: 3600 });
  assert.equal(connections.length, 0); assert.equal(session.connected, false);
  clients[1].callback({ access_token: 'new_token', scope, expires_in: 3600 }); await second;
  assert.equal(connections.length, 1); assert.equal(session.connected, true);
  await assert.rejects(session.chooseFolder(), e => e.code === 'confirmation');
  assert.equal(session.identity.label, 'fixture-backup@example.invalid');
  session.confirmAccount('synthetic_account');
  const selected = session.chooseFolder(); await pick({ action: 'picked', docs: [{ id: 'folder_A' }] });
  assert.match((await selected).binding, /^[0-9a-f]{64}$/);
  const cancelled = session.chooseFolder().catch(e => e.code); session.disconnect(); assert.equal(await cancelled, 'cancelled');
  console.log('✅ réponse tardive ancien compte ignorée, Picker explicite, liaison compte/dossier et annulation sans stockage de jeton');
  const extra = session.connect().catch(e => e.code); clients[2].callback({ access_token: 'token', scope: scope + ' extra', expires_in: 3600 });
  assert.equal(await extra, 'auth'); assert.equal(session.connected, false);
  assert(!/localStorage|sessionStorage|indexedDB|postMessage/.test(source));
  console.log('✅ scope supplémentaire refusé ; aucun stockage ni pont interorigines dans le parcours Google');
})().catch(e => { console.error(e); process.exitCode = 1; });
