let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (CX) drawChart(); }, 150); });
let gpsResumeAt = -Infinity;
function resumeGps() {
  if (document.hidden || !S.gpsAuto || location.protocol !== 'https:' || Date.now() - gpsResumeAt < 750) return;
  gpsResumeAt = Date.now(); stopGps(); startWatch(LIVE.phase === 'active' || !FIX || FIX.acc > PLACE_ACC_GPS, true); locate(false, true);
}
// iOS peut abandonner le watch et une demande ponctuelle pendant la veille : recréer les deux à la reprise.
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopGps(); gpsResumeAt = -Infinity; } else { if (checkSessionExpiry()) return; tripCancelSchedulePurge(); tickLocalClock(); resumeGps(); } });
['pageshow', 'focus'].forEach(ev => window.addEventListener(ev, () => { if (checkSessionExpiry()) return; tripCancelSchedulePurge(); if (APP_CONTEXT.ready) tickLocalClock(); resumeGps(); }));
// actualisation automatique : toutes les 5 min tant que l'app est à l'écran, et dès le retour dans l'app
// (vérification toutes les 30 s : résiste à la mise en veille des minuteurs par iOS)
const AUTO_MS = 5 * 60e3;
// Blocage fail-closed de l'interface : aucun rechargement si des données attendent encore leur sauvegarde.
// Le magasin chiffré refuse lui-même lecture et écriture dès l'expiration, même si iOS suspend les timers.
let SESSION_EXPIRING = false;
function showSessionExpiry() {
  if (SESSION_EXPIRING || !document.body) return;
  SESSION_EXPIRING = true;
  stopGps();
  const vs = window.TWRC_VAULT;
  const pending = !!(vs && vs.pendingRecovery);
  document.body.classList.add('twrc-session-expired');
  const pane = document.createElement('div');
  pane.id = 'twrcExpiryOverlay';
  pane.setAttribute('role', 'dialog');
  pane.setAttribute('aria-modal', 'true');
  pane.setAttribute('aria-labelledby', 'twrcExpiryTitle');
  pane.innerHTML = `<div class="twrc-expiry-card">
    <h2 id="twrcExpiryTitle">🔒 Session de 7 jours expirée</h2>
    <p>Pour protéger tes données, Race Control est verrouillé. Ressaisis ton code pour continuer.</p>
    ${pending ? '<p class="twrc-expiry-warning" role="alert">Des changements attendent encore leur sauvegarde. Ne ferme pas cet onglet : ressaisis ton code pour réessayer le chiffrement sans les perdre. Si le stockage est plein, libère de la place sans fermer cette page.</p>' : ''}
    <form id="twrcExpiryForm" autocomplete="on">
      <input type="text" name="username" autocomplete="username" value="Race Control" readonly tabindex="-1" aria-hidden="true" class="sr-only">
      <label for="twrcExpiryPassword">Code de déverrouillage</label>
      <input type="password" name="password" id="twrcExpiryPassword" autocomplete="current-password" required>
      <label class="twrc-expiry-remember"><input id="twrcExpiryRemember" type="checkbox"> Rester connecté 7 jours sur cet appareil personnel</label>
      <button type="submit" class="btn pri">Déverrouiller et récupérer</button>
      <p id="twrcExpiryMessage" role="status" aria-live="polite"></p>
    </form>
    ${pending ? '' : '<button type="button" class="btn" id="twrcExpiryLock">Verrouiller cet appareil</button>'}
  </div>`;
  document.body.appendChild(pane);
  document.body.style.overflow = 'hidden';
  pane.querySelector('#twrcExpiryPassword').focus({ preventScroll: true });
  pane.querySelector('#twrcExpiryForm').addEventListener('submit', async e => {
    e.preventDefault();
    const input = pane.querySelector('#twrcExpiryPassword');
    const message = pane.querySelector('#twrcExpiryMessage');
    const button = pane.querySelector('button[type=submit]');
    button.disabled = true;
    message.textContent = 'Vérification du code et sauvegarde chiffrée…';
    const ok = await unseal(input.value.trim(), pane.querySelector('#twrcExpiryRemember').checked);
    if (ok) {
      // La récupération des écritures en attente est vérifiée et chiffrée AVANT le rechargement.
      location.reload();
    } else {
      button.disabled = false;
      message.textContent = (vs && vs.pendingRecovery)
        ? 'Déverrouillage ou sauvegarde impossible. Les modifications restent en mémoire : garde cette page ouverte et réessaie. '
          + (unseal.error || '')
        : unseal.error || 'Code incorrect.';
      input.focus();
    }
  });
  const lock = pane.querySelector('#twrcExpiryLock');
  if (lock) lock.addEventListener('click', async () => {
    lock.disabled = true;
    try { await vs.lock(); location.reload(); }
    catch (e) {
      pane.querySelector('#twrcExpiryMessage').textContent = 'Verrouillage impossible : le coffre n’a pas été modifié. Réessaie.';
      lock.disabled = false;
    }
  });
}
function checkSessionExpiry() {
  const vs = window.TWRC_VAULT;
  if (!vs || !vs.expired()) return false;
  showSessionExpiry();
  return true;
}
window.addEventListener('twrc-session-expired', showSessionExpiry);
// Intercepter les interactions avant tout handler applicatif ; aucun tap ne peut utiliser un état expiré.
for (const name of ['pointerdown', 'click', 'keydown', 'input', 'change', 'submit', 'touchstart']) {
  document.addEventListener(name, event => {
    if (!checkSessionExpiry()) return;
    const pane = document.getElementById('twrcExpiryOverlay');
    if (!pane || pane.contains(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (name === 'keydown') pane.querySelector('#twrcExpiryPassword').focus({ preventScroll: true });
  }, true);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkSessionExpiry(); });
['pageshow', 'focus'].forEach(ev => window.addEventListener(ev, checkSessionExpiry));
function armSessionDeadline() {
  const vs = window.TWRC_VAULT;
  if (!vs || vs.mode !== 'vault' || !vs.expiresAt) return;
  setTimeout(checkSessionExpiry, Math.max(0, vs.expiresAt - Date.now()));
}
function validateRecovery(reason) {
  const before = USER_STORE.durability(), ok = USER_STORE.retry(), after = USER_STORE.durability();
  if (before.status === 'degraded' && ok && after.status === 'durable' && RUNTIME_RECORDER)
    RUNTIME_RECORDER.record('storage-recovered', reason || 'automatic');
  if (APP_CONTEXT.ready) { renderStatus(); renderDiag(); }
  return ok;
}
let LOCAL_CLOCK_MINUTE = null;
let LOCAL_WEATHER_DEFERRED = false, LIVE_CLOCK_TIMER = null;
function renderTemporalWeather() {
  if (APP_CONTEXT.rendering) return;
  const y = window.scrollY;
  APP_CONTEXT.rendering = true;
  try {
    APP_CONTEXT.calendarLegs = null;
    appRefreshContext({ persist: false }); recordJournal();
    // Ne pas reconstruire un formulaire en cours de saisie. Sa projection reprend à la sortie du champ.
    const project = (selector, draw) => {
      const root = document.querySelector(selector), active = document.activeElement;
      if (root && root.contains(active) && active.matches('input,textarea,select,[contenteditable="true"]')) { LOCAL_WEATHER_DEFERRED = true; return; }
      draw();
    };
    renderStatus(); project('#srcline', renderSrc); renderNotice(); renderBanners();
    if (UI.view === 'meteo') {
      project('#secWx', renderWx); renderCurrent(); renderChartShell(); renderDays(); renderIce(); renderAlerts(); renderWeatherStationButton();
    } else if (UI.view === 'analyse') project('#secLab', () => { renderLab(); labThermTick(false); });
    else if (UI.view === 'trajet') project('#secTrip', () => { renderTripView(); renderTripSummary(); });
    else if (UI.view === 'tenue') project('#secTenue', renderTenue);
    else if (UI.view === 'pneus') {
      project('#secCars', renderCars); renderDecisionCore(); renderBrfCore(); renderBrief(); renderCompare(); renderSeason(); renderAlerts();
    }
    renderWeatherStation();
  } finally { APP_CONTEXT.rendering = false; }
  if (Number.isFinite(y)) window.scrollTo({ top: y, behavior: 'instant' });
}
function tickLocalClock(force = false) {
  updateLiveClock();
  if (!APP_CONTEXT.ready) return;
  const minute = Math.floor(Date.now() / 60000);
  if (!force && minute === LOCAL_CLOCK_MINUTE) { renderLiveStatus(); return; }
  LOCAL_CLOCK_MINUTE = minute;
  if (offlineNow()) markOfflineCache();
  if (!DEMO.on && APP_CONTEXT.ready) {
    rebuild(); renderTemporalWeather();
  } else renderLiveStatus();
}
document.addEventListener('focusout', () => {
  if (LOCAL_WEATHER_DEFERRED) { LOCAL_WEATHER_DEFERRED = false; setTimeout(() => { if (!document.hidden) tickLocalClock(true); }, 0); }
});
function stopLiveClock() { clearTimeout(LIVE_CLOCK_TIMER); LIVE_CLOCK_TIMER = null; }
function startLiveClock() {
  stopLiveClock();
  if (document.hidden || checkSessionExpiry()) return;
  const pulse = () => {
    LIVE_CLOCK_TIMER = null;
    if (document.hidden || checkSessionExpiry()) return;
    updateLiveClock();
    if (Math.floor(Date.now() / 60000) !== LOCAL_CLOCK_MINUTE) tickLocalClock();
    LIVE_CLOCK_TIMER = setTimeout(pulse, 1000 - Date.now() % 1000);
  };
  pulse();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) stopLiveClock(); else startLiveClock(); });
window.addEventListener('pagehide', stopLiveClock);
['pageshow', 'focus'].forEach(ev => window.addEventListener(ev, startLiveClock));
function autoTick() {
  if (document.hidden && !weatherStationRunning()) return;
  if (window.TWRC_VAULT && window.TWRC_VAULT.expired()) { checkSessionExpiry(); return; }
  tickLocalClock(); // horloge et prévisions locales progressent même hors ligne, pendant une requête ou un 429
  calendarOriginPurge();
  if (USER_STORE.durability().status === 'degraded') validateRecovery('retry périodique');
  if (navigator.onLine !== false && Reliability.isDue(VER_CHECK_AT, AUTO_MS)) loadVersion(true); else enforceVersionCoherence();
  if (!DEMO.on && expireLive()) tickLocalClock(true);   // reprise : requalification avant toute requête
  if (DEMO.on || busy || (navigator.onLine === false)) return;
  const now = Date.now();
  if (weatherCheckAt(lastOk, lastTry, WEATHER_REQUESTS.state().until, now, AUTO_MS) <= now)
    weatherStationAutoRefresh().catch(() => { /* prochaine échéance du moteur */ });
}
setInterval(autoTick, 30e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(autoTick, 300); });
function networkChanged() {
  if (checkSessionExpiry()) return;
  if (offlineNow()) { markOfflineCache(); rebuild(); renderAll(); loadCalendar(); }
  else {
    calendarOriginRetryRoutes();
    if (USER_STORE.durability().status === 'degraded') validateRecovery('retour réseau');
    else renderStatus();
    // Retour réseau : rafraîchir ce qui est périmé, sans contourner les caches (iOS émet « online » à chaque bascule Wi-Fi/4G).
    loadVersion(true); refreshAll(false);
  }
}
window.addEventListener('offline', networkChanged);
window.addEventListener('online', networkChanged);
['pageshow', 'focus'].forEach(ev => window.addEventListener(ev, () => setTimeout(autoTick, 300)));

/* ---------- démarrage ---------- */
function registerSW() {
  try {
    if ('serviceWorker' in navigator && location.protocol === 'https:' && /github\.io$/.test(location.hostname))
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(e => { if (RUNTIME_RECORDER) RUNTIME_RECORDER.record('service-worker', e); });
  } catch (e) { if (RUNTIME_RECORDER) RUNTIME_RECORDER.record('service-worker', e); }
}
document.addEventListener('toggle', e => { if (e.target && e.target.id === 'settings' && e.target.open) renderSettings(true); }, true);
(function init() {
  if (LOCKED() && lsGet('twrc.key')) unseal(lsGet('twrc.key'), false).then(ok => { if (ok) location.reload(); });
  armSessionDeadline();
  registerSW(); readGeoPermission(); refreshTireDB(); tripCancelSchedulePurge();
  if (GPS && !(locHasCoords(GPS) && Number.isFinite(GPS.t) && GPS.t <= Date.now() + 60e3 && Number.isFinite(GPS.acc) && GPS.acc >= 0 && GPS.acc <= PLACE_ACC_APPROX)) { GPS = null; try { APP_STORAGE.removeItem('twrc.gps'); } catch (e) { /* stockage */ } }   // ancienne position imprécise ou invalide : jamais un lieu fiable
  if (S.gpsAuto && GPS) UI.loc = 'gps';
  { const c = placeNow(); if (c.source === 'manual') UI.loc = c.place.id; }   // lieu confirmé : contexte de tous les modules (origine verrouillée)
  if (S.gpsAuto && location.protocol === 'https:') setTimeout(() => locate(false), 400);
  loadCache(); if (offlineNow()) markOfflineCache(); rebuild(); APP_CONTEXT.ready = true; renderSettings(); renderAll();
  LOCAL_CLOCK_MINUTE = Math.floor(Date.now() / 60000); startLiveClock();
  if (offlineNow()) loadCalendar(); else refreshAll();
})();
