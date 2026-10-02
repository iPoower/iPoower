#!/usr/bin/env node
// Outils de clés : tests 100 % fictifs (aucun secret, aucune donnée réelle) de tools/rotate-rc-key.js et tools/check-keys.js.
// Rejoue le cas réel de la production : ancienne config du relais chiffrée avec une RC_KEY ÉGALE au code de l'app.
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), D = path.join(ROOT, '.ci-keys'), ENC = path.join(D, 'enc'), PROD = path.join(D, 'prod');
const { seal, tryUnseal } = require('../tools/keys');
const { APP_KEY_TEST, RC_KEY_TEST, RC_KEY_NEXT_TEST } = require('./lib/test-keys');
fs.rmSync(D, { recursive: true, force: true }); [ENC, PROD].forEach(d => fs.mkdirSync(d, { recursive: true }));
const fx = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures', f), 'utf8'));
const preset = fx('preset.fake.json'), cfg = fx('relay-config.fake.json'), cal = { v: 2, updated: '2026-10-05T05:00:00Z', events: [{ t: 'RDV test', loc: 'Lieu test' }] };
const J = (f, o) => fs.writeFileSync(f, JSON.stringify(o)), readJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const LEAK = [APP_KEY_TEST, RC_KEY_TEST, RC_KEY_NEXT_TEST, 'Maison test', 'Travail test', 'ci-test-topic-not-real', 'RDV test'];
const rows = []; let fail = 0, leaks = 0;
const check = (name, ok, detail) => { rows.push(`${ok ? '✅' : '❌'} ${name}${detail ? ' · ' + detail : ''}`); if (!ok) fail++; };
const node = (tool, args, keys) => { const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', tool), ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, ...keys } });
  const txt = (r.stdout || '') + (r.stderr || ''); if (LEAK.some(v => txt.includes(v))) leaks++; return { code: r.status, out: txt }; };
// état hérité (production actuelle) : préréglage + config + agenda, tout chiffré avec le code de l'app
J(path.join(ENC, 'preset.sealed.json'), { v: 'p', sealed: seal(preset, APP_KEY_TEST) });
const legacy = seal(cfg, APP_KEY_TEST);
J(path.join(D, 'main.json'), { v: 'testv', sealed: legacy }); J(path.join(D, 'prod.json'), legacy); J(path.join(D, 'other.json'), seal(cfg, APP_KEY_TEST));
J(path.join(PROD, 'calendar.sealed.json'), seal(cal, APP_KEY_TEST));
// 1. rotation
const OUT = path.join(D, 'out.json');
const rot = (keys, prod = path.join(D, 'prod.json')) => { fs.rmSync(OUT, { force: true }); const r = node('rotate-rc-key.js', ['--from', path.join(D, 'main.json'), '--prod', prod, '--out', OUT], keys); return { ...r, file: readJ(OUT) }; };
const ROT = { RC_KEY: APP_KEY_TEST, RC_KEY_NEXT: RC_KEY_NEXT_TEST, APP_KEY: APP_KEY_TEST };
const r1 = rot(ROT), s1 = r1.file && r1.file.sealed;
check('rotation : rechiffrée avec RC_KEY_NEXT, contenu et version identiques', r1.code === 0 && !!s1 && JSON.stringify(tryUnseal(s1, RC_KEY_NEXT_TEST)) === JSON.stringify(cfg) && r1.file.v === 'testv');
check('rotation : nouvelle config refusée avec l’ancienne clé et avec APP_KEY', !!s1 && !tryUnseal(s1, APP_KEY_TEST) && !tryUnseal(s1, RC_KEY_TEST));
const bad = { 'NEXT = APP_KEY': rot({ ...ROT, RC_KEY_NEXT: APP_KEY_TEST }), 'NEXT trop courte': rot({ ...ROT, RC_KEY_NEXT: 'trop-courte-0123' }), 'mauvaise RC_KEY': rot({ ...ROT, RC_KEY: RC_KEY_TEST }),
  'NEXT absente': rot({ RC_KEY: APP_KEY_TEST, APP_KEY: APP_KEY_TEST }), 'APP_KEY absente': rot({ RC_KEY: APP_KEY_TEST, RC_KEY_NEXT: RC_KEY_NEXT_TEST }),
  'source ≠ production': rot(ROT, path.join(D, 'other.json')), 'NEXT = RC_KEY': rot({ ...ROT, RC_KEY: RC_KEY_NEXT_TEST }) };
const ko = Object.entries(bad).filter(([, x]) => !(x.code === 1 && !x.file)).map(([k]) => k);
check(`rotation refusée sans rien écrire (${Object.keys(bad).length} cas)`, ko.length === 0, ko.join(', '));
// 2. check-keys, mode normal (après rotation et nettoyage)
const ENC2 = path.join(D, 'enc2'); fs.mkdirSync(ENC2); fs.copyFileSync(path.join(ENC, 'preset.sealed.json'), path.join(ENC2, 'preset.sealed.json'));
J(path.join(ENC2, 'relay-config.sealed.json'), { v: 'x', sealed: seal(cfg, RC_KEY_TEST) });
const ck = (enc, keys, prod) => node('check-keys.js', ['--enc', enc, ...(prod ? ['--prod', prod] : [])], keys);
const OK = { APP_KEY: APP_KEY_TEST, RC_KEY: RC_KEY_TEST };
const n1 = ck(ENC2, OK, PROD);
check('check-keys : vert avec deux clés séparées (dépôt + agenda en ligne)', n1.code === 0 && !/❌|⚠️/.test(n1.out));
const nbad = [ck(ENC2, { APP_KEY: RC_KEY_TEST, RC_KEY: APP_KEY_TEST }), ck(ENC2, { APP_KEY: APP_KEY_TEST, RC_KEY: APP_KEY_TEST }), ck(ENC2, { RC_KEY: RC_KEY_TEST }), ck(ENC, OK)];
check('check-keys : rouge si clés inversées, identiques, APP_KEY absente, ou config encore chiffrée avec le code de l’app', nbad.every(x => x.code === 1));
// 3. check-keys, mode rotation (transitoire)
const ENC3 = path.join(D, 'enc3'); fs.mkdirSync(ENC3); fs.copyFileSync(path.join(ENC, 'preset.sealed.json'), path.join(ENC3, 'preset.sealed.json')); J(path.join(ENC3, 'relay-config.sealed.json'), r1.file);
const t1 = ck(ENC3, ROT), t2 = ck(ENC3, { ...ROT, RC_KEY: RC_KEY_NEXT_TEST }), t3 = ck(ENC3, { APP_KEY: APP_KEY_TEST, RC_KEY: RC_KEY_NEXT_TEST }), t4 = ck(ENC3, { ...ROT, RC_KEY_NEXT: APP_KEY_TEST }), t5 = ck(ENC, ROT);
check('check-keys rotation : vert pendant la transition (ancienne clé signalée ⚠️)', t1.code === 0 && /⚠️/.test(t1.out) && /🔁/.test(t1.out));
check('check-keys rotation : vert après bascule (RC_KEY = nouvelle valeur), puis sans RC_KEY_NEXT', t2.code === 0 && t3.code === 0 && !/⚠️|❌/.test(t3.out));
check('check-keys rotation : rouge si RC_KEY_NEXT = APP_KEY ou config pas encore rechiffrée', t4.code === 1 && t5.code === 1);
check('aucune clé ni donnée en clair dans les sorties des outils', leaks === 0, leaks ? leaks + ' sortie(s)' : '');
fs.rmSync(D, { recursive: true, force: true });
console.log(rows.join('\n') + `\n\n${fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles des outils de clés au vert`}`);
if (fail && process.env.GITHUB_ACTIONS) console.log(`::error title=keys-tools::${rows.filter(r => r.startsWith('❌')).join(' / ')}`);
process.exit(fail ? 1 : 0);
