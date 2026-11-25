#!/usr/bin/env node
// Contrôle de confidentialité des pull requests : test 100 % fictif (aucun secret, aucune donnée réelle).
// Reproduit la disposition du workflow pr-privacy.yml : trusted/ (scanner + chiffrés de confiance) et target/ (la PR, simples fichiers).
// Vérifie : donnée privée fictive -> rouge ; PR propre -> vert ; aucun JavaScript de target/ exécuté (pièges) ; aucune valeur affichée ;
// liens symboliques refusés sans être suivis ; noms de fichiers piégés neutralisés ; titre et description de la PR contrôlés sans injection.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), W = path.join(ROOT, '.ci-privacy'), MARK = path.join(W, 'EXECUTE');
const { seal } = require('../tools/keys');
const { APP_KEY_TEST, RC_KEY_TEST } = require('./lib/test-keys');
fs.rmSync(W, { recursive: true, force: true });
const mk = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const fx = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures', f), 'utf8'));
// trusted/ : le scanner de main + les réglages chiffrés de confiance (fictifs)
const TR = path.join(W, 'trusted');
['check-secrets.js', 'keys.js'].forEach(f => mk(path.join(TR, 'tools', f), fs.readFileSync(path.join(ROOT, 'tools', f))));
mk(path.join(TR, 'encrypted/preset.sealed.json'), JSON.stringify({ v: 'p', sealed: seal(fx('preset.fake.json'), APP_KEY_TEST) }));
mk(path.join(TR, 'encrypted/relay-config.sealed.json'), JSON.stringify({ v: 'r', sealed: seal(fx('relay-config.fake.json'), RC_KEY_TEST) }));
// une PR = un dossier target/ ; pièges : du JavaScript qui laisserait une trace s'il était exécuté
const trap = `require('fs').writeFileSync(${JSON.stringify(MARK)}, 'piège exécuté');`;
const pr = (name, extra) => { const T = path.join(W, name, 'target');
  mk(path.join(T, 'src/engine.js'), fs.readFileSync(path.join(ROOT, 'src/engine.js'))); mk(path.join(T, 'README.md'), '# PR de test\n');
  mk(path.join(T, 'tools/check-secrets.js'), trap); mk(path.join(T, 'tools/keys.js'), trap + 'module.exports={norm:s=>s,tryUnseal:()=>null};');
  mk(path.join(T, 'package.json'), JSON.stringify({ scripts: { preinstall: 'node tools/keys.js', postinstall: 'node tools/keys.js', test: 'node tools/keys.js' } }));
  mk(path.join(T, '.github/workflows/piege.yml'), 'on: push\njobs: { x: { runs-on: ubuntu-latest, steps: [ { run: "echo $APP_KEY" } ] } }\n');
  mk(path.join(T, 'node_modules/x/index.js'), trap);
  if (extra) extra(T); return path.join(W, name); };
const KEYS = { APP_KEY: APP_KEY_TEST, RC_KEY: RC_KEY_TEST, GCAL_ICS: ['https://calendar.google.com/calendar/ical/test/', 'private-', '0123456789abcdef0123/basic.ics'].join('') };   // assemblée à l'exécution : le motif générique ne doit pas viser ce fichier de test
const scan = (dir, what = 'target') => { const r = spawnSync(process.execPath, ['trusted/tools/check-secrets.js', '--root', 'trusted', '--scan', what], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, ...KEYS } });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
// le dossier trusted/ est partagé : chaque PR est placée à côté (même disposition que dans le workflow)
const place = d => fs.symlinkSync(TR, path.join(d, 'trusted'), 'dir');
const rows = []; let fail = 0;
const check = (name, ok, detail) => { rows.push(`${ok ? '✅' : '❌'} ${name}${detail ? ' · ' + detail : ''}`); if (!ok) fail++; };
const outside = path.join(W, 'dehors.txt'); mk(outside, 'code : ' + APP_KEY_TEST);
const cases = {
  propre: pr('propre'),
  lieu: pr('lieu', T => mk(path.join(T, 'src/notes.md'), 'Rendez-vous à Maison test demain')),
  canal: pr('canal', T => mk(path.join(T, 'docs/push.txt'), 'ntfy.sh/ci-test-topic-not-real')),
  coordonnee: pr('coordonnee', T => mk(path.join(T, 'data/pt.json'), '{"lat":48.850,"lon":2.350}')),
  cle: pr('cle', T => mk(path.join(T, 'cfg.txt'), 'KEY=' + RC_KEY_TEST)),
  ical: pr('ical', T => mk(path.join(T, 'cal.txt'), KEYS.GCAL_ICS)),
  lien: pr('lien', T => fs.symlinkSync(outside, path.join(T, 'innocent.txt'))),
  nom: pr('nom', T => mk(path.join(T, 'x\n::error::injection.txt'), 'Maison test')),
};
Object.values(cases).forEach(place);
const res = Object.fromEntries(Object.entries(cases).map(([k, d]) => [k, scan(d)]));
check('PR propre : vert', res.propre.code === 0, res.propre.out.trim().split('\n').pop());
const red = ['lieu', 'canal', 'coordonnee', 'cle', 'ical', 'lien', 'nom'];
const miss = red.filter(k => res[k].code !== 1);
check(`donnée privée fictive dans la PR : rouge (${red.join(', ')})`, miss.length === 0, miss.join(', '));
check('lien symbolique refusé sans être suivi', /lien symbolique refusé/.test(res.lien.out) && !/code de déverrouillage/.test(res.lien.out));
check('nom de fichier piégé neutralisé (aucune commande de workflow injectée)', !res.nom.out.split('\n').some(l => l.startsWith('::')));
check('aucun JavaScript de la PR exécuté (pièges intacts)', !fs.existsSync(MARK));
const all = Object.values(res).map(r => r.out).join('\n');
check('aucune valeur sensible affichée', ![APP_KEY_TEST, RC_KEY_TEST, 'Maison test', 'ci-test-topic-not-real', '0123456789abcdef0123', '48.850'].some(v => all.includes(v)));
// titre et description : même scanner, sur pr-meta/ écrit tel quel par le workflow (aucune interpolation dans un script)
const meta = (name, text) => { const d = path.join(W, name); mk(path.join(d, 'pr-meta/titre-et-description.md'), text); place(d); return scan(d, 'pr-meta'); };
const descOk = meta('desc-propre', 'fix(trips): rendez-vous prioritaire\n\nLe cockpit proposait Lieu A → Lieu B à 16:47.\n');
const descLieu = meta('desc-lieu', 'fix(trips): rendez-vous prioritaire\n\nLe cockpit proposait Maison test → Lieu B à 16:47.\n');
const descCoord = meta('desc-coord', 'Point de départ : 48.850, 2.350\n');
check('description propre : vert', descOk.code === 0, descOk.out.trim().split('\n').pop());
check('lieu personnel ou coordonnée dans la description : rouge', descLieu.code === 1 && descCoord.code === 1 && /titre-et-description\.md : lieu personnel/.test(descLieu.out));
check('description : aucune valeur sensible affichée', !['Maison test', '48.850'].some(v => (descLieu.out + descCoord.out).includes(v)));
// workflow : titre/description passés UNIQUEMENT par env, jamais via ${{ }} dans un run (injection de commande)
const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/pr-privacy.yml'), 'utf8');
const steps = wf.split(/\n(?=      - )/), runOf = st => (st.split(/\n        run: ?\|?/)[1] || '');
const metaStep = steps.find(st => /PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/.test(st));
const metaScan = steps.find(st => /--scan pr-meta\b/.test(st));
check('workflow : description rescannée à chaque modification (edited)', /types: \[[^\]]*\bedited\b[^\]]*\]/.test(wf));
check('workflow : titre et description jamais interpolés dans un script', !!metaStep && /PR_TITLE: \$\{\{ github\.event\.pull_request\.title \}\}/.test(metaStep) &&
  !steps.some(st => /github\.event\.pull_request\.(title|body)/.test(runOf(st))) && /"\$PR_TITLE" "\$PR_BODY"/.test(runOf(metaStep)));
check('workflow : aucun secret à l\'étape qui écrit la description', !!metaStep && !/secrets\./.test(metaStep));
check('workflow : description contrôlée par le scanner de main, même si les fichiers sont rouges', !!metaScan && /node trusted\/tools\/check-secrets\.js --root trusted --scan pr-meta/.test(metaScan) &&
  /if: \$\{\{ !cancelled\(\) \}\}/.test(metaScan) && /if: \$\{\{ !cancelled\(\) \}\}/.test(metaStep));
// ---------- audit du lot 1 (24/11/2026) : variantes que l'ancien scanner laissait passer (valeurs FICTIVES) ----------
// Lieu précis fictif (6 décimales), nom accentué et véhicule complet : le préréglage de confiance est scellé avec la clé de test.
const PRECIS = { locs: [{ id: 'home', name: 'Rosières-Témoin-Fictif', lat: 48.813849, lon: 2.138762 }], customs: [],
  cars: [{ id: 'carZ', name: 'Voiture fictive Z 1.6 essence 2015', short: 'Z', spec: '110 ch · 2015 · BVM5 · fictive' }] };
const TR2 = path.join(W, 'trusted2');
['check-secrets.js', 'keys.js'].forEach(f => mk(path.join(TR2, 'tools', f), fs.readFileSync(path.join(ROOT, 'tools', f))));
mk(path.join(TR2, 'encrypted/preset.sealed.json'), JSON.stringify({ v: 'p2', sealed: seal(PRECIS, APP_KEY_TEST) }));
const scan2 = (files, extra = [], env = { APP_KEY: APP_KEY_TEST }) => { const d = path.join(W, 'v-' + Object.keys(files).join('-').replace(/[^a-z0-9]+/gi, '_').slice(0, 60) + '-' + rows.length);
  Object.entries(files).forEach(([f, s]) => mk(path.join(d, 'target', f), s)); fs.symlinkSync(TR2, path.join(d, 'trusted'), 'dir');
  const r = spawnSync(process.execPath, ['trusted/tools/check-secrets.js', '--root', 'trusted', '--scan', 'target', ...extra], { cwd: d, encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const red2 = {
  'coordonnée exacte (6 décimales)': { 'a.json': '{"lat":48.813849}' },
  'coordonnée tronquée à 4 décimales (l’ancien arrondi à 3 la ratait)': { 'a.txt': 'point 48.8138 environ' },
  'coordonnée arrondie à 3 décimales': { 'a.txt': 'vers 2.139 est' },
  'coordonnée tronquée à 3 décimales': { 'a.txt': 'lat 48.813' },
  'coordonnée à la française (virgule)': { 'a.md': 'Latitude 48,8138 environ' },
  'coordonnée dans une URL': { 'a.txt': 'https://example.invalid/?ll=48.81385%2C2.13876' },
  'nom sans accent ni tiret': { 'a.md': 'Départ de Rosieres Temoin Fictif à 7 h' },
  'nom encodé dans une URL': { 'a.txt': 'q=Rosi%C3%A8res-T%C3%A9moin-Fictif' },
  'nom en majuscules avec ponctuation': { 'a.md': 'ROSIÈRES · TÉMOIN · FICTIF' },
  'véhicule : nom complet': { 'b.js': "const v = 'Voiture fictive Z 1.6 essence 2015';" },
  'véhicule : description complète': { 'b.js': "spec: '110 ch · 2015 · BVM5 · fictive'" },
  'code tiers : latitude ET longitude à 3 décimales': { 'src/vendor/lib.min.js': 'a=48.814,b=2.139' },
  'code tiers : une coordonnée à 4 décimales suffit': { 'src/vendor/lib.min.js': 'x=2.1387' },
};
const green2 = {
  'nombre plus long (précédé d’un chiffre)': { 'a.txt': 'v=148.8138 et 12.1387' },
  'coordonnée peu précise (2 décimales)': { 'a.txt': '48.81, 2.13' },
  'code tiers : un seul nombre court à 3 décimales': { 'src/vendor/lib.min.js': 'k=2.139;m=0.5' },
  'modèle seul (jamais un nom court)': { 'a.md': 'Voiture fictive Z' },
  'pourcentage isolé (décodage tolérant)': { 'a.css': '.x{width:100%}\n.y{height:50%;} %ZZ %C3' },
  'mot voisin sans accent (forme repliée comparée mot à mot)': { 'a.md': 'Rosieres Temoin Fictifs et autres' },
};
for (const [name, files] of Object.entries(red2)) { const r = scan2(files); check(`nouvelle variante détectée : ${name}`, r.code === 1, r.out.trim().split('\n')[0]); }
for (const [name, files] of Object.entries(green2)) { const r = scan2(files); check(`sans faux positif : ${name}`, r.code === 0, r.out.trim().split('\n')[0]); }
const wrongKey = scan2({ 'a.txt': 'rien' }, [], { APP_KEY: 'mauvaise-cle-de-test' });
check('clé fournie qui n’ouvre pas son fichier : rouge (jamais un vert sans valeurs privées)', wrongKey.code === 1 && /APP_KEY fournie mais le préréglage chiffré ne s’ouvre pas/.test(wrongKey.out), wrongKey.out.trim());
const fifoDir = path.join(W, 'fifo'); mk(path.join(fifoDir, 'target/a.txt'), 'rien'); fs.symlinkSync(TR2, path.join(fifoDir, 'trusted'), 'dir');
let fifoOk = true; try { require('child_process').execFileSync('mkfifo', [path.join(fifoDir, 'target/tube')]); } catch (e) { fifoOk = false; }
if (fifoOk) { const r = spawnSync(process.execPath, ['trusted/tools/check-secrets.js', '--root', 'trusted', '--scan', 'target'], { cwd: fifoDir, encoding: 'utf8', env: { PATH: process.env.PATH, APP_KEY: APP_KEY_TEST }, timeout: 20000 });
  check('fichier spécial (tube) refusé sans être lu, jamais ignoré', r.status === 1 && /tube : fichier spécial refusé/.test(r.stdout), (r.stdout || '') + (r.error ? r.error.message : '')); }
const masked = scan2({ 'secret-ici.md': 'Rosières-Témoin-Fictif' }, ['--mask']);
check('--mask (journal public de main) : rouge, sans nom de fichier ni valeur', masked.code === 1 && /\(fichier masqué\) : lieu personnel/.test(masked.out) && !/secret-ici|Rosi|48\.81/.test(masked.out), masked.out.trim());
const ok2 = scan2({ 'a.txt': 'rien de privé' });
check('journal : le nombre de valeurs privées n’est plus affiché', ok2.code === 0 && /valeurs privées chargées/.test(ok2.out) && !/\d+ valeurs? privées?/.test(ok2.out), ok2.out.trim());
// fichiers nommés : chemins relatifs à la racine de confiance (comportement historique de build.js)
{ const d = path.join(W, 'opt'); fs.mkdirSync(d, { recursive: true }); mk(path.join(TR2, '--root'), 'Rosières-Témoin-Fictif'); fs.symlinkSync(TR2, path.join(d, 'trusted'), 'dir');
  const run = a => spawnSync(process.execPath, ['trusted/tools/check-secrets.js', '--root', 'trusted', ...a], { cwd: d, encoding: 'utf8', env: { PATH: process.env.PATH, APP_KEY: APP_KEY_TEST } });
  const asFile = run(['--', '--root']), unknown = run(['--inconnue']);
  check('« -- » : un nom de fichier qui commence par « -- » est contrôlé, jamais pris pour une option', asFile.status === 1 && /--root : lieu personnel/.test(asFile.stdout), asFile.stdout);
  check('option inconnue refusée (code 2)', unknown.status === 2, unknown.stdout);
  const gone = run(['--', 'absent.js']);
  check('fichier nommé introuvable : rouge, jamais ignoré en silence', gone.status === 1 && /absent\.js : fichier illisible/.test(gone.stdout), gone.stdout);
  fs.rmSync(path.join(TR2, '--root')); }
// ---------- hook local tools/pre-commit : il contrôle l'INDEX (ce qui part), pas la copie de travail ----------
{ const G = path.join(W, 'hook'), git = (...a) => spawnSync('git', a, { cwd: G, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
  fs.mkdirSync(G, { recursive: true }); git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'test');
  ['check-secrets.js', 'keys.js', 'pre-commit'].forEach(f => mk(path.join(G, 'tools', f), fs.readFileSync(path.join(ROOT, 'tools', f))));
  mk(path.join(G, 'private/preset.json'), JSON.stringify(PRECIS)); mk(path.join(G, '.gitignore'), 'private/\n');
  git('add', 'tools', '.gitignore'); git('commit', '-q', '-m', 'base');
  const hook = () => spawnSync('sh', ['tools/pre-commit'], { cwd: G, encoding: 'utf8', env: { PATH: process.env.PATH } });
  mk(path.join(G, 'notes.md'), 'Départ : Rosières-Témoin-Fictif\n'); git('add', 'notes.md'); mk(path.join(G, 'notes.md'), 'Départ : Lieu A\n');   // copie de travail propre, index pollué
  const staged = hook();
  check('hook : donnée privée dans l’index, copie de travail nettoyée → commit refusé', staged.status === 1 && /notes\.md : lieu personnel/.test(staged.stdout), staged.stdout + staged.stderr);
  git('add', 'notes.md'); const clean = hook();
  check('hook : index propre → commit accepté', clean.status === 0, clean.stdout + clean.stderr);
  mk(path.join(G, '--root'), 'Rosières-Témoin-Fictif'); mk(path.join(G, 'a b.md'), '48.8138'); git('add', '--', '--root', 'a b.md'); const odd = hook();
  check('hook : noms de fichiers piégés (« --root », espace) contrôlés comme des fichiers', odd.status === 1 && /--root : lieu personnel/.test(odd.stdout) && /a b\.md : lieu personnel \(coordonnée\)/.test(odd.stdout), odd.stdout + odd.stderr); }
// ---------- workflow : messages de commit de la PR contrôlés, lus par l'API (toutes les pages) ----------
{ const commitStep = steps.find(st => /pulls\/\$PR_NUMBER\/commits/.test(st));
  check('workflow : messages de commit lus par l’API, 100 par page, toutes les pages, écrits comme données dans pr-meta/', !!commitStep &&
    /gh api --paginate "repos\/\$REPO\/pulls\/\$PR_NUMBER\/commits\?per_page=100"/.test(commitStep) && /> pr-meta\/commits\.txt/.test(commitStep) &&
    !/\$\{\{/.test(runOf(commitStep)) && !/secrets\./.test(commitStep) && /if: \$\{\{ !cancelled\(\) \}\}/.test(commitStep), commitStep && commitStep.slice(0, 300));
  check('workflow : plus de 250 commits → refus (l’API n’en liste pas davantage)', !!commitStep && /-ge 250/.test(runOf(commitStep)) && /exit 1/.test(runOf(commitStep)));
  check('workflow : droit minimal pull-requests: read en plus de contents: read', /permissions:\n  contents: read\n  pull-requests: read\n/.test(wf));
  check('workflow : étape des commits placée avant le contrôle de pr-meta', !!commitStep && wf.indexOf(commitStep) < wf.indexOf(metaScan)); }
fs.rmSync(W, { recursive: true, force: true });
console.log(rows.join('\n') + `\n\n${fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles de confidentialité des PR au vert`}`);
if (fail && process.env.GITHUB_ACTIONS) console.log(`::error title=pr-privacy::${rows.filter(r => r.startsWith('❌')).join(' / ')}`);
process.exit(fail ? 1 : 0);
