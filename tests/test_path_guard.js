'use strict';
// Exécute le vrai setter de l'application dans des VM jetables.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
const setter = source.slice(source.indexOf('function setPath('), source.indexOf('/* ---------- données ---------- */'));
for (const key of ['__proto__.fixturePollution', 'constructor.prototype.fixturePollution', 'cars.0.__proto__.fixturePollution']) {
  const context = vm.createContext({});
  vm.runInContext(setter + ';this.apply = () => setPath({ cars: [{}] }, ' + JSON.stringify(key) + ', true);', context);
  assert.throws(() => context.apply(), /Chemin de réglage interdit/, key);
  assert.equal(vm.runInContext('({}).fixturePollution', context), undefined);
}
const context = vm.createContext({});
vm.runInContext(setter + ';this.value = { cars: [{ tire: { tread: 5 } }] }; setPath(value, "cars.0.tire.tread", 6);', context);
assert.equal(context.value.cars[0].tire.tread, 6);
console.log('4/4 chemins de réglage : pollution refusée, édition légitime préservée');
