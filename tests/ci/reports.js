'use strict';
const { select } = require('./plan');
function verifyReports(reports, total = 3, expectedHash) {
  const expected = [{ lane: 'unit', browser: 'chromium', index: 1, total: 1 }, ...['chromium', 'webkit'].flatMap(browser => Array.from({ length: total }, (_, i) => ({ lane: 'browser', browser, index: i + 1, total })))];
  const key = r => `${r.lane}:${r.browser}:${r.index}/${r.total}`;
  const roles = new Map(); let hash;
  for (const report of reports) {
    if (report.schema !== 1 || report.selection !== 'full' || !/^[a-f0-9]{64}$/.test(report.sourceHash)) throw new Error('Rapport invalide ou sélection ciblée');
    if (hash && hash !== report.sourceHash) throw new Error('Rapports de sources différentes'); hash = report.sourceHash;
    if (expectedHash && report.sourceHash !== expectedHash) throw new Error('Rapport d’une autre version de source');
    if (roles.has(key(report))) throw new Error('Rapport de shard dupliqué'); roles.set(key(report), report);
    if (!Number.isFinite(report.durationMs) || report.durationMs < 0) throw new Error('Durée invalide');
  }
  if (roles.size !== expected.length) throw new Error('Rapport manquant ou supplémentaire');
  let count = 0;
  for (const role of expected) {
    const report = roles.get(key(role)); if (!report) throw new Error('Shard manquant : ' + key(role));
    const files = select(role).map(s => s[0]).sort(), results = report.results;
    if (!Array.isArray(results) || JSON.stringify(results.map(r => r.file).sort()) !== JSON.stringify(files)) throw new Error('Couverture incomplète ou suite dupliquée : ' + key(role));
    if (results.some(r => r.ok !== true || !Number.isFinite(r.ms) || r.ms < 0)) throw new Error('Suite en échec : ' + key(role));
    count += results.length;
  }
  return { count, roles: expected.map(role => roles.get(key(role))), sourceHash: hash };
}
function verifyGates(needs, rollback, production) {
  const wanted = { version: 'success', 'relay-smoke': 'success', confidentialite: production ? 'success' : 'skipped', unit: rollback ? 'skipped' : 'success', tests: rollback ? 'skipped' : 'success', 'tests-rollback': rollback ? 'success' : 'skipped' };
  for (const [job, result] of Object.entries(wanted)) if (needs[job]?.result !== result) throw new Error('Contrôle non validé : ' + job + ' (' + needs[job]?.result + ')');
}
module.exports = { verifyReports, verifyGates };
