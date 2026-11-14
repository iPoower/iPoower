// Mission « Cohérence gel et trajet » (constat en production du 14/11/2026, prod-207) : pour la MÊME nuit, six verdicts gel
// différents (synthèse « Gel possible · PRUDENCE », poste Météo « GEL DE SURFACE PROBABLE », « Risque verglas : FAIBLE »,
// « 0 % des scénarios », preuves v2 « aucun phénomène critique prouvé », courbe « DANGER 39/100 »), « chaussée sèche » contre
// « chaussée humide » pour la même heure et trois minimums de chaussée. Fixture FICTIVE (tests/fixtures/frost-1411.js) : nuit
// humide, chaussée min 1,6 °C vers 05:00 ⇒ PRUDENCE (option A). Dix contrôles, chacun vérifié sur PC ET iPhone.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
const fx = require('./fixtures/frost-1411');
const N = 10; let n = 0; const findings = [];
const expect = (label, ok, detail) => { if (ok) { n++; console.log('✅ ' + label); } else { findings.push(label + ' · ' + String(detail || '').slice(0, 600)); console.log('❌ ' + label + ' · ' + String(detail || '').slice(0, 600)); } };
const norm = s => String(s || '').replace(/\s+/g, ' ');
(async () => {
  const b = await BR.launch(), D = {};
  try {
    for (const dev of ['pc', 'iphone']) {
      const s = await session(b, { at: fx.AT, dev, wx: fx.wx }), p = s.p; await s.settle(4);
      await p.evaluate(fx.setup); await s.settle(8);
      const d = D[dev] = await p.evaluate(() => {
        const fr24 = frostRisk(CX.sum24), frH = frostRisk(CX.sum), hs = CX.m.hs, at = h => hs.findIndex(x => x.t.startsWith('2026-11-15T' + h));
        const curve = ['01', '04', '05', '06'].map(h => { const i = at(h), fh = frostHour(hs, i); return { h, frost: fh && fh.level, humid: fh && fh.humid, cars: S.cars.map(c => { const v = hourVerdict(c, hs, i); return v && { type: c.tire.type, level: v.level, score: v.score }; }) }; });
        return { ref: { level: fr24.level, roadMin: fr24.roadMin, humid: fr24.humid, minAt: fr24.sMin && hhmm(fr24.sMin), word: frostWords(fr24).label },
          refH: { level: frH.level, roadMin: frH.roadMin }, t0: CX.alerts.t0 ? { sev: CX.alerts.t0.sev, title: CX.alerts.t0.title, detail: CX.alerts.t0.detail } : null,
          cards: CX.cars.map(c => ({ type: c.car.tire.type, level: c.w && c.w.level, score: c.w && c.w.score, body: c.nar && c.nar.body })), curve,
          nowHumid: frostHour(hs, CX.m.nowI).humid };
      });
      await p.evaluate(() => { UI.view = 'pneus'; renderAll(); }); await s.settle(6);
      d.core = norm(await p.evaluate(() => { const e = document.querySelector('#decisionCore'); return e ? e.innerText : ''; }));
      d.ice = await p.evaluate(() => { const e = document.querySelector('#secIce .frost-verdict'), m = document.querySelector('#secIce'); return { lv: e && e.dataset.frostLevel, text: e ? e.innerText.replace(/\s+/g, ' ') : '', all: m ? m.innerText.replace(/\s+/g, ' ') : '' }; });
      d.cardsText = norm(await p.evaluate(() => { const e = document.querySelector('#secCars'); return e ? e.innerText : ''; }));
      await p.evaluate(fx.chartAt); await s.settle(3);
      d.readout = norm(await p.evaluate(() => { const e = document.querySelector('#readout'); return e ? e.innerText : ''; }));
      d.pneusText = norm(await p.evaluate(() => document.body.innerText));
      await p.evaluate(() => { UI.view = 'meteo'; renderAll(); }); await s.settle(6);
      d.wx = norm(await p.evaluate(() => { const e = document.querySelector('#secWx'); return e ? e.innerText : ''; }));
      d.ev = norm(await p.evaluate(() => { const e = document.querySelector('#secWx details.ev summary'); return e ? e.innerText : ''; }));
      d.meteoText = norm(await p.evaluate(() => document.body.innerText));
      await s.c.close();
    }
  } finally { await b.close(); }
  const both = f => ['pc', 'iphone'].every(dev => f(D[dev], dev)), show = f => JSON.stringify({ pc: f(D.pc), iphone: f(D.iphone) });
  const c16 = '1,6';
  expect('1. règle de référence (moteur, 24 h) : PRUDENCE · chaussée humide · un seul minimum 1,6 °C vers 05:00', both(d => d.ref.level === 2 && d.ref.roadMin === 1.6 && d.ref.humid === true && d.ref.minAt === '05:00' && d.refH.level === 2 && d.refH.roadMin === 1.6), show(d => [d.ref, d.refH]));
  expect('2. bandeau de décision : même niveau, même mot et même humidité (« Gel possible (marge de prudence) · chaussée humide »), PRUDENCE', both(d => /PRUDENCE/.test(d.core) && /Gel possible \(marge de prudence\) · chaussée humide/i.test(d.core) && !/gel[^·]{0,30}probable|DANGER/i.test(d.core) && /chaussée min 1,6 °C/.test(d.core)), show(d => d.core.slice(0, 300)));
  expect('3. poste Météo : « GEL POSSIBLE (MARGE DE PRUDENCE) · CHAUSSÉE HUMIDE · PRUDENCE », minimum 1,6 °C avec heure et horizon, jamais « probable » ni « verglas »', both(d => /GEL POSSIBLE \(MARGE DE PRUDENCE\) · CHAUSSÉE HUMIDE · PRUDENCE/.test(d.wx) && new RegExp('Chaussée estimée min ' + c16 + ' °C ± 2 vers demain 05:00 \\(jusqu’à ').test(d.wx) && !/probable|RISQUE DE VERGLAS/i.test(d.wx)), show(d => d.wx.slice(0, 400)));
  expect('4. Gel et verglas : verdict de la règle en tête (PRUDENCE, min 1,6 °C, 24 h) ; verglas et ensemble libellés « complémentaires », sans contradiction muette', both(d => d.ice.lv === '2' && /Verdict gel \(règle unique\) : PRUDENCE/.test(d.ice.text) && d.ice.text.includes('chaussée estimée min ' + c16 + ' °C vers 05:00 (24 h)') && /Indicateur verglas \(complémentaire\)/.test(d.ice.all) && (!/des scénarios/.test(d.ice.all) || /INDICATEUR COMPLÉMENTAIRE/.test(d.ice.all) && /ne contredit pas le verdict gel PRUDENCE/.test(d.ice.all))), show(d => d.ice.all.slice(0, 700)));
  expect('5. preuves v2 : « aucun phénomène prouvé » expliqué face au verdict gel PRUDENCE (indicateur complémentaire)', both(d => /indicateur complémentaire/i.test(d.ev) && (/ne contredit pas le verdict gel PRUDENCE/i.test(d.ev) || !/aucun phénomène critique prouvé/.test(d.ev))), show(d => d.ev.slice(0, 300)));
  expect('6. alerte gel : PRUDENCE, même mot et même humidité, détail avec le minimum 1,6 °C et l’horizon 24 h', both(d => d.t0 && d.t0.sev === 2 && /^Gel possible \(marge de prudence\) : chaussée estimée 1,6 °C vers 05:00 · chaussée humide$/.test(d.t0.title) && d.t0.detail.includes('Sur les 24 prochaines heures : chaussée estimée min ' + c16 + ' °C vers 05:00')), show(d => d.t0));
  expect('7. cartes voiture : humidité de la même heure (règle), jamais « chaussée sèche » à côté de « humide » pour la même heure ; verdict gel PRUDENCE avec horizon', both(d => d.cards.every(c => c.body && c.body.includes('actuellement, ' + (d.nowHumid === true ? 'chaussée humide' : d.nowHumid === false ? 'chaussée sèche' : 'humidité inconnue') + '.') && /à 04:00, chaussée humide\./.test(c.body) && c.body.includes('Gel possible (marge de prudence) · PRUDENCE · chaussée humide · chaussée estimée min ' + c16 + ' °C vers 05:00 (') && !/Risque de verglas/.test(c.body))), show(d => d.cards.map(c => c.body && c.body.slice(0, 420))));
  expect('8. courbe pneus été : niveau = règle gel à chaque heure de gel (05:00, 06:00 : PRUDENCE), score dans la tranche, jamais au-dessus', both(d => d.curve.filter(h => h.frost >= 1).length >= 2 && d.curve.filter(h => h.frost >= 1).every(h => { const sm = h.cars.find(c => c.type === 'summer'), wi = h.cars.find(c => c.type === 'winter'); return sm.level === h.frost && sm.score >= [80, 60, 40, 0][sm.level] && sm.score <= [100, 79, 59, 39][sm.level] && wi.level <= h.frost; }) && /Gel \(règle\) ?PRUDENCE · gel possible \(marge de prudence\) · chaussée humide/i.test(d.readout)), show(d => ({ curve: d.curve, readout: d.readout.slice(0, 400) })));
  expect('9. carte voiture été : verdict de la fenêtre qui reprend le niveau gel (jamais « RAS » une nuit de gel PRUDENCE) ; hiver jamais au-dessus', both(d => { const sm = d.cards.find(c => c.type === 'summer'), wi = d.cards.find(c => c.type === 'winter'); return sm.level >= 2 && wi.level <= Math.max(2, sm.level) && sm.score <= 59; }), show(d => d.cards.map(c => ({ type: c.type, level: c.level, score: c.score }))));
  // Libellés de verdict gel concurrents (constat du 14/11) ; « Indicateur verglas » reste permis : il est nommé comme tel.
  const banned = /gel de surface probable|risque de verglas|verglas possible|givre possible|INCERTITUDE GEL|surface sous 0 °C — estimation/i;
  const mins = t => [...t.matchAll(/(?<!fenêtre du trajet[^·]{0,80})chaussée estimée min (-?\d+,\d) °C(?! ·? ?\(marge de prudence)/gi)].map(m => m[1]);
  expect('10. vocabulaire et minimum uniques sur Pneus et Météo : aucun « probable » / « verglas possible » / « INCERTITUDE GEL » ; tout minimum de chaussée de la nuit = 1,6 °C', both(d => !banned.test(d.pneusText) && !banned.test(d.meteoText) && [...mins(d.pneusText), ...mins(d.meteoText)].length >= 3 && [...mins(d.pneusText), ...mins(d.meteoText)].every(v => v === c16)), show(d => ({ banned: (d.pneusText.match(banned) || d.meteoText.match(banned) || [''])[0], mins: [...mins(d.pneusText), ...mins(d.meteoText)] })));
  if (errors.length) findings.push('erreurs de page : ' + errors.join(' | ').slice(0, 600));
  console.log(`\n${n}/${N} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
  if (findings.length || n !== N) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('❌ ' + e.stack); if (findings.length) console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); });
