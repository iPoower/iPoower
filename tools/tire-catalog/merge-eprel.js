#!/usr/bin/env node
// Catalogue pneus : fusion du registre européen EPREL (étiquette UE officielle) dans src/tiredb.json.
// Entrée : fichiers produits par fetch-eprel.js (fiches publiques EPREL d'une dimension). Aucune donnée personnelle.
// Règles (aucune donnée inventée) :
//   · seuls les pneus de tourisme (C1) publiés, disponibles en France et encore commercialisés sont retenus ;
//   · l'étiquette (consommation A–E, adhérence sur sol mouillé A–E, bruit en dB et classe A–C, 3PMSF, glace) est celle
//     du registre, par variante (indice de charge et de vitesse), avec son numéro d'enregistrement EPREL ;
//   · EPREL ne donne pas la saison : les modèles déjà vérifiés gardent la leur. Pour les autres, sans 3PMSF = été,
//     3PMSF avec un nom clairement hivernal = hiver, sinon 4 saisons ; marqué « q » (saison déduite, à confirmer).
// Usage : node tools/tire-catalog/merge-eprel.js <dossier des fichiers EPREL> [src/tiredb.json]
'use strict';
const fs = require('fs'), path = require('path');

const SIZE_FILES = { '215/40 R18': '215-40-R18.json', '225/45 R17': '225-45-R17.json' };
const WINTER = /\b(WINTER|SNOW|ALPIN[A-Z]*|ICE|NORD[A-Z]*|POLAR[A-Z]*|FROST|BLIZZAK|ULTRAGRIP|WINTRAC|SOTTOZERO|I\*?CEPT|ARCTIC|GLACIER|HIVER|WINGUARD|SNOWPROOF|WINTERCONTACT|ESKIMO|KRISTALL|WINTERMAX|EUROWINTER|WINTERHAWK|SNOWTRAC|WINTERCRAFT|NORTH ?POLE)/;
const BRAND_ALIAS = { NEXENTIRE: 'Nexen', NEXEN: 'Nexen', BFGOODRICH: 'BFGoodrich', 'GT RADIAL': 'GT Radial', GTRADIAL: 'GT Radial', ARROWSPEED: 'Arrowspeed', 'ARROW SPEED': 'Arrowspeed' };
// Même pneu, nom différent au registre : correspondances vérifiées une à une (marque|nom EPREL → modèle de la base).
// Les cas douteux restent séparés (ex. Vredestein Wintrac ≠ Wintrac Pro+).
const MODEL_ALIAS = {
  'Hankook|Kinergy 4S 2': 'Kinergy 4S2 H750', 'Hankook|Ventus Evo': 'Ventus evo K137', 'Hankook|Ventus S1 evo2': 'Ventus S1 evo2 K117B',
  'Hankook|Ventus S1 evo3': 'Ventus S1 evo3 K127', 'Hankook|Winter i*cept evo3': 'Winter i*cept evo3 W330',
  'Kumho|PS71': 'Ecsta PS71', 'Kumho|PS72': 'Ecsta Sport PS72', 'Kumho|HA32+': 'Solus 4S HA32+', 'Maxxis|WP6': 'Premitra Snow WP6',
  'Nankang|SV-2': 'Snow Viva SV-2', 'Nankang|AS-3': 'Sportnex AS-3', 'Nereus|Sailfish NS601': 'NS601', 'Pirelli|Winter Sottozero 3': 'Sottozero 3',
  'Tristar|AS Power': 'All Season Power'
};
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Disponible en France : tout l'EEE (« ALL ») ou la France listée.
const inFrance = h => h.availabilityInEUEEACountries === 'ALL' || (h.modelAvailabilityInCountries || []).includes('FR') || (h.modelAvailabilityInEUEEACountries || []).includes('FR');
const onMarket = (h, nowMs) => !h.onMarketEndDateTS || h.onMarketEndDateTS * 1000 > nowMs;
const keep = (h, nowMs) => h && h.status === 'PUBLISHED' && !h.blocked && h.tyreClass === 'C1' && inFrance(h) && onMarket(h, nowMs) &&
  /^[A-E]$/.test(h.energyClass || '') && /^[A-E]$/.test(h.wetGripClass || '');

function brandName(raw, known) {
  const up = String(raw || '').trim().replace(/\s+/g, ' ').toUpperCase(), base = up.replace(/\s+(TIRES?|TYRES?)$/, '').replace(/^(KUMHO)\s.*$/, '$1');
  if (BRAND_ALIAS[base]) return BRAND_ALIAS[base];
  const k = known.get(norm(base)); if (k) return k;
  return base.split(' ').map(w => /^[A-Z]{3,}$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w).join(' ');
}
// Nom commercial : certains déclarants y recopient la dimension et les indices (« 215/40R18 89V SV-4 XL L EUHA »).
function modelName(raw) {
  let s = String(raw || '').trim().replace(/\s+/g, ' ');
  s = s.replace(/^\d{3}\/\d{2}\s*Z?R?F?\s*\d{2}\s+\d{2,3}\s*[A-Z]\s+/i, '');
  s = s.replace(/(\s+(XL|L|EUHA|M\+S|RF|FR|MFS|SL))+$/i, '').trim();
  return s.split(' ').map(w => /^[A-Za-z]{3,}$/.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w).join(' ');
}
// Variante compacte : « indices|conso|mouillé|dB|classe bruit|3PMSF|glace|n° EPREL ».
function variant(h) {
  const si = h.speedCategorySymbol === 'PAR_Y_PAR' ? '(Y)' : h.speedCategorySymbol || '?';
  const ind = h.loadCapacityIndicator && h.loadCapacityIndicator !== 'SL' ? ' ' + h.loadCapacityIndicator : '';
  return [`${h.loadCapacityIndex}${si}${ind}`, h.energyClass, h.wetGripClass, h.externalRollingNoiseValue == null ? '' : h.externalRollingNoiseValue,
    h.externalRollingNoiseClass || '', h.severeSnowTyre ? 1 : 0, h.iceTyre ? 1 : 0, h.eprelRegistrationNumber || ''].join('|');
}
const score = v => { const p = v.split('|'); return (p[2].charCodeAt(0) - 64) * 10 + (p[1].charCodeAt(0) - 64); };

function merge(db, dumps, nowMs = Date.now()) {
  const tires = db.tires.map(t => ({ ...t, e: undefined }));
  const knownBrands = new Map(tires.map(t => [norm(t.b), t.b]));
  const byKey = new Map(tires.map(t => [norm(t.b) + '|' + norm(t.m), t]));
  const akaKey = new Map(tires.map(t => [norm(t.b) + '|' + norm(t.m.replace(/\(.*?\)/g, '')), t]));
  const stats = { records: 0, kept: 0, enriched: new Set(), added: 0, seasonGuessed: 0, pmsfMismatch: [] };
  for (const [size, hits] of Object.entries(dumps)) {
    for (const h of hits) {
      stats.records++;
      if (!keep(h, nowMs)) continue;
      const rawName = (h.additionalDetails || {}).commercialName; if (!rawName || !String(rawName).trim()) continue;
      stats.kept++;
      const b = brandName(h.supplierOrTrademark, knownBrands), m = modelName(rawName); if (!m) continue;
      const alias = Object.entries(MODEL_ALIAS).find(([k]) => norm(k.split('|')[0]) === norm(b) && norm(k.split('|')[1]) === norm(m));
      const key = norm(b) + '|' + norm(alias ? alias[1] : m);
      let t = byKey.get(key) || akaKey.get(key);
      if (!t) {
        t = { b, m, t: null, p: 0, s: {}, c: '', q: 1, a: null, _snow: false };
        tires.push(t); byKey.set(key, t); stats.added++;
      }
      if (!t.q) stats.enriched.add(t);
      t.e = t.e || {}; t.e[size] = t.e[size] || [];
      const v = variant(h); if (!t.e[size].includes(v)) t.e[size].push(v);
      if (!t.s[size]) t.s[size] = 'eprel';
      if (h.severeSnowTyre && t.q) t._snow = true;
      if (!t.q && h.severeSnowTyre && t.p === 0) stats.pmsfMismatch.push(`${t.b} ${t.m} (${size})`);
    }
  }
  for (const t of tires) {
    if (t.e) for (const k of Object.keys(t.e)) t.e[k].sort((x, y) => score(x) - score(y) || x.localeCompare(y));
    else delete t.e;
    if (t.q) {   // saison déduite (registre sans saison) : prudence, voir l'en-tête
      t.p = t._snow ? 1 : 0;
      t.t = !t._snow ? 'summer' : WINTER.test(t.m.toUpperCase()) ? 'winter' : 'allseason';
      t.c = t.t === 'summer' ? 'Été (sans 3PMSF au registre UE)' : t.t === 'winter' ? 'Hiver 3PMSF (saison déduite du nom)' : '3PMSF : 4 saisons ou hiver, à confirmer';
      stats.seasonGuessed++;
    }
    delete t._snow; if (t.a === null) delete t.a;
  }
  const out = { ...db, tires: tires.sort((x, y) => (x.q ? 1 : 0) - (y.q ? 1 : 0) || x.b.localeCompare(y.b) || x.m.localeCompare(y.m)) };
  out.labels = { source: 'EPREL, registre européen des étiquettes énergétiques (eprel.ec.europa.eu)', fetched: null,
    format: 'indices|conso A-E|mouillé A-E|bruit dB|classe bruit A-C|3PMSF|glace|n° EPREL',
    scope: 'pneus de tourisme C1 publiés, disponibles en France, encore commercialisés' };
  return { db: out, stats: { ...stats, enriched: stats.enriched.size } };
}
module.exports = { merge, modelName, brandName, variant, keep, inFrance, WINTER, MODEL_ALIAS };

if (require.main === module) {
  const dir = process.argv[2], file = process.argv[3] || path.join(__dirname, '../../src/tiredb.json');
  if (!dir) { console.error('Usage : node tools/tire-catalog/merge-eprel.js <dossier EPREL> [tiredb.json]'); process.exit(2); }
  const db = JSON.parse(fs.readFileSync(file, 'utf8')), dumps = {}; let fetched = null;
  for (const [size, f] of Object.entries(SIZE_FILES)) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!Array.isArray(j.hits) || j.hits.length !== j.size) throw new Error(`${f} : téléchargement incomplet (${j.hits && j.hits.length}/${j.size})`);
    dumps[size] = j.hits; fetched = fetched && fetched < j.fetched ? fetched : j.fetched;
  }
  const { db: out, stats } = merge(db, dumps);
  out.labels.fetched = fetched; out.version = (db.version || 0) + 1; out.updated = String(fetched).slice(0, 10);
  out.note = 'Modèles vérifiés (catalogue, fiche ou gamme du fabricant) et registre européen EPREL : étiquette UE officielle par variante (champ e). Saison : vérifiée, ou déduite (q) du 3PMSF et du nom, à confirmer.';
  fs.writeFileSync(file, JSON.stringify(out) + '\n');
  console.log(JSON.stringify(stats));
}
