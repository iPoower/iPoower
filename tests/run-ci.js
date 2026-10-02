#!/usr/bin/env node
// Suite de tests de la CI : prépare un dossier de travail à partir du build (dist/) et des réglages chiffrés,
// génère les jeux de test de l'agenda avec le harnais du relais (données fictives), puis exécute chaque test et contrôle son verdict.
// Clé : private/.passphrase en local, secret APP_KEY dans GitHub Actions. Rien n'est écrit en dehors de .ci/ (ignoré par Git).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), CI = path.join(ROOT, '.ci'), W = path.join(CI, 'w'), H = path.join(CI, 'h'), OUT = path.join(CI, 'out');
const BROWSER = (process.env.BROWSER || 'chromium').toLowerCase();
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8'), cp = (a, b) => fs.copyFileSync(path.join(ROOT, a), b);
fs.rmSync(CI, { recursive: true, force: true }); [W, path.join(W, 'site'), H, OUT].forEach(d => fs.mkdirSync(d, { recursive: true }));
if (!fs.existsSync(path.join(ROOT, 'dist/index.html'))) { console.error('dist/ absent : lance d’abord node tools/build.js'); process.exit(2); }
const norm = s => String(s || '').trim().replace(/^["'«\s]+|["'»\s]+$/g, '').toLowerCase();
let KEY = ''; try { KEY = norm(rd('private/.passphrase')); } catch (e) { KEY = norm(process.env.APP_KEY || process.env.RC_KEY); }   // le code de l'app est aujourd'hui aussi la clé du relais
if (!KEY) { console.error('Clé absente (private/.passphrase, ou secret APP_KEY / RC_KEY) : impossible de déverrouiller l’app dans les tests.'); process.exit(2); }
function unseal(S) { const k = crypto.pbkdf2Sync(KEY, Buffer.from(S.s, 'base64'), S.it, 32, 'sha256'), b = Buffer.from(S.c, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(S.i, 'base64')); d.setAuthTag(b.subarray(b.length - 16));
  return Buffer.concat([d.update(b.subarray(0, b.length - 16)), d.final()]).toString('utf8'); }
// dossier de travail des tests (même disposition que l'atelier d'origine)
for (const f of fs.readdirSync(path.join(ROOT, 'dist'))) cp('dist/' + f, path.join(W, 'site', f));
['engine.js', 'demo.js', 'relay.js'].forEach(f => cp('src/' + f, path.join(W, f)));
fs.writeFileSync(path.join(W, '.passphrase'), KEY);
const PRESET = fs.existsSync(path.join(ROOT, 'private/preset.json')) ? rd('private/preset.json') : unseal(JSON.parse(rd('encrypted/preset.sealed.json')).sealed);
fs.writeFileSync(path.join(W, 'preset.json'), PRESET);
// journaux publics (dépôt public) : les noms de lieux et coordonnées personnels sont masqués avant tout affichage
const PRIV = []; try { const P = JSON.parse(PRESET); [...(P.locs || []), ...(P.customs || [])].forEach(l => { PRIV.push(l.name, String(l.name).split(' / ')[0]);
  ['lat', 'lon'].forEach(k => { if (typeof l[k] === 'number') PRIV.push(l[k].toFixed(4), l[k].toFixed(3), String(l[k])); }); }); } catch (e) { /* préréglage illisible */ }
const scrub = t => PRIV.filter(v => v && String(v).length >= 4).sort((a, b) => String(b).length - String(a).length).reduce((x, v) => x.split(String(v)).join('•••').split(String(v).toUpperCase()).join('•••'), t);
// widget : configuration fictive pour le test (le widget public n'en contient pas)
fs.writeFileSync(path.join(W, 'widget.js'), rd('src/widget.js').replace(/const CFG = null;[^\n]*/, 'const CFG = ' + JSON.stringify({ home: { id: 'home', name: 'Départ test', lat: 48.85, lon: 2.35 }, work: { id: 'work', name: 'Arrivée test', lat: 49.4, lon: 2.8 }, dep: '06:30', durMin: 40, days: [1, 2, 3], cars: [{ short: 'Voiture test', sporty: 1, tire: { type: 'summer', size: '215/40 R18', tread: null, dot: '2124' }, plan: { on: 0 } }] }) + ';'));
const NM = fs.existsSync(path.join(ROOT, 'node_modules')) ? path.join(ROOT, 'node_modules') : process.env.NODE_MODULES_DIR;
if (NM) fs.symlinkSync(NM, path.join(W, 'node_modules'), 'dir');
// jeu de test de l'agenda : le vrai relais tourne sur un agenda fictif, avec la date simulée du scénario
['relay.js', 'engine.js', 'demo.js'].forEach(f => cp('src/' + f, path.join(H, f)));
fs.readdirSync(path.join(ROOT, 'tests/relay-harness')).forEach(f => cp('tests/relay-harness/' + f, path.join(H, f)));
cp('dist/relay-config.sealed.json', path.join(H, 'relay-config.sealed.json'));
const rel = spawnSync(process.execPath, ['-r', './mock_tt.js', 'relay.js'], { cwd: H, encoding: 'utf8', timeout: 180e3,
  env: { ...process.env, FAKE: '2026-10-02T08:00:00+02:00', SCN: 'doux', GCAL_ICS: 'https://calendar.google.com/test.ics', APP_KEY: KEY, RC_KEY: KEY } });
if (!fs.existsSync(path.join(H, 'calendar.sealed.json'))) { console.error('Harnais du relais en échec :\n' + (rel.stdout || '') + (rel.stderr || '')); process.exit(1); }
fs.copyFileSync(path.join(H, 'calendar.sealed.json'), path.join(OUT, 'cal.fake.json'));
if (process.env.GITHUB_ACTIONS) { try { const C = JSON.parse(unseal(JSON.parse(fs.readFileSync(path.join(H, 'calendar.sealed.json'), 'utf8'))));   // agenda fictif : horaires seulement
  console.log('::notice title=Jeu de test agenda (fictif)::TZ=' + (process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone) + ' | ' + C.events.map(e => e.t.slice(0, 12) + ' ' + (e.legs || []).map(l => l.k + ' ' + l.dep.slice(5)).join(',')).join(' ; ')); } catch (e) { console.log('::notice::agenda illisible ' + e.message); } }
// suite : tests unitaires du moteur et du widget, puis parcours navigateur (horloge et réseau simulés)
const SUITE = [
  ['test_engine.js', 'moteur : verdicts, chaussée, verglas', false], ['test_examples.js', 'moteur : cas de référence', false], ['test_widget.js', 'widget iPhone (Scriptable simulé)', false],
  ['e2e17.js', 'réglages conservés lors d’une mise à jour', true], ['e2e18.js', 'astuces et mode Météo', true], ['e2e24.js', 'jours de trajet domicile-travail', true],
  ['e2e25.js', 'timeline : prochain trajet, en cours, arrivée', true], ['e2e26.js', 'lieux et Ma position', true], ['e2e27.js', 'mini-carte ordinateur et iPhone', true]];
const verdict = (code, out) => {
  if (code !== 0) return 'code de sortie ' + code;
  if (/❌|ERR |Error:|TimeoutError/.test(out)) return 'échec signalé dans la sortie';
  const sc = [...out.matchAll(/(\d+)\/(\d+) scénarios OK/g)]; if (sc.some(m => m[1] !== m[2])) return 'scénarios incomplets';
  const er = out.match(/errors (\[.*\])/); if (er && er[1] !== '[]') return 'erreurs JavaScript : ' + er[1].slice(0, 200);
  if (/erreurs JS : (?!aucune)/.test(out)) return 'erreurs JavaScript';
  if (/perdus [1-9]/.test(out)) return 'réglages perdus';
  return null;
};
let fail = 0; const rows = [];
for (const [file, what, browser] of SUITE) {
  const t0 = Date.now(), r = spawnSync(process.execPath, [path.join(ROOT, 'tests', file)], { cwd: W, encoding: 'utf8', timeout: 20 * 60e3, env: { ...process.env, SP: OUT, BROWSER } });
  const out = (r.stdout || '') + (r.stderr || ''), why = r.error ? String(r.error.message) : verdict(r.status, out);
  fs.writeFileSync(path.join(OUT, file.replace('.js', '.log')), out);
  rows.push(`${why ? '❌' : '✅'} ${file.padEnd(17)} ${what}${browser ? ` [${BROWSER}]` : ''} · ${Math.round((Date.now() - t0) / 1000)} s${why ? ' · ' + why : ''}`);
  if (why) { fail++; console.log(scrub(out.split('\n').slice(-25).join('\n')));   // détail seulement en cas d'échec, données personnelles masquées
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=${file} (${BROWSER})::${scrub(why + ' | ' + out.split('\n').map((l, i, A) => /❌/.test(l) ? l + ' ⏎ ' + (A[i + 1] || '').slice(0, 160) + ' ⏎ ' + (A[i + 2] || '').slice(0, 200) : /Error|Timeout|errors \[|scénarios OK/.test(l) ? l : null).filter(Boolean).slice(0, 4).join(' / ')).replace(/[\r\n%]/g, ' ').slice(0, 900)}`); }
}
console.log('\n' + rows.join('\n') + `\n\n${fail ? `❌ ${fail} test(s) en échec` : `✅ ${SUITE.length} tests au vert`} (${BROWSER})`);
process.exit(fail ? 1 : 0);
