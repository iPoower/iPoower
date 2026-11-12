#!/usr/bin/env node
// Téléchargement des fiches publiques du registre européen EPREL (étiquette énergétique des pneus) pour les dimensions
// de tiredb.json. Le site public interroge son API depuis le navigateur ; l'API appelée directement (sans navigateur)
// répond 403. Le script utilise donc la page publique de recherche, comme un visiteur, à un rythme modéré (1 page / 0,8 s).
// Aucune donnée personnelle, aucun identifiant. Sortie : un fichier JSON par dimension, contrôlé complet (hits = size).
// Usage : node tools/tire-catalog/fetch-eprel.js <dossier de sortie> ; puis node tools/tire-catalog/merge-eprel.js <dossier>
'use strict';
const fs = require('fs'), path = require('path');
const DIMS = [[215, 40, 18], [225, 45, 17]];
(async () => {
  const out = process.argv[2]; if (!out) { console.error('Usage : node tools/tire-catalog/fetch-eprel.js <dossier>'); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });
  const { chromium } = require('playwright'), b = await chromium.launch();
  try {
    const p = await b.newPage();
    await p.goto('https://eprel.ec.europa.eu/screen/product/tyres', { waitUntil: 'networkidle', timeout: 90000 });
    for (const [w, a, r] of DIMS) {
      const hits = []; let page = 1, size = null;
      for (;;) {
        const res = await p.evaluate(async q => {
          const x = await fetch('/api/products/tyres?' + q, { headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' } });
          return { s: x.status, t: await x.text() };
        }, `_page=${page}&_limit=100&tyreSection=${w}&aspectRatio=${a}&rimDiameter=${r}&sort0=onMarketStartDateTS&order0=DESC`);
        if (res.s !== 200) throw new Error(`EPREL HTTP ${res.s} (${w}/${a} R${r}, page ${page})`);
        const j = JSON.parse(res.t); size = j.size; hits.push(...j.hits);
        if (!j.hits.length || hits.length >= size) break;
        page++; await p.waitForTimeout(800);
      }
      if (hits.length !== size) throw new Error(`${w}/${a} R${r} : ${hits.length}/${size} fiches, téléchargement incomplet`);
      fs.writeFileSync(path.join(out, `${w}-${a}-R${r}.json`), JSON.stringify({ fetched: new Date().toISOString(), size, hits }));
      console.log(`${w}/${a} R${r} : ${hits.length} fiches`);
    }
  } finally { await b.close(); }
})().catch(e => { console.error(e.message || e); process.exit(1); });
