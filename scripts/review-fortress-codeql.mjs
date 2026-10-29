// Every alert remains in SARIF. Only individually reviewed, byte-identical test
// findings can be classified; a changed file or any runtime finding fails closed.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const dir = process.argv[2];
if (!dir) throw Error('SARIF directory required');
const review = JSON.parse(fs.readFileSync('docs/fortress-codeql-triage.json', 'utf8'));
if (review.schema !== 1 || !Array.isArray(review.findings)) throw Error('Invalid triage');
for (const row of review.findings) {
  if (!row.path.startsWith('tests/') || row.path.split('/').includes('..') || !row.reason || !/^[a-f0-9]{64}$/.test(row.fileSha256)) throw Error('Invalid test-only classification');
}
const files = fs.readdirSync(dir).filter(n => n.endsWith('.sarif'));
if (!files.length) throw Error('No CodeQL proof');
let classified = 0, blocking = 0;
for (const file of files) for (const run of JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).runs) {
  const rules = new Map((run.tool.driver.rules || []).map(r => [r.id, r]));
  for (const result of run.results || []) {
    const level = result.level || rules.get(result.ruleId)?.defaultConfiguration?.level || 'warning';
    if (!['error', 'warning'].includes(level)) continue;
    const physical = result.locations?.[0]?.physicalLocation;
    const name = physical?.artifactLocation?.uri, line = physical?.region?.startLine;
    const row = review.findings.find(r => r.rule === result.ruleId && r.path === name && r.line === line && r.messageSha256 === digest(result.message.text));
    const exact = row && digest(fs.readFileSync(row.path)) === row.fileSha256;
    if (exact) classified++;
    else { blocking++; console.error('UNREVIEWED', result.ruleId, name, line); }
  }
}
console.log(JSON.stringify({ classifiedTestFindings: classified, unreviewedFindings: blocking, runtimeExceptions: 0 }));
if (blocking) process.exitCode = 1;
