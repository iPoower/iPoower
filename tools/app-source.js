// Assemblage mécanique des sections de l'app dans leur ordre historique.
// Le navigateur reçoit toujours un unique script classique, sans chargement de modules ni changement de portée.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const INCLUDE = /^\/\/ @include (app\/[a-z-]+\.js)\r?\n/gm;
function appSource(root = path.resolve(__dirname, '..')) {
  const dir = path.join(root, 'src');
  function read(file, parents = []) {
    if (parents.includes(file)) throw new Error('Inclusion circulaire : ' + [...parents, file].join(' -> '));
    const full = path.join(dir, file);
    const relative = path.relative(fs.realpathSync(dir), fs.realpathSync(full));
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Section hors de src : ' + file);
    let fd;
    try { fd = fs.openSync(full, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
    catch (e) { if (e.code === 'ELOOP') throw new Error('Section non régulière : ' + file); throw e; }
    let text;
    try {
      if (!fs.fstatSync(fd).isFile()) throw new Error('Section non régulière : ' + file);
      text = fs.readFileSync(fd, 'utf8');
    } finally { fs.closeSync(fd); }
    if (/^\/\/ @include /m.test(text.replace(INCLUDE, ''))) throw new Error('Directive app invalide : ' + file);
    return text.replace(INCLUDE, (_, child) => read(child, [...parents, file]));
  }
  return read('app.js');
}
module.exports = { appSource };
