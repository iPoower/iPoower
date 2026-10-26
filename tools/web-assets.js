'use strict';
// Leaflet 1.9.4 auto-hébergé : mêmes octets que la version déjà autorisée par SRI.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const LEAFLET = {
  js: 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH',
  css: 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H'
};
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
}
module.exports = { LEAFLET, ASSETS, copy };
