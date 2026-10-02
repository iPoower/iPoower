// TYRE WEATHER RACE CONTROL · widget Scriptable (taille moyenne conseillée)
// Données : Open-Meteo (modèle de base + Météo-France AROME). Moteur identique à l'application.
// Pour changer un type de pneus : modifie "type" ci-dessous (summer, winter, allseason, unknown).
const SITE = 'https://ipoower.github.io/iPoower/race-control/';
const CFG = null; // configuration ajoutée par l’app au moment de la copie

const Q_CUR = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
const Q_HR = 'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,pressure_msl,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m,shortwave_radiation';
const Q_AR = 'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,pressure_msl,cloud_cover,wind_speed_10m,wind_gusts_10m,shortwave_radiation';
const API = 'https://api.open-meteo.com/v1/forecast';
const urlBase = l => `${API}?latitude=${l.lat}&longitude=${l.lon}&current=${Q_CUR}&hourly=${Q_HR}&timezone=auto&past_days=1&forecast_days=3`;
const urlArome = l => `${API}?latitude=${l.lat}&longitude=${l.lon}&current=${Q_CUR}&hourly=${Q_AR}&models=meteofrance_seamless&timezone=auto&past_days=1&forecast_days=3`;

async function getText(u) { const r = new Request(u); r.timeoutInterval = 20; return await r.loadString(); }
async function getJSON(u) { const r = new Request(u); r.timeoutInterval = 20; return await r.loadJSON(); }
async function model(E, loc) {
  const base = await getJSON(urlBase(loc));
  let ar = null; try { ar = await getJSON(urlArome(loc)); } catch (e) { ar = null; }
  return E.makeModel(E.mergeArome(base, ar), 'live', loc);
}
const COL = { bg: new Color('#080c11'), fg: new Color('#e9eff6'), mute: new Color('#9aa9bb'), acc: new Color('#62c7f0'),
  lv: [new Color('#2fcf7a'), new Color('#f2c230'), new Color('#ff8c2b'), new Color('#ff4a4a')] };

async function build() {
  const w = new ListWidget(); w.backgroundColor = COL.bg; w.url = SITE; w.setPadding(12, 14, 12, 14);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  try {
    const src = await getText(SITE + 'engine.js');
    const E = new Function(src + '; return { makeModel, mergeArome, seqOf, summarize, windowAssess, LV, ICE_LV, TYPE_LABEL, f1, f0, addMin, toMin };')();
    const [mA, mB] = await Promise.all([model(E, CFG.home), model(E, CFG.work)]);
    const now = mA.nowStr, x = mA.hs[mA.nowI];
    // départ : prochain horaire du matin
    const today = now.slice(0, 10), off = E.toMin(CFG.dep) > E.toMin(now.slice(11, 16)) ? 0 : 1;
    const dep = E.addMin(today + 'T00:00', off * 1440 + E.toMin(CFG.dep)), arr = E.addMin(dep, CFG.durMin);
    const seq = []; for (let t = dep.slice(0, 13) + ':00'; t <= arr.slice(0, 13) + ':00'; t = E.addMin(t, 60)) {
      const a = mA.byTime.get(t), b = mB.byTime.get(t); if (a != null) seq.push({ hs: mA.hs, i: a }); if (b != null) seq.push({ hs: mB.hs, i: b }); }
    const sum = E.summarize(seq);
    const h = w.addStack(); h.centerAlignContent();
    const t1 = h.addText('RACE CONTROL'); t1.font = Font.heavySystemFont(12); t1.textColor = COL.acc;
    h.addSpacer();
    const t2 = h.addText(`${E.f1(x.T)} °C · chaussée ${E.f1(x.Tr)} °C`); t2.font = Font.mediumMonospacedSystemFont(11); t2.textColor = COL.fg;
    w.addSpacer(4);
    const sub = w.addText(`Départ ${dep.slice(11, 16)} ${off ? 'demain' : 'aujourd’hui'} · min ${E.f1(sum.Tmin)} °C · verglas ${E.ICE_LV[sum.iceLevel || 0].toLowerCase()}${sum.visMin != null && sum.visMin < 1000 ? ' · brouillard ' + E.f0(sum.visMin) + ' m' : ''}`);
    sub.font = Font.systemFont(11); sub.textColor = COL.mute; sub.lineLimit = 2;
    w.addSpacer(6);
    CFG.cars.forEach(car => {
      if (car.tire.type === 'none') { const r = w.addStack(); r.spacing = 8; const d = r.addText('◌'); d.font = Font.boldSystemFont(16); d.textColor = COL.mute;
        const n = r.addText(`${car.short} · en attente de pneus`); n.font = Font.semiboldSystemFont(13); n.textColor = COL.mute; w.addSpacer(3); return; }
      const wa = E.windowAssess(car, seq, 'trip'); if (!wa) return;
      const r = w.addStack(); r.centerAlignContent(); r.spacing = 8;
      const dot = r.addText('●'); dot.font = Font.boldSystemFont(16); dot.textColor = COL.lv[wa.level];
      const nm = r.addText(`${car.short} · ${E.TYPE_LABEL[car.tire.type]}`); nm.font = Font.semiboldSystemFont(13); nm.textColor = COL.fg; nm.lineLimit = 1;
      r.addSpacer();
      const sc = r.addText(`${E.LV[wa.level].name} ${wa.score}`); sc.font = Font.heavyMonospacedSystemFont(13); sc.textColor = COL.lv[wa.level];
      w.addSpacer(3);
    });
    w.addSpacer();
    const f = w.addText(`MAJ ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · Open-Meteo / AROME · indice d’aide à la décision`);
    f.font = Font.systemFont(9); f.textColor = COL.mute;
  } catch (e) {
    const t = w.addText('Météo indisponible'); t.font = Font.boldSystemFont(14); t.textColor = COL.fg;
    const d = w.addText(String(e && e.message || e)); d.font = Font.systemFont(10); d.textColor = COL.mute;
  }
  return w;
}
const widget = await build();
if (config.runsInWidget) Script.setWidget(widget); else await widget.presentMedium();
Script.complete();
