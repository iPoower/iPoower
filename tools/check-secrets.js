#!/usr/bin/env node
// Garde-fou de confidentialité : refuse tout fichier qui contient une donnée personnelle ou un secret.
// Les valeurs à rechercher ne sont JAMAIS écrites ici : elles sont lues dans les fichiers privés locaux (private/),
// ou, dans GitHub Actions, déchiffrées depuis encrypted/ avec les secrets APP_KEY / RC_KEY, et passées par variables d'environnement.
// Chaque clé n'ouvre que son fichier : APP_KEY -> préréglage, RC_KEY -> configuration du relais (aucun repli de l'une sur l'autre).
// Une clé fournie qui n'ouvre pas son fichier est une ERREUR (jamais un contrôle « vert » sans les valeurs privées).
//
// Deux racines distinctes :
//   --root <dossier> : racine DE CONFIANCE (défaut : ce dépôt). D'où viennent private/ et encrypted/ servant à dériver les valeurs sensibles.
//   --scan <dossier> : contenu à contrôler, lu UNIQUEMENT comme des octets (ex. la branche d'une pull request, l'index Git du hook).
//                      Rien n'y est exécuté : pas de git, pas de node, aucun lien symbolique suivi. Un fichier illisible est refusé.
//   --mask           : journal public (main) : ni nom de fichier ni valeur, seulement le type et le nombre de problèmes.
//   --               : tout ce qui suit est un nom de fichier, jamais une option.
// Sans --scan : fichiers passés en argument, sinon fichiers suivis par Git dans --root (comportement historique).
// Sortie : nom de fichier (sauf --mask) + type de donnée uniquement, jamais la valeur trouvée.
//
// Recherche (24/11/2026, audit du lot 1) :
//  - coordonnées : valeur exacte, arrondie ET tronquée à 3, 4, 5 et 6 décimales, avec point ou virgule, jamais précédée d'un chiffre.
//    À 4 décimales ou plus (≈ 10 m) : alerte partout. À 3 décimales (≈ 100 m) : alerte partout sauf dans le code tiers (vendor/),
//    où il faut la latitude ET la longitude du même lieu (un nombre court peut apparaître par hasard dans du code minifié).
//  - noms : texte brut, texte aux séquences %XX valides décodées, et texte replié (sans accents, ponctuation et espaces réduits).
//  - véhicules : nom et description complets (≥ 16 caractères, jamais un simple modèle).
'use strict';
const fs = require('fs'), path = require('path'), { execSync } = require('child_process'), { norm, tryUnseal } = require('./keys');
const all = process.argv.slice(2), dash = all.indexOf('--'), argv = dash < 0 ? all : all.slice(0, dash), rest = dash < 0 ? [] : all.slice(dash + 1);
const opt = k => { const i = argv.indexOf(k); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flagOpt = k => { const i = argv.indexOf(k); if (i < 0) return false; argv.splice(i, 1); return true; };
const root = path.resolve(opt('--root') || path.join(__dirname, '..')), scanRoot = opt('--scan'), mask = flagOpt('--mask'), priv = p => path.join(root, 'private', p);
if (argv.some(a => a.startsWith('--'))) { console.log('❌ option inconnue : utiliser « -- » avant un nom de fichier qui commence par « -- »'); process.exit(2); }
const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
const sealedIn = f => { try { return JSON.parse(read(path.join(root, 'encrypted', f))).sealed; } catch (e) { return null; } };
const appKey = norm(read(priv('.passphrase')) || process.env.APP_KEY || ''), rcKey = norm(read(priv('.rc_key')) || process.env.RC_KEY || '');
let preset = JSON.parse(read(priv('preset.json')) || 'null'), relay = JSON.parse(read(priv('relay-config.json')) || 'null');
if (!preset && appKey) preset = tryUnseal(sealedIn('preset.sealed.json'), appKey);
if (!relay && rcKey) relay = tryUnseal(sealedIn('relay-config.sealed.json'), rcKey);
// fail closed : une clé présente qui n'ouvre pas son fichier laisserait le contrôle sans aucune valeur privée.
const keyErrors = [];
if (appKey && !preset) keyErrors.push('APP_KEY fournie mais le préréglage chiffré ne s’ouvre pas : contrôle impossible');
if (rcKey && !relay) keyErrors.push('RC_KEY fournie mais la configuration du relais ne s’ouvre pas : contrôle impossible');
if (!preset && !relay && !appKey && !rcKey) { console.log('⚠️  Aucune clé ni fichier privé : seuls les motifs génériques sont contrôlés.'); }

// ---------- valeurs sensibles ----------
const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const T = new Map(), N = new Map(), add = (v, why) => { v = String(v == null ? '' : v).trim(); if (v.length >= 4) T.set(v.toLowerCase(), why); };
// nom : forme exacte + forme repliée (« Rosières-aux-Salines » = « rosieres aux salines »), comparée mot à mot
const addName = (v, why, min = 4) => { v = String(v == null ? '' : v).trim(); if (v.length < min) return; add(v, why); const f = fold(v); if (f.length >= min) N.set(f, why); };
if (appKey) add(appKey, 'code de déverrouillage');
if (rcKey) add(rcKey, 'clé du relais');
if (process.env.GCAL_ICS) add(process.env.GCAL_ICS.trim(), 'adresse iCal');
// coordonnées : chaque lieu donne ses variantes, avec leur précision
const CV = new Map();   // variante normalisée (point) -> [{ why, place, axis, p }]
let placeN = 0;
function coordVariants(v) {
  const out = new Map(), s = String(v), m = /^(-?\d+)\.(\d+)$/.exec(s);
  const put = (txt, p) => { if (!out.has(txt) || out.get(txt) < p) out.set(txt, p); };
  if (!m) { put(v.toFixed(3), 3); return out; }   // entier ou notation exponentielle : forme historique seule
  const [, int, dec] = m;
  if (dec.length < 3) put(v.toFixed(3), 3);       // coordonnée peu précise : forme historique (ex. 48.850)
  for (let p = 3; p <= Math.min(dec.length, 6); p++) { put(int + '.' + dec.slice(0, p), p); put(v.toFixed(p), p); }
  return out;
}
const place = (l, why) => {
  if (!l) return; const id = placeN++;
  addName(l.name, why); addName(String(l.name || '').split(/\s*\/\s*/)[0], why); if (l.label && l.label !== 'Domicile') addName(l.label, why);
  ['lat', 'lon'].forEach(axis => { if (typeof l[axis] !== 'number' || !Number.isFinite(l[axis])) return;
    for (const [txt, p] of coordVariants(l[axis])) { if (!CV.has(txt)) CV.set(txt, []); CV.get(txt).push({ why: why + ' (coordonnée)', place: id, axis, p }); } });
};
const car = (c, why) => { if (!c) return; addName(c.name, why, 16); addName(c.spec, why, 16); };
if (preset) { (preset.locs || []).forEach(l => place(l, 'lieu personnel')); (preset.customs || []).forEach(l => place(l, 'lieu personnel'));
  (preset.cars || []).forEach(c => { if (c.photo) add(c.photo.slice(30, 90), 'photo de la voiture'); car(c, 'véhicule personnel'); }); if (preset.ntfy) add(preset.ntfy, 'canal de notification'); }
if (relay) { add(relay.ntfy, 'canal de notification'); ['home', 'work'].forEach(k => place(relay[k], 'lieu personnel')); (relay.origins || []).forEach(o => place(o, 'lieu personnel'));
  (relay.cars || []).forEach(c => car(c, 'véhicule personnel')); }
// motifs génériques
const P = [[/calendar\.google\.com\/calendar\/ical\/[^\s'"]*private-[0-9a-f]{20,}/i, 'adresse iCal privée'], [/#cfg=[A-Za-z0-9_-]{40,}/, 'lien de configuration'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clé privée'], [/gh[pousr]_[A-Za-z0-9]{30,}/, 'jeton GitHub'], [/window\.TWRC_PRESET\s*=\s*\{/, 'préréglage en clair']];
// %XX : seules les séquences valides sont décodées (un « 100% » isolé ne casse rien)
const decode = s => s.replace(/(?:%[0-9a-f]{2})+/gi, m => { try { return decodeURIComponent(m); } catch (e) { return m; } });
// nombres du texte (jamais précédés d'un chiffre), virgule ramenée au point ; chaque nombre est comparé à ses préfixes de 3 à 6 décimales
const NUM = /(?<![0-9])-?\d{1,3}[.,]\d{3,}/g;
const coords = s => { const out = []; if (!CV.size) return out;
  for (const t of s.match(NUM) || []) { const [int, dec] = t.replace(',', '.').split('.');
    for (let p = 3; p <= Math.min(dec.length, 6); p++) { const e = CV.get(int + '.' + dec.slice(0, p)); if (e) out.push(...e); } }
  return out; };
const vendor = f => /(^|\/)vendor\//.test(String(f).replace(/\\/g, '/'));

// ---------- liste des fichiers ----------
let base = root, files;
const explicit = !scanRoot && (argv.length > 0 || rest.length > 0);   // fichiers nommés : chemins relatifs à --root
if (scanRoot) {   // contenu non fiable : parcours du dossier, sans git, sans suivre aucun lien
  base = path.resolve(scanRoot); files = [];
  const walk = rel => { for (const d of fs.readdirSync(path.join(base, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + d.name : d.name;
    if (d.isDirectory()) { if (d.name !== '.git') walk(r); } else if (d.isFile()) files.push(r); else if (d.isSymbolicLink()) files.push({ link: r }); else files.push({ odd: r }); } };
  walk('');
} else files = explicit ? [...argv, ...rest] : execSync('git ls-files -co --exclude-standard', { cwd: root }).toString().split('\n').filter(Boolean);
const shown = f => mask ? '(fichier masqué)' : String(f).replace(/[\x00-\x1f\x7f]/g, '?');   // un nom de fichier ne peut ni casser une ligne ni injecter une commande de workflow
let bad = 0;
const flag = (f, why) => { bad++; console.log(`❌ ${shown(f)} : ${why}`); };
keyErrors.forEach(e => flag('configuration du contrôle', e));
for (const f of files) {
  if (typeof f === 'object') { f.link ? flag(f.link, 'lien symbolique refusé (non suivi)') : flag(f.odd, 'fichier spécial refusé'); continue; }
  const full = path.join(base, f); let txt;
  try { if (scanRoot && !fs.lstatSync(full).isFile()) { flag(f, 'fichier spécial refusé'); continue; } txt = fs.readFileSync(full); }
  catch (e) { if (scanRoot || explicit) flag(f, 'fichier illisible : contrôle impossible'); continue; }   // contenu non fiable ou fichier demandé : jamais ignoré en silence
  if (txt.length > 5e6) { if (scanRoot) flag(f, 'fichier trop volumineux pour être contrôlé'); continue; }
  const s = txt.toString('utf8'), low = s.toLowerCase(), dlow = decode(s).toLowerCase(), folded = ' ' + fold(decode(s)) + ' ';
  const why = new Set();
  for (const [v, w] of T) if (low.includes(v) || dlow.includes(v)) why.add(w);
  for (const [v, w] of N) if (folded.includes(' ' + v + ' ')) why.add(w);
  for (const [re, w] of P) if (re.test(s)) why.add(w);
  // coordonnées : précision ≥ 4 partout ; précision 3 isolée hors vendor/, en paire (lat + lon du même lieu) dans vendor/
  const hits = coords(s).concat(dlow !== low ? coords(dlow) : []);
  for (const c of hits) {
    if (c.p >= 4 || !vendor(f)) { why.add(c.why); continue; }
    if (hits.some(o => o.place === c.place && o.axis !== c.axis)) why.add(c.why);
  }
  why.forEach(w => flag(f, w));
}
const values = T.size + N.size + CV.size;
console.log(bad ? `\n${bad} problème(s) : rien ne doit partir tant que ce n'est pas corrigé.` : `✅ ${files.length} fichiers contrôlés (${values ? 'valeurs privées chargées' : '0 valeur privée'} + ${P.length} motifs) : aucune donnée personnelle.`);
if (process.env.GITHUB_ACTIONS && scanRoot) {
  const title = 'Confidentialité de la PR · ' + (path.basename(path.resolve(scanRoot)) === 'pr-meta' ? 'titre, description et commits' : 'fichiers');
  console.log(bad ? `::error title=${title}::${bad} donnée(s) personnelle(s) ou secret(s) détecté(s)` : `::notice title=${title}::✅ aucune donnée personnelle détectée`);
}
process.exit(bad ? 1 : 0);
