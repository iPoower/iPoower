#!/usr/bin/env node
// Garde-fou de confidentialité : refuse tout fichier suivi par Git qui contient une donnée personnelle ou un secret.
// Les valeurs à rechercher ne sont JAMAIS écrites ici : elles sont lues dans les fichiers privés locaux (private/),
// ou, dans GitHub Actions, déchiffrées depuis encrypted/ avec les secrets APP_KEY / RC_KEY, et passées par variables d'environnement.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execSync } = require('child_process');
const root = path.resolve(__dirname, '..'), priv = p => path.join(root, 'private', p);
const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
const norm = s => String(s || '').trim().replace(/^["'«\s]+|["'»\s]+$/g, '').toLowerCase();
function unseal(S, pass) {
  const key = crypto.pbkdf2Sync(pass, Buffer.from(S.s, 'base64'), S.it, 32, 'sha256'), b = Buffer.from(S.c, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(S.i, 'base64')); d.setAuthTag(b.subarray(b.length - 16));
  return JSON.parse(Buffer.concat([d.update(b.subarray(0, b.length - 16)), d.final()]).toString('utf8'));
}
const appKey = norm(read(priv('.passphrase')) || process.env.APP_KEY || process.env.RC_KEY || ''), rcKey = norm(process.env.RC_KEY || '') || appKey;
let preset = JSON.parse(read(priv('preset.json')) || 'null'), relay = JSON.parse(read(priv('relay-config.json')) || 'null');
try { if (!preset && appKey) preset = unseal(JSON.parse(read(path.join(root, 'encrypted/preset.sealed.json'))).sealed, appKey); } catch (e) { /* clé absente ou différente */ }
try { if (!relay && rcKey) relay = unseal(JSON.parse(read(path.join(root, 'encrypted/relay-config.sealed.json'))).sealed, rcKey); } catch (e) { /* idem */ }
if (!preset && !relay && !appKey) { console.log('⚠️  Aucune clé ni fichier privé : seuls les motifs génériques sont contrôlés.'); }
// valeurs sensibles
const T = new Map(), add = (v, why) => { v = String(v == null ? '' : v).trim(); if (v.length >= 4) T.set(v.toLowerCase(), why); };
if (appKey) add(appKey, 'code de déverrouillage');
if (process.env.RC_KEY) add(norm(process.env.RC_KEY), 'clé du relais');
if (process.env.GCAL_ICS) add(process.env.GCAL_ICS.trim(), 'adresse iCal');
// nom complet + commune principale (la grande ville citée en second, ex. « X / Grande-Ville », n'est pas personnelle)
const place = (l, why) => { if (!l) return; add(l.name, why); add(String(l.name || '').split(/\s*\/\s*/)[0], why); if (l.label && l.label !== 'Domicile') add(l.label, why);
  ['lat', 'lon'].forEach(k => { if (typeof l[k] === 'number') add(l[k].toFixed(3), why + ' (coordonnée)'); }); };
if (preset) { (preset.locs || []).forEach(l => place(l, 'lieu personnel')); (preset.customs || []).forEach(l => place(l, 'lieu personnel'));
  (preset.cars || []).forEach(c => { if (c.photo) add(c.photo.slice(30, 90), 'photo de la voiture'); }); if (preset.ntfy) add(preset.ntfy, 'canal de notification'); }
if (relay) { add(relay.ntfy, 'canal de notification'); ['home', 'work'].forEach(k => place(relay[k], 'lieu personnel')); (relay.origins || []).forEach(o => place(o, 'lieu personnel')); }
// motifs génériques
const P = [[/calendar\.google\.com\/calendar\/ical\/[^\s'"]*private-[0-9a-f]{20,}/i, 'adresse iCal privée'], [/#cfg=[A-Za-z0-9_-]{40,}/, 'lien de configuration'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clé privée'], [/gh[pousr]_[A-Za-z0-9]{30,}/, 'jeton GitHub'], [/window\.TWRC_PRESET\s*=\s*\{/, 'préréglage en clair']];
const files = process.argv.length > 2 ? process.argv.slice(2) : execSync('git ls-files -co --exclude-standard', { cwd: root }).toString().split('\n').filter(Boolean);
let bad = 0;
for (const f of files) {
  const full = path.join(root, f); let txt; try { txt = fs.readFileSync(full); } catch (e) { continue; }
  if (txt.length > 5e6) continue; const s = txt.toString('utf8'), low = s.toLowerCase();
  for (const [v, why] of T) if (low.includes(v)) { bad++; console.log(`❌ ${f} : ${why}`); }
  for (const [re, why] of P) if (re.test(s)) { bad++; console.log(`❌ ${f} : ${why}`); }
}
console.log(bad ? `\n${bad} problème(s) : rien ne doit partir tant que ce n'est pas corrigé.` : `✅ ${files.length} fichiers contrôlés (${T.size} valeurs privées + ${P.length} motifs) : aucune donnée personnelle.`);
process.exit(bad ? 1 : 0);
