#!/usr/bin/env node
// Copie le build (dist/) vers la branche de production gh-pages (dossier race-control/).
// Ne touche JAMAIS aux fichiers écrits par le relais (obs.json, calendar.sealed.json).
// La base pneus n'est remplacée que si celle du build est plus récente (la tâche mensuelle peut l'avoir mise à jour).
// Usage : node tools/deploy-copy.js <dist> <dossier race-control de gh-pages>
'use strict';
const fs = require('fs'), path = require('path');
const [src, dst] = process.argv.slice(2);
if (!src || !dst || !fs.existsSync(path.join(src, 'index.html')) || !fs.existsSync(dst)) { console.error('usage : deploy-copy.js <dist> <gh-pages/race-control>'); process.exit(2); }
const SITE = ['index.html', 'engine.js', 'relay.js', 'sw.js', 'widget.js', 'manifest.webmanifest', 'relay-config.sealed.json', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
const RELAY_OWNED = ['obs.json', 'calendar.sealed.json'];
const same = (a, b) => fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b));
const changed = [];
for (const f of SITE) { const a = path.join(src, f), b = path.join(dst, f); if (!fs.existsSync(a)) { console.error('manquant dans le build : ' + f); process.exit(1); } if (!same(a, b)) { fs.copyFileSync(a, b); changed.push(f); } }
const ver = f => { try { return +JSON.parse(fs.readFileSync(f, 'utf8')).version || 0; } catch (e) { return -1; } };
const ta = path.join(src, 'tiredb.json'), tb = path.join(dst, 'tiredb.json');
if (ver(ta) > ver(tb) || (ver(ta) === ver(tb) && !same(ta, tb) && ver(tb) < 0)) { fs.copyFileSync(ta, tb); changed.push('tiredb.json'); }
else if (!same(ta, tb)) console.log(`tiredb.json : version en production (${ver(tb)}) ≥ build (${ver(ta)}) → conservée`);
// version.json : n° de mise en production, date et commit (affichés dans Réglages → Version), seulement s'il y a quelque chose à publier
if (changed.length && process.env.DEPLOY_RUN && process.env.DEPLOY_SHA) { fs.writeFileSync(path.join(dst, 'version.json'), JSON.stringify({ run: +process.env.DEPLOY_RUN, sha: process.env.DEPLOY_SHA, at: new Date().toISOString() })); changed.push('version.json'); }
for (const f of fs.readdirSync(src)) if (RELAY_OWNED.includes(f)) { console.error('Le build ne doit pas contenir ' + f); process.exit(1); }
console.log(changed.length ? 'Fichiers publiés : ' + changed.join(', ') : 'Aucun changement à publier');
