// Lisibilité mobile (1er novembre 2026) : champs de saisie à 16 px minimum (pas de zoom Safari à la mise au point),
// bandeau LIVE sur une seule ligne sans horloge à la seconde, ⟳ lisible, gris tertiaire au contraste AA dans les deux thèmes.
// Fixtures fictives uniquement (Maison test, Travail test) : aucun profil réel, GPS ou réseau externe.
'use strict';
const assert = require('node:assert/strict');
const { BR, session, errors } = require('./lib/context-session');
let stage = '', count = 0;
const check = async (label, fn) => { stage = label; await fn(); count++; console.log('✅ ' + label); };
const views = ['meteo', 'pneus', 'trajet', 'garage', 'analyse'];
// Champs de saisie au clavier : les cases, boutons radio, curseurs et sélecteurs de fichier ne déclenchent pas le zoom.
const NOT_TEXT = /^(checkbox|radio|range|color|file|hidden|button|submit|reset|image)$/;
const smallFields = p => p.evaluate(re => [...document.querySelectorAll('input,select,textarea')]
  .filter(x => !new RegExp(re).test(x.type) && x.getClientRects().length)
  .filter(x => parseFloat(getComputedStyle(x).fontSize) < 16)
  .map(x => (x.id || x.name || x.tagName) + ' ' + getComputedStyle(x).fontSize), NOT_TEXT.source);
async function run(browser, width, dev) {
  const s = await session(browser, { at: '2026-10-07T06:00:00+02:00', dev }), p = s.p, label = BR.NAME + ' ' + width;
  try {
    await p.setViewportSize({ width, height: dev === 'iphone' ? 844 : 900 }); await s.settle(4);
    await check(label + ' · bandeau sur une seule ligne, sans horloge à la seconde', async () => {
      const bar = await p.evaluate(() => {
        const r = s => document.querySelector(s).getBoundingClientRect(), mid = b => b.top + b.height / 2;
        const row = ['#weatherBadge', '#weatherReceived', '#statusbar [data-act=refresh]'].map(r);
        const shown = [...document.querySelectorAll('#statusbar *')].filter(x => x.getClientRects().length && x.getBoundingClientRect().width > 1 && !x.children.length);
        return { height: document.querySelector('.statusbar').getBoundingClientRect().height, aligned: row.every(b => Math.abs(mid(b) - mid(row[0])) < 12),
          clock: !!document.querySelector('#statusbar time, #liveClock, .live-clock-wrap'), seconds: shown.some(x => /\b\d{2}:\d{2}:\d{2}\b/.test(x.textContent)),
          age: shown.some(x => /Reçues il y a/.test(x.textContent)), detail: document.querySelector('#weatherFreshness').textContent, receipt: document.querySelector('#weatherReceived').textContent };
      });
      assert(bar.height <= 64, JSON.stringify(bar)); assert(bar.aligned, JSON.stringify(bar));
      assert.equal(bar.clock, false); assert.equal(bar.seconds, false); assert.equal(bar.age, false, 'ligne « Reçues il y a » encore visible');
      assert.match(bar.receipt, /Météo reçue à \d{2}:\d{2}$/);
      // L'information n'est pas perdue : lue par les lecteurs d'écran, et l'âge reste affiché dans « Sources et fraîcheur ».
      assert.match(bar.detail, /Reçues il y a .* · Prochaine vérification/);
      assert.match(await p.locator('#srcline summary').innerText(), /reçue à \d{2}:\d{2}/);
    });
    await check(label + ' · bandeau stable trois secondes : aucune écriture de seconde', async () => {
      const text = () => p.evaluate(() => document.querySelector('#statusbar').textContent);
      const before = await text(); await p.clock.runFor(3000); await p.waitForTimeout(50);
      assert.equal(await text(), before);
    });
    await check(label + ' · ⟳ lisible : icône ≥ 18 px, cible ≥ 44 pt sur iPhone', async () => {
      const r = await p.evaluate(() => { const b = document.querySelector('#statusbar [data-act=refresh]'), i = b.querySelector('.refresh-icon'), cs = getComputedStyle(i);
        return { size: parseFloat(cs.fontSize), w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height, visible: cs.display !== 'none' && cs.visibility !== 'hidden' }; });
      assert(r.visible && r.size >= 18, JSON.stringify(r));
      if (dev === 'iphone') assert(r.w >= 44 && r.h >= 44, JSON.stringify(r));
    });
    await check(label + ' · gris tertiaire ≥ 4,5:1 sur --bg, --panel et --panel2 (thèmes sombre et clair)', async () => {
      for (const theme of ['dark', 'light']) {
        const ratios = await p.evaluate(t => {
          document.documentElement.setAttribute('data-theme', t);
          const v = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
          const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
          const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
          return ['--bg', '--panel', '--panel2'].map(n => [n, v('--fg3'), v(n), ratio(v('--fg3'), v(n))]);
        }, theme);
        for (const [name, fg, bg, r] of ratios) assert(r >= 4.5, `${theme} ${name} ${fg}/${bg} = ${r.toFixed(3)}`);
      }
      await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    });
    for (const view of views) {
      await check(label + ' · ' + view + ' : tous les champs de saisie à 16 px minimum, panneaux ouverts', async () => {
        await p.evaluate(v => { UI.view = v; renderAll(); }, view); await s.settle(1);
        await p.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; })); await s.settle(1);
        await p.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; })); await s.settle(1);
        assert(await p.evaluate(() => document.querySelectorAll('input,select,textarea').length) > 0);
        assert.deepEqual(await smallFields(p), []);
      });
    }
    await check(label + ' · contre-test : un champ forcé à 14 px est bien détecté', async () => {
      await p.evaluate(() => { const st = document.createElement('style'); st.id = 'e2e94-counter'; st.textContent = '#tripDestQ, #geoQ, #carNewName { font-size: 14px !important; }'; document.head.appendChild(st); });
      const found = await smallFields(p);
      await p.evaluate(() => document.getElementById('e2e94-counter').remove());
      assert(found.length >= 1 && found.every(x => / 14px$/.test(x)), JSON.stringify(found));
      assert.deepEqual(await smallFields(p), []);
    });
    await check(label + ' · page sans débordement horizontal', async () => {
      await p.evaluate(() => { UI.view = 'meteo'; renderAll(); window.scrollTo(0, 0); }); await s.settle(1);
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    });
  } finally { await s.c.close(); }
}
(async () => {
  const browser = await BR.launch();
  try { for (const [width, dev] of [[390, 'iphone'], [320, 'iphone'], [1280, 'pc']]) await run(browser, width, dev); }
  finally { await browser.close(); }
  assert.deepEqual(errors, []); console.log(count + '/' + count + ' scénarios OK · erreurs JS : aucune');
})().catch(e => { console.error('❌ Lisibilité · ' + stage + ' · ' + String(e.message || e).split('\n')[0]); process.exit(1); });
