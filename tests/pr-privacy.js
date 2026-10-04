#!/usr/bin/env node
// Contrôle de confidentialité des pull requests : test 100 % fictif (aucun secret, aucune donnée réelle).
// Reproduit la disposition du workflow pr-privacy.yml : trusted/ (scanner + chiffrés de confiance) et target/ (la PR, simples fichiers).
// Vérifie : donnée privée fictive -> rouge ; PR propre -> vert ; aucun JavaScript de target/ exécuté (pièges) ; aucune valeur affichée ;
// liens symboliques refusés sans être suivis ; noms de fichiers piégés neutralisés.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), W = path.join(ROOT, '.ci-privacy'), MARK = path.join(W, 'EXECUTE');
const { seal } = require('../tools/keys');
const { APP_KEY_TEST, RC_KEY_TEST } = require('./lib/test-keys');
fs.rmSync(W, { recursive: true, force: true });
const mk = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const fx = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures', f), 'utf8'));
// Adresses volontairement distinctes des noms et coordonnées déjà couverts : elles seules
// doivent suffire à rendre une PR rouge, qu'elles viennent de l'app ou du relais.
const ADDRESS_APP_TEST = ['987 avenue des contretests', 'Cité fictive QZ42'].join(', ');
const ADDRESS_RELAY_TEST = ['654 impasse des essais', 'Ville fictive YX73'].join(', ');
const fakePreset = fx('preset.fake.json'), fakeRelay = fx('relay-config.fake.json');
fakePreset.locs.find(location => location.id === fakePreset.work.to).address = ADDRESS_APP_TEST;
fakeRelay.work.address = ADDRESS_RELAY_TEST;
// trusted/ : le scanner de main + les réglages chiffrés de confiance (fictifs)
const TR = path.join(W, 'trusted');
['check-secrets.js', 'keys.js'].forEach(f => mk(path.join(TR, 'tools', f), fs.readFileSync(path.join(ROOT, 'tools', f))));
mk(path.join(TR, 'encrypted/preset.sealed.json'), JSON.stringify({ v: 'p', sealed: seal(fakePreset, APP_KEY_TEST) }));
mk(path.join(TR, 'encrypted/relay-config.sealed.json'), JSON.stringify({ v: 'r', sealed: seal(fakeRelay, RC_KEY_TEST) }));
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
const scan = dir => { const r = spawnSync(process.execPath, ['trusted/tools/check-secrets.js', '--root', 'trusted', '--scan', 'target'], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, ...KEYS } });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
// le dossier trusted/ est partagé : chaque PR est placée à côté (même disposition que dans le workflow)
const place = d => fs.symlinkSync(TR, path.join(d, 'trusted'), 'dir');
const rows = []; let fail = 0;
const check = (name, ok, detail) => { rows.push(`${ok ? '✅' : '❌'} ${name}${detail ? ' · ' + detail : ''}`); if (!ok) fail++; };
const outside = path.join(W, 'dehors.txt'); mk(outside, 'code : ' + APP_KEY_TEST);
const cases = {
  propre: pr('propre'),
  lieu: pr('lieu', T => mk(path.join(T, 'src/notes.md'), 'Rendez-vous à Maison test demain')),
  adresseApp: pr('adresseApp', T => mk(path.join(T, 'docs/address.txt'), ADDRESS_APP_TEST)),
  adresseRelais: pr('adresseRelais', T => mk(path.join(T, 'docs/address.txt'), ADDRESS_RELAY_TEST)),
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
const red = ['lieu', 'adresseApp', 'adresseRelais', 'canal', 'coordonnee', 'cle', 'ical', 'lien', 'nom'];
const miss = red.filter(k => res[k].code !== 1);
check(`donnée privée fictive dans la PR : rouge (${red.join(', ')})`, miss.length === 0, miss.join(', '));
check('adresse seule issue du préréglage ou du relais : rouge, sans révéler sa valeur',
  [res.adresseApp, res.adresseRelais].every(result => result.code === 1 && /lieu personnel \(adresse\)/.test(result.out)
    && !result.out.includes(ADDRESS_APP_TEST) && !result.out.includes(ADDRESS_RELAY_TEST)));
check('lien symbolique refusé sans être suivi', /lien symbolique refusé/.test(res.lien.out) && !/code de déverrouillage/.test(res.lien.out));
check('nom de fichier piégé neutralisé (aucune commande de workflow injectée)', !res.nom.out.split('\n').some(l => l.startsWith('::')));
check('aucun JavaScript de la PR exécuté (pièges intacts)', !fs.existsSync(MARK));
const all = Object.values(res).map(r => r.out).join('\n');
check('aucune valeur sensible affichée', ![APP_KEY_TEST, RC_KEY_TEST, ADDRESS_APP_TEST, ADDRESS_RELAY_TEST, 'Maison test', 'ci-test-topic-not-real', '0123456789abcdef0123', '48.850'].some(v => all.includes(v)));
fs.rmSync(W, { recursive: true, force: true });
console.log(rows.join('\n') + `\n\n${fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles de confidentialité des PR au vert`}`);
if (fail && process.env.GITHUB_ACTIONS) console.log(`::error title=pr-privacy::${rows.filter(r => r.startsWith('❌')).join(' / ')}`);
process.exit(fail ? 1 : 0);
