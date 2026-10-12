#!/usr/bin/env node
// Frontière allowlist : gh-pages est lu comme des données, jamais comme du code.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const FILES = ['obs.json', 'calendar.sealed.json'];
function directory(p) {
  const absolute = path.resolve(p);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!fs.lstatSync(current).isDirectory()) throw new Error('Dossier de données non régulier');
  }
  return absolute;
}
function read(root, name) {
  const file = path.join(directory(root), name);
  if (!fs.existsSync(file)) {
    // existsSync retourne aussi false pour un lien cassé : ne pas l'accepter.
    try { fs.lstatSync(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 16000000) throw new Error('Fichier de données non régulier ou trop volumineux');
    const bytes = fs.readFileSync(fd), value = JSON.parse(bytes.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON de données invalide');
    if (Object.keys(value).some(k => ['__proto__', 'constructor', 'prototype'].includes(k))) throw new Error('Métadonnée de données invalide');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function write(root, name, bytes) {
  const file = path.join(directory(root), name);
  try { if (!fs.lstatSync(file).isFile()) throw new Error('Sortie non régulière'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o600);
  try { if (!fs.fstatSync(fd).isFile()) throw new Error('Sortie non régulière'); fs.writeFileSync(fd, bytes); } finally { fs.closeSync(fd); }
}
function copy(from, to, required = false) {
  directory(from); directory(to);
  // Tout vérifier avant la première écriture ; ne jamais publier une entrée partiellement lue.
  const inputs = FILES.map(name => [name, read(from, name)]);
  if (required && !inputs[0][1]) throw new Error('Observations produites absentes');
  for (const [name, bytes] of inputs) if (bytes) write(to, name, bytes);
}
function due(root, threshold, manual = false, now = Date.now()) {
  const bytes = read(root, 'obs.json'); let age = Infinity;
  if (bytes) { const time = Date.parse(JSON.parse(bytes).updated); if (Number.isFinite(time) && time <= now + 60000) age = (now - time) / 60000; }
  return manual || !Number.isFinite(age) || age >= threshold;
}
if (require.main === module) {
  try {
    const [mode, from, to] = process.argv.slice(2);
    if (mode === 'prepare' || mode === 'publish') copy(from, to, mode === 'publish');
    else if (mode === 'due') {
      const result = due(from, Number(to), process.env.MANUAL === 'true' || process.env.FORCE_PUSH === '1');
      fs.appendFileSync(process.env.GITHUB_OUTPUT, 'due=' + (result ? '1' : '0') + '\n');
      console.log(result ? 'Synchronisation nécessaire' : 'Observations encore fraîches');
    } else throw new Error('Mode de données inconnu');
  } catch (e) { console.error('::error::Frontière des données refusée (JSON, taille ou lien non conforme)'); process.exitCode = 1; }
}
module.exports = { FILES, directory, read, copy, due };
