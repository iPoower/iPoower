// Propreté de l'affichage : aucun onglet ni sous-vue principale ne montre d'horodatage brut (ISO « …T… » ou « …Z »),
// ni « none », « null » ou « undefined », ni une icône doublée (« 🟠🟠 »). Profil 100 % fictif et riche :
// Voiture test A en pneus « Rovelo RPX988 » (modèle fictif), relevés de jauge, contrôle de pression daté sans valeurs,
// jeu stocké sans saison (« none »), montage daté sans compteur. PC et iPhone.
'use strict';
const assert = require('node:assert/strict'), BR = require('./lib/browser'), { session } = require('./lib/jarvis-session');
const RAW_ISO = /\d{4}-\d{2}-\d{2}T/, RAW_Z = /\d{2}(\.\d+)?Z\b/, WORDS = /\b(none|null|undefined)\b/i;
const DOUBLE = /(\p{Extended_Pictographic})️?\s*\1/u;
let count = 0, step = '';
async function check(name, fn) { step = name; await fn(); count++; console.log('✅ ' + name); }
// Tous les volets repliables ouverts : le texte caché derrière un « détails » compte aussi.
async function openAll(s) {
  for (let i = 0; i < 3; i++) { await s.p.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; })); await s.settle(2); }
}
function offenders(text) {
  return text.split('\n').filter(l => RAW_ISO.test(l) || RAW_Z.test(l) || WORDS.test(l) || DOUBLE.test(l)).map(l => l.trim().slice(0, 220));
}
async function enrich(s) {
  await s.p.evaluate(() => {
    const a = S.cars[0];
    Object.assign(a.tire, { type: 'summer', brand: 'Rovelo', model: 'RPX988', size: '225/45 ZR17 94Y XL', tread: 4.4, treadAv: 4.4, treadAr: 6.2, treadEst: 0,
      treads: [{ d: '2026-09-20', mm: 4.4, ax: 'av', pos: 'centre', km: null }, { d: '2026-09-20', mm: 6.2, ax: 'ar', pos: 'centre', km: null }],
      pchk: { date: '2026-09-22', T: 10.2 }, mounted: '2026-04-02', mountKm: null });
    a.sets = { ...(a.sets || {}), none: { brand: 'Rovelo', model: 'RPX988' }, winter: { brand: 'Marque test', model: 'Hiver test', size: '225/45 R17' } };
    a.odo = [{ d: '2026-09-01', km: 41200 }, { d: '2026-09-28', km: 42150 }];
    saveSettings(); rebuild(); renderAll();
  });
  await s.settle(4);
  if (await s.p.locator('#dayContext details.day-editor').getAttribute('open') === null) await s.p.locator('#dayContext details.day-editor > summary').click();
  await s.p.locator('#dayContext [data-act="day-car"]').first().click(); await s.settle(4);
}
const VIEWS = ['pneus', 'meteo', 'trajet', 'garage', 'analyse'];
async function run(browser, iphone) {
  const tag = iphone ? 'iPhone' : 'PC', s = await session(browser, { iphone });
  try {
    await enrich(s);
    const found = {};
    const tour = async label => {
      for (const v of VIEWS) {
        await s.p.locator(`#viewSeg [data-act=view][data-v=${v}]`).first().click(); await s.settle(4);
        await openAll(s);
        const bad = offenders(await s.p.evaluate(() => document.body.innerText));
        if (bad.length) found[label + ' · ' + v] = bad;
      }
    };
    await tour('données réseau');
    // Démonstrations simulées : brouillard et gel (froid), pluie, neige — phénomènes absents de la météo « douce » du réseau fictif.
    for (const scn of ['froid', 'pluie', 'neige']) { await s.p.evaluate(x => startDemo(x), scn); await s.settle(4); await tour('démo ' + scn); }
    // Veille de l’aube en démo « froid » : brouillard prévu dans la nuit, pastille de niveau déjà portée par la ligne (ancien « 🟠 🟠 Visibilité »).
    await s.p.clock.setSystemTime(Date.parse('2026-10-05T23:00:00+02:00')); await s.p.evaluate(() => startDemo('froid')); await s.settle(4);
    await s.p.locator('#viewSeg [data-act=view][data-v=meteo]').first().click(); await s.settle(4); await openAll(s);
    const fog = await s.p.evaluate(() => (document.querySelector('#secWx details[data-k=fog] .ln') || {}).innerText || '');
    await check(tag + ' · démo à l’aube : brouillard affiché avec une seule pastille', async () => { assert.match(fog, /Visibilité/); assert.doesNotMatch(fog, DOUBLE); });
    await tour('démo froid · aube');
    await s.p.evaluate(() => { DEMO = { on: false, scn: 'froid' }; rebuild(); renderAll(); }); await s.settle(3);
    // Réglages (fiche des voitures) et relevés rapides du Garage ouverts.
    await s.p.locator('#viewSeg [data-act=view][data-v=garage]').first().click(); await s.settle(3);
    await s.p.locator('[data-act=goset-cfg]').first().click(); await s.settle(4); await openAll(s);
    const bad = offenders(await s.p.evaluate(() => document.body.innerText)); if (bad.length) found.reglages = bad;
    await check(tag + ' · aucun horodatage brut, aucun none/null/undefined, aucune icône doublée sur ' + VIEWS.length + ' onglets (réseau et 3 démos) et Réglages', async () => {
      const lines = Object.entries(found).map(([k, v]) => k + ' → ' + [...new Set(v)].slice(0, 6).join(' ‖ '));
      assert.equal(lines.length, 0, lines.join('\n'));
    });
    assert.deepEqual(s.errors, []);
  } finally { await s.c.close(); }
}
(async () => {
  const browser = await BR.launch();
  try { for (const iphone of [false, true]) await run(browser, iphone); }
  finally { await browser.close(); }
  console.log(`${count}/${count} scénarios OK · erreurs JS : aucune`);
})().catch(e => { console.log('❌ ' + step); console.log(String(e.message).slice(0, 6000)); process.exit(1); });
