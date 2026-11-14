// Mission « Cohérence gel et trajet », PR 3 (constat en production du 14/11/2026) : affichage et données sans risque.
// B1 « Prévu · … · NON MONTÉ » après la monte enregistrée · B2 relevés antérieurs au montage sous la monte actuelle (conservés)
// · B3 Garage : point 3/4 absent, point 2/4 « arrivée à 06:00 » · B4 deux ressentis à la même heure · B5 formats français,
// « #direct » dans les titres, mots collés, doublon dans « Départ depuis ». Profil et agenda FICTIFS. Dix contrôles, PC ET iPhone.
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { seal, tryUnseal } = require('../tools/keys.js');
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SRC = process.env.SP, SP = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e123-'));
fs.cpSync(SRC, SP, { recursive: true });
const base = tryUnseal(JSON.parse(fs.readFileSync(path.join(SRC, 'cal.fake.json'), 'utf8')), PW.toLowerCase());
fs.writeFileSync(path.join(SP, 'cal.fake.json'), JSON.stringify(seal({ ...base, events: base.events.map(e => !e.allDay && e.lat != null ? { ...e, t: e.t + ' #direct' } : e) }, PW.toLowerCase())));
process.env.SP = SP;
const { session, BR, errors } = require('./lib/context-session');
const N = 10; let n = 0; const findings = [];
const expect = (label, ok, detail) => { if (ok) { n++; console.log('✅ ' + label); } else { findings.push(label + ' · ' + String(detail || '').slice(0, 600)); console.log('❌ ' + label + ' · ' + String(detail || '').slice(0, 600)); } };
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
function setup() {
  const A = S.cars[0], B = S.cars[1];
  Object.assign(A.tire, { type: 'summer', brand: 'Marque A', model: 'Modèle A', size: '205/55 R16 91V', tread: 5.5, treadAv: 5.5, treadAr: 5.5, dot: '1224', press: '2.4', pchk: { date: '2026-10-01', T: 12 } });
  // Voiture B (fictive) : monte hiver enregistrée le 28/09 par les réglages, projet hiver resté actif, relevés d'été conservés.
  Object.assign(B.tire, { type: 'winter', brand: 'Goodyear', model: 'UltraGrip Performance 3', size: '225/45 R17 94W', mounted: '2026-09-28', mountKm: 49100, dot: '3825', press: '2,4 AV / 2,2 AR',
    tread: 7.8, treadAv: 7.8, treadAr: 7.8, treadEst: 0, treads: [{ d: '2026-06-01', mm: 6.4, km: 41000, ax: 'av' }, { d: '2026-08-20', mm: 5.1, km: 47000, ax: 'av' }, { d: '2026-09-28', mm: 7.8, km: 49100, ax: 'av' }, { d: '2026-09-28', mm: 7.8, km: 49100, ax: 'ar' }] });
  B.plan = { on: 1, brand: 'Goodyear', model: 'UltraGrip Performance 3', size: '225/45 R17 94W', date: '2026-09-28' };
  B.odo = [{ d: '2026-06-01', km: 41000 }, { d: '2026-09-28', km: 49100 }];
  S.customs = (S.customs || []).concat([{ id: 'c-homonyme', name: 'Ville proche', lat: 48.86, lon: 2.36 }]);
  S.flags = S.flags || {}; S.flags.f1TyreManagement = 1;
  saveSettings(); appSetCar(B.id); rebuild(); renderAll();
}
async function grab(b, dev) {
  const s = await session(b, { at: '2026-10-02T18:00:00+02:00', dev }), p = s.p; await s.settle(4);
  await p.evaluate(setup); await s.settle(8);
  const d = {};
  await p.evaluate(() => { UI.view = 'pneus'; renderAll(); document.querySelectorAll('details').forEach(x => { x.open = true; }); }); await s.settle(4);
  d.ti = await p.evaluate(() => ({ planned: document.querySelectorAll('.ti-planned').length, readings: [...document.querySelectorAll('[data-k="ti-readings"]')].map(e => e.innerText.replace(/\s+/g, ' ')),
    before: [...document.querySelectorAll('.ti-before-mount')].map(e => e.innerText), treads: S.cars[1].tire.treads.length, text: document.body.innerText }));
  d.cal = await p.evaluate(() => [...document.querySelectorAll('#secCal .cal-t')].map(e => e.textContent));
  d.sources = norm(await p.evaluate(() => { const e = document.querySelector('#hdrMore'); return e ? e.textContent : ''; }));
  // B4 : station de mesure active (le modèle recale l'heure en cours) ; ressenti de l'API instantanée différent de l'heure.
  d.feel = await p.evaluate(() => { const m = CX.m; m.obs = { id: 'st-test', name: 'Station test', t: m.hs[m.nowI].t, T: m.hs[m.nowI].T };
    m.cur.Tapp = -1.0; m.hs[m.nowI].Tapp = -0.8; UI.view = 'meteo'; renderWx.last = ''; renderAll();
    const head = document.querySelector('.wx-now-feel'), cur = document.querySelector('#secCur .cond .sub');
    return { head: head ? head.textContent : '', cur: cur ? cur.textContent : '' }; });
  // B5 : position GPS qui porte le nom d'un lieu enregistré (situation du constat), état simulé ; puis boutons « Départ depuis ».
  d.depart = await p.evaluate(() => { UI.view = 'pneus'; const keep = CX && CX.m; GPS = { id: 'gps', gps: true, lat: 48.8601, lon: 2.3601, acc: 20, t: Date.now(), name: 'Ville proche', sub: '' }; if (keep && !M.gps) M.gps = keep;   // état simulé : météo déjà chargée au point GPS
    let err = null; try { renderAll(); } catch (e) { err = String(e && e.message); } try { renderBrief(); } catch (e) { err = err || String(e && e.message); }
    const b = [...document.querySelectorAll('[data-act="from"]')].map(x => x.textContent.trim()); return err ? b.concat(['ERREUR ' + err]) : b; });
  await p.evaluate(() => { UI.view = 'garage'; renderAll(); document.querySelectorAll('#secGarage details').forEach(x => { x.open = true; }); }); await s.settle(6);
  d.garage = await p.evaluate(() => ({ points: [...document.querySelectorAll('#secGarage .twin-samples li')].map(li => ({ role: li.dataset.role, prudence: !!li.dataset.prudence, text: li.innerText.replace(/\s+/g, ' ') })),
    joins: [...document.querySelectorAll('#secGarage .garage-economics > summary, #secGarage .rc-inbox > summary, #secGarage .mission-watch')].map(e => e.textContent.replace(/\s+/g, ' ')) }));
  await s.c.close();
  return d;
}
(async () => {
  const b = await BR.launch(), D = {};
  try { for (const dev of ['pc', 'iphone']) D[dev] = await grab(b, dev); } finally { await b.close(); }
  const both = f => ['pc', 'iphone'].every(dev => f(D[dev])), show = f => JSON.stringify({ pc: f(D.pc), iphone: f(D.iphone) });
  expect('1. B1 · monte hiver enregistrée : plus de « Prévu · … · NON MONTÉ »', both(d => d.ti.planned === 0 && !/NON MONTÉ/.test(d.ti.text)), show(d => d.ti.planned));
  expect('2. B2 · relevés de la monte actuelle seulement (2), les 2 antérieurs signalés comme conservés', both(d => d.ti.readings.length >= 1 && d.ti.readings.every(r => /Relevés individuels · 2/.test(r) && !/01\/06\/2026|20\/08\/2026/.test(r)) && d.ti.before.some(t => /2 relevés antérieurs au montage du 28\/09\/2026 : conservés dans l’historique/.test(t))), show(d => ({ r: d.ti.readings.map(x => x.slice(0, 200)), b: d.ti.before })));
  expect('3. B2 · aucune suppression : les 4 relevés restent dans les données', both(d => d.ti.treads === 4), show(d => d.ti.treads));
  // Trajet du profil fictif : 5 points (départ, 3 passages, arrivée) ; le cas domicile-travail à 4 points est couvert par test_display_safe.
  expect('4. B3 · Garage : TOUS les points du trajet affichés, sans trou (avant : premier, milieu et dernier seulement)', both(d => d.garage.points.length >= 4 && d.garage.points.every((x, i) => x.text.includes('POINT ' + (i + 1) + ' / ' + d.garage.points.length + ' '))), show(d => d.garage.points.map(x => x.text.slice(0, 50))));
  expect('5. B3 · Garage : chaque point porte son lieu et son rôle ; le lieu d’arrivée à l’heure du départ est une « lecture de prudence »', both(d => d.garage.points.every(x => /DÉPART|ARRIVÉE|PASSAGE/.test(x.text)) && d.garage.points.filter(x => x.prudence).every(x => /MÉTÉO DE \d\d:\d\d/.test(x.text) && /lecture de prudence/.test(x.text)) && d.garage.points.filter(x => !x.prudence).every(x => !/lecture de prudence/.test(x.text))), show(d => d.garage.points));
  expect('6. B4 · un seul ressenti à la même heure : en-tête = Météo actuelle (−0,8 °C)', both(d => /−?-?0,8 °C/.test(d.feel.head) && /Ressentie −?-?0,8 °C/.test(d.feel.cur)), show(d => d.feel));
  expect('7. B5 · virgule décimale et espace des milliers : « 2,4 bar », « 49 100 km », jamais « 2.4 bar » ni « 49100 km »', both(d => /2,4 bar/.test(d.ti.text) && !/\d\.\d\s?(bar|mm|°C)/.test(d.ti.text) && !/\d{5,} ?km/.test(d.ti.text)), show(d => [(d.ti.text.match(/.{0,30}\d\.\d\s?(bar|mm|°C).{0,10}/) || [''])[0], (d.ti.text.match(/.{0,30}\d{5,} ?km/) || [''])[0], (d.ti.text.match(/.{30}2,4 bar/) || [''])[0]]));
  expect('8. B5 · Sources : aucun horodatage ISO brut', both(d => d.sources.length > 50 && !/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(d.sources)), show(d => (d.sources.match(/.{30}\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}.{10}/) || ['—'])[0]));
  expect('9. B5 · titres de trajet sans « #direct » ; « Départ depuis » sans libellé en double (position GPS homonyme nommée)', both(d => d.cal.length > 0 && d.cal.every(t => !/#direct/.test(t)) && d.depart.length >= 2 && new Set(d.depart).size === d.depart.length && d.depart.includes('📍 Ma position (GPS)')), show(d => ({ cal: d.cal.slice(0, 3), depart: d.depart })));
  expect('10. B5 · Garage : blocs voisins séparés à la lecture (« rentabilité · Budget », « Claude · Pleins », « VIGILANCE PRINCIPALE · … · … »)', both(d => d.garage.joins.length >= 2 && d.garage.joins.every(t => !/rentabilitéBudget|ClaudePleins|[a-zé]\.[A-Z][a-z]/.test(t)) && d.garage.joins.some(t => /rentabilité · Budget/.test(t)) && d.garage.joins.some(t => /Claude · Pleins/.test(t))), show(d => d.garage.joins.map(t => t.slice(0, 120))));
  if (errors.length) findings.push('erreurs de page : ' + errors.join(' | ').slice(0, 600));
  console.log(`\n${n}/${N} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
  if (findings.length || n !== N) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('❌ ' + e.stack); if (findings.length) console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); });
