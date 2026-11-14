/*
 * Weather Desk ONLY — offline packaging and security preflight.
 * NEVER calls hosting APIs, external network, GitHub, Open-Meteo or a deploy CLI.
 * The output is intentionally missing public-weather.json until a SEPARATELY approved publisher exists.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'weather-desk-preview');
const OUT = path.join(ROOT, '.ci', 'weather-desk-site');
const FILES = Object.freeze(['index.html', 'app.js', 'style.css', '_headers']);
const BLOCKED = Object.freeze([
  /(?:^|\/)sw\.js$/i, /(?:^|\/)manifest\.webmanifest$/i,
  /(?:^|\/)private(?:\/|$)/i, /(?:^|\/)encrypted(?:\/|$)/i,
  /(?:^|\/)(?:session-vault|remember-device|device-storage)\.js$/i,
  /(?:^|\/)(?:calendar|relay|preset)[^/]*\.(?:json|js)$/i,
  /(?:^|\/)public-weather\.json$/i
]);
function assert(condition, why) { if (!condition) throw new Error('Weather Desk preflight: ' + why); }
function checkSource() {
  for (const name of FILES) {
    const f = path.join(SRC, name), stat = fs.lstatSync(f);
    assert(stat.isFile() && !stat.isSymbolicLink(), 'input must be a regular file: ' + name);
    assert(stat.size > 10 && stat.size < 300000, 'unexpected size: ' + name);
  }
  const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');
  const headers = fs.readFileSync(path.join(SRC, '_headers'), 'utf8');
  assert(/http-equiv="Content-Security-Policy"/.test(html), 'in-page CSP missing');
  assert(/default-src 'none'/.test(html) && /connect-src 'self'/.test(html) &&
    /script-src 'self'/.test(html), 'strict inline CSP missing');
  assert(/src="\.\/app\.js"/.test(html) && /href="\.\/style\.css"/.test(html),
    'unexpected boot assets');
  assert(/Permissions-Policy:\s*geolocation=\(\)/.test(headers),
    'hosting must block GPS permission');
  assert(/Content-Security-Policy:/.test(headers) && /frame-ancestors 'none'/.test(headers) &&
    /connect-src 'self'/.test(headers) && /script-src-attr 'none'/.test(headers),
    'hosting CSP weakened');
  assert(/Referrer-Policy:\s*no-referrer/.test(headers), 'referrer policy missing');
  assert(/\/public-weather\.json\s*\n\s*Cache-Control:\s*no-store/.test(headers),
    'public weather must not be disk HTTP cached');
  assert(!/(?:fetch|XMLHttpRequest|sendBeacon)\s*\(\s*['"]https?:/i.test(js),
    'new third-party network path detected');
  assert(!/navigator\s*\.\s*(?:geolocation|serviceWorker)/.test(js.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')),
    'forbidden browser capability');
  return { html, js, headers };
}
function preflight(dir = OUT) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  assert(entries.length === FILES.length, 'not an exact four-file public allowlist');
  for (const entry of entries) {
    assert(FILES.includes(entry.name) && entry.isFile() && !entry.isSymbolicLink(),
      'unknown asset in output');
    assert(!BLOCKED.some(re => re.test(entry.name)), 'sensitive asset in public output');
    const actual = fs.readFileSync(path.join(dir, entry.name));
    const expected = fs.readFileSync(path.join(SRC, entry.name));
    assert(actual.equals(expected), 'mismatched asset: ' + entry.name);
  }
  assert(!fs.existsSync(path.join(dir, 'public-weather.json')),
    'real or fictive public snapshot forbidden without a publisher');
  return { output: dir, files: [...FILES] };
}
function stage() {
  checkSource();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  // The only path replaced is the fixed .ci/weather-desk-site sandbox.
  assert(OUT === path.join(ROOT, '.ci', 'weather-desk-site'), 'output outside CI sandbox');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of FILES) fs.copyFileSync(path.join(SRC, name), path.join(OUT, name));
  return preflight(OUT);
}
if (require.main === module) {
  try {
    const result = stage();
    console.log('PASS Weather Desk static package: ' + result.files.join(', ') +
      '. No public-weather.json, no app vault, no hosting or network action.');
  } catch (e) {
    console.error('FAIL Weather Desk preflight: ' + e.message);
    process.exitCode = 1;
  }
}
module.exports = { stage, preflight, checkSource, FILES, OUT };
