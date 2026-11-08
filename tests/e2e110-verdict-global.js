// Lot V · verdict global unifié et statuts honnêtes (audit du 08/11 sur prod-195). Données FICTIVES uniquement.
// Défauts reproduits sur e0325ba : pour un même trajet 06:30 → 07:10 avec une chaussée estimée à 1,0 °C humide (gel DANGER,
// option A inchangée), le briefing, la synthèse et l'onglet Trajet restaient verts (indice pneus seul), le Garage disait
// « pluie prévue » sans le gel et « voiture active » pour une voiture seulement affichée ; les alertes de profondeur, d'usure
// et de pression affichaient « RAS » sans aucune mesure ; « jusqu'à 01:00 » sans « demain ».
// Attendu : UNE synthèse du risque global (tripRisk) partagée par toutes les surfaces du même trajet, l'indice pneus nommé à
// part ; statuts NON ÉVALUABLE / NON APPLICABLE / ÉVALUÉE ; voiture active seulement si confirmée ; jour nommé après minuit.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
const DAY = '2026-11-16';   // lundi : trajet domicile-travail 06:30 du profil fictif
let n = 0; const findings = [];
const expect = (label, ok, detail) => { if (ok) { n++; console.log('✅ ' + label); } else { findings.push(label + ' · ' + String(detail || '').slice(0, 500)); console.log('❌ ' + label + ' · ' + String(detail || '').slice(0, 500)); } };
// Matin fictif : air 1,0 °C, ciel couvert, pluie faible (chaussée estimée 1,0 °C, humide) de 00:00 à 09:00.
const frostWx = o => { const h = o.hourly; if (!h || !h.time) return o; h.time.forEach((t, i) => { if (t.slice(0, 10) !== DAY || +t.slice(11, 13) > 9) return;
  const set = (k, v) => { if (Array.isArray(h[k])) h[k][i] = v; }; set('temperature_2m', 1.0); set('apparent_temperature', -2); set('cloud_cover', 100); set('wind_speed_10m', 10); set('wind_gusts_10m', 15);
  set('relative_humidity_2m', 96); set('dew_point_2m', 0.4); set('precipitation', 0.3); set('rain', 0.3); set('showers', 0); set('snowfall', 0); set('weather_code', 61); set('visibility', 20000); set('precipitation_probability', 80); set('shortwave_radiation', 0); });
  return o; };
const txt = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ') : ''; }, sel);
const view = async (s, v) => { await s.p.evaluate(v => { UI.view = v; renderAll(); window.scrollTo(0, 0); }, v); await s.settle(5); };
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['pc', 'iphone']) {
      const s = await session(b, { at: DAY + 'T05:30:00+01:00', dev, wx: frostWx }), p = s.p; await s.settle(6);
      // Voiture fictive en pneus hiver, profondeur NON renseignée : indice pneus bas, gel DANGER sur le même trajet.
      await p.evaluate(() => { Object.assign(S.cars[0].tire, { type: 'winter', brand: 'Marque fictive', model: 'Hiver fictif', tread: null, treadAv: null, treadAr: null, treads: [] }); saveSettings(); rebuild(); renderAll(); });
      await s.settle(10);
      const ref = await p.evaluate(() => { const t = APP_CONTEXT.snapshot.nextTrip; if (!t || !t.sum) return null; const s = t.sum, fr = frostRisk(s).level || 0;
        // Oracle indépendant de l'implémentation : pire de l'indice pneus, du gel (option A), du verglas et du brouillard.
        const g = Math.max(t.worst || 0, fr, (s.iceLevel || 0) >= 1 ? Math.min(3, s.iceLevel + 1) : 0, s.visMin != null && s.visMin < 1000 ? (s.visMin < 200 ? 3 : 2) : 0);
        return { dep: t.dep, arr: t.arr, tyre: t.worst, frost: fr, Tr: s.TrMin, global: g }; });
      expect(`${dev} · scénario : trajet 06:30 → 07:10, chaussée 1,0 °C humide = gel DANGER, indice pneus plus bas`, ref && ref.dep.endsWith('06:30') && ref.frost === 3 && ref.Tr === 1 && ref.tyre < 3 && ref.global === 3, JSON.stringify(ref));
      const levels = {};
      // Briefing et synthèse (onglets Pneus et Météo).
      for (const v of ['pneus', 'meteo']) {
        await view(s, v);
        const brf = await p.evaluate(() => { const e = document.querySelector('#secBrf'), g = e && e.querySelector('[data-global-risk]'); return { cls: e && e.className, g: g && g.dataset.globalRisk, gt: g && g.innerText, car: (e.querySelector('.brf-car') || {}).innerText || '' }; });
        expect(`${dev} · ${v} · briefing : couleur et ligne « Risque global du trajet : DANGER »`, /\blv3\b/.test(brf.cls) && brf.g === '3' && /Risque global du trajet : DANGER/.test(brf.gt) && /gel/i.test(brf.gt), JSON.stringify(brf));
        expect(`${dev} · ${v} · briefing : l'indice pneus est présenté à part et nommé`, /Indice pneus/i.test(brf.car), brf.car);
        const dec = await p.evaluate(() => { const e = document.querySelector('#decisionCore .decision-trip-verdict'); return e && { g: e.dataset.globalRisk, cls: e.className, t: e.innerText }; });
        expect(`${dev} · ${v} · synthèse : trajet en DANGER (risque global), indice pneus nommé`, dec && dec.g === '3' && /\blv3\b/.test(dec.cls) && /DANGER · risque global du trajet/.test(dec.t) && /indice pneus/.test(dec.t), JSON.stringify(dec));
        levels[v + '-briefing'] = +brf.g; levels[v + '-synthèse'] = dec ? +dec.g : null;
      }
      // Onglet Trajet.
      await view(s, 'trajet');
      const br = await p.evaluate(() => { const g = document.querySelector('#secBrief [data-global-risk]'); return { g: g && g.dataset.globalRisk, gt: g && g.innerText, lbl: (document.querySelector('#secBrief .verdict-label') || {}).innerText || '' }; });
      expect(`${dev} · Trajet : « Risque global du trajet : DANGER », indice pneus de la voiture affichée nommé`, br.g === '3' && /DANGER/.test(br.gt) && /Indice pneus/.test(br.lbl), JSON.stringify(br));
      levels.trajet = +br.g;
      // Garage.
      await view(s, 'garage');
      const gar = await p.evaluate(() => { const m = document.querySelector('#missionControl'), g = m && m.querySelector('[data-global-risk]'), cap = document.querySelector('.twin-caption');
        return { g: g && g.dataset.globalRisk, gt: g && g.innerText, dep: m ? m.querySelector('.mission-grid > div').innerText.replace(/\s+/g, ' ') : '', watch: (m.querySelector('.mission-watch') || {}).innerText || '', cap: cap ? cap.innerText.replace(/\s+/g, ' ') : '' }; });
      expect(`${dev} · Garage : risque global DANGER, gel nommé au point de départ, jamais « Aucun phénomène signalé »`, gar.g === '3' && /gel possible/.test(gar.dep) && !/Aucun phénomène/.test(gar.dep) && /chaussée 1,0 °C/i.test(gar.watch), JSON.stringify(gar));
      expect(`${dev} · Garage : voiture affichée NON confirmée, jamais « voiture active »`, /affichée, non confirmée pour le trajet/.test(gar.cap) && !/voiture active/.test(gar.cap), gar.cap);
      levels.garage = +gar.g;
      const lv = Object.values(levels);
      expect(`${dev} · même risque global sur toutes les surfaces du trajet (${Object.keys(levels).length})`, lv.every(x => x === 3), JSON.stringify(levels));
      // Alertes : mesures manquantes ⇒ NON ÉVALUABLE ; voiture non concernée ⇒ NON APPLICABLE ; jamais un faux RAS.
      await view(s, 'meteo');
      const al = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#secAlerts .al')].map(a => { const cb = a.querySelector('[data-alert]'), st = a.querySelector('.sev.none');
        return [cb && cb.dataset.alert, st ? st.dataset.alertState + ':' + st.innerText : 'actif']; })));
      const a0 = await al();
      expect(`${dev} · alertes sans mesure : profondeur, usure irrégulière et pression « NON ÉVALUABLE », jamais RAS`, ['tread', 'treadgap', 'press'].every(k => /^unk:NON ÉVALUABLE$/.test(a0[k])), JSON.stringify(a0));
      expect(`${dev} · alertes non concernées (aucune voiture en été) : « NON APPLICABLE »`, /^na:NON APPLICABLE$/.test(a0.t5s) && /^na:NON APPLICABLE$/.test(a0.pre), JSON.stringify({ t5s: a0.t5s, pre: a0.pre }));
      // Mesures renseignées (fictives) : la profondeur et la pression deviennent évaluées ; l'usure par roue reste non évaluable.
      await p.evaluate(today => { Object.assign(S.cars[0].tire, { treadAv: 6.5, treadAr: 6.8, tread: 6.5, treadEst: 0, pchk: { date: today, T: 2 } }); saveSettings(); rebuild(); renderAll(); }, DAY);
      await s.settle(6); const a1 = await al();
      expect(`${dev} · mesures fictives saisies : profondeur et pression évaluées sans alerte (RAS), usure par roue toujours non évaluable`, /^ok:RAS$/.test(a1.tread) && /^ok:RAS$/.test(a1.press) && /^unk:NON ÉVALUABLE$/.test(a1.treadgap), JSON.stringify(a1));
      const off = await p.evaluate(() => { S.alerts.tread = 0; renderAll(); const a = document.querySelector('#secAlerts [data-alert="tread"]').closest('.al'); const st = a.querySelector('.sev.none'); return st && st.dataset.alertState + ':' + st.innerText; });
      expect(`${dev} · alerte désactivée : « OFF », distincte de non évaluable`, off === 'off:OFF', off);
      await p.evaluate(() => { S.alerts.tread = 1; renderAll(); });
      // Confirmation EXPLICITE de la voiture (geste) : seulement alors « voiture active » au Garage.
      await view(s, 'pneus');
      if (await p.locator('#dayContext details.day-editor').getAttribute('open') === null) await p.locator('#dayContext details.day-editor > summary').click();
      await p.locator('#dayContext [data-act="day-car"]').first().click(); await s.settle(4);
      await view(s, 'garage');
      const cap2 = await txt(p, '.twin-caption');
      expect(`${dev} · voiture confirmée par l'utilisateur : « voiture active » au Garage`, /voiture active/.test(cap2) && !/non confirmée/.test(cap2), cap2);
      await s.c.close();
      // Fenêtre traversant minuit : le jour est nommé.
      const nS = await session(b, { at: DAY + 'T22:30:00+01:00', dev }); await nS.settle(6);
      const mid = await nS.p.evaluate(() => ({ k: (document.querySelector('.decision-k') || {}).innerText || '', wx: [...document.querySelectorAll('.wx-scope')].map(e => e.innerText).join(' ') }));
      expect(`${dev} · 22:30 : « jusqu'à demain 01:00 » (synthèse) et fin de fenêtre Météo datée`, /jusqu’à demain 01:00/.test(mid.k) && /jusqu’à demain \d\d:\d\d/.test(mid.wx), JSON.stringify(mid));
      await nS.c.close();
      // Page verrouillée : aperçu générique identifié, y compris la ligne de risque global.
      const L = await session(b, { at: DAY + 'T05:30:00+01:00', dev, unlock: false }); await L.settle(6);
      await L.p.evaluate(() => { UI.view = 'pneus'; renderAll(); }); await L.settle(4);
      const lk = await L.p.evaluate(() => { const g = document.querySelector('#secBrf [data-global-risk]'); return { g: g ? g.innerText : '', brf: (document.querySelector('#secBrf') || {}).innerText || '' }; });
      expect(`${dev} · verrouillée : aperçu générique identifié (briefing et risque global)`, /APERÇU/.test(lk.brf) && (!lk.g || /aperçu générique/.test(lk.g)), JSON.stringify(lk).slice(0, 300));
      await L.c.close();
    }
  } finally { await b.close(); }
  if (errors.length) findings.push('erreurs de page : ' + errors.join(' | ').slice(0, 600));
  console.log(`\n${n} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
  if (findings.length) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('❌ ' + e.message); if (findings.length) console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); });
