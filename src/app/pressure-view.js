// Pression prédictive · rendu (28/11/2026). Le calcul vit dans PressureForecast (pur) ; ici, les entrées (cible plaque,
// dernier contrôle, prévision horaire du lieu affiché) et deux rendus : Analyse (3 pressions, fiabilité, courbe, 7 jours) et
// une ligne avant le départ, seulement quand une vraie mesure prédit une pression sous la cible.
function pressForecastFor(car) {
  if (!car || !car.tire) return null;
  const m = M[UI.loc]; if (!m || !Array.isArray(m.hs)) return { known: false, reason: 'Météo indisponible : aucune projection de pression.' };
  return PressureForecast.project({ pressText: car.tire.press, pchk: car.tire.pchk, hours: m.hs, nowStr: m.nowStr, nowT: curTemp(m), days: 7, pressLoss });
}
const pressBar = v => v == null ? '—' : String((Math.round(v * 100) / 100).toFixed(2)).replace('.', ',');
const pressPair = (o, approx) => {
  if (!o) return '—';
  const p = approx ? '≈ ' : '';
  return o.av != null && o.ar != null && Math.abs(o.av - o.ar) >= 0.05 ? `${p}AV ${pressBar(o.av)} · AR ${pressBar(o.ar)} bar` : `${p}${pressBar(o.av != null ? o.av : o.ar)} bar`;
};
// cellule du tableau : un essieu par ligne quand AV et AR diffèrent (lisible à 320 px de large)
const pressCell = o => o.av != null && o.ar != null && Math.abs(o.av - o.ar) >= 0.05 ? `AV ≈ ${pressBar(o.av)}<br>AR ≈ ${pressBar(o.ar)}` : `≈ ${pressBar(o.av != null ? o.av : o.ar)}`;
const pressHour = t => t ? fmtDay(t.slice(0, 10)) + ' vers ' + t.slice(11, 16) : '';
const pressT = v => (v < 0 ? '−' : '') + f1(Math.abs(v)) + ' °C';
const PRESS_EMO = ['🟢', '🟡', '🟠'];
function pressChart(f) {
  const s = f.series; if (s.length < 2) return '';
  const vals = s.flatMap(x => [x.av, x.ar]).filter(Number.isFinite), tg = f.target ? [f.target.av, f.target.ar] : [];
  const lo = Math.min(...vals, ...tg) - 0.05, hi = Math.max(...vals, ...tg) + 0.05, W = 360, H = 150, X0 = 34, X1 = 352, Y0 = 12, Y1 = 122;
  const x = i => X0 + i * (X1 - X0) / (s.length - 1), y = v => Y1 - (v - lo) / (hi - lo || 1) * (Y1 - Y0);
  const line = k => s.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p[k]).toFixed(1)).join(' ');
  const split = s.some(p => p.av != null && p.ar != null && Math.abs(p.av - p.ar) >= 0.05);
  const axes = ['av', 'ar'].filter(k => s.every(p => p[k] != null)).slice(0, split ? 2 : 1);
  const tgtLines = f.target ? [...new Set([f.target.av, f.target.ar])].map(v => `<line x1="${X0}" x2="${X1}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="press-tgt"/><text x="2" y="${(y(v) + 3).toFixed(1)}">${pressBar(v)}</text>`).join('') : '';
  const ticks = s.map((p, i) => p.t.slice(11, 13) === '00' ? `<line x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${Y0}" y2="${Y1}" class="press-day"/><text x="${(x(i) + 2).toFixed(1)}" y="${H - 14}">${esc(fmtDay(p.t.slice(0, 10)).slice(0, 3))}</text>` : '').join('');
  const w = f.worst, wi = w ? s.findIndex(p => p.t === w.t) : -1, wk = axes[axes.length - 1];
  const dot = wi >= 0 ? `<circle cx="${x(wi).toFixed(1)}" cy="${y(s[wi][wk]).toFixed(1)}" r="3.5" class="press-min"/>` : '';
  return `<figure class="press-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe de pression prédite sur ${f.days.length} jours, cible plaque en pointillés ; valeurs par jour dans le tableau ci-dessous">${tgtLines}${ticks}${axes.map(k => `<path d="${line(k)}" class="press-line press-${k}"/>`).join('')}${dot}</svg>
    <figcaption class="sub">${axes.length > 1 ? 'Trait plein : avant · trait clair : arrière · ' : ''}pointillés : cible plaque · point : moment le plus froid. Prévision horaire du lieu affiché.</figcaption></figure>`;
}
function pressForecastHtml(car) {
  const f = pressForecastFor(car); if (!f) return '';
  const name = esc(car.short || car.name), ms = f.measured, tg = f.target, rel = f.reliability || {};
  const quick = `<button type="button" class="btn sm" data-act="garage-quick" data-car="${esc(car.id)}" data-garage-target="pressure">Saisir une mesure</button>`;
  const cards = `<div class="press-refs">
    <div class="press-ref" data-press="target"><span>Cible plaque</span><b>${tg ? pressPair(tg) : 'non renseignée'}</b><small>${tg ? 'saisie par toi · à froid · plaque de portière' : 'Réglages → voiture'}</small></div>
    <div class="press-ref" data-press="measured"><span>Dernière mesure</span><b>${ms ? pressPair(ms) : 'aucune'}</b><small>${ms ? esc(fmtDay(ms.date)) + (ms.T != null ? ' · contrôle à ' + pressT(ms.T) : ' · température non renseignée') : 'au manomètre, pneus froids'}</small></div>
    <div class="press-ref est" data-press="predicted"><span>Prédite au plus froid</span><b>${f.known && f.worst ? pressPair(f.worst, true) : '—'}</b><small>${f.known && f.worst ? esc(pressHour(f.worst.t)) + ' · ' + pressT(f.worst.T) : esc(f.reason || '')}</small></div></div>`;
  const relLine = `<p class="press-rel r${rel.lv != null ? rel.lv : 0}" data-press-rel="${esc(rel.level || '')}"><b>${esc(rel.label || 'Fiabilité inconnue')}</b> · ${esc(rel.why || '')}${f.known && f.base === 'simulation' ? ' Base supposée : gonflé à la cible à ' + pressT(f.T0) + ' maintenant.' : ''}</p>`;
  let body = cards + relLine;
  if (f.known) {
    const rows = f.days.map(d => `<tr data-day="${esc(d.date)}"${d.far ? ' class="far"' : ''}><th scope="row">${esc(d.i === 0 ? 'Aujourd’hui' : fmtDay(d.date))}</th><td class="num">${pressT(d.min.T)} <small>${esc(d.min.t.slice(11, 16))}</small></td><td class="num press-v">${pressCell(d.min)}</td><td aria-label="${['conforme', 'légèrement sous la cible', 'sous la cible'][d.lv]}">${PRESS_EMO[d.lv]}</td></tr>`).join('');
    body += pressChart(f) + `<table class="press-days"><caption class="sub">Au moment le plus froid de chaque jour${f.days.some(d => d.far) ? ' · en gris : au-delà de 3 jours, prévision moins sûre' : ''}</caption><thead><tr><th scope="col">Jour</th><th scope="col">Plus froid</th><th scope="col">Pression (bar)</th><th scope="col"><span class="sr-only">État</span></th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  body += `<p class="sub press-legal">Estimation Race Control par la loi des gaz (pression absolue, Kelvin) : elle ne remplace jamais ton manomètre ni la plaque constructeur. 🟡 de 0,1 à 0,2 bar sous la cible (précision d’un manomètre), 🟠 au-delà. Pneus chauds : ne dégonfle jamais.</p>${quick}`;
  const note = f.known && f.worst ? `${pressPair(f.worst, true)} · ${pressHour(f.worst.t)} · ${(rel.label || '').toLowerCase()}` : (f.reason || 'aucune projection');
  return `<section class="press-fc" data-press-car="${esc(car.id)}" aria-label="Pression prédictive de ${name}">${uxFold('lab-press', '🎈 Pression prédictive · 7 jours', body, note)}</section>`;
}
// Avant le départ : seulement depuis une vraie mesure (jamais une simulation théorique) et sous la cible à l'heure du départ.
function pressDepartLine(car, dep) {
  const f = pressForecastFor(car); if (!f || !f.known || f.base !== 'mesure' || !dep) return '';
  const h = f.series.find(x => x.t === String(dep).slice(0, 13) + ':00'), p = h ? f.at(h.T) : null;
  if (!p || p.lv < 1) return '';
  return `<div class="press-dep lv${p.lv}" data-press-dep="${p.lv}"><b>🎈 Départ ${esc(String(dep).slice(11, 16))} : ${pressPair(p, true)} prévus à ${pressT(h.T)}</b><small>Cible plaque ${pressPair(f.target)} · mesure du ${esc(fmtDay(f.measured.date))} à ${pressT(f.measured.T)}. Recontrôle à froid avant de partir.</small>
    <button type="button" class="btn sm" data-act="garage-quick" data-car="${esc(car.id)}" data-garage-target="pressure">Saisir une mesure</button></div>`;
}
