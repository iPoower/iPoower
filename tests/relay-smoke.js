#!/usr/bin/env node
// Relais : test de bout en bout du vrai relay.js, sur une configuration, un agenda et une géographie 100 % fictifs (aucun secret).
// Scénarios : matin de trajet avec brouillard (alerte attendue), même matin un quart d'heure plus tard (pas de doublon),
// jour de télétravail (aucune alerte du matin), et agenda chiffré lisible avec ses tracés.
// Séparation des clés : deux clés de test distinctes (APP_KEY_TEST, RC_KEY_TEST) ; chaque clé n'ouvre que ses fichiers,
// une mauvaise clé de relais bloque la configuration, une APP_KEY absente bloque l'agenda (aucun repli sur RC_KEY).
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), CI = path.join(ROOT, '.ci-relay'), FAKE = path.join(CI, 'fake'), H = path.join(CI, 'h');
const { APP_KEY_TEST, RC_KEY_TEST } = require('./lib/test-keys');   // clés publiques de test : ne protègent que des données fictives
fs.rmSync(CI, { recursive: true, force: true }); [FAKE, H].forEach(d => fs.mkdirSync(d, { recursive: true }));
const cp = (a, b) => fs.copyFileSync(path.join(ROOT, a), b);
cp('tests/fixtures/preset.fake.json', path.join(FAKE, 'preset.json')); cp('tests/fixtures/relay-config.fake.json', path.join(FAKE, 'relay-config.json'));
fs.writeFileSync(path.join(FAKE, '.passphrase'), APP_KEY_TEST); fs.writeFileSync(path.join(FAKE, '.rc_key'), RC_KEY_TEST);
const b = spawnSync(process.execPath, [path.join(ROOT, 'tools/build.js')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, RC_PRIVATE: '.ci-relay/fake', RC_OUT: '.ci-relay/dist', RC_ENCRYPTED: '.ci-relay/enc' } });
if (b.status !== 0) { console.error('Build de test en échec'); process.exit(1); }
['relay.js', 'engine.js', 'demo.js'].forEach(f => cp('src/' + f, path.join(H, f)));
fs.readdirSync(path.join(ROOT, 'tests/relay-harness')).forEach(f => cp('tests/relay-harness/' + f, path.join(H, f)));
// Observer uniquement les appels fictifs de géocodage, sans modifier le harnais partagé.
fs.appendFileSync(path.join(H, 'mock_tt.js'), `
const fetchForGeoCheck = global.fetch, geoRequests = [];
global.fetch = (u, o) => {
  const url = String(u);
  if (url.includes('geocodage/search') || url.includes('geocoding-api')) geoRequests.push(url);
  return fetchForGeoCheck(u, o);
};
process.on('exit', () => fs.writeFileSync(path.join(__dirname, 'geocodes.json'), JSON.stringify(geoRequests)));
`);
fs.copyFileSync(path.join(CI, 'dist/relay-config.sealed.json'), path.join(H, 'relay-config.sealed.json'));
const KEYS = { APP_KEY: APP_KEY_TEST, RC_KEY: RC_KEY_TEST };
const run = (fake, scn, keys = KEYS) => { const env = { PATH: process.env.PATH, FAKE: fake, SCN: scn, GCAL_ICS: 'https://calendar.google.com/test.ics' };
  Object.entries(keys).forEach(([k, v]) => { if (v) env[k] = v; });
  const r = spawnSync(process.execPath, ['-r', './mock_tt.js', 'relay.js'], { cwd: H, encoding: 'utf8', timeout: 180e3, env });
  let obs = null; try { obs = JSON.parse(fs.readFileSync(path.join(H, 'obs.json'), 'utf8')); } catch (e) { /* absent */ }
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), obs }; };
const { tryUnseal, seal } = require('../tools/keys');
const readJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const rows = []; let fail = 0;
const check = (name, ok, detail) => { rows.push(`${ok ? '✅' : '❌'} ${name}${detail ? ' · ' + detail : ''}`); if (!ok) fail++; };
const morningPushes = out => (out.match(/>>> PUSH [^\n]*trajet du matin/g) || []).length;
// 1. lundi (jour de trajet), brouillard et gel avant le départ
const a = run('2026-10-05T05:35:00+02:00', 'fog');
check('le relais termine sans erreur', a.code === 0 && /Terminé/.test(a.out), 'code ' + a.code);
check('configuration chiffrée lue', a.obs && a.obs.relay && a.obs.relay.cfg === 'ok');
check('agenda synchronisé', a.obs && a.obs.relay.cal === 'ok' && a.obs.relay.calLegs > 0, a.obs && `${a.obs.relay.calLegs} trajets`);
check('tous les trajets routés', a.obs && a.obs.relay.calRouted === a.obs.relay.calLegs);
check('alerte du matin envoyée (jour de trajet, brouillard)', morningPushes(a.out) === 1 && a.obs.morning.sent === 1);
const calS = readJ(path.join(H, 'calendar.sealed.json')), cal = tryUnseal(calS, APP_KEY_TEST);
const legs = cal ? cal.events.flatMap(e => e.legs || []) : [];
check('agenda chiffré lisible avec APP_KEY, tracés présents', legs.length > 0 && legs.every(l => Array.isArray(l.g) && l.g.length > 1), `${legs.length} trajets`);
check('agenda refusé avec RC_KEY', !!calS && !tryUnseal(calS, RC_KEY_TEST));
const relS = readJ(path.join(H, 'relay-config.sealed.json')), preS = (readJ(path.join(CI, 'enc/preset.sealed.json')) || {}).sealed;
check('config du relais : s’ouvre avec RC_KEY, refusée avec APP_KEY', !!tryUnseal(relS, RC_KEY_TEST) && !tryUnseal(relS, APP_KEY_TEST));
check('préréglage de l’app : s’ouvre avec APP_KEY, refusé avec RC_KEY', !!tryUnseal(preS, APP_KEY_TEST) && !tryUnseal(preS, RC_KEY_TEST));
check('obs.json sans trajet ni tracé (fichier public)', a.obs && !JSON.stringify(a.obs).includes('"g":') && !JSON.stringify(a.obs).includes('legs'));
// 2. même matin, 15 minutes plus tard : la situation ne s'aggrave pas, aucune nouvelle alerte
const b2 = run('2026-10-05T05:50:00+02:00', 'fog');
check('pas de doublon 15 min plus tard', b2.code === 0 && morningPushes(b2.out) === 0 && b2.obs.morning.sent === 1);
// 3. jeudi (télétravail) : aucune alerte du matin, l'agenda reste actif
fs.rmSync(path.join(H, 'obs.json'), { force: true });
const c = run('2026-10-01T05:35:00+02:00', 'fog');
check('jour de télétravail : aucune alerte du matin', c.code === 0 && morningPushes(c.out) === 0 && c.obs.morning.sent === 0);
const calWithUnknownS = readJ(path.join(H, 'calendar.sealed.json')), calWithUnknown = tryUnseal(calWithUnknownS, APP_KEY_TEST);
const unknown = calWithUnknown && calWithUnknown.events.find(ev => ev.t === 'Appel sans lieu' && ev.s === '2026-10-04T11:00');
check('rendez-vous sans adresse conservé chiffré, sans coordonnées ni trajet', !!unknown && unknown.loc === '' && unknown.lat === null && unknown.lon === null && unknown.label === null && !(unknown.legs || []).length);
const geoRequests = readJ(path.join(H, 'geocodes.json'));
check('aucun géocodage sans localisation exploitable', Array.isArray(geoRequests) && geoRequests.length > 0 && geoRequests.every(url => {
  const q = new URL(url).searchParams, location = q.get('q') || q.get('name') || '';
  return location.trim().length > 2 && location !== 'undefined' && location !== 'null';
}));
check('titre sans adresse absent des sorties publiques', !!unknown && !JSON.stringify(calWithUnknownS).includes(unknown.t) && !JSON.stringify(c.obs).includes(unknown.t) && !c.out.includes(unknown.t));
// 4. séparation des clés côté relais
// 4a. RC_KEY = code de l'app (ancienne configuration) : la configuration du relais doit rester fermée, aucune alerte
fs.rmSync(path.join(H, 'obs.json'), { force: true });
const d = run('2026-10-05T05:35:00+02:00', 'fog', { APP_KEY: APP_KEY_TEST, RC_KEY: APP_KEY_TEST });
check('RC_KEY erronée : configuration refusée, aucune alerte', d.code === 0 && d.obs && d.obs.relay.cfg === 'illisible' && morningPushes(d.out) === 0);
// 4b. APP_KEY absente : l'agenda n'est PAS chiffré avec RC_KEY (aucun repli), la configuration reste lue
fs.rmSync(path.join(H, 'obs.json'), { force: true }); fs.rmSync(path.join(H, 'calendar.sealed.json'), { force: true });
const e = run('2026-10-05T05:35:00+02:00', 'fog', { RC_KEY: RC_KEY_TEST });
check('APP_KEY absente : agenda non écrit (pas de repli sur RC_KEY)', e.code === 0 && e.obs && e.obs.relay.cal === 'sans clé' && !fs.existsSync(path.join(H, 'calendar.sealed.json')) && e.obs.relay.cfg === 'ok');
// 5. outil de contrôle des clés (utilisé par la CI avec les vrais secrets) : vert avec les bonnes clés, rouge sinon
run('2026-10-05T05:35:00+02:00', 'fog');   // agenda rechiffré avec APP_KEY
const ck = keys => spawnSync(process.execPath, [path.join(ROOT, 'tools/check-keys.js'), '--enc', path.join(CI, 'enc'), '--prod', H], { encoding: 'utf8', env: { PATH: process.env.PATH, ...keys } });
const k1 = ck(KEYS), k2 = ck({ APP_KEY: RC_KEY_TEST, RC_KEY: APP_KEY_TEST }), k3 = ck({ APP_KEY: APP_KEY_TEST, RC_KEY: APP_KEY_TEST }), k4 = ck({ RC_KEY: RC_KEY_TEST });
check('check-keys : vert avec les deux bonnes clés', k1.status === 0 && !/❌|⚪/.test(k1.stdout), (k1.stdout.match(/✅/g) || []).length + ' contrôles');
check('check-keys : rouge si clés inversées, identiques ou APP_KEY absente', k2.status === 1 && k3.status === 1 && k4.status === 1);
check('check-keys : aucune clé affichée', ![k1, k2, k3, k4].some(k => (k.stdout + k.stderr).includes(APP_KEY_TEST) || (k.stdout + k.stderr).includes(RC_KEY_TEST)));
// 6. garde-fou permanent : une clé du relais égale au code de l'app est refusée, même si elle ouvrirait la config
const plainCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/relay-config.fake.json'), 'utf8'));
const legacy = seal(plainCfg, APP_KEY_TEST);   // config chiffrée avec le code de l'app (état d'avant la séparation)
const cfgWith = (S, keys) => { fs.writeFileSync(path.join(H, 'relay-config.sealed.json'), JSON.stringify(S)); fs.rmSync(path.join(H, 'obs.json'), { force: true });
  const x = run('2026-10-05T05:35:00+02:00', 'fog', keys); return x.code === 0 && x.obs ? x.obs.relay.cfg : 'erreur'; };
const g1 = cfgWith(legacy, { APP_KEY: APP_KEY_TEST, RC_KEY: APP_KEY_TEST }), g2 = cfgWith(legacy, { APP_KEY: APP_KEY_TEST });
check('garde-fou : RC_KEY égale à APP_KEY refusée ; APP_KEY seule n’ouvre jamais la config', g1 === 'illisible' && g2 === 'absent', [g1, g2].join('/'));
console.log(rows.join('\n') + `\n\n${fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles du relais au vert`}`);
if (fail && process.env.GITHUB_ACTIONS) console.log(`::error title=relay-smoke::${rows.filter(r => r.startsWith('❌')).join(' / ')}`);
process.exit(fail ? 1 : 0);
