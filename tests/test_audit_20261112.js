// Audit de l'app réelle du 12/11/2026 (iPhone 390 px et PC, lecture seule) : corrections et contre-tests.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ctx = { console, Math, Date, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8') + ';this.alertWhen=alertWhen;', ctx);
let n = 0; const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
test('bandeau 24 h : une heure déjà passée aujourd’hui est demain ; une heure à venir reste sans mot ajouté', () => {
  assert.equal(ctx.alertWhen('Gel possible : chaussée estimée 0,4 °C vers 03:00', '05:00'), 'Gel possible : chaussée estimée 0,4 °C vers 03:00 demain');
  assert.equal(ctx.alertWhen('Gel possible : chaussée estimée 0,4 °C vers 23:00', '05:00'), 'Gel possible : chaussée estimée 0,4 °C vers 23:00');
  assert.equal(ctx.alertWhen('Minimum vers 05:00', '05:00'), 'Minimum vers 05:00', 'heure courante = aujourd’hui');
  assert.equal(ctx.alertWhen('Brouillard vers 04:59', '05:00'), 'Brouillard vers 04:59 demain');
  assert.equal(ctx.alertWhen('A vers 01:00 · B vers 22:00', '21:00'), 'A vers 01:00 demain · B vers 22:00');
});
test('bandeau : sans heure courante lisible, titre inchangé ; jamais « demain demain »', () => {
  assert.equal(ctx.alertWhen('Gel vers 03:00', ''), 'Gel vers 03:00');
  assert.equal(ctx.alertWhen('Gel vers 03:00', 'xx'), 'Gel vers 03:00');
  assert.equal(ctx.alertWhen('Gel vers 03:00 demain', '05:00'), 'Gel vers 03:00 demain');
  assert.equal(ctx.alertWhen('2,1 °C avec pneus été (i20 N)', '05:00'), '2,1 °C avec pneus été (i20 N)');
});
test('application : les bandeaux passent par alertWhen avec l’heure du modèle', () => {
  const app = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  assert.match(app, /esc\(alertWhen\(a\.title, nowHHMM\)\)/);
});
test('agenda : la pastille de verdict d’un trajet revient à la ligne (aucun débordement à 390 px)', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
  assert.match(css, /\.cal-v \.pill \{ white-space: normal; max-width: 100%;/);
});
test('Trajet : sans voiture choisie, le contrôle demande de choisir la voiture au lieu d’accuser la fiche', () => {
  const tv = fs.readFileSync(path.join(__dirname, '../src/app/trip-view.js'), 'utf8');
  assert.match(tv, /!car \? 'voiture à choisir'/);
  assert.match(tv, /Choisis la voiture du trajet ci-dessus/);
});
console.log(n + '/' + n + ' scénarios OK');
