#!/usr/bin/env node
// Garde-fou de confidentialité : refuse tout fichier qui contient une donnée personnelle ou un secret.
// Les valeurs à rechercher ne sont JAMAIS écrites ici : elles sont lues dans les fichiers privés locaux (private/),
// ou, dans GitHub Actions, déchiffrées depuis encrypted/ avec les secrets APP_KEY / RC_KEY, et passées par variables d'environnement.
// Chaque clé n'ouvre que son fichier : APP_KEY -> préréglage, RC_KEY -> configuration du relais (aucun repli de l'une sur l'autre).
//
// Deux racines distinctes :
//   --root <dossier> : racine DE CONFIANCE (défaut : ce dépôt). D'où viennent private/ et encrypted/ servant à dériver les valeurs sensibles.
//   --scan <dossier> : contenu à contrôler, lu UNIQUEMENT comme des octets (ex. la branche d'une pull request).
//                      Rien n'y est exécuté : pas de git, pas de node, aucun lien symbolique suivi.
// Sans --scan : fichiers passés en argument, sinon fichiers suivis par Git dans --root (comportement historique).
// Sortie : nom de fichier + type de donnée uniquement, jamais la valeur trouvée.
'use strict';
const fs = require('fs'), path = require('path'), { execSync } = require('child_process'), { norm, tryUnseal } = require('./keys');
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const root = path.resolve(opt('--root') || path.join(__dirname, '..')), scanRoot = opt('--scan'), priv = p => path.join(root, 'private', p);
const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
const sealedIn = f => { try { return JSON.parse(read(path.join(root, 'encrypted', f))).sealed; } catch (e) { return null; } };
const appKey = norm(read(priv('.passphrase')) || process.env.APP_KEY || ''), rcKey = norm(read(priv('.rc_key')) || process.env.RC_KEY || '');
let preset = JSON.parse(read(priv('preset.json')) || 'null'), relay = JSON.parse(read(priv('relay-config.json')) || 'null');
if (!preset && appKey) preset = tryUnseal(sealedIn('preset.sealed.json'), appKey);
if (!relay && rcKey) relay = tryUnseal(sealedIn('relay-config.sealed.json'), rcKey);
if (!preset && !relay && !appKey && !rcKey) { console.log('⚠️  Aucune clé ni fichier privé : seuls les motifs génériques sont contrôlés.'); }
// valeurs sensibles
const T = new Map(), add = (v, why) => { v = String(v == null ? '' : v).trim(); if (v.length >= 4) T.set(v.toLowerCase(), why); };
if (appKey) add(appKey, 'code de déverrouillage');
if (rcKey) add(rcKey, 'clé du relais');
if (process.env.GCAL_ICS) add(process.env.GCAL_ICS.trim(), 'adresse iCal');
// nom complet + commune principale (la grande ville citée en second, ex. « X / Grande-Ville », n'est pas personnelle)
const place = (l, why) => { if (!l) return; add(l.name, why); add(String(l.name || '').split(/\s*\/\s*/)[0], why); if (l.label && l.label !== 'Domicile') add(l.label, why); if (l.address) add(l.address, why + ' (adresse)');
  ['lat', 'lon'].forEach(k => { if (typeof l[k] === 'number') add(l[k].toFixed(3), why + ' (coordonnée)'); }); };
if (preset) { (preset.locs || []).forEach(l => place(l, 'lieu personnel')); (preset.customs || []).forEach(l => place(l, 'lieu personnel'));
  (preset.cars || []).forEach(c => { if (c.photo) add(c.photo.slice(30, 90), 'photo de la voiture'); }); if (preset.ntfy) add(preset.ntfy, 'canal de notification'); }
if (relay) { add(relay.ntfy, 'canal de notification'); ['home', 'work'].forEach(k => place(relay[k], 'lieu personnel')); (relay.origins || []).forEach(o => place(o, 'lieu personnel')); }
// motifs génériques
const P = [[/calendar\.google\.com\/calendar\/ical\/[^\s'"]*private-[0-9a-f]{20,}/i, 'adresse iCal privée'], [/#cfg=[A-Za-z0-9_-]{40,}/, 'lien de configuration'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clé privée'], [/gh[pousr]_[A-Za-z0-9]{30,}/, 'jeton GitHub'], [/window\.TWRC_PRESET\s*=\s*\{/, 'préréglage en clair']];
// liste des fichiers
let base = root, files;
if (scanRoot) {   // contenu non fiable : parcours du dossier, sans git, sans suivre aucun lien
  base = path.resolve(scanRoot); files = [];
  const walk = rel => { for (const d of fs.readdirSync(path.join(base, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + d.name : d.name;
    if (d.isDirectory()) { if (d.name !== '.git') walk(r); } else if (d.isFile()) files.push(r); else if (d.isSymbolicLink()) files.push({ link: r }); } };
  walk('');
} else files = argv.length ? argv : execSync('git ls-files -co --exclude-standard', { cwd: root }).toString().split('\n').filter(Boolean);
const shown = f => String(f).replace(/[\x00-\x1f\x7f]/g, '?');   // un nom de fichier ne peut ni casser une ligne ni injecter une commande de workflow
let bad = 0;
const flag = (f, why) => { bad++; console.log(`❌ ${shown(f)} : ${why}`); };
for (const f of files) {
  if (typeof f === 'object') { flag(f.link, 'lien symbolique refusé (non suivi)'); continue; }
  const full = path.join(base, f); let txt;
  try { if (scanRoot && !fs.lstatSync(full).isFile()) continue; txt = fs.readFileSync(full); } catch (e) { continue; }
  if (txt.length > 5e6) { if (scanRoot) flag(f, 'fichier trop volumineux pour être contrôlé'); continue; }
  const s = txt.toString('utf8'), low = s.toLowerCase();
  for (const [v, why] of T) if (low.includes(v)) flag(f, why);
  for (const [re, why] of P) if (re.test(s)) flag(f, why);
}
console.log(bad ? `\n${bad} problème(s) : rien ne doit partir tant que ce n'est pas corrigé.` : `✅ ${files.length} fichiers contrôlés (${T.size} valeurs privées + ${P.length} motifs) : aucune donnée personnelle.`);
if (process.env.GITHUB_ACTIONS && scanRoot) console.log(bad ? `::error title=Confidentialité de la PR::${bad} donnée(s) personnelle(s) ou secret(s) détecté(s)` : '::notice title=Confidentialité de la PR::✅ aucune donnée personnelle détectée');
process.exit(bad ? 1 : 0);
