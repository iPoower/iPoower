'use strict';
const fs = require('node:fs'), path = require('node:path'), { verifyReports, verifyGates } = require('./reports');
const { sourceHash } = require('./workspace');
try {
  verifyGates(JSON.parse(process.env.CI_NEEDS || '{}'), process.env.CI_ROLLBACK === 'true', process.env.CI_PRODUCTION === 'true');
  if (process.argv.includes('--gates-only')) { console.log('✅ Tous les contrôles requis sont verts ; aucun saut inattendu.'); process.exit(0); }
  const dir = process.argv[2];
  const reports = fs.readdirSync(dir).filter(f => /^report-.*\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const summary = verifyReports(reports, 3, sourceHash());
  let text = `### Validation complète\n\n${summary.count} exécutions validées ; aucune suite absente, ciblée, dupliquée ou en échec.\n\n| Lane | Suites | Temps du runner |\n|---|---:|---:|\n`;
  for (const r of summary.roles) text += `| ${r.lane === 'unit' ? 'unit' : r.browser + ' ' + r.index + '/' + r.total} | ${r.results.length} | ${(r.durationMs / 1000).toFixed(1)} s |\n`;
  text += '\nUnitaires partagés une seule fois ; E2E Chromium et WebKit inchangés. Les deux tests Service Worker restent sur Chromium, comme avant.\n';
  const p = summary.roles[0].prepare;
  text += `\nPréparation unique : build fictif ${p.buildMs} ms ; agenda fictif ${p.fixtureMs} ms ; total ${p.prepareMs} ms. Les temps mur complets et les installations restent visibles dans les jobs GitHub Actions.\n`;
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  console.log(text);
} catch (e) { console.error('❌ Validation incomplète : ' + e.message); process.exit(1); }
