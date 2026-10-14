#!/usr/bin/env node
// Red team hermétique : scripts de production hostiles, liens et fausse CI.
// Aucun secret réel, aucune requête réseau réelle, aucune publication.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const { approvedRun } = require('../tools/relay-trust'), { copy, due } = require('../tools/relay-data');
const { seal, tryUnseal } = require('../tools/keys'), { APP_KEY_TEST, RC_KEY_TEST } = require('./lib/test-keys');
const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-relay-trust-'));
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
try {
  const sha = 'a'.repeat(40), repo = 'example/race-control';
  const green = { id: 10, head_sha: sha, head_branch: 'main', event: 'push', path: '.github/workflows/ci.yml', head_repository: { full_name: repo }, status: 'completed', conclusion: 'success' };
  test('CI exacte main : succès obligatoire, aucune PR/fork/autre workflow accepté', () => {
    assert.equal(approvedRun([green], sha, repo), green);
    for (const change of [{ head_sha: 'b'.repeat(40) }, { head_branch: 'hostile' }, { event: 'pull_request' }, { event: 'workflow_dispatch' }, { path: '.github/workflows/fake.yml' }, { head_repository: { full_name: 'attacker/fork' } }, { status: 'in_progress' }, { conclusion: 'failure' }]) {
      assert.equal(approvedRun([{ ...green, ...change }], sha, repo), null);
    }
    assert.equal(approvedRun([green, { ...green, id: 11, conclusion: 'failure' }], sha, repo), null, 'un ancien vert ne masque pas le dernier run rouge');
  });
  const pages = path.join(temp, 'pages'), data = path.join(temp, 'data'), trusted = path.join(temp, 'trusted');
  for (const d of [pages, data, trusted]) fs.mkdirSync(d);
  const json = (dir, file, value) => fs.writeFileSync(path.join(dir, file), JSON.stringify(value));
  const oldCalendar = seal({ events: [{ t: 'événement fictif conservé' }] }, APP_KEY_TEST);
  json(pages, 'obs.json', { updated: '2026-10-05T03:30:00Z', stations: {}, morning: { date: '2026-10-05', w: 3, i: 3, f: true, sent: 1, checks: 1 } });
  json(pages, 'calendar.sealed.json', oldCalendar);
  const malicious = "require('fs').writeFileSync(process.env.ATTACK_RESULT,process.env.RC_KEY);";
  for (const f of ['relay.js', 'engine.js', 'evidence.js']) fs.writeFileSync(path.join(pages, f), malicious);
  json(pages, 'relay-config.json', { ntfy: 'canal-hostile-fictif' });
  test('préparation allowlist : aucun script/config de gh-pages copié, agenda et anti-doublons conservés', () => {
    copy(pages, data);
    assert.deepEqual(fs.readdirSync(data).sort(), ['calendar.sealed.json', 'obs.json']);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data, 'calendar.sealed.json'))), oldCalendar);
    assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'obs.json'))).morning.sent, 1);
  });
  test('exécution réelle du relais approuvé : le code hostile de production ne voit jamais les clés fictives', () => {
    for (const f of ['relay.js', 'engine.js', 'demo.js', 'evidence.js']) fs.copyFileSync(path.join(root, 'src', f), path.join(trusted, f));
    for (const f of fs.readdirSync(path.join(root, 'tests/relay-harness'))) fs.copyFileSync(path.join(root, 'tests/relay-harness', f), path.join(trusted, f));
    const config = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/relay-config.fake.json')));
    json(trusted, 'config.sealed.json', { v: 'test', sealed: seal(config, RC_KEY_TEST) });
    const marker = path.join(temp, 'secret-stolen.txt');
    const r = spawnSync(process.execPath, ['-r', './mock_tt.js', 'relay.js'], { cwd: trusted, encoding: 'utf8', timeout: 180000, env: {
      PATH: process.env.PATH, FAKE: '2026-10-05T05:50:00+02:00', SCN: 'fog', GCAL_ICS: 'https://calendar.google.com/test.ics',
      APP_KEY: APP_KEY_TEST, RC_KEY: RC_KEY_TEST, ATTACK_RESULT: marker, RC_RELAY_DATA: data, RC_RELAY_CONFIG_FILE: path.join(trusted, 'config.sealed.json')
    } });
    assert.equal(r.status, 0, 'le relais isolé doit réussir avec les fixtures');
    assert(!fs.existsSync(marker), 'aucun script de production exécuté');
    const obs = JSON.parse(fs.readFileSync(path.join(data, 'obs.json')));
    assert.equal(obs.relay.cfg, 'ok'); assert.equal(obs.morning.sent, 1, 'anti-doublon conservé');
    assert.equal(obs.relay.cal, 'ok');
    assert(tryUnseal(JSON.parse(fs.readFileSync(path.join(data, 'calendar.sealed.json'))), APP_KEY_TEST));
    assert(!fs.existsSync(path.join(trusted, 'obs.json')), 'sorties exclusivement dans les données');
    assert(!((r.stdout || '') + (r.stderr || '')).includes(RC_KEY_TEST), 'aucune clé dans les logs');
    copy(data, pages, true);
    assert.equal(fs.readFileSync(path.join(pages, 'relay.js'), 'utf8'), malicious, 'publication sans toucher au code gh-pages');
  });
  test('liens symboliques en lecture/écriture et dossiers parents refusés, aucune cible modifiée', () => {
    const hostile = path.join(temp, 'links'), victim = path.join(temp, 'victim.json'); fs.mkdirSync(hostile);
    fs.writeFileSync(victim, '{"intact":true}'); fs.symlinkSync(victim, path.join(hostile, 'obs.json'));
    assert.throws(() => copy(hostile, data)); assert.throws(() => copy(data, hostile, true));
    assert.equal(fs.readFileSync(victim, 'utf8'), '{"intact":true}');
    fs.symlinkSync(data, path.join(temp, 'linked-directory'));
    assert.throws(() => copy(pages, path.join(temp, 'linked-directory')));
    fs.unlinkSync(path.join(hostile, 'obs.json')); fs.symlinkSync(path.join(temp, 'absent'), path.join(hostile, 'obs.json'));
    assert.throws(() => copy(hostile, data), 'lien cassé refusé');
  });
  test('JSON malformé, métadonnées hostiles et grosse entrée refusés avant la première écriture', () => {
    const bad = path.join(temp, 'bad'); fs.mkdirSync(bad);
    fs.writeFileSync(path.join(bad, 'obs.json'), '{"__proto__":{"poison":1}}');
    const before = fs.readFileSync(path.join(data, 'obs.json'));
    assert.throws(() => copy(bad, data));
    fs.writeFileSync(path.join(bad, 'obs.json'), '{'); assert.throws(() => copy(bad, data));
    fs.writeFileSync(path.join(bad, 'obs.json'), '{"x":"' + 'a'.repeat(16000001) + '"}'); assert.throws(() => copy(bad, data));
    assert(fs.readFileSync(path.join(data, 'obs.json')).equals(before));
  });
  test('une date future falsifiée ne neutralise pas le relais', () => {
    json(data, 'obs.json', { updated: '2099-01-01T00:00:00Z', stations: {} }); assert(due(data, 8));
    json(data, 'obs.json', { updated: new Date().toISOString(), stations: {} }); assert.equal(due(data, 8), false); assert(due(data, 8, true));
  });
  function workflowCheck(s) {
    assert.match(s, /approved:[\s\S]*actions: read[\s\S]*run: node tools\/relay-trust\.js/);
    assert.match(s, /needs: approved/);
    assert.match(s, /needs\.approved\.outputs\.state == 'approved'/);
    assert.match(s, /ref: \$\{\{ needs.approved.outputs.sha \}\}\n\s+path: trusted\n\s+persist-credentials: false/);
    assert.match(s, /run: node trusted\/src\/relay\.js/);
    assert(!/run:.*(?:node|python|npm).*pages\//.test(s));
    assert.match(s, /RC_RELAY_CONFIG_FILE:.*trusted\/encrypted\/relay-config.sealed.json/);
    assert(!s.includes('contents: write\nconcurrency:'), 'pas de permission write globale');
  }
  test('workflows réels : source approuvée + secrets bornés ; mutations dangereuses rejetées', () => {
    for (const file of ['race-control.yml', 'race-control-watchdog.yml']) {
      const s = fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8'); workflowCheck(s);
      assert.throws(() => workflowCheck(s.replace('run: node trusted/src/relay.js', 'run: node pages/race-control/relay.js')));
      assert.throws(() => workflowCheck(s.replace('needs: approved', 'needs: []')));
      assert.throws(() => workflowCheck(s.replace('path: trusted\n', 'path: untrusted\n')));
    }
    const privacy = fs.readFileSync(path.join(root, '.github/workflows/pr-privacy.yml'), 'utf8');
    assert.match(privacy, /base.ref == 'main'/); assert.match(privacy, /ref: \$\{\{ github.sha \}\}/);
    const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8').split('  confidentialite:')[1].split('  unit:')[0];
    assert.match(ci, /run: node trusted\/tools\/check-secrets.js --root trusted --scan target/);
    assert.match(ci, /run: node trusted\/tools\/check-keys.js --enc target\/encrypted/);
  });
  function datexCheck(s) {
    const steps = s.split(/\n(?=      - )/);
    const pages = steps.find(st => /ref: gh-pages/.test(st));
    assert(pages && /persist-credentials: false/.test(pages), 'checkout gh-pages sans jeton persistant');
    assert(!steps.some(st => /uses: actions\/checkout/.test(st) && !/persist-credentials: false/.test(st)), 'aucun checkout ne garde le jeton');
    const sync = steps.find(st => /tools\/road-datex\/sync\.py/.test(st)), pub = steps.find(st => /git push/.test(st));
    assert(sync && !/GH_TOKEN|github\.token|secrets\./.test(sync), 'lecture DATEX sans jeton ni secret');
    assert(pub && /GH_TOKEN: \$\{\{ github\.token \}\}/.test(pub) && /GIT_CONFIG_KEY_0=http\.https:\/\/github\.com\/\.extraheader/.test(pub), 'jeton injecté seulement au push');
    assert(steps.indexOf(sync) < steps.indexOf(pub), 'lecture avant publication');
    assert.match(pub, /case "\$file" in race-control\/road-datex\.json\) ;; \*\) exit 1 ;; esac/, 'seul road-datex.json est publiable');
    assert(!s.includes('contents: write\nconcurrency:'), 'pas de permission write globale');
  }
  test('DATEX : flux Internet lu sans jeton d’écriture, publication bornée ; mutations rejetées', () => {
    const s = fs.readFileSync(path.join(root, '.github/workflows/road-datex.yml'), 'utf8'); datexCheck(s);
    assert.throws(() => datexCheck(s.replace("          # aucun jeton d'écriture sur le disque pendant la lecture du flux DATEX venu d'Internet\n          persist-credentials: false\n", '')));
    assert.throws(() => datexCheck(s.replace('run: python3 tools/road-datex/sync.py', 'env:\n          GH_TOKEN: ${{ github.token }}\n        run: python3 tools/road-datex/sync.py')));
    assert.throws(() => datexCheck(s.replace('race-control/road-datex.json) ;;', 'race-control/*) ;;')));
    assert.throws(() => datexCheck(s.replace(/\n          export GIT_CONFIG_KEY_0=[^\n]*/, '')));
  });
  function fullMainCoverage(workflow) {
    const push = workflow.split('\non:\n')[1]?.split('  push:\n')[1]?.split('  pull_request:')[0];
    assert(push, 'déclencheur push présent');
    assert.match(push, /branches: \[main\]/, 'main reste la seule branche de push');
    assert(!/^\s*(paths|paths-ignore|branches-ignore):/m.test(push), 'chaque SHA main doit déclencher la CI, même documentation seule');
  }
  test('disponibilité : tout commit main déclenche sa CI exacte, sans élargir l’approbation', () => {
    const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'); fullMainCoverage(ci);
    for (const filter of ["paths: ['src/**']", "paths-ignore: ['**/*.md']"]) {
      assert.throws(() => fullMainCoverage(ci.replace('branches: [main]', 'branches: [main]\n    ' + filter)));
    }
    assert.throws(() => fullMainCoverage(ci.replace('branches: [main]', 'branches: [untrusted]')));
    assert.equal(approvedRun([{ ...green, event: 'workflow_dispatch' }], sha, repo), null, 'ne pas contourner la CI push requise');
  });
  console.log(`✅ ${n} scénarios de frontière du relais au vert`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
