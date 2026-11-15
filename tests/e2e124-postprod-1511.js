// PR 4 « post-prod 15/11 » (vidéo en production du 15/11/2026, prod-210) : P1 verdict « ici, maintenant » de la voiture choisie,
// l'autre voiture nommée à part · P2 Ingénieur de course = risque global du trajet · P3 tuile gel = règle unique · P5 modèles en
// désaccord ⇒ VIGILANCE · P6 précipitation observée à la station, jamais présentée comme locale · P7 aucun « dem. demain »
// · intégrité des données persistantes. Profil, voitures, lieux et station FICTIFS. Dix contrôles, PC ET iPhone.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
const fx = require('./fixtures/postprod-1511');
const N = 10; let n = 0; const findings = [];
const expect = (label, ok, detail) => { if (ok) { n++; console.log('✅ ' + label); } else { findings.push(label + ' · ' + String(detail || '').slice(0, 600)); console.log('❌ ' + label + ' · ' + String(detail || '').slice(0, 600)); } };
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
async function grab(b, dev) {
  const s = await session(b, { at: '2026-11-15T07:18:00+01:00', dev, wx: fx.wx() }), p = s.p; await s.settle(4);
  await p.evaluate(fx.setup); await s.settle(8);
  const text = sel => p.evaluate(sel => [...document.querySelectorAll(sel)].map(e => e.innerText).join(' ¦ '), sel).then(norm);
  // Contenu complet (blocs repliés compris : « Prévisions détaillées » est fermé par défaut).
  // Texte de la page sans le code (le fichier unique embarque ses scripts, dont les commentaires citent les anciens libellés).
  const pageText = () => p.evaluate(() => { const c = document.body.cloneNode(true); c.querySelectorAll('script, style, template').forEach(x => x.remove()); return c.textContent; }).then(norm);
  const full = sel => p.evaluate(sel => [...document.querySelectorAll(sel)].map(e => e.textContent).join(' ¦ '), sel).then(norm);
  const persisted = () => p.evaluate(() => { const ls = {}; for (const k of ['twrc.debrief.archive.v1', 'twrc.context.v1', 'twrc.debrief.v1']) ls[k] = localStorage.getItem(k);
    return JSON.stringify({ ls, journal: S.journal || null, cars: S.cars.map(c => ({ tire: c.tire, odo: c.odo || null, plan: c.plan || null })) }); });
  const d = {}; d.before = await persisted();
  d.cars = await p.evaluate(() => S.cars.map(c => c.short || c.name || c.id));
  await p.evaluate(() => { UI.view = 'pneus'; renderAll(); }); await s.settle(6);
  d.core = await text('#decisionCore'); d.coreH = await text('#decisionCore h2'); d.other = await text('#decisionCore [data-other-car]');
  d.banOther = await text('#banners [data-other-car]'); d.banAll = await text('#banners .note');
  d.eng = await text('#f1-panel-raceEngineer');
  d.risk = await p.evaluate(() => { const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip, r = t && tripRisk(t); return r && { lv: r.lv, k: r.k, why: r.why, indet: r.indet, name: riskName(r), dep: t.dep }; });
  await p.evaluate(() => { UI.view = 'meteo'; renderAll(); document.querySelectorAll('.wx-pc').forEach(x => { x.open = true; }); }); await s.settle(6);
  d.trackLv = await p.evaluate(() => { const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip, x = t && F1Pure.trackConditions(t.seq); return x && x.available ? Math.max(...x.sectors.map(s => s.level)) : null; });
  d.crit = await p.evaluate(() => [...document.querySelectorAll('.wx-crit')].map(e => ({ cls: e.className, t: e.innerText.replace(/\s+/g, ' ') })));
  d.ice = await full('.wx-pc[data-k="ice"]');
  d.tl = await p.evaluate(() => [...document.querySelectorAll('.wx-tl time')].map(e => e.textContent));
  d.page = await pageText();
  // P6 : observation fictive de la station (en mémoire), puis lecture du héros Météo, de la tuile Pluie et de l'alerte de pluie imminente.
  d.obsOk = await p.evaluate(fx.injectObs);
  d.rain = await full('.wx-pc[data-k="rain"]');
  d.rain15 = await p.evaluate(() => { const a = CX && CX.alertsNow && CX.alertsNow.rain15; return a ? { sev: a.sev, title: a.title, obs: !!a.obs } : null; });
  d.page2 = await pageText();
  d.after = await persisted();   // intégrité : relevé AVANT la seule action du test (changement de voiture, ci-dessous)
  // P1 (contrôle inverse) : la voiture été choisie garde SON risque (aucun masquage), sans ligne « Si tu prends » pour la voiture hiver.
  await p.evaluate(() => { appSetCar(S.cars[0].id); UI.view = 'pneus'; renderAll(); }); await s.settle(6);
  d.summerH = await text('#decisionCore h2'); d.summerCore = await text('#decisionCore'); d.summerOther = await text('#decisionCore [data-other-car]');
  await s.c.close();
  return d;
}
(async () => {
  const b = await BR.launch(), D = {};
  try { for (const dev of ['pc', 'iphone']) D[dev] = await grab(b, dev); } finally { await b.close(); }
  const both = f => ['pc', 'iphone'].every(dev => f(D[dev])), show = f => JSON.stringify({ pc: f(D.pc), iphone: f(D.iphone) });
  expect('1. P1 · voiture hiver choisie : le verdict « ici, maintenant » ne reprend plus « PRUDENCE · … avec pneus été »', both(d => !/PRUDENCE|DANGER/.test(d.coreH) && !/avec pneus été/.test(d.core.replace(d.other, ''))), show(d => ({ h: d.coreH, core: d.core.slice(0, 300) })));
  expect('2. P1 · l’autre voiture reste nommée : « Si tu prends la <voiture été> : PRUDENCE · 4,0 °C avec pneus été »', both(d => new RegExp('^Si tu prends (la |l’)' + d.cars[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' : PRUDENCE · 4,0 °C avec pneus été').test(d.other)), show(d => d.other));
  expect('3. P1 · bandeaux : l’alerte pneus été est rattachée à l’autre voiture, jamais présentée seule', both(d => /Si tu prends/.test(d.banOther) && !d.banAll.split(' ¦ ').some(x => /avec pneus été/.test(x) && !/Si tu prends/.test(x))), show(d => d.banAll));
  expect('4. P1 · contrôle inverse : la voiture été choisie garde sa PRUDENCE (risque applicable jamais masqué)', both(d => /PRUDENCE/.test(d.summerH) && /avec pneus été/.test(d.summerCore) && !d.summerOther), show(d => ({ h: d.summerH, other: d.summerOther })));
  expect('5. P5 · trajet de lundi : modèles en désaccord (base 2,3 mm/h, AROME 0,0 mm/h) ⇒ risque global VIGILANCE, valeurs citées', both(d => d.risk && d.risk.lv === 1 && d.risk.k === 'rain' && /modèles en désaccord \(base 2,3 mm\/h, AROME 0,0 mm\/h\)/.test(d.risk.why) && /VIGILANCE · risque global du trajet/.test(d.core)), show(d => ({ risk: d.risk })));
  expect('6. P5 · État de la route = risque global (même fenêtre) ; carte Météo du trajet 🟡 « modèles en désaccord », plus en vert', both(d => d.trackLv === d.risk.lv && d.crit.some(c => /\blv1\b/.test(c.cls) && /modèles en désaccord/.test(c.t)) && !d.crit.some(c => /\blv0\b/.test(c.cls) && /Pluie possible/.test(c.t))), show(d => ({ track: d.trackLv, crit: d.crit })));
  expect('7. P2 · Ingénieur de course : verdict du trajet (même nom que le risque global) et portée écrite', both(d => d.eng.includes('Verdict : risque global du trajet') && d.eng.includes(d.risk.name) && !/PRUDENCE/.test(d.eng.split('Verdict')[0])), show(d => ({ eng: d.eng.slice(0, 260), risk: d.risk && d.risk.name })));
  expect('8. P3 · tuile Gel · verglas : verdict de la règle (« Pas de gel attendu (marge faible) » ou « Aucun risque de gel »), jamais « Aucun risque estimé »', both(d => /Pas de gel attendu \(marge faible\)|Aucun risque de gel/.test(d.ice) && !/Aucun risque estimé/.test(d.page)), show(d => d.ice.slice(0, 200)));
  expect('9. P6 · bruine à la station : en tête, « mesure de la station, pas au lieu consulté » ; alerte de pluie imminente VIGILANCE (observée), plus « RAS »', both(d => d.obsOk && /Observation à la station Station test \(6 km, 07:00\) : faible bruine · mesure de la station, pas au lieu consulté/.test(d.page2) && /Observation à la station Station test .* · prévision : /.test(d.rain) && d.rain15 && d.rain15.sev === 1 && d.rain15.obs), show(d => ({ obs: (d.page2.match(/.{0,40}Observation à la station.{0,120}/g) || []).slice(0, 3), rain: d.rain.slice(0, 200), rain15: d.rain15 })));
  // Intégrité mesurée entre la mise en place du profil et la seule action du test (changement de voiture du contrôle inverse).
  expect('10. P7 · aucun « dem. demain » ; chronologie datée « demain HH:MM » · intégrité : voitures, journal, débriefs et contexte identiques', both(d => !/dem\. demain/.test(d.page + d.page2) && d.tl.some(t => /^demain \d\d:\d\d$/.test(t)) && d.before === d.after && d.before.length > 50), show(d => ({ tl: d.tl.slice(0, 8), same: d.before === d.after, diff: d.before === d.after ? null : [d.before.slice(0, 300), d.after.slice(0, 300)] })));
  if (errors.length) findings.push('erreurs de page : ' + errors.join(' | ').slice(0, 600));
  console.log(`\n${n}/${N} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
  if (findings.length || n !== N) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('❌ ' + e.stack); if (findings.length) console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); });
