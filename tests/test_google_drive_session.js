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
  const dedicatedFolders = [{id:'folder_A',name:'Dossier fictif',createdTime:'2026-10-28T00:00:00.000Z'}];
  const provider = { connect(...args) { connections.push(args); }, disconnect() {}, folder: async () => {}, folders: async () => dedicatedFolders, account: async () => 'synthetic_account', identity: async () => ({id:'synthetic_account', label:'fixture-backup@example.invalid'}) };
  const session = G.create(config, provider, host); await session.prepare();
  let first = session.connect().catch(e => e.code); assert.equal(clients.length, 1, 'demande ouverte dans le geste onclick');
  session.disconnect(); assert.equal(await first, 'cancelled');
  const second = session.connect(); clients[0].callback({ access_token: 'old_token', scope, expires_in: 3600 });
  assert.equal(connections.length, 0); assert.equal(session.connected, false);
  clients[1].callback({ access_token: 'new_token', scope, expires_in: 3600 }); await second;
  assert.equal(connections.length, 1); assert.equal(session.connected, true);
  await assert.rejects(session.chooseFolder(), e => e.code === 'confirmation');
  await assert.rejects(session.listDedicatedFolders(), e => e.code === 'confirmation');
  assert.equal(session.identity.label, 'fixture-backup@example.invalid');
  session.confirmAccount('synthetic_account');
  await assert.rejects(session.chooseDedicatedFolder('folder_A'), e => e.code === 'confirmation');
  assert.equal((await session.listDedicatedFolders())[0].id,'folder_A');
  await assert.rejects(session.chooseDedicatedFolder('arbitrary-folder'), e => e.code === 'confirmation');
  const direct = await session.chooseDedicatedFolder('folder_A');
  const selected = session.chooseFolder(); await pick({ action: 'picked', docs: [{ id: 'folder_A' }] });
  const picked = await selected;
  assert.match(picked.binding, /^[0-9a-f]{64}$/); assert.equal(direct.binding,picked.binding);
  const cancelled = session.chooseFolder().catch(e => e.code); session.disconnect(); assert.equal(await cancelled, 'cancelled');
  console.log('✅ réponse tardive ancien compte ignorée, Picker explicite, liaison compte/dossier et annulation sans stockage de jeton');
  const extra = session.connect().catch(e => e.code); clients[2].callback({ access_token: 'token', scope: scope + ' extra', expires_in: 3600 });
  assert.equal(await extra, 'auth'); assert.equal(session.connected, false);
  assert(!/localStorage|sessionStorage|indexedDB|postMessage/.test(source));
  console.log('✅ scope supplémentaire refusé ; aucun stockage ni pont interorigines dans le parcours Google');
  const fourth=session.connect(); clients[3].callback({access_token:'fixture_token',scope,expires_in:3600}); await fourth; session.confirmAccount('synthetic_account');
  let enter,release;
  const started=new Promise(r=>{enter=r;});
  provider.folders=()=>{enter();return new Promise(r=>{release=r;});};
  const late=session.listDedicatedFolders().catch(e=>e.code); await started; session.disconnect(); release(dedicatedFolders);
  assert.equal(await late,'auth');
  const fifth=session.connect();clients[4].callback({access_token:'fixture_token_2',scope,expires_in:3600});await fifth;session.confirmAccount('synthetic_account');
  await assert.rejects(session.chooseDedicatedFolder('folder_A'),e=>e.code==='confirmation');
  provider.folders=async()=>dedicatedFolders;await session.listDedicatedFolders();
  provider.account=async()=>'different_account';
  await assert.rejects(session.chooseDedicatedFolder('folder_A'),e=>e.code==='auth');
  session.disconnect();
  console.log('✅ dossiers dédiés explicites, liaison identique à Picker, compte relu, ancienne liste invalidée après déconnexion');
  // An unavailable Google Picker must not block the independent drive.file API route.
  const offlineClients = [];
  const noPickerHost = {
    location: { origin: config.raceOrigin }, crypto: webcrypto,
    gapi: { load(_name, callbacks) { callbacks.onerror(); } },
    google: { accounts: { oauth2: {
      initTokenClient(options) { offlineClients.push(options); return { requestAccessToken() {} }; },
      hasGrantedAllScopes: () => true,
    } } },
  };
  const offlineProvider = {
    connect() {}, disconnect() {},
    account: async () => 'synthetic_account',
    identity: async () => ({ id: 'synthetic_account', label: 'fixture@example.invalid' }),
    folder: async () => {}, folders: async () => dedicatedFolders,
  };
  const apiOnly = G.create(config, offlineProvider, noPickerHost);
  await apiOnly.prepare();
  const auth = apiOnly.connect();
  await offlineClients.at(-1).callback({ access_token: 'fixture-token', scope, expires_in: 3600 });
  await auth;
  apiOnly.confirmAccount('synthetic_account');
  assert.equal((await apiOnly.listDedicatedFolders())[0].id, 'folder_A');
  assert.equal((await apiOnly.chooseDedicatedFolder('folder_A')).folder, 'folder_A');
  await assert.rejects(apiOnly.chooseFolder(), e => e.code === 'network');
  apiOnly.disconnect();
  console.log('✅ Picker indisponible : connexion et sélection Drive API restent utilisables');
  // NOESIS 13.4 : reprise en un geste. Seule une liaison identique (même client, même compte, même dossier)
  // à celle déjà confirmée explicitement évite le parcours complet ; sinon confirmation obligatoire.
  {
  const resumeHost = { ...noPickerHost, google: { accounts: { oauth2: { initTokenClient(o) { offlineClients.push(o); return { requestAccessToken() {} }; }, hasGrantedAllScopes: () => true } } } };
  const resumeProvider = { ...offlineProvider, checked: [], folder: async f => { resumeProvider.checked.push(f); } };
  const first = G.create(config, resumeProvider, resumeHost); await first.prepare();
  let p = first.connect(); await offlineClients.at(-1).callback({ access_token: 'fixture-token', scope, expires_in: 3600 }); await p;
  first.confirmAccount('synthetic_account'); await first.listDedicatedFolders();
  const hint = await first.chooseDedicatedFolder('folder_A'); first.disconnect();
  const again = G.create(config, resumeProvider, resumeHost); await again.prepare();
  await assert.rejects(again.resume({ folder: hint.folder, binding: hint.binding }), e => e.code === 'auth', 'sans jeton : aucune reprise');
  p = again.connect(); await offlineClients.at(-1).callback({ access_token: 'fixture-token-2', scope, expires_in: 3600 }); await p;
  const resumed = await again.resume({ folder: hint.folder, binding: hint.binding });
  assert.deepEqual({ ...resumed }, { ...hint }); assert.equal(again.confirmed, true); assert.equal(resumeProvider.checked.at(-1), 'folder_A', 'contrat du dossier relu');
  again.disconnect();
  const other = G.create(config, { ...resumeProvider, account: async () => 'other_account', identity: async () => ({ id: 'other_account', label: 'autre@example.invalid' }) }, resumeHost);
  await other.prepare(); p = other.connect(); await offlineClients.at(-1).callback({ access_token: 'fixture-token-3', scope, expires_in: 3600 }); await p;
  await assert.rejects(other.resume({ folder: hint.folder, binding: hint.binding }), e => e.code === 'confirmation', 'autre compte : confirmation explicite exigée');
  assert.equal(other.confirmed, false);
  await assert.rejects(again.resume({ folder: 'x', binding: 'zz' }), e => ['auth', 'confirmation'].includes(e.code));
  // Contre-expertise A8 : dossier refusé à la relecture ⇒ compte non approuvé.
  const strict = G.create(config, { ...resumeProvider, folder: async () => { throw Object.assign(new Error('conflict'), { code: 'conflict' }); } }, resumeHost);
  await strict.prepare(); p = strict.connect(); await offlineClients.at(-1).callback({ access_token: 'fixture-token-4', scope, expires_in: 3600 }); await p;
  await assert.rejects(strict.resume({ folder: hint.folder, binding: hint.binding })); assert.equal(strict.confirmed, false, 'aucune approbation implicite après échec');
  console.log('✅ reprise en un geste : seulement pour la liaison compte/dossier déjà confirmée, contrat du dossier relu, aucun stockage de jeton');
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
