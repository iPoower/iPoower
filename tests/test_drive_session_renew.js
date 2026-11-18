'use strict';
// Drive · reconnexion et prolongation (18/11/2026). Faux Google Identity Services, horloge contrôlée, comptes fictifs.
// C : reconnexion au compte déjà vérifié sans écran de choix (indice en mémoire seulement, repli sur le choix du compte).
// A : prolongation avant expiration, adoptée seulement si Drive confirme le MÊME compte ; tout échec conserve l'autorisation.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), { webcrypto } = require('node:crypto');
const source = fs.readFileSync(path.resolve(__dirname, '../src/google-drive-session.js'), 'utf8');
let NOW = Date.parse('2026-11-18T08:00:00Z');
class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
const timers = [];
const context = { URL, console, TextEncoder, TextDecoder, Uint8Array, AbortSignal, Date: FakeDate,
  setTimeout: (fn, ms) => { const t = { fn, ms, off: false }; timers.push(t); return t; }, clearTimeout: t => { if (t) t.off = true; } };
vm.createContext(context); vm.runInContext(source + ';this.G=GoogleDriveSession;', context);
const G = context.G, scope = G.SCOPE;
const config = { approved: true, clientId: ['123456', 'fake.apps.googleusercontent.com'].join('-'), apiKey: 'AIza' + 'a'.repeat(35), appId: '123456', raceOrigin: 'https://race.example.com', vaultOrigin: 'https://vault.example.com' };
const clients = [], requests = [], connections = [];
let throwOnRequest = false;
const host = { location: { origin: config.raceOrigin }, crypto: webcrypto,
  google: { accounts: { oauth2: { initTokenClient(options) { clients.push(options); return { requestAccessToken(arg) { requests.push(arg); if (throwOnRequest) throw new Error('popup'); } }; }, hasGrantedAllScopes: () => true } } } };
let who = { id: 'account_A', label: 'fixture-a@example.invalid' }, identityFails = false;
const provider = { connected: true, connect(...args) { connections.push(args[0]); }, disconnect() {}, folder: async () => {}, folders: async () => [],
  account: async () => who.id, identity: async () => { if (identityFails) throw new Error('network'); return { ...who }; } };
const last = () => clients[clients.length - 1], lastReq = () => requests[requests.length - 1];
const answer = (tokenValue, extra = {}) => last().callback({ access_token: tokenValue, scope, expires_in: 3600, ...extra });
let n = 0; const check = async (name, fn) => { await fn(); n++; console.log('✅ ' + name); };
(async () => {
  const session = G.create(config, provider, host); await session.prepare();
  await check('première connexion : choix du compte, comme avant', async () => {
    const p = session.connect(); assert.deepEqual({ ...lastReq() }, { prompt: 'select_account' }); answer('token_1'); await p;
    assert.equal(session.connected, true); assert.equal(session.identity.label, 'fixture-a@example.invalid');
  });
  await check('prolongation refusée tant que le compte n’est pas confirmé explicitement', async () => {
    const before = clients.length;
    await assert.rejects(session.renew(), e => e.code === 'auth'); assert.equal(clients.length, before, 'aucune fenêtre Google ouverte');
    session.confirmAccount('account_A'); assert.equal(session.confirmed, true);
  });
  await check('A · prolongation : même compte relu par Drive → nouveau jeton adopté, compte toujours confirmé, durée renouvelée', async () => {
    NOW += 52 * 60000; const left = session.remainingMs; assert(left > 0 && left < 10 * 60000, String(left));
    const p = session.renew(); assert.equal(session.renewing, true);
    assert.deepEqual({ ...lastReq() }, { prompt: '', login_hint: 'fixture-a@example.invalid' }, 'aucun écran de choix de compte');
    answer('token_2'); await p;
    assert.equal(connections[connections.length - 1], 'token_2'); assert.equal(session.connected, true); assert.equal(session.confirmed, true);
    assert(session.remainingMs > 55 * 60000, 'nouvelle heure'); assert.equal(session.renewing, false);
  });
  await check('A · Google refuse ou fenêtre fermée : l’autorisation en cours est conservée jusqu’à son expiration', async () => {
    NOW += 52 * 60000; const p = session.renew(); last().error_callback({ type: 'popup_closed' });
    await assert.rejects(p, e => e.code === 'auth');
    assert.equal(session.connected, true); assert.equal(session.confirmed, true); assert.equal(connections[connections.length - 1], 'token_2');
  });
  await check('A · portée différente ou durée invalide : refusé, ancien jeton conservé', async () => {
    let p = session.renew(); answer('token_x', { scope: scope + ' extra' }); await assert.rejects(p, e => e.code === 'auth');
    p = session.renew(); answer('token_y', { expires_in: 10 }); await assert.rejects(p, e => e.code === 'auth');
    assert.equal(connections[connections.length - 1], 'token_2'); assert.equal(session.connected, true);
  });
  await check('A · vérification du compte impossible (réseau) : ancien jeton remis en place, jamais le nouveau', async () => {
    identityFails = true; const p = session.renew(); answer('token_net'); await assert.rejects(p, e => e.code === 'auth'); identityFails = false;
    assert.equal(connections[connections.length - 1], 'token_2'); assert.equal(session.connected, true);
  });
  await check('A · Google renvoie un AUTRE compte : jeton jamais adopté, session coupée, confirmation exigée', async () => {
    who = { id: 'account_B', label: 'fixture-b@example.invalid' };
    const p = session.renew(); answer('token_other'); await assert.rejects(p, e => e.code === 'confirmation');
    assert.equal(session.connected, false); assert.equal(session.confirmed, false); assert.equal(session.identity, null);
    who = { id: 'account_A', label: 'fixture-a@example.invalid' };
  });
  await check('C · reconnexion après expiration : compte déjà vérifié proposé directement (login_hint), sans choix', async () => {
    const p = session.connect({ reuse: true }); assert.deepEqual({ ...lastReq() }, { prompt: '', login_hint: 'fixture-a@example.invalid' });
    answer('token_3'); await p; assert.equal(session.connected, true); assert.equal(session.confirmed, false, 'la liaison reste à revérifier (resume)');
  });
  await check('C · échec de la reconnexion silencieuse : la suivante repasse par le choix du compte', async () => {
    let p = session.connect({ reuse: true }); last().error_callback({ type: 'popup_failed_to_open' }); await assert.rejects(p, e => e.code === 'auth');
    p = session.connect({ reuse: true }); assert.deepEqual({ ...lastReq() }, { prompt: 'select_account' }); answer('token_4'); await p;
    p = session.connect({ reuse: true }); assert.equal(lastReq().prompt, '', 'après un succès, la reconnexion directe revient'); answer('token_5'); await p;
  });
  await check('C · nouvelle ouverture de l’application (rien en mémoire) : choix du compte, comme avant', async () => {
    const fresh = G.create(config, provider, host); await fresh.prepare();
    const p = fresh.connect({ reuse: true }); assert.deepEqual({ ...lastReq() }, { prompt: 'select_account' }); answer('token_6'); await p; fresh.disconnect();
  });
  await check('A · une seule prolongation à la fois ; refus synchrone de Google : état libéré, nouvel essai possible', async () => {
    session.confirmAccount('account_A');
    const p1 = session.renew(); await assert.rejects(session.renew(), e => e.code === 'busy'); answer('token_7'); await p1;
    throwOnRequest = true; await assert.rejects(session.renew(), e => e.code === 'auth'); throwOnRequest = false;
    assert.equal(session.renewing, false); const p2 = session.renew(); answer('token_8'); await p2; assert.equal(connections[connections.length - 1], 'token_8');
  });
  await check('A · déconnexion pendant la prolongation : réponse tardive ignorée, aucun jeton adopté', async () => {
    const p = session.renew(); session.disconnect(); const count = connections.length; answer('token_late');
    await assert.rejects(p, e => e.code === 'auth'); assert.equal(connections.length, count); assert.equal(session.connected, false);
  });
  await check('A · fenêtre Google sans réponse : abandon après 2 min, état libéré', async () => {
    const p = session.connect(); answer('token_9'); await p; session.confirmAccount('account_A');
    const r = session.renew(); const t = timers.filter(x => !x.off && x.ms === 120000).pop(); assert(t); t.fn();
    await assert.rejects(r, e => e.code === 'auth'); assert.equal(session.renewing, false); assert.equal(session.connected, true);
  });
  await check('A · autorisation déjà expirée : pas de prolongation (reconnexion habituelle)', async () => {
    NOW += 2 * 3600e3; await assert.rejects(session.renew(), e => e.code === 'auth'); assert.equal(session.remainingMs, 0); assert.equal(session.connected, false);
  });
  await check('aucun stockage : ni jeton ni adresse écrits hors mémoire', async () => {
    assert(!/localStorage|sessionStorage|indexedDB|document\.cookie|postMessage/.test(source));
  });
  console.log(`${n}/${n} scénarios OK`);
})().catch(e => { console.error('❌ ' + (e && e.stack || e)); process.exit(1); });
