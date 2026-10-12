// Le widget installé transporte le moteur approuvé ; les réponses réseau restent des données JSON.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const MARKER = 'const E = null; // moteur approuvé embarqué au build';
function widgetSource(root) {
  const template = fs.readFileSync(path.join(root, 'src/widget.js'), 'utf8');
  if (template.split(MARKER).length !== 2) throw new Error('Point d’insertion du moteur widget invalide');
  const engine = fs.readFileSync(path.join(root, 'src/engine.js'), 'utf8');
  const block = `const E = (() => {\n${engine}\nreturn { makeModel, mergeArome, seqOf, summarize, windowAssess, LV, ICE_LV, TYPE_LABEL, f1, f0, addMin, toMin, commuteOff, fmtDay };\n})();`;
  return template.replace(MARKER, () => block);
}
module.exports = { widgetSource };
