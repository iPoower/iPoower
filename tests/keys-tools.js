#!/usr/bin/env node
// Outils de clés : tests 100 % fictifs (aucun secret, aucune donnée réelle) de tools/check-keys.js.
// Inclut l'état d'avant la séparation (config du relais chiffrée avec le code de l'app) : il doit être refusé.
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), D = path.join(ROOT, '.ci-keys'), ENC = path.join(D, 'enc'), PROD = path.join(D, 'prod');
const { seal, tryUnseal } = require('../tools/keys');
const { APP_KEY_TEST, RC_KEY_TEST } = require('./lib/test-keys');
fs.rmSync(D, { recursive: true, force: true }); [ENC, PROD].forEach(d => fs.mkdirSync(d, { recursive: true }));
const fx = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures', f), 'utf8'));
const preset = fx('preset.fake.json'), cfg = fx('relay-config.fake.json'), cal = { v: 2, updated: '2026-10-05T05:00:00Z', events: [{ t: 'RDV test', loc: 'Lieu test' }] };
const J = (f, o) => fs.writeFileSync(f, JSON.stringify(o)), readJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const LEAK = [APP_KEY_TEST, RC_KEY_TEST, 'Maison test', 'Travail test', 'ci-test-topic-not-real', 'RDV test'];
const rows = []; let fail = 0, leaks = 0;
const check = (name, ok, detail) => { rows.push(`${ok ? '✅' : '❌'} ${name}${detail ? ' · ' + detail : ''}`); if (!ok) fail++; };
const node = (tool, args, keys) => { const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', tool), ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, ...keys } });
  const txt = (r.stdout || '') + (r.stderr || ''); if (LEAK.some(v => txt.includes(v))) leaks++; return { code: r.status, out: txt }; };
// préréglage + agenda chiffrés avec le code de l'app ; config du relais encore chiffrée avec ce code (état d'avant la séparation, doit être refusé)
J(path.join(ENC, 'preset.sealed.json'), { v: 'p', sealed: seal(preset, APP_KEY_TEST) });
const legacy = seal(cfg, APP_KEY_TEST); J(path.join(ENC, 'relay-config.sealed.json'), { v: 'l', sealed: legacy });   // état d'avant la séparation
J(path.join(PROD, 'calendar.sealed.json'), seal(cal, APP_KEY_TEST));
// check-keys
const ENC2 = path.join(D, 'enc2'); fs.mkdirSync(ENC2); fs.copyFileSync(path.join(ENC, 'preset.sealed.json'), path.join(ENC2, 'preset.sealed.json'));
J(path.join(ENC2, 'relay-config.sealed.json'), { v: 'x', sealed: seal(cfg, RC_KEY_TEST) });
const ck = (enc, keys, prod) => node('check-keys.js', ['--enc', enc, ...(prod ? ['--prod', prod] : [])], keys);
const OK = { APP_KEY: APP_KEY_TEST, RC_KEY: RC_KEY_TEST };
const n1 = ck(ENC2, OK, PROD);
check('check-keys : vert avec deux clés séparées (dépôt + agenda en ligne)', n1.code === 0 && !/❌|⚠️/.test(n1.out));
const nbad = [ck(ENC2, { APP_KEY: RC_KEY_TEST, RC_KEY: APP_KEY_TEST }), ck(ENC2, { APP_KEY: APP_KEY_TEST, RC_KEY: APP_KEY_TEST }), ck(ENC2, { RC_KEY: RC_KEY_TEST }), ck(ENC, OK)];
check('check-keys : rouge si clés inversées, identiques, APP_KEY absente, ou config encore chiffrée avec le code de l’app', nbad.every(x => x.code === 1));
check('aucune clé ni donnée en clair dans les sorties des outils', leaks === 0, leaks ? leaks + ' sortie(s)' : '');
fs.rmSync(D, { recursive: true, force: true });
console.log(rows.join('\n') + `\n\n${fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles des outils de clés au vert`}`);
if (fail && process.env.GITHUB_ACTIONS) console.log(`::error title=keys-tools::${rows.filter(r => r.startsWith('❌')).join(' / ')}`);
process.exit(fail ? 1 : 0);
