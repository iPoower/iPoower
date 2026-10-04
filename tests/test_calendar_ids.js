// Identifiants techniques : vrai helper du relais, sans exécuter ses accès réseau.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '../src/relay.js'), 'utf8');
const begin = source.indexOf('function calendarEventId(e) {'), end = source.indexOf('async function calendarSync(out)', begin);
assert(begin >= 0 && end > begin, 'Helper du relais introuvable');
const ctx = { crypto }; vm.createContext(ctx);
vm.runInContext(source.slice(begin, end) + ';this.id = calendarEventId;', ctx);
const event = { uid: 'uid-fictif-prive@agenda.test', s: '2026-10-04T10:00', e: '2026-10-04T11:00', title: 'Titre privé fictif', loc: 'Adresse privée fictive', lat: 49.20779, lon: 2.58743, allDay: false, legs: [] };
let count = 0;
function test(name, fn) { fn(); count++; console.log('✅ ' + name); }
test('identifiant opaque issu de SHA256, sans UID brut', () => {
  const id = ctx.id(event), expected = crypto.createHash('sha256').update(JSON.stringify([event.uid, event.s])).digest('hex').slice(0, 32);
  assert.match(id, /^event-[0-9a-f]{32}$/); assert.equal(id, 'event-' + expected); assert(!id.includes(event.uid));
});
test('événements simultanés avec UID distincts gardent deux identités', () => {
  assert.notEqual(ctx.id(event), ctx.id({ ...event, uid: 'autre-uid-fictif@agenda.test' }));
});
test('titre, lieu et coordonnées ne changent pas l’identité', () => {
  assert.equal(ctx.id(event), ctx.id({ ...event, title: 'Autre titre', loc: 'Autre adresse', lat: -25.12345, lon: 125.67891, label: 'Autre lieu' }));
});
test('heure de fin et jambes ne changent pas l’identité', () => {
  assert.equal(ctx.id(event), ctx.id({ ...event, e: '2026-10-04T12:30', legs: [{ from: { lat: 0, lon: 0 }, dep: '2026-10-04T09:00', min: 30 }], alt: { key: 'autre-route' } }));
});
test('réordonnancement de l’agenda ne réattribue aucune identité', () => {
  const events = [event, { ...event, uid: 'autre-uid-fictif@agenda.test' }, { ...event, s: '2026-10-05T10:00' }];
  const original = events.map(e => ctx.id(e));
  assert.deepEqual([...events].reverse().map(e => ctx.id(e)).reverse(), original);
});
test('occurrences récurrentes d’un même UID restent distinctes', () => {
  assert.notEqual(ctx.id(event), ctx.id({ ...event, s: '2026-10-11T10:00', e: '2026-10-11T11:00' }));
});
test('UID absent ou vide conserve le repli legacy du client', () => {
  for (const uid of [undefined, null, '', '   ']) assert.equal(ctx.id({ ...event, uid }), null);
  assert.equal(ctx.id(null), null);
});
test('calcul déterministe sans mutation de l’occurrence', () => {
  const before = JSON.stringify(event); Object.freeze(event);
  assert.equal(ctx.id(event), ctx.id(event)); assert.equal(JSON.stringify(event), before);
});
console.log(count + '/' + count + ' scénarios identifiants agenda OK');
