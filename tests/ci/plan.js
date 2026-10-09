'use strict';
const { SUITE, FIRST } = require('./suites'), durations = require('./durations.json');
const unitSuites = () => SUITE.filter(s => !s[2]);
function browserSuites(browser) {
  if (!['chromium', 'webkit'].includes(browser)) throw new Error('Navigateur CI inconnu');
  return SUITE.filter(s => s[2] && (!s[3] || s[3] === browser));
}
function shards(browser, total = 3) {
  const suites = browserSuites(browser);
  if (!Number.isInteger(total) || total < 1 || total > suites.length) throw new Error('Nombre de shards invalide');
  const bins = Array.from({ length: total }, () => ({ seconds: 0, suites: [] }));
  const weight = s => Math.max(1, durations[browser][s[0]] || 1);
  for (const suite of suites.slice().sort((a, b) => weight(b) - weight(a) || a[0].localeCompare(b[0]))) {
    const bin = bins.reduce((a, b) => b.seconds < a.seconds ? b : a);
    bin.suites.push(suite); bin.seconds += weight(suite);
  }
  return bins;
}
function select({ lane = 'all', browser = 'chromium', index = 1, total = 1, files = [] } = {}) {
  browserSuites(browser);
  if (!['all', 'unit', 'browser'].includes(lane)) throw new Error('Lane CI inconnue');
  if (!Number.isInteger(index) || index < 1 || index > total) throw new Error('Index de shard invalide');
  if (lane !== 'browser' && (index !== 1 || total !== 1)) throw new Error('Seules les suites navigateur sont shardées');
  let suites = lane === 'unit' ? unitSuites() : lane === 'browser' ? shards(browser, total)[index - 1].suites : SUITE.filter(s => !s[3] || s[3] === browser);
  if (files.length) { for (const f of files) if (!suites.some(s => s[0] === f)) throw new Error('Suite inconnue dans cette lane : ' + f); suites = suites.filter(s => files.includes(s[0])); }
  if (!suites.length) throw new Error('Sélection CI vide');
  // La priorité accélère le diagnostic, sans déplacer ni omettre de suite entre les shards.
  if (lane === 'browser') suites.sort((a, b) => (FIRST.includes(a[0]) ? FIRST.indexOf(a[0]) : FIRST.length) - (FIRST.includes(b[0]) ? FIRST.indexOf(b[0]) : FIRST.length));
  return suites;
}
module.exports = { unitSuites, browserSuites, shards, select };
