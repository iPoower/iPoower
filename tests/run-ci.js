#!/usr/bin/env node
// Validation locale complète, lane rapide ou shard E2E : même registre, mêmes tests et mêmes verdicts.
// Les artifacts partagés ne contiennent que les fixtures fictives ; chaque lane copie son workspace.
'use strict';
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const { SUITE } = require('./ci/suites'), { select } = require('./ci/plan'), { verdict } = require('./ci/verdict');
const { ROOT, CI, prepare, workspace } = require('./ci/workspace');
const started = Date.now(), options = { lane: 'all', browser: (process.env.BROWSER || 'chromium').toLowerCase(), index: 1, total: 1, files: [] };
let reuse = false, list = false, prepareOnly = false;
try {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split('='), value = () => inline === undefined ? argv[++i] : inline;
    if (flag === '--lane') options.lane = value();
    else if (flag === '--shard') { const m = /^(\d+)\/(\d+)$/.exec(value() || ''); if (!m) throw new Error('Shard attendu : 1/3'); options.index = +m[1]; options.total = +m[2]; }
    else if (flag === '--suite') options.files.push(value());
    else if (flag === '--reuse') reuse = true;
    else if (flag === '--list') list = true;
    else if (flag === '--prepare-only') prepareOnly = true;
    else throw new Error('Option CI inconnue : ' + flag);
  }
  if (options.lane === 'unit') options.browser = 'chromium';
  const suites = select(options);
  if (list) { console.log(JSON.stringify(suites.map(s => s[0]), null, 2)); process.exit(0); }
  if (!reuse) prepare();
  if (prepareOnly) { console.log('✅ Fixtures fictives prêtes.'); process.exit(0); }
  const key = options.lane === 'browser' ? `${options.browser}-${options.index}-of-${options.total}` : options.lane === 'all' ? 'all-' + options.browser : 'unit';
  const { w, out, meta } = workspace(key);
  const report = { schema: 1, selection: options.files.length ? 'targeted' : 'full', sourceHash: meta.sourceHash, lane: options.lane, browser: options.browser, index: options.index, total: options.total, startedAt: new Date(started).toISOString(), prepare: { buildMs: meta.buildMs, fixtureMs: meta.fixtureMs, prepareMs: meta.prepareMs }, results: [] };
  let fail = 0;
  for (const [file, what, browser] of suites) {
    const t0 = Date.now(), r = spawnSync(process.execPath, [path.join(ROOT, 'tests', file)], { cwd: w, encoding: 'utf8', timeout: 20 * 60e3, env: { ...process.env, SP: out, BROWSER: options.browser } });
    const output = (r.stdout || '') + (r.stderr || ''), why = r.error ? String(r.error.message) : verdict(r.status, output), ms = Date.now() - t0;
    fs.writeFileSync(path.join(out, file.replace('.js', '.log')), output);
    report.results.push({ file, ms, ok: !why, ...(why ? { error: why } : {}) });
    console.log(`${why ? '❌' : '✅'} ${file.padEnd(17)} ${what}${browser ? ` [${options.browser}]` : ''} · ${Math.round(ms / 1000)} s${why ? ' · ' + why : ''}`);
    if (why) {
      fail++;
      const labels = output.split('\n').map((l, i, a) => /^\s*❌/.test(l) ? l.trim().slice(0, 160) + ' ⏎ ' + (a[i + 1] || '').trim().slice(0, 260) : null).filter(Boolean).slice(0, 6).join(' / ');
      if (process.env.GITHUB_ACTIONS) console.log(`::error title=${file} (${options.browser})::${(why + (labels ? ' | ' + labels : '')).replace(/[\r\n%]/g, ' ')}`);
      else console.log(output.split('\n').slice(-25).join('\n'));
    }
  }
  report.completedAt = new Date().toISOString(); report.durationMs = Date.now() - started;
  fs.mkdirSync(path.join(CI, 'results'), { recursive: true });
  fs.writeFileSync(path.join(CI, 'results', 'report-' + key + '.json'), JSON.stringify(report, null, 2));
  const skipped = options.lane === 'all' && !options.files.length ? SUITE.filter(s => s[3] && s[3] !== options.browser).length : 0;
  console.log(`\n${fail ? `❌ ${fail} test(s) en échec` : `✅ ${suites.length} tests au vert${skipped ? ` + ${skipped} non applicable (Service Worker Chromium)` : ''}`} (${key}) · ${(report.durationMs / 1000).toFixed(1)} s`);
  process.exit(fail ? 1 : 0);
} catch (e) { console.error('❌ CI : ' + String(e.message).replace(/https?:\S+/g, 'url')); process.exit(1); }
