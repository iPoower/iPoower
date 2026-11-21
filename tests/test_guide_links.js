// « Guider avec… » (21/11/2026) · module pur GuideLinks : URL EXACTES des liens officiels Waze, Apple Plans et Google Maps,
// adresses accentuées, lieu sans adresse, coordonnées seules ; jamais d'adresse ni de position pour un lieu enregistré. FICTIF.
'use strict';
const assert = require('node:assert/strict'), G = require('../src/app/guide-links-core.js');
let n = 0; const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const accents = { address: "3 rue fictive de l'Église, Lieu B", lat: 48.8566139, lon: 2.3522219, privacy: null };
test('adresse avec accents : les trois liens officiels, adresse encodée (UTF-8), coordonnées à 5 décimales', () => {
  assert.equal(G.waze(accents).url, "https://waze.com/ul?q=3%20rue%20fictive%20de%20l%27%C3%89glise%2C%20Lieu%20B&ll=48.85661,2.35222&navigate=yes");
  assert.equal(G.plans(accents).url, "https://maps.apple.com/?daddr=3%20rue%20fictive%20de%20l%27%C3%89glise%2C%20Lieu%20B&dirflg=d");
  assert.equal(G.google(accents).url, "https://www.google.com/maps/dir/?api=1&destination=3%20rue%20fictive%20de%20l%27%C3%89glise%2C%20Lieu%20B&travelmode=driving");
});
test('lieu sans adresse (coordonnées seules) : Waze et Google par position, Plans indisponible (adresse obligatoire)', () => {
  const d = { address: '', lat: 45.1, lon: 5.72, privacy: null };
  assert.equal(G.waze(d).url, 'https://waze.com/ul?ll=45.10000,5.72000&navigate=yes');
  assert.equal(G.google(d).url, 'https://www.google.com/maps/dir/?api=1&destination=45.10000%2C5.72000&travelmode=driving');
  assert.equal(G.plans(d).url, null); assert.match(G.plans(d).why, /adresse/);
});
test('adresse seule (sans position) : Waze par recherche, Plans et Google par adresse ; espaces normalisés', () => {
  const d = { address: '  Place   fictive  C ', privacy: null };
  assert.equal(G.waze(d).url, 'https://waze.com/ul?q=Place%20fictive%20C&navigate=yes');
  assert.equal(G.plans(d).url, 'https://maps.apple.com/?daddr=Place%20fictive%20C&dirflg=d');
  assert.equal(G.google(d).url, 'https://www.google.com/maps/dir/?api=1&destination=Place%20fictive%20C&travelmode=driving');
});
test('lieu enregistré privé : domicile et travail par favori Waze, jamais d’adresse ni de position ; autre lieu enregistré : aucun lien', () => {
  const home = { address: '1 rue fictive A', lat: 48.1, lon: 2.1, privacy: 'home' }, work = { ...home, privacy: 'work' }, other = { ...home, privacy: 'private' };
  assert.equal(G.waze(home).url, 'https://waze.com/ul?favorite=home&navigate=yes'); assert.equal(G.waze(work).url, 'https://waze.com/ul?favorite=work&navigate=yes');
  for (const d of [home, work]) { assert.equal(G.plans(d).url, null); assert.equal(G.google(d).url, null); }
  for (const a of G.all(other)) assert.equal(a.url, null);
  const urls = [home, work, other].flatMap(d => G.all(d).map(a => a.url || ''));
  assert.ok(urls.every(u => !/rue|48\.1|2\.1/.test(u)), urls.join(' '));
});
test('destination inconnue ou vide : aucun lien, raison donnée ; trois apps dans l’ordre Waze, Plans, Google Maps', () => {
  assert.deepEqual(G.all(null).map(a => [a.id, a.url]), [['waze', null], ['plans', null], ['google', null]]);
  assert.equal(G.waze({ privacy: null }).url, null);
});
console.log(`\n${n}/${n} contrôles « Guider avec… »`);
