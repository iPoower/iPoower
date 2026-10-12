/* Mode Station facultatif : mêmes modèles, même contexte, mêmes minuteurs ; aucune persistance nouvelle. */
const WX_STATION = { active: false, element: null, trigger: null, scroll: 0, overflow: '', minute: null,
  enabled: false, silent: true, system: false, cooldownMin: 15, message: '', pip: null, openingPip: false,
  monitor: WeatherWatch.monitor(), history: { events: [], alerts: [] }, snapshot: null, renders: 0, sharedSkips: 0 };
function weatherStationDesktop() { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; }
function weatherStationRunning() { return WX_STATION.active; }
function stationSet(el, html) { if (el && el.innerHTML !== html) el.innerHTML = html; }
function renderWeatherStationButton() {
  const root = document.getElementById('secWx'); if (!root) return;
  const existing = root.querySelector('.wx-station-launch');
  if (!weatherStationDesktop() || root.hidden || UI.view !== 'meteo') { if (existing) existing.remove(); return; }
  if (existing || !root.querySelector('.wx-hero')) return;
  const launcher = document.createElement('div'); launcher.className = 'wx-station-launch';
  launcher.innerHTML = '<button class="btn sm" data-act="station-open" aria-haspopup="dialog">🖥️ Mode Station</button>';
  const foot = root.querySelector('.wx-foot'); if (foot) foot.before(launcher); else root.appendChild(launcher);
}
function weatherStationOpen(button) {
  if (!weatherStationDesktop() || LOCKED() || checkSessionExpiry()) return;
  if (WX_STATION.active) return;
  const pane = document.createElement('dialog');
  pane.id = 'wxStation'; pane.className = 'wx-station'; pane.setAttribute('aria-labelledby', 'wxStationTitle');
  pane.innerHTML = `<div class="station-shell">
    <header class="station-head"><div><small class="station-kicker">RACE CONTROL · WEATHER WATCH</small><h2 id="wxStationTitle">Station météo</h2><p id="stationPlace" class="sub"></p></div>
      <div class="station-actions"><button class="btn sm" data-act="station-mini">Mini-cockpit</button><button class="btn sm" data-act="station-close" autofocus>Fermer la station</button></div></header>
    <div id="stationStatus" class="station-status" role="status" aria-live="polite"></div>
    <div class="station-top"><section id="stationCurrent" class="station-current"></section><section class="station-chart-box"><h3>Températures prévues · 12 heures</h3><div id="stationChart"></div></section></div>
    <ol id="stationHours" class="station-hours" aria-label="Prévisions des douze prochaines heures"></ol>
    <div id="stationConditions" class="station-conditions"></div>
    <div id="stationNext" class="station-next" role="status"></div>
    <section class="station-watch"><div class="station-watch-head"><h3>🔔 Surveillance des changements</h3><div class="station-actions">
      <button class="btn sm" data-act="station-alerts" aria-pressed="false">Activer les alertes</button>
      <button class="btn sm" data-act="station-silent" aria-pressed="true">Mode silencieux : oui</button>
      <button class="btn sm" data-act="station-notifications">Autoriser Windows</button>
      <label class="station-cooldown" for="stationCooldown">Temporisation<select id="stationCooldown"><option value="5">5 min</option><option value="15" selected>15 min</option><option value="30">30 min</option><option value="60">60 min</option></select></label></div></div>
      <p id="stationPermission" class="sub" role="status"></p><ul id="stationAlertList" class="station-alerts" aria-live="polite"></ul>
      <details class="station-thresholds"><summary>Seuils et limites de surveillance</summary><p class="sub">Température sous 7 / 3 / 0 °C (réarmement +0,5 °C) ; visibilité sous 1 000 / 500 m (réarmement +200 / +100 m) ; rafales +15 km/h à partir de 55 km/h ; pluie possible dans l’heure si ≥0,2 mm/h ou probabilité ≥60 % ; gel et risque routier issus du moteur Météo. Alertes nouvelles suspendues hors ligne, en cache, en démo ou après 15 min sans données fraîches. Notifications Windows : texte discret sans lieu, trajet ni valeur privée. Le mode silencieux conserve les alertes visuelles.</p></details>
    </section>
    <div class="station-bottom"><section class="station-log"><h3>Journal des changements · cette session</h3><ol id="stationJournal"></ol><p class="sub">60 événements maximum par lieu ; conservés en mémoire, jusqu’à la fermeture de l’application.</p></section><section id="stationSources" class="station-sources"></section></div>
    <p class="station-limit sub">Actualisation prévue toutes les 5 min, si le navigateur peut exécuter la page. Une veille Windows, un onglet suspendu ou un navigateur fermé interrompt la surveillance. Reprise et contrôle de fraîcheur au retour. Aucun service de surveillance distant.</p>
  </div>`;
  document.body.appendChild(pane);
  WX_STATION.element = pane; WX_STATION.trigger = button; WX_STATION.scroll = window.scrollY;
  WX_STATION.overflow = document.body.style.overflow; WX_STATION.active = true;
  WX_STATION.rebaseline = true;
  pane.addEventListener('cancel', event => { event.preventDefault(); weatherStationClose(); });
  pane.addEventListener('close', () => { if (WX_STATION.active) weatherStationClose(); });
  pane.querySelector('#stationCooldown').addEventListener('change', event => { WX_STATION.cooldownMin = Number(event.target.value); renderWeatherStation(); });
  pane.showModal(); document.body.style.overflow = 'hidden'; renderWeatherStation();
}
function weatherStationClose() {
  const st = WX_STATION; if (!st.active && !st.pip) return;
  st.active = false;
  if (st.pip) { const win = st.pip; st.pip = null; try { win.close(); } catch (e) { /* déjà fermée */ } }
  const pane = st.element; st.element = null;
  if (pane) { if (pane.open) pane.close(); pane.remove(); }
  document.body.style.overflow = st.overflow;
  // Un verrouillage conserve sa propre couche de sécurité ; le mode Station ne la supprime jamais.
  if (document.getElementById('twrcExpiryOverlay')) document.body.style.overflow = 'hidden';
  const trigger = st.trigger && st.trigger.isConnected ? st.trigger : document.querySelector('#secWx [data-act="station-open"]');
  // WebKit may restore the dialog's former focus *after* close() returns.
  // Restore it again after the native close task, without defeating a session lock.
  const restore = () => {
    if (!st.active && !document.hidden && !LOCKED() && !document.getElementById('twrcExpiryOverlay') && trigger && trigger.isConnected)
      trigger.focus({ preventScroll: true });
  };
  restore();
  setTimeout(restore, 0);
  if (!document.hidden) requestAnimationFrame(restore);
  window.scrollTo({ top: st.scroll, behavior: 'instant' });
}
function weatherStationSafety() {
  const vs = window.TWRC_VAULT;
  if (WX_STATION.active && (LOCKED() || vs && vs.expired())) weatherStationClose();
}
window.addEventListener('twrc-session-expired', weatherStationClose);
window.addEventListener('pagehide', weatherStationClose);
['focus', 'pageshow'].forEach(name => window.addEventListener(name, weatherStationSafety));
document.addEventListener('visibilitychange', weatherStationSafety);
function weatherStationTick() {
  weatherStationSafety();
  if (!WX_STATION.active || busy || DEMO.on) return;
  const min = Math.floor(Date.now() / 60000);
  if (WX_STATION.minute !== min) { rebuild(); renderAll(); }
}
// Coordination best effort des actualisations automatiques de stations utilisant les mêmes lieux.
// Web Locks contient uniquement un hash. Aucune diffusion de coordonnées, aucun nouveau stockage.
async function weatherStationAutoRefresh() {
  if (!WX_STATION.active || !navigator.locks || typeof navigator.locks.request !== 'function') return refreshAll(false);
  const primary = curLoc();
  const urls = (locHasCoords(primary) ? urlFor(primary) : 'unavailable') + '\n' + allLocs().filter(locHasCoords).map(urlFor).sort().join('\n');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(urls));
  const key = Array.from(new Uint8Array(bytes)).map(x => x.toString(16).padStart(2, '0')).join('');
  return navigator.locks.request('twrc.weather.station.' + key, { ifAvailable: true }, async lock => {
    if (!lock) { WX_STATION.sharedSkips++; lastTry = Date.now(); return; }
    if (LOCKED() || offlineNow() || !WX_STATION.active) return;
    await refreshAll(false);
  });
}
// Le coffre existant transmet déjà ses mises à jour déchiffrées entre onglets autorisés.
// Reprendre seulement une réponse validée, plus récente, et correspondant exactement au lieu.
window.addEventListener('storage', event => {
  if (!WX_STATION.active || LOCKED() || !event.key || !event.key.startsWith('twrc.cache.') || !event.newValue) return;
  // Un événement brut d'une autre application sur la même origine ne fait pas foi.
  // La valeur doit déjà appartenir au magasin autorisé, mis à jour par le coffre existant.
  if (lsGet(event.key) !== event.newValue) return;
  const id = event.key.slice('twrc.cache.'.length), loc = locById(id); if (!locHasCoords(loc)) return;
  try {
    const r = JSON.parse(event.newValue), prev = RAW[id];
    if (!r || !r.p || validForecast(r.p) || !Number.isFinite(r.t) || r.t > Date.now() + 60000
        || Date.now() - r.t > 36 * 3600e3 || Math.abs(r.lat - loc.lat) > 1e-6 || Math.abs(r.lon - loc.lon) > 1e-6
        || !Number.isFinite(r.lat) || !Number.isFinite(r.lon) || prev && r.t <= prev.t) return;
    RAW[id] = { ...r, mode: offlineNow() || Date.now() - r.t > LIVE_MAX_MS ? 'cache' : 'live' };
    delete ERR[id]; if (RAW[id].mode === 'live') lastOk = Math.max(lastOk || 0, r.t);
    rebuild(); renderAll();
  } catch (e) { /* réponse illisible conservée hors du modèle */ }
});
function stationChart(s) {
  const rows = s.timeline, ts = rows.filter(x => Number.isFinite(x.T)); if (!ts.length) return '<p class="sub">Températures indisponibles</p>';
  const low = Math.min(...ts.map(x => x.T)) - 1, high = Math.max(...ts.map(x => x.T)) + 1;
  const y = t => 132 - (t - low) / (high - low) * 108, step = rows.length > 1 ? 896 / (rows.length - 1) : 0;
  let line = '', gap = true;
  rows.forEach((r, i) => { if (!Number.isFinite(r.T)) { gap = true; return; } line += (gap ? 'M' : 'L') + (32 + i * step).toFixed(1) + ',' + y(r.T).toFixed(1) + ' '; gap = false; });
  const levels = [0, 3, 7].filter(t => t >= low && t <= high).map(t => `<line x1="30" x2="930" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="station-chart-grid"/><text x="4" y="${(y(t) - 4).toFixed(1)}">${t}°</text>`).join('');
  return `<svg viewBox="0 0 960 154" role="img" aria-label="Courbe des températures prévues ; valeurs détaillées heure par heure ci-dessous">${levels}<path d="${line}" class="station-chart-line"/>${rows.map((r, i) => Number.isFinite(r.T) ? `<circle cx="${32 + i * step}" cy="${y(r.T)}" r="3"/>` : '').join('')}</svg><p class="sub">Prévisions du modèle · ${esc(s.modelSource)} · aucune mesure routière</p>`;
}
function stationValue(v, unit, digits = 0) { return Number.isFinite(v) ? (digits ? f1(v) : f0(v)) + (unit ? ' ' + unit : '') : '—'; }
function stationPermissionText() {
  const st = WX_STATION, N = window.Notification, permission = N ? N.permission : 'indisponible';
  return (st.enabled ? 'Alertes visuelles actives' : 'Alertes désactivées') + ' · Windows : ' +
    (permission === 'granted' ? st.system ? 'autorisé' : 'non activé dans cette session' : permission === 'denied' ? 'permission refusée, alertes visuelles disponibles' : permission === 'default' ? 'autorisation à demander volontairement' : 'API indisponible, alertes visuelles disponibles') +
    (st.silent ? ' · silencieux' : '') + (st.message ? ' · ' + st.message : '');
}
function renderWeatherStation() {
  if (!WX_STATION.active) return;
  weatherStationSafety(); if (!WX_STATION.active) return;
  const st = WX_STATION, pane = st.element;
  st.minute = Math.floor(Date.now() / 60000);
  const input = CX && wxInput(), desk = input && wxDesk(input);
  const s = input && desk ? WeatherWatch.snapshot({ input, desk, model: CX.m, raw: RAW[UI.loc], place: curLoc(), offline: offlineNow(), demo: DEMO.on, nowMs: Date.now() }) : null;
  st.snapshot = s; st.renders++;
  pane.querySelector('#stationPlace').textContent = s ? s.name + ' · même lieu que Météo' : 'Météo indisponible pour le lieu sélectionné';
  const age = s && s.ageMin != null ? ageTxt(s.ageMin) : 'âge inconnu';
  stationSet(pane.querySelector('#stationStatus'), `<span class="badge">${s ? esc(s.mode) : 'INDISPONIBLE'}</span><span>${s && s.fetchedAt ? 'Dernière réception : ' + esc(hmLocal(s.fetchedAt)) + ' · il y a ' + esc(age) : 'Aucune prévision valide disponible'}</span><span>${offlineNow() ? 'Sans réseau' : 'Réseau disponible'}${document.hidden ? ' · onglet en arrière-plan' : ''}</span>`);
  if (s) {
    const h = st.monitor.ingest(s, { enabled: st.enabled, cooldownMin: st.cooldownMin, rebaseline: st.rebaseline }); st.rebaseline = false; st.history = h;
    for (const alert of h.emitted) {
      if (!st.system || st.silent || !window.Notification || Notification.permission !== 'granted') continue;
      try { const notice = new Notification('Race Control · alerte météo', { body: 'Un changement météorologique significatif a été détecté. Consulte Race Control.', tag: 'twrc-station-' + alert.id, silent: true });
        notice.onclick = () => { try { window.focus(); } catch (e) { /* navigateur décide */ } notice.close(); };
      } catch (e) { st.message = 'Notification système indisponible ; alerte visuelle conservée'; }
    }
    const title = DEMO.on ? 'Température simulée' : !s.coverage ? 'Température indisponible'
      : s.current.source === 'hourly' ? 'Prévision de l’heure en cours' + (s.fresh ? '' : ' · cache · ' + age)
      : s.fresh ? 'Température actuelle du modèle' : 'Dernière valeur du modèle · ' + age;
    stationSet(pane.querySelector('#stationCurrent'), `<span class="station-kicker">${esc(title)}</span><div class="station-temp num">${stationValue(s.current.T, '', 1)}<small> °C</small></div><p>Ressenti <b class="num">${stationValue(s.current.Tapp, '°C', 1)}</b></p><p class="sub">${esc(s.modelSource)} · ${s.currentTime ? esc(s.currentTime.slice(11, 16)) : 'heure inconnue'}</p><p class="sub">Prévision pour ${esc(s.now.slice(11, 16))} : <b>${stationValue(s.forecastNow, '°C', 1)}</b></p><p class="station-verdict lv${s.hero.level}">${esc(s.hero.emoji + ' ' + s.hero.title)}</p>`);
    stationSet(pane.querySelector('#stationChart'), stationChart(s));
    stationSet(pane.querySelector('#stationHours'), s.timeline.map(x => `<li class="lv${x.lv}" data-hour="${esc(x.t)}"><time datetime="${esc(x.t)}">${x.t.slice(0, 10) !== s.now.slice(0, 10) ? 'dem. ' : ''}${esc(x.hh)}</time><b class="num">${stationValue(x.T, '°', 1)}</b><span>${stationValue(x.pp, '%')} pluie</span><small>${stationValue(x.P, 'mm/h', 1)}</small></li>`).join('') || '<li>Aucune échéance disponible</li>');
    const tile = (title, number, source) => `<section class="station-tile"><h3>${esc(title)}</h3><b class="num">${number}</b><p class="sub">${source}</p></section>`;
    stationSet(pane.querySelector('#stationConditions'),
      tile('🌧 Pluie prévue', stationValue(s.rain, 'mm/h', 1), stationValue(s.pp, '%') + ' probabilité · quantité : ' + esc(s.rainSource) + ' · probabilité : modèle de base') +
      (s.snow != null ? tile('❄ Neige prévue', stationValue(s.snow, 'cm/h', 1), 'Prévision horaire · ' + esc(s.modelSource) + ' · pas une observation') : '') +
      tile('💨 Vent · rafales', stationValue(s.wind, 'km/h') + ' · ' + stationValue(s.gust, 'km/h'), esc(s.modelSource) + ' · prévision horaire') +
      tile('👁 Visibilité · brouillard', stationValue(s.vis, 'm'), 'Open-Meteo · modèle de base · ' + esc(s.fog)) +
      tile('🛣 Chaussée estimée', stationValue(s.roadT, '°C', 1), 'Moteur Race Control · estimation, pas un capteur routier') +
      tile('❄ Gel · verglas', s.ice == null ? '—' : ['Faible', 'Modéré', 'Élevé', 'Critique'][Math.min(3, s.ice)], 'Moteur Race Control · risque estimé, ponts et ombre peuvent différer') +
      tile('🚦 Risque routier', s.road && Number.isFinite(s.road.score) ? ['Faible', 'Modéré', 'Élevé', 'Critique'][s.road.level] : 'Données insuffisantes', s.road ? esc(s.road.window.label) + ' · même période et mêmes facteurs que Météo' : 'Moteur indisponible'));
    stationSet(pane.querySelector('#stationNext'), `<b>Prochain changement prévu</b><span>${s.nextChange ? esc(s.nextChange.t + ' · ' + s.nextChange.text) : 'Aucun changement significatif identifié dans les prévisions disponibles'}</span>${s.fresh ? '' : '<small>Prévision en cache ou indisponible ; aucune nouvelle alerte système.</small>'}`);
    stationSet(pane.querySelector('#stationSources'), `<h3>Sources et fraîcheur</h3><p>${esc(s.modelSource)} · températures, vent et quantités selon les champs réellement disponibles.</p><p>Visibilité et probabilité de pluie : modèle de base Open-Meteo.</p><p>Chaussée et verglas : résultats du moteur Race Control.</p>${s.observation ? `<p>Mesure observée : station ${esc(s.observation.name || s.observation.id)} · ${esc(s.observation.t)} · âge ${esc(ageTxt(s.observation.ageMin))} · ${stationValue(s.observation.T, '°C', 1)}.</p>` : '<p>Aucune mesure de station disponible ; les modèles ne sont pas des observations.</p>'}<p>${s.expired ? 'Données expirées ou couverture horaire indisponible.' : 'Prévisions consultables pour les échéances présentes.'}</p><p>Mini-cockpit : ${'documentPictureInPicture' in window ? 'disponible sur demande' : 'non pris en charge ; utiliser cette station ou une fenêtre de navigateur existante'}.</p>`);
    stationSet(pane.querySelector('#stationJournal'), h.events.slice().reverse().map(x => `<li><time class="num">${esc(hmLocal(x.at))}</time><span class="station-kind">${({ observation: 'Mesure observée', prévision: 'Révision de prévision', estimation: 'Estimation recalculée', statut: 'Statut des données' })[x.kind]}</span><span>${esc(x.text)}</span></li>`).join(''));
    stationSet(pane.querySelector('#stationAlertList'), h.alerts.slice().reverse().map(x => `<li class="lv${x.level}"><time class="num">${esc(hmLocal(x.at))}</time> ${esc(x.text)}</li>`).join('') || '<li>Aucun nouveau franchissement détecté pendant la surveillance.</li>');
  } else {
    ['stationCurrent', 'stationChart', 'stationConditions', 'stationNext', 'stationSources'].forEach(id => stationSet(pane.querySelector('#' + id), '<p class="sub">Données indisponibles. La station attend le modèle du lieu sélectionné.</p>'));
    stationSet(pane.querySelector('#stationHours'), '');
    stationSet(pane.querySelector('#stationJournal'), ''); stationSet(pane.querySelector('#stationAlertList'), '<li>Météo indisponible pour ce lieu ; nouvelles alertes suspendues.</li>');
  }
  const alertBtn = pane.querySelector('[data-act="station-alerts"]'); alertBtn.setAttribute('aria-pressed', String(st.enabled)); alertBtn.textContent = st.enabled ? 'Désactiver les alertes' : 'Activer les alertes';
  const silentBtn = pane.querySelector('[data-act="station-silent"]'); silentBtn.setAttribute('aria-pressed', String(st.silent)); silentBtn.textContent = 'Mode silencieux : ' + (st.silent ? 'oui' : 'non');
  const mini = pane.querySelector('[data-act="station-mini"]'); mini.disabled = !('documentPictureInPicture' in window) || st.openingPip; mini.title = mini.disabled ? 'Mini-fenêtre native non prise en charge ; la station reste disponible' : 'Ouvrir une mini-fenêtre flottante sur demande';
  const nBtn = pane.querySelector('[data-act="station-notifications"]'); nBtn.disabled = !window.Notification || Notification.permission === 'denied'; nBtn.textContent = st.system ? 'Désactiver Windows' : 'Autoriser Windows';
  pane.querySelector('#stationPermission').textContent = stationPermissionText();
  renderWeatherStationMini();
}
function renderWeatherStationMini() {
  const st = WX_STATION, win = st.pip; if (!win || win.closed) return;
  const s = st.snapshot;
  stationSet(win.document.getElementById('stationMiniData'), s ? `<span class="station-kicker">${esc(s.mode)} · il y a ${s.ageMin != null ? esc(ageTxt(s.ageMin)) : '—'}</span><div class="station-temp num">${stationValue(s.current.T, '', 1)}<small> °C</small></div><p>${s.fresh ? 'Valeur actuelle du modèle' : 'Dernière valeur du modèle'}</p><p>${s.nextChange ? esc(s.nextChange.t + ' · ' + s.nextChange.text) : 'Pas de changement significatif prévu'}</p><p class="sub">${esc(s.modelSource)}</p>` : '<p>Météo indisponible</p>');
}
async function weatherStationMini() {
  const st = WX_STATION; if (!st.active || !weatherStationDesktop() || !window.documentPictureInPicture || st.openingPip || LOCKED()) return;
  if (st.pip && !st.pip.closed) { st.pip.focus(); return; }
  st.openingPip = true;
  try {
    const win = await documentPictureInPicture.requestWindow({ width: 390, height: 340 });
    if (!st.active || LOCKED()) { win.close(); return; }
    st.pip = win; win.document.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') || 'dark');
    win.document.documentElement.lang = 'fr'; win.document.title = 'Race Control · Mini-cockpit';
    document.querySelectorAll('head style').forEach(style => win.document.head.appendChild(style.cloneNode(true)));
    win.document.body.className = 'station-mini-body';
    win.document.body.innerHTML = '<main class="station-mini"><h2>Weather Watch</h2><div id="stationMiniData"></div><button class="btn" data-act="station-return">Revenir à Race Control</button><p class="sub">Surveillance pendant l’exécution du navigateur uniquement.</p></main>';
    win.document.querySelector('[data-act="station-return"]').addEventListener('click', () => { window.focus(); win.close(); });
    win.addEventListener('pagehide', () => { if (st.pip === win) st.pip = null; });
    renderWeatherStationMini();
  } catch (e) { st.message = 'Mini-fenêtre indisponible ou refusée ; la station reste disponible'; }
  finally { st.openingPip = false; renderWeatherStation(); }
}
async function weatherStationAction(a, button) {
  if (a === 'station-open') weatherStationOpen(button);
  else if (a === 'station-close') weatherStationClose();
  else if (a === 'station-alerts') { WX_STATION.enabled = !WX_STATION.enabled; WX_STATION.rebaseline = true; renderWeatherStation(); }
  else if (a === 'station-silent') { WX_STATION.silent = !WX_STATION.silent; renderWeatherStation(); }
  else if (a === 'station-mini') await weatherStationMini();
  else if (a === 'station-return') { window.focus(); if (WX_STATION.pip) WX_STATION.pip.close(); }
  else if (a === 'station-notifications') {
    if (WX_STATION.system) WX_STATION.system = false;
    else if (window.Notification && window.isSecureContext) {
      try {
        const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
        WX_STATION.system = permission === 'granted';
        if (WX_STATION.system) { WX_STATION.silent = false; WX_STATION.enabled = true; WX_STATION.rebaseline = true; }
      } catch (e) { WX_STATION.message = 'Autorisation impossible ; alertes visuelles disponibles'; }
    }
    renderWeatherStation();
  } else return false;
  return true;
}
