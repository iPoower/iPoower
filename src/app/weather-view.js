/* ---------- onglet Météo : poste météo (verdict, prochain trajet, chronologie, ce qui compte, phénomènes, route) ---------- */
// Toute la décision vient de wxDesk (src/wxdesk.js, pur et testé) ; ici, seulement l'adaptation des données déjà chargées et le rendu.
// Trajets : ceux du briefing (domicile-travail + rendez-vous de l'agenda reconnus comme trajets), jamais tous les événements de l'agenda.
const WX_IC = { rain: '🌧', snow: '🌨', fog: '🌫', wind: '💨', ice: '❄️', temp: '🌡', sun: '🌅', better: '🌤', zero: '🧊', dep: '🚗', arr: '🏁' };
// Présentation de la seule valeur actuelle ; aucun lien avec les niveaux d'alerte.
function wxCurrentTemperatureTone(temperature) {
  if (temperature <= 0) return 'cold';
  if (temperature < 8) return 'chilly';
  if (temperature < 15) return 'cool';
  if (temperature < 20) return 'mild';
  if (temperature < 25) return 'warm';
  if (temperature < 30) return 'warmer';
  if (temperature < 35) return 'hot';
  return 'hottest';
}
// Les heures des prévisions ne sont pas des heures de passage. Pour les trajets
// sans points datés (domicile-travail), répartir les échantillons entre départ
// et arrivée : progression estimée, mêmes données météo, aucun kilomètre mesuré.
function tripPassagePoints(t) {
  const seq = t.seq || [], last = seq.length - 1;
  const duration = (tsToDate(t.arr || t.dep) - tsToDate(t.dep)) / 60e3;
  return seq.map((q, j) => {
    const x = q && q.hs && q.hs[q.i]; if (!x) return null;
    const f = q.f != null ? q.f : last > 0 ? j / last : 0;
    const at = q.t || (Number.isFinite(duration) && duration >= 0 ? addMin(t.dep, duration * f) : null);
    if (!at) return null;
    const located = Number.isFinite(q.lat) && Number.isFinite(q.lon) && Math.abs(q.lat) <= 90 && Math.abs(q.lon) <= 180;
    return { t: at, f, km: q.km != null ? q.km : null, name: q.name || q.loc || null, x, hs: q.hs,
      lat: located ? q.lat : null, lon: located ? q.lon : null };
  }).filter(Boolean);
}
function wxTrips(clockModel) {
  const offSec = clockModel && clockModel.payload && clockModel.payload.utc_offset_seconds != null ? clockModel.payload.utc_offset_seconds : 7200;
  return APP_CONTEXT.snapshot.trips.filter(t => t.dep).map((t, k) => {
    const points = tripPassagePoints(t);
    let glare = t.td && t.td.glare ? { ts: t.td.glare.ts } : null;
    if (!glare && t.l && locHasCoords(t.l.from) && locHasCoords(t.l.to) && t.l.min) {
      const cloudAt = ts => { const p = points.reduce((b, q) => !b || Math.abs(tsToDate(q.t) - tsToDate(ts)) < Math.abs(tsToDate(b.t) - tsToDate(ts)) ? q : b, null); return p ? p.x.cloud : null; };
      const g = glareCheck(t.l.from, t.l.to, t.dep, t.l.min, offSec, cloudAt).glare; if (g) glare = { ts: g.ts };
    }
    const label = t.src === 'work' ? (t.td && t.td.dir === 'ret' ? 'trajet retour' : 'trajet aller') : t.l && t.l.k === 'ret' ? 'trajet retour' : `trajet vers ${t.to || 'le rendez-vous'}`;
    return { id: t.key || 'trip' + k, src: t.src || null, label, from: t.from || null, to: t.to || null, dep: t.dep, arr: t.arr || t.dep, pending: !!t.originPending,
      running: !!(APP_CONTEXT.snapshot.activeTrip && APP_CONTEXT.snapshot.activeTrip.key === t.key), km: t.l && t.l.km != null ? t.l.km : null, glare, points };
  });
}
function wxInput() {
  const m = CX.m, now = DEMO.on ? m.nowStr.slice(0, 16) : nowIn(m.tz || 'Europe/Paris');
  const raw = RAW[UI.loc], ageMin = DEMO.on || !raw || !raw.t ? null : Reliability.ageMin(raw.t);
  const day = m.days.find(d => d.date === now.slice(0, 10)) || {};
  // valeurs « actuelles » d'une réponse ancienne : on préfère l'heure prévue pour maintenant
  const cur = m.cur.source === 'current' ? { T: m.cur.T, Tapp: m.cur.Tapp } : {};
  return { now, hours: m.hs.slice(Math.max(0, m.nowI - 4)), cur, trips: wxTrips(m), nowcast: ageMin != null && ageMin > 30 ? null : m.nc || null,
    sun: { sunrise: day.sunrise || null, sunset: day.sunset || null }, ageMin };
}
// Provenance de la correction par station : laquelle, à quelle distance, de quand, et de combien elle décale les prévisions horaires.
// Le grand chiffre « actuel » est la donnée du modèle (source « current ») : seules les heures sont corrigées par la station.
function wxStationLine(o) {
  const a = Reliability.ageMin(o.t), dT = Number.isFinite(o.dT) ? o.dT : null;
  return `Station ${o.name || o.id || '?'}${Number.isFinite(o.dist) ? ' · ' + Math.round(o.dist) + ' km' : ''} · ${a == null ? 'heure inconnue' : 'relevé il y a ' + ageTxt(a)}${dT == null ? '' : ' · prévisions horaires corrigées de ' + (dT >= 0 ? '+' : '−') + f1(Math.abs(dT)) + ' °C'}`;
}
function renderWx() {
  const el = $('#secWx'); if (!el) return;
  if (UI.view === 'meteo' && !CX && M[UI.loc] && M[UI.loc].nowI < 0) {
    el.hidden = false; el.innerHTML = '<div class="wx-blk wx-none" role="status"><h3>INDISPONIBLE · météo actuelle</h3><p class="sub">Les prévisions conservées ne couvrent pas l’heure actuelle. Actualise dès que la connexion le permet ; aucune météo n’est extrapolée.</p></div>' + tyreIntelligenceHtml(appActiveCar(), 'meteo');
    renderWx.last = ''; return;
  }
  if (UI.view !== 'meteo' || !CX) { if (!el.hidden || el.innerHTML) { el.hidden = true; el.innerHTML = ''; renderWx.last = ''; } return; }
  const input = wxInput(), d = wxDesk(input);
  if (!d) {
    el.hidden = false;
    el.innerHTML = '<div class="wx-blk wx-none" role="status"><h3>INDISPONIBLE · météo actuelle</h3><p class="sub">Les prévisions conservées ne couvrent pas l’heure actuelle. Actualise dès que la connexion le permet ; aucune météo n’est extrapolée.</p></div>' + tyreIntelligenceHtml(appActiveCar(), 'meteo');
    renderWx.last = ''; return;
  }
  el.hidden = false;
  const m = CX.m, l = curLoc(), today = input.now.slice(0, 10), E = WXD_EMO;
  const dayLbl = day => { const n = dayDiff(today, day); return n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : fmtDay(day); };
  const mode = DEMO.on ? 'DÉMO · simulé' : offlineNow() ? 'HORS LIGNE' : m.mode === 'live' ? 'LIVE' : 'CACHE';
  const age = input.ageMin == null ? '' : ` · ${freshState(input.ageMin)} · ${ageTxt(input.ageMin)}`;
  const h = d.hero, nowWx = d.current || {}, hasNowTemp = Number.isFinite(nowWx.T);
  const heroLines = h.lines.filter(x => !(hasNowTemp && /°C · ressenti .* °C/.test(x)));
  const currentTone = hasNowTemp ? wxCurrentTemperatureTone(nowWx.T) : '';
  const currentCard = hasNowTemp ? `<div class="wx-now" data-tone="${currentTone}" aria-label="Température actuelle">
      <div class="wx-now-main"><span class="wx-now-v num">${f1(nowWx.T)}</span><span class="wx-now-u">°C</span></div>
      <div class="wx-now-side"><span class="wx-now-k">Température actuelle</span>
        <b class="wx-now-feel">Ressenti ${Number.isFinite(nowWx.Tapp) ? f1(nowWx.Tapp) + ' °C' : '—'}</b>
        <span class="wx-now-src">${m.obs && nowWx.source !== 'current' ? 'ESTIMÉ · modèle ajusté par station' : 'PRÉVU · ' + (nowWx.source === 'current' ? 'Donnée actuelle du modèle' : 'Estimation de l’heure en cours')}${m.mode === 'cache' || offlineNow() ? ' · CACHE' : ''}</span>
        ${m.obs ? `<span class="wx-now-src wx-now-obs" data-k="station">${esc(wxStationLine(m.obs))}</span>` : ''}</div>
    </div>` : '';
  // Une même icône météo pour la lecture rapide et la chronologie détaillée.
  const skyIc = x => { const dd = m.days.find(z => z.date === x.t.slice(0, 10)) || {}, night = dd.sunrise && dd.sunset && (x.t < dd.sunrise.slice(0, 13) + ':00' || x.t > dd.sunset);
    return x.code == null ? '·' : x.code <= 1 ? (night ? '🌙' : '☀️') : x.code === 2 ? (night ? '☁️' : '⛅') : '☁️'; };
  const hero = `<div class="wx-hero lv${h.level}" role="status" aria-live="polite">
    <div class="wx-hk"><span>${esc(l ? l.name : '')} · MÉTÉO</span><span class="wx-age">${mode}${age}</span></div>
    ${currentCard}
    <h2 class="wx-ht"><span aria-hidden="true">${h.emoji}</span> ${esc(h.title)}</h2>
    <p class="wx-scope sub">Phénomènes météo jusqu’à ${esc(d.window.to)}</p>
    ${heroLines.map((x, i) => `<p class="${i ? 'wx-hl' : 'wx-hl wx-h1'}">${esc(x)}</p>`).join('')}
    ${h.stale ? `<p class="wx-stale">⚠ Prévisions reçues il y a ${esc(ageTxt(input.ageMin))} : verdict indicatif, actualise dès que possible.</p>` : ''}</div>`;
  // Prévisions visibles sans ouvrir « Prévisions détaillées ». Réutilise exactement
  // le modèle de la chronologie : aucune requête supplémentaire, aucune seconde source
  // de vérité ni donnée persistante ajoutée. En mode cache, âge réel affiché.
  const hourlyRows = d.timeline.strip.slice(0, 13);
  const hourlyHtml = hourlyRows.length ? `<section class="wx-blk wx-hours" aria-label="Prévisions de température heure par heure">
    <div class="wx-hours-head"><h3>🌡️ Heure par heure</h3><span class="wx-hours-state">${esc(mode)}</span></div>
    <ol class="wx-hours-track" aria-label="Températures prévues pour les 12 prochaines heures">${hourlyRows.map(x => {
      const tomorrow = x.t.slice(0, 10) !== today;
      const hh = x.hh || x.t.slice(11, 16), icon = x.ic ? (WX_IC[x.ic] || '·') : skyIc(x);
      const rain = x.pp == null ? '' : `<small class="wx-hours-rain">${f0(x.pp)} % pluie</small>`;
      return `<li class="wx-hours-card lv${x.lv}${x.now ? ' now' : ''}" data-hour="${esc(x.t)}">
        <time datetime="${esc(x.t)}">${tomorrow ? 'dem. ' : ''}${esc(hh)}</time>
        <span class="wx-hours-icon" aria-hidden="true">${icon}</span>
        <b class="num">${Number.isFinite(x.T) ? f1(x.T) + '°' : '—'}</b>
        ${rain || '<small class="wx-hours-rain">—</small>'}
      </li>`;
    }).join('')}</ol>
    <p class="wx-hours-note">Prévisions du modèle, pas mesures en direct · ${offlineNow() ? 'hors ligne, dernières données conservées' : DEMO.on ? 'simulation' : 'mise à jour automatique toutes les 5 min en ligne'}${input.ageMin != null ? ' · reçues il y a ' + esc(ageTxt(input.ageMin)) : ''}. Glisser pour la suite →</p>
  </section>` : '';
  // prochain trajet
  const t = d.trip, pending = APP_CONTEXT.snapshot.dayContext.nextDestination && !APP_CONTEXT.snapshot.dayContext.nextDestination.placeId;
  const target = t && APP_CONTEXT.snapshot.trips.find(trip => trip.key === t.id);
  const tripHtml = pending ? `<div id="wxNextTrip" class="wx-blk wx-trip wx-none"><h3>${APP_CONTEXT.snapshot.status === 'travel' ? '🚗 En trajet' : '🧭 Prochain trajet'}</h3><p class="wx-route"><b>${esc(APP_CONTEXT.snapshot.origin && APP_CONTEXT.snapshot.origin.name || 'Origine à confirmer')} → Destination à confirmer</b></p><p class="sub">Destination nécessaire pour calculer l’ETA et la météo route.</p></div>`
    : !t ? `<div id="wxNextTrip" class="wx-blk wx-trip wx-none"><h3>🧭 Prochain trajet</h3>${APP_CONTEXT.agendaSelectionUnavailable ? appAgendaConflictHtml() : '<p class="sub">Aucun trajet prévu dans les 24 h. Les rendez-vous sans lieu reconnu ne sont pas des trajets.</p>'}</div>`
    : `<div id="wxNextTrip" class="wx-blk wx-trip ${t.lv == null ? 'lvx' : 'lv' + t.lv}"><h3>🧭 Prochain trajet${t.running ? ' · en cours' : ' · ' + esc(dayLbl(t.day))}</h3>
      <p class="wx-route"><b>${esc(t.from || 'Départ')} → ${esc(t.to || 'Arrivée')}</b></p>
      ${appAgendaConflictHtml()}${calendarOriginControls(target)}
      ${t.pending ? `<p class="sub" role="status">⏳ ${offlineNow() ? 'Hors ligne : itinéraire, horaire conseillé et météo du parcours en attente du réseau.' : 'Nouvel itinéraire, horaire conseillé et météo du parcours en cours de calcul…'}</p>` : `<p class="wx-when num">${t.dep} → ${t.arr} · ${t.durMin} min${t.km != null ? ' · ' + f0(t.km) + ' km' : ''}</p>`}
      ${t.pending ? '' : t.waiting ? `<p class="sub">⏳ Météo du trajet indisponible${offlineNow() ? ' hors ligne' : ' pour le moment'}.</p>` : `<ul class="wx-pts">${t.points.map(p => `<li class="lv${p.lv}"><span class="k">${esc(p.label)} <i class="num">${esc(p.t)}</i></span><span>${p.T != null ? '<b class="num">' + f0(p.T) + ' °C</b> · ' : ''}${esc(p.text)}${p.place && p.label === 'Mi-parcours' ? ' · ' + esc(p.place) : ''}</span></li>`).join('')}</ul>`}
      ${t.crit ? `<p class="wx-crit lv${t.crit.lv}">${E[t.crit.lv]} ${esc(t.crit.text)}</p>` : t.waiting ? '' : '<p class="wx-crit lv0">🟢 Aucun phénomène critique sur le trajet</p>'}
      ${t.later.length ? `<p class="sub">Ensuite : ${t.later.map(x => `${x.lv == null ? '⏳' : E[x.lv]} ${x.day !== today ? esc(dayLbl(x.day)) + ' ' : ''}${esc(x.dep)} ${esc(x.label)}${x.lv == null ? ' · météo indisponible' : ''}`).join(' · ')}</p>` : ''}${calendarOriginEditorHtml()}</div>`;
  // chronologie : moments clés, puis bande horaire défilante
  const tday = x => x.ts.slice(0, 10) !== today && x.t !== 'maintenant' ? (dayDiff(today, x.ts) === 1 ? 'dem. ' : fmtDay(x.ts.slice(0, 10)) + ' ') : '';
  const mom = d.timeline.moments.map(x => `<li class="lv${x.lv}${x.kind !== 'wx' ? ' trip' : ''}" data-ts="${esc(x.ts)}"><time class="num">${esc(tday(x) + x.t)}</time><span aria-hidden="true">${WX_IC[x.kind === 'wx' ? x.id : x.kind] || '•'}</span><span>${esc(x.text)}</span></li>`).join('');

  const strip = d.timeline.strip.map(x => {
    const bar = x.P == null ? 0 : Math.min(100, Math.round(x.P / 4 * 100));
    return `<li class="lv${x.lv}${x.trip ? ' trip' : ''}${x.now ? ' now' : ''}"><span class="hh num">${x.now ? 'maint.' : x.t.slice(0, 10) !== today && x.hh === '00:00' ? 'dem.' : esc(x.hh)}</span><span class="ic" aria-hidden="true">${x.ic ? WX_IC[x.ic] : skyIc(x)}</span><b class="num">${x.T == null ? '—' : f0(x.T) + '°'}</b><span class="rb" title="${x.P == null ? '' : f1(x.P) + ' mm/h'}"><i style="height:${bar}%"></i></span><span class="pp num">${x.pp != null && x.pp >= 20 ? f0(x.pp) + '%' : ''}</span>${x.trip ? '<span class="tm" aria-label="trajet">🚗</span>' : ''}</li>`;
  }).join('');
  const tl = `<div class="wx-blk wx-tlb"><h3>🕒 Chronologie · jusqu’à ${esc(d.window.to)}</h3><ol class="wx-tl">${mom || '<li class="lv0"><time>—</time><span></span><span>Aucun changement notable</span></li>'}</ol>
    <ol class="wx-strip" aria-label="Heure par heure : température, pluie, phénomènes, trajets">${strip}</ol>
    <p class="sub">Barre bleue : pluie (pleine à 4 mm/h) · % : probabilité de pluie · 🚗 : heure de trajet.</p></div>`;
  const matters = `<div class="wx-blk wx-matb"><h3>🎯 Ce qui compte aujourd’hui</h3><ul class="wx-mat">${d.matters.map(x => `<li class="lv${x.lv}"><span aria-hidden="true">${E[x.lv]}</span><span>${esc(x.text)}</span></li>`).join('')}</ul></div>`;
  const open = new Set([...el.querySelectorAll('details[open][data-k]')].map(x => x.dataset.k));
  const ph = `<div class="wx-blk"><h3>⚡ Phénomènes</h3><div class="wx-ph">${d.phen.map(p => `<details class="wx-pc lv${p.lv}" data-k="${p.id}"${open.has(p.id) ? ' open' : ''}><summary><span class="ic" aria-hidden="true">${p.icon}</span><span class="tt">${esc(p.title)}</span><span class="ln">${p.lv ? E[p.lv] + ' ' : ''}${esc(p.line)}</span></summary><ul>${p.detail.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`).join('')}</div></div>`;
  // conditions route + lien court vers Pneus (aucune analyse pneumatique ici)
  const r = d.road, tires = (CX.cars || []).filter(c => hasTires(c.car) && c.w), tl2 = tires.length ? tires.reduce((a, c) => Math.max(a, c.w.level), 0) : null;
  const road = `<div class="wx-blk wx-road lv${r.score == null ? 'x' : r.level}"><h3>🛣️ Conditions route · ESTIMÉ</h3>
    <div class="wx-rs"><b class="num">${r.score == null ? '—' : r.score}</b><span>${r.score == null ? 'INDISPONIBLE · données insuffisantes' : '/ 100 ' + E[r.level]}</span><span class="sub">${esc(r.window.label)}</span></div>
    <ul class="wx-rf">${r.factors.map(f => `<li class="lv${f.lv}"><span aria-hidden="true">${E[f.lv]}</span><b>${esc(f.label)}</b><span class="sub">${esc(f.why)}</span><span class="num">${f.pen ? '−' + f.pen : '0'}</span></li>`).join('')}</ul>
    <details class="wx-how" data-k="how"${open.has('how') ? ' open' : ''}><summary>Comment ce score est calculé</summary><p class="sub">100 moins les points listés : gel jusqu’à −45 (verglas élevé ou pluie verglaçante), neige −35, visibilité −15 à −35 (sous 1 000, 500 et 200 m), pluie −5 à −30 (probabilité ≥ 60 %, 0,2, 2 et 7,6 mm/h), rafales −10 à −30 (55, 70 et 90 km/h), froid ou chaleur −5, air saturé −5, soleil rasant −5. La couleur n’est jamais plus douce que le pire facteur. Environnement seulement : l’adhérence des pneus est dans l’onglet Pneus.</p></details>
    ${tl2 != null ? `<div class="wx-tire"><span>Impact pneus : <b>${['faible', 'modéré', 'élevé', 'critique'][tl2]}</b> ${E[tl2]}</span><button class="btn sm" data-act="view" data-v="pneus">Voir analyse Pneus →</button></div>` : ''}</div>`;
  const foot = `<p class="sub wx-foot">Détails techniques plus bas : <a href="#secCur">mesures</a> · <a href="#secChart">graphique 24 h</a> · <a href="#hdrMore">sources et fraîcheur</a>.</p>`;
  const evH = evidenceHtml(), evOn = EV_FLAG() === 'on' && /class="ev-crit/.test(evH) && d.level < 2;
  const html = (evOn ? evH + hero : hero) + hourlyHtml + (evOn ? '' : evH) + tripHtml +
    uxFold('wx-forecast', 'Prévisions détaillées', tl + matters + ph, 'Chronologie · phénomènes') +
    uxFold('wx-road', 'Conditions route', road, r.score == null ? 'INDISPONIBLE · données insuffisantes' : r.score + '/100 · risque ' + ['faible', 'modéré', 'élevé', 'critique'][r.level]) + tyreIntelligenceHtml(appActiveCar(), 'meteo') + foot;
  if (html === renderWx.last) return;   // rafraîchissement sans changement : rien ne bouge (détails ouverts, défilement)
  const sl = el.querySelector('.wx-strip'), left = sl ? sl.scrollLeft : 0;
  const hourlyTrack = el.querySelector('.wx-hours-track'), hourlyLeft = hourlyTrack ? hourlyTrack.scrollLeft : 0;
  const editor = el.querySelector('#wxOriginEditor'), active = document.activeElement;
  const foldFocus = uxFocusKey(el);
  const editorFocused = editor && editor.contains(active), selection = editorFocused && [active.selectionStart, active.selectionEnd];
  el.className = 'mod wx lv' + d.level; el.innerHTML = html; renderWx.last = html;
  uxRestoreFocus(el, foldFocus);
  const nextEditor = el.querySelector('#wxOriginEditor');
  if (editor && nextEditor && editor.dataset.binding === nextEditor.dataset.binding) {
    nextEditor.replaceWith(editor);
    if (editorFocused) { active.focus({ preventScroll: true }); if (typeof selection[0] === 'number') try { active.setSelectionRange(...selection); } catch (e) { /* select */ } }
  }
  const ns = el.querySelector('.wx-strip'); if (ns && left) ns.scrollLeft = left;
  const nextHours = el.querySelector('.wx-hours-track'); if (nextHours && hourlyLeft) nextHours.scrollLeft = hourlyLeft;
}
/* ---------- moteur de preuves météo v2 (weatherEvidenceV2) : actif par défaut ---------- */
// Réglage S.flags.weatherEvidenceV2 : 'on' (défaut) ; 'shadow' calcule, journalise et montre la carte « Preuves » marquée expérimentale
// sans toucher aux verdicts ; 'on' place en plus le phénomène critique v2 en tête de l'onglet Météo ; 'off' n'affiche rien.
// Signalements terrain : twrc.reports.v1 (type, heure, lieu arrondi à ~1 km, gardés 6 h). Journal fantôme : twrc.shadow.v1
// (200 entrées max : heure, identifiant du lieu affiché, brouillard v1, brouillard v2 et confiance, observation éventuelle).
const EV_FLAG = () => { const f = S.flags && S.flags.weatherEvidenceV2; return ['shadow', 'off'].includes(f) ? f : 'on'; };
const REPORT_KEY = 'twrc.reports.v1', SHADOW_KEY = 'twrc.shadow.v1';
const REPORT_KINDS = { fog: '🌫 Brouillard', lowvis: '👁 Visibilité très réduite', rain: '🌧 Pluie', wet: '💧 Route humide', snow: '❄️ Neige', ice: '🧊 Verglas', slippery: '⚠️ Route glissante' };
let REPORTS = []; try { REPORTS = JSON.parse(lsGet(REPORT_KEY) || '[]') || []; } catch (e) { REPORTS = []; }
const reportsLive = () => { const n = Date.now(); REPORTS = REPORTS.filter(r => r && Number.isFinite(r.at) && r.at <= n + 60000 && n - r.at < 6 * 3600e3); return REPORTS; };
function reportAdd(kind) {
  if (!REPORT_KINDS[kind]) return;
  const c = placeNow(), l = c.place || (GPS && placeFixClass({ acc: GPS.acc }) !== 'network' ? GPS : null) || curLoc();
  if (!l || !locHasCoords(l)) return;
  // Figer la prévision AVANT l'assimilation : le signalement ne valide pas son propre effet.
  const before = kind === 'fog' || kind === 'lowvis' ? evNow() : null;
  REPORTS = reportsLive().concat([{ kind, at: Date.now(), lat: Math.round(l.lat * 100) / 100, lon: Math.round(l.lon * 100) / 100, place: c.place ? c.place.id : null }]).slice(-30);
  lsSet(REPORT_KEY, JSON.stringify(REPORTS));
  // journal prévision / observation : ce que les deux moteurs disaient juste avant le signalement
  if (before) shadowPush({ obs: 1, src: 'utilisateur', independent: true, v1: before.v1, v2: before.prevLv });
  UI.evOpen = true; renderAll();
}
function shadowLoad() { try { return JSON.parse(lsGet(SHADOW_KEY) || '[]') || []; } catch (e) { return []; } }
function shadowPush(e) { const L = shadowLoad(); L.push({ at: Date.now(), loc: UI.loc, ...e }); lsSet(SHADOW_KEY, JSON.stringify(L.slice(-200))); }
function evStations() {
  const src = OBS || (offlineNow() ? OBS_LAST : null);
  return Object.values((src && src.stations) || {}).filter(s => s && Number.isFinite(s.lat)).map(s => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, kind: 'METAR', obs: s.hist || (s.last ? [s.last] : []) }));
}
function evLocTrust() {
  if (PLACE.conf && PLACE.conf.placeId === UI.loc) return 'Confirmée';
  if (UI.loc === 'gps') return GPS && placeFixClass({ acc: GPS.acc }) === 'gps' ? 'Fiable' : 'Estimée';
  return 'Fiable';   // lieu enregistré : la prévision porte exactement sur ses coordonnées
}
function evInput() {
  if (!CX) return null;
  const m = CX.m, off = (m.payload && m.payload.utc_offset_seconds) || 0, now = DEMO.on ? Date.parse(m.nowStr + ':00Z') - off * 1000 : Date.now();
  const nowL = DEMO.on ? m.nowStr.slice(0, 16) : nowIn(m.tz || 'Europe/Paris'), l = curLoc();
  const msOf = t => Date.parse(t.slice(0, 16) + ':00Z') - off * 1000;
  // points : prochain trajet dans les 3 h (départ, passages, arrivée), sinon le lieu affiché pour les 3 prochaines heures
  const trip = wxTrips(m).find(t => t.points.length && t.arr > nowL && msOf(t.dep) - now <= 3 * 3600e3);
  const labels = ['départ', '25 %', '50 %', '75 %', 'arrivée'];
  const points = trip ? trip.points.map((p, k, a) => ({ lat: p.lat, lon: p.lon, t: p.t, ms: msOf(p.t), x: p.x, label: a.length === 5 ? labels[k] : k === 0 ? 'départ' : k === a.length - 1 ? 'arrivée' : `point ${k}` }))
    : [0, 1, 2, 3].map(k => m.hs[m.nowI + k]).filter(Boolean).map((x, k) => ({ lat: l.lat, lon: l.lon, t: x.t, ms: msOf(x.t), x, label: k ? '+' + k + ' h' : 'maintenant' }));
  const raw = RAW[UI.loc];
  const located = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  return { now, points: located, coverage: { expected: points.length, located: located.length }, stations: evStations(), reports: reportsLive(), community: { available: false },
    location: { trust: evLocTrust() }, fresh: { modelAgeMin: DEMO.on ? 0 : raw && raw.t ? Reliability.ageMin(raw.t) : null, offline: offlineNow() }, onTrip: !!trip, tripKey: trip && trip.id };
}
function evNow() {
  const i = evInput(); if (!i || !i.points.length) return null;
  const r = evidenceEngine(i); if (!r) return null;
  const v1 = CX.alerts.fog ? CX.alerts.fog.sev : CX.alerts.vis ? 1 : 0;
  return { r, v1, prevLv: r.worst.lv, coverage: i.coverage };
}
function evShadowTick(v) {
  if (!v || DEMO.on) return;
  const L = shadowLoad(), last = L.filter(e => e.loc === UI.loc && e.obs == null).slice(-1)[0];
  if (last && Date.now() - last.at < 15 * 60e3) return;
  // observation proche et récente (≤ 25 km, ≤ 60 min) : sert de vérité terrain pour mesurer v1 et v2
  const o = v.r.worst.ev.find(e => e.layer === 'A' && e.w >= 0.6);
  shadowPush({ v1: v.v1, v2: v.r.worst.lv, trust: v.r.worst.trust, contra: !!v.r.contradiction, ...(o ? { obs: o.lv >= 2 ? 1 : 0, src: 'station' } : {}) });
}
function evidenceHtml() {
  const flag = EV_FLAG(); if (flag === 'off') return '';
  const v = evNow(); if (!v) {
    const i = evInput();
    return i && i.onTrip ? '<p class="wx-stale" role="status">Preuves météo du trajet indisponibles : points de passage non localisés.</p>' : '';
  }
  evShadowTick(v);
  const r = v.r, E = WXD_EMO, h = r.headline, T = ['faible', 'moyenne', 'élevée'];
  const lastObs = r.fog.flatMap(f => f.ev).filter(e => e.layer === 'A').sort((a, b) => b.w - a.w)[0];   // observation la plus pertinente, tous points confondus
  const off = offlineNow() ? `<p class="wx-stale">⚠ Hors connexion : conditions actuelles non vérifiables · ${lastObs ? 'dernière observation : ' + esc(lastObs.text) : 'aucune observation en cache'}</p>` : '';
  const head = h ? `<div class="ev-crit lv${r.worst.lv}"><b>${h.icon} ${esc(h.text)}</b><span>${esc(h.sub)}${h.window ? ` · ${esc(h.window[0])} → ${esc(h.window[1])}` : ''}${h.where ? ' · ' + esc(h.where) : ''}</span>
    <span class="sub">Preuves : ${h.proofs.map(esc).join(' · ')}</span><span class="sub">Confiance : ${esc(h.trust)} · variabilité locale importante</span></div>` : '';
  const contra = r.contradiction ? `<p class="ev-contra">⚠ CONTRADICTION DÉTECTÉE · ${esc(r.contradiction)}</p>` : '';
  const rows = r.phen.map(p => `<li class="lv${p.lv}"><span>${p.icon} ${esc(p.label)}</span><b>${esc(p.value)}</b><span class="ev-t ev-${p.trust}">${['🔴', '🟠', '🟢'][Math.max(0, Math.min(2, p.trust))]} ${esc(p.trustTxt)}</span></li>`).join('');
  const prov = r.worst.ev.map(e => `<li><span class="ev-l">${e.layer}</span> ${e.dir === '+' ? '▲' : '▽'} ${esc(e.source)} : ${esc(e.text)}</li>`).join('');
  const rep = Object.entries(REPORT_KINDS).map(([k, t]) => `<button class="btn sm" data-act="ev-report" data-k="${k}">${t}</button>`).join('');
  const mine = reportsLive().slice(-3).reverse().map(x => `${REPORT_KINDS[x.kind]} à ${hmLocal(x.at)}`).join(' · ');
  return `<details class="wx-pc ev" data-k="ev"${UI.evOpen || (flag === 'on' && h) ? ' open' : ''}><summary><span class="ic" aria-hidden="true">🧪</span><span class="tt">Preuves météo · moteur v2${flag === 'shadow' ? ' (mode observation)' : ''}</span><span class="ln">${h ? E[r.worst.lv] + ' ' + esc(h.text.toLowerCase()) : 'aucun phénomène critique prouvé'}${r.contradiction ? ' · contradiction' : ''}</span></summary>
    <div class="ev-b">${off}${v.coverage && v.coverage.located < v.coverage.expected ? `<p class="wx-stale">Couverture partielle : ${v.coverage.located} point(s) localisé(s) sur ${v.coverage.expected}. Les autres portions ne sont pas vérifiées.</p>` : ''}${head}${contra}<ul class="ev-ph">${rows}</ul>
    <p class="sub">Axes : données ${esc(r.axes.data)} · modèles ${esc(r.axes.models)} · localisation ${esc(r.axes.location)} · ${esc(r.axes.observations)} · ${esc(r.axes.freshness)} · communauté ${esc(r.community)}.</p>
    <details class="wx-how" data-k="evprov"><summary>Provenance du verdict brouillard${r.worst.label ? ' (' + esc(r.worst.label) + ')' : ''}</summary><ul class="lab-why">${prov}</ul><p class="sub">A observation · C modèle · D terrain · E physique. Une observation pèse selon sa distance, son âge et l’échéance ; l’absence de signalement ne prouve rien.</p></details>
    <div class="ev-rep"><p class="sub"><b>Signaler les conditions réelles</b> (votre observation, non officielle)${mine ? ' · récents : ' + esc(mine) : ''}</p><div class="chips">${rep}</div></div></div></details>`;
}
