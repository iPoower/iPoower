// Régression visuelle ciblée : le vrai renderer, des modèles exclusivement fictifs.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { session } = require('./jarvis-session');
const BR = require('./browser');
const TEMPS = [-5, 0, 8, 15, 25, 35];
const TOKENS = ['--panel2', '--line', '--fg', '--fg2', '--c-rain', '--c-air', '--risk-t', '--nogo-t'];
const rgb = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const luminance = s => rgb(s).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
const tokenColor = hex => 'rgb(' + [1, 3, 5].map(i => parseInt(hex.trim().slice(i, i + 2), 16)).join(', ') + ')';

async function run(browser, check) {
  const baseline = process.env.TEMPERATURE_BASELINE === '1', shots = process.env.TEMPERATURE_SHOTS;
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const report = [];
  for (const iphone of [false, true]) {
    const device = iphone ? 'iphone-11-pro-max' : 'desktop', s = await session(browser, { iphone });
    try {
      // Comparaison des surfaces des quatre onglets, sans modifier leur code ni leurs données.
      const surfaces = {};
      for (const view of ['pneus', 'tenue', 'analyse', 'meteo']) {
        await s.p.locator(`[data-act=view][data-v=${view}]`).click(); await s.settle(1);
        surfaces[view] = await s.p.evaluate(() => {
          const rows = [...document.querySelectorAll('.mod, .readout, .outfit-base, .outfit-moment, .lab-hero, .wx-blk')].filter(e => e.getBoundingClientRect().height > 0);
          return rows.map(e => { const c = getComputedStyle(e); return { cls: e.className, bg: c.background, border: c.border, radius: c.borderRadius, color: c.color, shadow: c.boxShadow, font: c.fontFamily }; });
        });
        if (shots) { await s.p.evaluate(() => window.scrollTo(0, 0)); await s.p.screenshot({ path: path.join(shots, `${device}-${view}-overview.png`) }); }
      }
      report.push({ device, surfaces });
      for (const context of ['none', 'fog', 'wind']) for (const temperature of TEMPS) {
        // La température actuelle et les phénomènes horaires sont indépendants dans cette fixture de rendu.
        // Cela vérifie qu'une alerte rouge ne colore pas une température douce et inversement.
        const expected = await s.p.evaluate(({ context, temperature }) => {
          const m = CX.m;
          m.cur.T = temperature; m.cur.Tapp = temperature - .5;
          m.hs = m.hs.map(x => ({ ...x, T: 15, Tapp: 14.5, Tr: 12, Td: 5, RH: 60, P: 0, Pl: 0, pp: 0, snow: 0, ice: { level: 0 }, code: 1, vis: 24000, wind: 9, gust: 20 }));
          const hour = m.nowStr.slice(0, 13);
          const start = m.hs.findIndex(x => x.t.slice(0, 13) === hour);
          for (let i = start; i < start + 2; i++) {
            if (context === 'fog') Object.assign(m.hs[i], { vis: 100, code: 45, RH: 98, Td: 14.5 });
            if (context === 'wind') m.hs[i].gust = 95;
          }
          RAW[UI.loc].t = Date.now(); m.mode = 'live';
          const d = wxDesk(wxInput()); renderWx();
          return { title: d.hero.title, level: d.hero.level, lines: d.hero.lines.filter(x => !/°C · ressenti .* °C/.test(x)) };
        }, { context, temperature });
        const observed = await s.p.evaluate(tokens => {
          const root = getComputedStyle(document.documentElement), card = document.querySelector('.wx-now'), hero = card.closest('.wx-hero');
          const value = card.querySelector('.wx-now-v'), title = hero.querySelector('.wx-ht'), side = card.querySelector('.wx-now-side');
          const rect = e => { const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
          const c = getComputedStyle(card), v = getComputedStyle(value), t = getComputedStyle(title);
          const bounds = rect(card), header = rect(hero.querySelector('.wx-hk')), main = rect(card.querySelector('.wx-now-main')), secondary = rect(side);
          const clipped = [...card.querySelectorAll('*')].filter(e => { const b = rect(e); return b.width && (b.left < bounds.left - 1 || b.right > bounds.right + 1); }).map(e => e.className);
          return { tokens: Object.fromEntries(tokens.map(k => [k, root.getPropertyValue(k)])), background: c.backgroundColor, borderColor: c.borderColor, radius: c.borderRadius, shadow: c.boxShadow,
            value: value.textContent, valueColor: v.color, valueSize: parseFloat(v.fontSize), unitColor: getComputedStyle(card.querySelector('.wx-now-u')).color,
            feel: card.querySelector('.wx-now-feel').textContent, feelColor: getComputedStyle(card.querySelector('.wx-now-feel')).color,
            secondaryColor: getComputedStyle(card.querySelector('.wx-now-src')).color, title: title.textContent.trim().replace(/^[^A-Z]+/, ''), titleColor: t.color,
            alertColor: getComputedStyle(hero).getPropertyValue('--lv-t').trim(), heroClass: hero.className, lines: [...hero.querySelectorAll('.wx-hl')].map(e => e.textContent),
            clipped, main, secondary, bounds, header, viewportWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
            badges: hero.querySelector('.wx-age').textContent };
        }, TOKENS);
        const label = `${device} · ${temperature} °C · ${context}`;
        check(label + ' : valeur et ressenti inchangés', observed.value === temperature.toFixed(1).replace('.', ',') && observed.feel === 'Ressenti ' + (temperature - .5).toFixed(1).replace('.', ',') + ' °C');
        check(label + ' : sans débordement ni collision', !observed.clipped.length && observed.scrollWidth <= observed.viewportWidth && observed.main.right <= observed.secondary.left + 1 && observed.header.bottom <= observed.bounds.top + 1, JSON.stringify(observed.clipped));
        check(label + ' : alerte et données météo conservées', observed.title === expected.title && observed.heroClass.includes('lv' + expected.level) && JSON.stringify(observed.lines) === JSON.stringify(expected.lines) && (context === 'none' ? expected.level === 0 : expected.level === 3), JSON.stringify({ expected, title: observed.title }));
        check(label + ' : badges et grande valeur lisibles', /LIVE.*FRESH/.test(observed.badges) && observed.valueSize >= 50 && contrast(observed.valueColor, observed.background) >= 4.5);
        if (!baseline) {
          const token = temperature <= 0 ? '--c-rain' : temperature < 15 ? '--c-air' : temperature < 25 ? '--fg' : temperature < 35 ? '--risk-t' : '--nogo-t';
          check(label + ' : surface sombre du cockpit, sans ombre ajoutée', observed.background === tokenColor(observed.tokens['--panel2']) && observed.borderColor === tokenColor(observed.tokens['--line']) && observed.radius === '6px' && observed.shadow === 'none');
          check(label + ' : couleur thermique limitée à la valeur', observed.valueColor === tokenColor(observed.tokens[token]) && observed.unitColor === tokenColor(observed.tokens['--fg2']) && observed.feelColor === tokenColor(observed.tokens['--fg']) && observed.secondaryColor === tokenColor(observed.tokens['--fg2']) && contrast(observed.secondaryColor, observed.background) >= 4.5);
          check(label + ' : priorité visuelle de l’alerte conservée', observed.titleColor === tokenColor(observed.alertColor));
        }
        report.push({ device, context, temperature, expected, observed });
        if (shots) {
          await s.p.locator('.wx-hero').screenshot({ path: path.join(shots, `${device}-${context}-${temperature}.png`) });
          if (temperature === 8) { await s.p.evaluate(() => window.scrollTo(0, 0)); await s.p.screenshot({ path: path.join(shots, `${device}-${context}-screen.png`) }); }
        }
      }
      // Les handlers existants restent utilisables après les rerenders du composant.
      await s.p.locator('[data-act=view][data-v=pneus]').click(); await s.settle(1);
      await s.p.locator('[data-act=view][data-v=meteo]').click(); await s.settle(1);
      check(device + ' : retour à Météo et aucune erreur JavaScript', await s.p.locator('.wx-now').isVisible() && !s.errors.length, s.errors.join(' | '));
    } finally { await s.c.close(); }
  }
  if (shots) fs.writeFileSync(path.join(shots, 'matrix.json'), JSON.stringify({ browser: BR.NAME, baseline, report }, null, 2));
}
module.exports = run;
if (require.main === module) {
  let failures = 0, count = 0;
  const check = (label, ok, detail) => { count++; if (!ok) failures++; console.log((ok ? '✅ ' : '❌ ') + label + (ok || !detail ? '' : ' · ' + detail)); };
  (async () => { const b = await BR.launch(); try { await run(b, check); } finally { await b.close(); } console.log(`${count - failures}/${count} scénarios OK`); process.exitCode = failures ? 1 : 0; })().catch(e => { console.error(e); process.exitCode = 1; });
}
