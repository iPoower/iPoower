'use strict';
// Leaflet 1.9.4 auto-hébergé : mêmes octets que la version déjà autorisée par SRI.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const LEAFLET = {
  js: 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH',
  css: 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H'
};
const ASSETS = ['leaflet.js', 'leaflet.css', 'images/layers.png', 'images/layers-2x.png', 'images/marker-icon.png', 'images/marker-icon-2x.png', 'images/marker-shadow.png'];
function copy(root, out) {
  for (const [file, expected] of [['leaflet.js', LEAFLET.js], ['leaflet.css', LEAFLET.css]]) {
    const source = path.join(root, 'src/vendor/leaflet', file);
    if (!fs.lstatSync(source).isFile() || 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(source)).digest('base64') !== expected) throw new Error('Intégrité Leaflet refusée : ' + file);
  }
  for (const file of ASSETS) {
    const source = path.join(root, 'src/vendor/leaflet', file), target = path.join(root, out, 'vendor/leaflet', file);
    if (!fs.lstatSync(source).isFile()) throw new Error('Ressource Leaflet non régulière');
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target);
  }
}
module.exports = { LEAFLET, ASSETS, copy };
