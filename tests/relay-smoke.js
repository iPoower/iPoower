#!/usr/bin/env node
// Relais : test de bout en bout du vrai relay.js, sur une configuration, un agenda et une géographie 100 % fictifs (aucun secret).
// Scénarios : matin de trajet avec brouillard (alerte attendue), même matin un quart d'heure plus tard (pas de doublon),
// jour de télétravail (aucune alerte du matin), et agenda chiffré lisible avec ses tracés.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), CI = path.join(ROOT, '.ci-relay'), FAKE = path.join(CI, 'fake'), H = path.join(CI, 'h');
const KEY = 'race-control-ci-test-only';   // clé publique de test : ne protège que des données fictives
fs.rmSync(CI, { recursive: true, force: true }); [FAKE, H].forEach(d => fs.mkdirSync(d, { recursive: true }));
const cp = (a, b) => fs.copyFileSync(path.join(ROOT, a), b);
cp('tests/fixtures/preset.fake.json', path.join(FAKE, 'preset.json')); cp('tests/fixtures/relay-config.fake.json', path.join(FAKE, 'relay-config.json'));
fs.writeFileSync(path.join(FAKE, '.passphrase'), KEY);
const b = spawnSync(process.execPath, [path.join(ROOT, 'tools/build.js')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, RC_PRIVATE: '.ci-relay/fake', RC_OUT: '.ci-relay/dist', RC_ENCRYPTED: '.ci-relay/enc' } });
if (b.status !== 0) { console.error('Build de test en échec'); process.exit(1); }
['relay.js', 'engine.js', 'demo.js'].forEach(f => cp('src/' + f, path.join(H, f)));
fs.readdirSync(path.join(ROOT, 'tests/relay-harness')).forEach(f => cp('tests/relay-harness/' + f, path.join(H, f)));
fs.copyFileSync(path.join(CI, 'dist/relay-config.sealed.json'), path.join(H, 'relay-config.sealed.json'));
const run = (fake, scn) => { const r = spawnSync(process.execPath, ['-r', './mock_tt.js', 'relay.js'], { cwd: H, encoding: 'utf8', timeout: 180e3,
  env: { PATH: process.env.PATH, FAKE: fake, SCN: scn, GCAL_ICS: 'https://calendar.google.com/test.ics', APP_KEY: KEY, RC_KEY: KEY } });
  let obs = null; try { obs = JSON.parse(fs.readFileSync(path.join(H, 'obs.json'), 'utf8')); } catch (e) { /* absent */ }
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), obs }; };
function unseal(S) { const k = crypto.pbkdf2Sync(KEY, Buffer.from(S.s, 'base64'), S.it, 32, 'sha256'), x = Buffer.from(S.c, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(S.i, 'base64')); d.setAuthTag(x.subarray(x.length - 16));
  return JSON.parse(Buffer.concat([d.update(x.subarray(0, x.length - 16)), d.final()]).toString('utf8')); }
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
let cal = null; try { cal = unseal(JSON.parse(fs.readFileSync(path.join(H, 'calendar.sealed.json'), 'utf8'))); } catch (e) { /* illisible */ }
const legs = cal ? cal.events.flatMap(e => e.legs || []) : [];
check('agenda chiffré lisible, tracés présents', legs.length > 0 && legs.every(l => Array.isArray(l.g) && l.g.length > 1), `${legs.length} trajets`);
check('obs.json sans trajet ni tracé (fichier public)', a.obs && !JSON.stringify(a.obs).includes('"g":') && !JSON.stringify(a.obs).includes('legs'));
// 2. même matin, 15 minutes plus tard : la situation ne s'aggrave pas, aucune nouvelle alerte
const b2 = run('2026-10-05T05:50:00+02:00', 'fog');
check('pas de doublon 15 min plus tard', b2.code === 0 && morningPushes(b2.out) === 0 && b2.obs.morning.sent === 1);
// 3. jeudi (télétravail) : aucune alerte du matin, l'agenda reste actif
fs.rmSync(path.join(H, 'obs.json'), { force: true });
const c = run('2026-10-01T05:35:00+02:00', 'fog');
check('jour de télétravail : aucune alerte du matin', c.code === 0 && morningPushes(c.out) === 0 && c.obs.morning.sent === 0);
console.log(rows.join('\n') + `\n\n${fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles du relais au vert`}`);
if (fail && process.env.GITHUB_ACTIONS) console.log(`::error title=relay-smoke::${rows.filter(r => r.startsWith('❌')).join(' / ')}`);
process.exit(fail ? 1 : 0);
