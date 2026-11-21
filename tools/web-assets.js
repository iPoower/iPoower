'use strict';
// Leaflet 1.9.4 auto-hébergé : mêmes octets que la version déjà autorisée par SRI.
// MapLibre GL JS 4.7.1 (carte 3D du mode « EN DIRECT ») auto-hébergé, construction « CSP » (aucun worker blob:, aucun eval) :
// octets identiques au paquet npm maplibre-gl@4.7.1 (intégrité du registre sha512-lgL7XpIw…VrLuaA== vérifiée le 21/11/2026).
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const LEAFLET = {
  js: 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH',
  css: 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H'
};
const MAPLIBRE = {
  js: 'sha384-wkz3bHd2XHn0zfBLsJfGiElUhnowWv/hdfV/QfPpaQXPrS1euKdOIZFHNVrbocON',
  worker: 'sha384-nihfgYxLAwZc2OGkDb9/UgCi7mzsDxEbeUKuYBlMywKVRZPdD1dNli4fql0bu19P'
};
// Feuille de style de MapLibre NON embarquée (contrôle de confidentialité : motif numérique pris pour une coordonnée) :
// les 4 règles utiles sont dans src/style.css.
const MAPLIBRE_ASSETS = ['maplibre-gl-csp.js', 'maplibre-gl-csp-worker.js', 'LICENSE.txt'];
const ASSETS = ['leaflet.js', 'leaflet.css', 'images/layers.png', 'images/layers-2x.png', 'images/marker-icon.png', 'images/marker-icon-2x.png', 'images/marker-shadow.png'];
function readAsset(source) {
  let fd;
  try { fd = fs.openSync(source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
  catch (e) { if (e.code === 'ELOOP') throw new Error('Intégrité Leaflet refusée : ressource non régulière'); throw e; }
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error('Ressource Leaflet non régulière');
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
}
function copy(root, out) {
  const bytes = new Map(ASSETS.map(file => [file, readAsset(path.join(root, 'src/vendor/leaflet', file))]));
  for (const [file, expected] of [['leaflet.js', LEAFLET.js], ['leaflet.css', LEAFLET.css]]) {
    if ('sha384-' + crypto.createHash('sha384').update(bytes.get(file)).digest('base64') !== expected) throw new Error('Intégrité Leaflet refusée : ' + file);
  }
  for (const file of ASSETS) {
    const target = path.join(root, out, 'vendor/leaflet', file);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes.get(file));
  }
  const ml = new Map(MAPLIBRE_ASSETS.map(file => [file, readAsset(path.join(root, 'src/vendor/maplibre', file))]));
  for (const [file, expected] of [['maplibre-gl-csp.js', MAPLIBRE.js], ['maplibre-gl-csp-worker.js', MAPLIBRE.worker]]) {
    if ('sha384-' + crypto.createHash('sha384').update(ml.get(file)).digest('base64') !== expected) throw new Error('Intégrité MapLibre refusée : ' + file);
  }
  for (const file of MAPLIBRE_ASSETS) {
    const target = path.join(root, out, 'vendor/maplibre', file);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, ml.get(file));
  }
}
module.exports = { LEAFLET, ASSETS, MAPLIBRE, MAPLIBRE_ASSETS, copy };
