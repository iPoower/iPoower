#!/usr/bin/env node
// Prépare deux configurations chiffrées cohérentes ; ne publie rien et ne modifie jamais la source.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { norm, seal, tryUnseal } = require('./keys');
const FILES = ['preset.sealed.json', 'relay-config.sealed.json'];
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(message); };
const hash = value => crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 10);
const validPoint = point => isObject(point) && Number.isFinite(point.lat) && Number.isFinite(point.lon) && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
function validEnvelope(envelope) {
  const sealed = envelope && envelope.sealed;
  const base64 = (value, size) => typeof value === 'string' && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) && Buffer.from(value, 'base64').length === size;
  return isObject(envelope) && typeof envelope.v === 'string' && envelope.v.length > 0 && isObject(sealed) && sealed.v === 1 && sealed.kdf === 'PBKDF2-SHA256'
    && Number.isInteger(sealed.it) && sealed.it > 0 && sealed.it <= 2000000 && base64(sealed.s, 16) && base64(sealed.i, 12)
    && typeof sealed.c === 'string' && sealed.c.length <= 1400000 && base64(sealed.c, Buffer.from(sealed.c, 'base64').length) && Buffer.from(sealed.c, 'base64').length >= 16;
}
function validatePatch(patch) {
  if (!isObject(patch) || Object.keys(patch).some(key => !['name', 'address', 'sub', 'lat', 'lon'].includes(key))) fail('Modification de lieu invalide.');
  const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 320 && !/[\u0000-\u001f\u007f]/.test(value);
  if (!text(patch.name) || !validPoint(patch)) fail('Modification de lieu invalide.');
  if (patch.address !== undefined && !text(patch.address) || patch.sub !== undefined && !text(patch.sub)) fail('Modification de lieu invalide.');
  const address = patch.address === undefined ? patch.sub : patch.address;
  if (!text(address) || patch.sub !== undefined && patch.address !== undefined && patch.sub.trim() !== patch.address.trim()) fail('Modification de lieu invalide.');
  return { name: patch.name.trim(), address: address.trim(), sub: address.trim(), lat: patch.lat, lon: patch.lon };
}
function prepareWorkUpdate(presetEnvelope, relayEnvelope, patch, suppliedKeys) {
  const update = validatePatch(patch), appKey = norm(suppliedKeys && suppliedKeys.APP_KEY), relayKey = norm(suppliedKeys && suppliedKeys.RC_KEY);
  if (!appKey || relayKey.length < 16 || appKey === relayKey) fail('Deux clés distinctes et valides sont nécessaires.');
  if (![presetEnvelope, relayEnvelope].every(validEnvelope)) fail('Configurations chiffrées invalides.');
  const preset = tryUnseal(presetEnvelope.sealed, appKey), relay = tryUnseal(relayEnvelope.sealed, relayKey);
  if (!preset || !relay || tryUnseal(presetEnvelope.sealed, relayKey) || tryUnseal(relayEnvelope.sealed, appKey)) fail('Déchiffrement ou séparation des clés refusé.');
  if (!isObject(preset) || !isObject(preset.work) || typeof preset.work.to !== 'string' || !preset.work.to || !Array.isArray(preset.locs) || !isObject(relay) || !validPoint(relay.work)) fail('Destination de travail incohérente.');
  const targetId = preset.work.to, locations = [...preset.locs, ...(Array.isArray(preset.customs) ? preset.customs : [])];
  // Le domicile ne peut jamais être corrigé par cet outil, même si work.to est mal configuré.
  // Deux lieux distincts peuvent néanmoins partager une adresse : leur identifiant fait foi.
  if (targetId === 'home' || preset.locs[0] && targetId === preset.locs[0].id) fail('Destination de travail incohérente.');
  const targets = locations.filter(location => isObject(location) && location.id === targetId);
  if (targets.length !== 1 || !validPoint(targets[0])) fail('Destination de travail incohérente.');
  const target = targets[0];
  if (relay.work.id != null ? relay.work.id !== targetId : relay.work.lat !== target.lat || relay.work.lon !== target.lon) fail('Destination de travail incohérente.');
  if (preset.locRevisions != null && !isObject(preset.locRevisions)) fail('Révisions de lieux invalides.');
  Object.assign(target, update);
  Object.assign(relay.work, update);
  // Révision opaque, conservée uniquement dans le préréglage chiffré. Elle permet à l'app de
  // remplacer une seule fois les anciennes modifications locales de CE lieu, sans toucher les autres.
  preset.locRevisions = { ...(preset.locRevisions || {}), [targetId]: crypto.randomBytes(16).toString('hex') };
  return {
    [FILES[0]]: { v: hash(preset), sealed: seal(preset, appKey) },
    [FILES[1]]: { v: hash(relay), sealed: seal(relay, relayKey) }
  };
}
function canonicalPath(filename) {
  const resolved = path.resolve(filename);
  let ancestor = resolved;
  while (!fs.existsSync(ancestor)) { const parent = path.dirname(ancestor); if (parent === ancestor) break; ancestor = parent; }
  return path.join(fs.realpathSync(ancestor), path.relative(ancestor, resolved));
}
const contains = (parent, child) => { const relative = path.relative(parent, child); return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
function writePrepared(prepared, encryptedDirectory, outputDirectory) {
  const source = canonicalPath(encryptedDirectory), output = canonicalPath(outputDirectory);
  if (contains(source, output) || contains(output, source) || fs.existsSync(output)) fail('La sortie doit être un nouveau dossier séparé de la source.');
  let staging = null;
  try {
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
    staging = fs.mkdtempSync(path.join(path.dirname(output), '.' + path.basename(output) + '-'));
    fs.chmodSync(staging, 0o700);
    for (const filename of FILES) {
      const descriptor = fs.openSync(path.join(staging, filename), 'wx', 0o600);
      try { fs.writeFileSync(descriptor, JSON.stringify(prepared[filename])); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    }
    // Une seule opération rend les DEUX fichiers visibles dans le dossier final.
    // La sortie existante est refusée : aucun remplacement partiel des fichiers de production.
    if (fs.existsSync(output)) fail('La sortie doit être un nouveau dossier séparé de la source.');
    fs.renameSync(staging, output); staging = null;
  } catch (error) { fail('Écriture de la préparation refusée.'); }
  finally { if (staging) fs.rmSync(staging, { recursive: true, force: true }); }
}
function readJson(filename) {
  try { if (fs.statSync(filename).size > 1024 * 1024) fail(''); return JSON.parse(fs.readFileSync(filename, 'utf8')); }
  catch (error) { fail('Fichier de préparation invalide ou inaccessible.'); }
}
function argumentsFor(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { help: true };
  const options = { encrypted: path.resolve(__dirname, '..', 'encrypted'), out: path.resolve(__dirname, '..', 'private', 'prepared-work-location') };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!['--patch', '--encrypted', '--out'].includes(key) || seen.has(key) || !argv[index + 1] || argv[index + 1].startsWith('--')) fail('Arguments invalides ; utiliser --help.');
    seen.add(key); options[key.slice(2)] = path.resolve(argv[index + 1]);
  }
  if (!options.patch) fail('Fichier de modification privé requis ; utiliser --help.');
  return options;
}
function main(argv, env) {
  try {
    const options = argumentsFor(argv);
    if (options.help) {
      console.log('Usage : node tools/update-work-location.js --patch fichier-prive.json [--encrypted dossier-source] [--out nouveau-dossier]\nAPP_KEY et RC_KEY sont lus uniquement dans l’environnement. La sortie contient deux fichiers chiffrés ; aucun déploiement.');
      return 0;
    }
    const prepared = prepareWorkUpdate(readJson(path.join(options.encrypted, FILES[0])), readJson(path.join(options.encrypted, FILES[1])), readJson(options.patch), env);
    writePrepared(prepared, options.encrypted, options.out);
    console.log('Préparation chiffrée terminée ; source inchangée. Aucun déploiement effectué.');
    return 0;
  } catch (error) {
    // Seulement nos libellés constants : jamais une erreur système, un chemin privé ou une valeur d'entrée.
    const allowed = ['Modification de lieu invalide.', 'Deux clés distinctes et valides sont nécessaires.', 'Configurations chiffrées invalides.', 'Déchiffrement ou séparation des clés refusé.', 'Destination de travail incohérente.', 'Révisions de lieux invalides.', 'La sortie doit être un nouveau dossier séparé de la source.', 'Écriture de la préparation refusée.', 'Fichier de préparation invalide ou inaccessible.', 'Arguments invalides ; utiliser --help.', 'Fichier de modification privé requis ; utiliser --help.'];
    console.error(allowed.includes(error.message) ? error.message : 'Préparation refusée.');
    return 1;
  }
}
if (require.main === module) process.exitCode = main(process.argv.slice(2), process.env);
module.exports = { validatePatch, prepareWorkUpdate, writePrepared, argumentsFor, main };
