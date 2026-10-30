/* Horloge de l'appareil et fraîcheur météo : projections des états existants, aucun réseau ni stockage. */
const LIVE_TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const LIVE_RECEIPT_FORMAT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const LIVE_DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
function weatherCheckAt(lastSuccess, lastAttempt, pauseUntil, now, interval) {
  const ref = Math.max(lastSuccess || 0, lastAttempt || 0);
  return Math.max(Reliability.isDue(ref || null, interval, now) ? now : ref + interval, pauseUntil || 0);
}
function weatherLiveState({ now, receivedAt, mode, offline, busy, demo, pauseUntil, lastSuccess, lastAttempt, interval }) {
  const age = Reliability.ageMin(receivedAt, now), dated = age !== null;
  const fresh = dated && !Reliability.liveExpired(receivedAt, now) && mode === 'live';
  const limited = pauseUntil > now;
  const label = demo ? 'DÉMO' : offline ? 'HORS LIGNE' : limited ? 'LIMITÉ' : busy ? 'ACTUALISATION' : fresh ? 'LIVE' : mode ? 'CACHE' : 'INDISPONIBLE';
  const receipt = demo ? 'Simulation · aucune donnée réelle' : !dated ? 'Réception météo non datée'
    : 'Météo reçue ' + (LIVE_DAY_FORMAT.format(receivedAt) === LIVE_DAY_FORMAT.format(now) ? 'à ' : 'le ' + LIVE_DAY_FORMAT.format(receivedAt) + ' à ') + LIVE_RECEIPT_FORMAT.format(receivedAt);
  const ageText = !dated ? 'Âge des données inconnu' : 'Reçues ' + (age < 1 ? 'il y a < 1 min' : 'il y a ' + Math.floor(age) + ' min');
  const nextAt = weatherCheckAt(lastSuccess, lastAttempt, pauseUntil, now, interval);
  const next = demo ? 'Aucune vérification en simulation' : offline ? 'Vérification au retour du réseau'
    : limited ? 'fournisseur météo limité · reprise automatique après ' + LIVE_DAY_FORMAT.format(pauseUntil).slice(0, 5) + ' ' + LIVE_RECEIPT_FORMAT.format(pauseUntil)
    : busy ? (fresh ? '' : mode ? 'CACHE · ' : '') + 'actualisation en cours…'
    : nextAt <= now ? 'Prochaine vérification imminente' : 'Prochaine vérification dans environ ' + Math.ceil((nextAt - now) / 60000) + ' min';
  return { label, fresh, receipt: receipt + (dated && !fresh && mode && !demo ? ' · CACHE' : ''), detail: demo ? next : ageText + ' · ' + next, nextAt, limited, dated };
}
function statusText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
function updateLiveClock(now = Date.now()) {
  const el = document.getElementById('liveClock'); if (!el) return;
  statusText(el, LIVE_TIME_FORMAT.format(now));
  el.dateTime = new Date(now).toISOString();
}
function renderLiveStatus() {
  const root = document.getElementById('statusbar'); if (!root) return;
  // Conserver les nœuds (et le bouton focalisé) lors des changements d'âge ou de statut.
  if (!root.querySelector('#liveClock')) root.innerHTML = `<span id="weatherBadge" class="badge"><i aria-hidden="true"></i><span id="weatherState" role="status" aria-live="polite"></span></span>
    <div class="upd"><div class="status-main"><span class="live-clock-wrap" title="Horloge de cet appareil · Europe/Paris"><span aria-hidden="true">🕒</span> <span class="sr-only">Heure de l’appareil, Europe/Paris : </span><time id="liveClock" aria-live="off"></time></span><span id="weatherReceived" class="weather-received"></span></div><p id="weatherFreshness" class="status-detail" aria-live="off"></p></div>
    <button class="btn pri sm status-refresh" data-act="refresh" aria-label="Actualiser maintenant"><span class="refresh-icon" aria-hidden="true">⟳</span><span class="lg">Actualiser maintenant</span><span class="sh">Actualiser</span></button>`;
  // Hauteur réelle du bandeau collant : les liens « aller à » s'arrêtent juste dessous, titre jamais masqué.
  if (!root.dataset.h && window.ResizeObserver) {
    root.dataset.h = '1';
    new ResizeObserver(() => document.documentElement.style.setProperty('--bar-h', Math.ceil(root.parentElement.getBoundingClientRect().height) + 'px')).observe(root.parentElement);
  }
  const now = Date.now(), mode = DEMO.on ? 'demo' : mainMode(), off = !DEMO.on && offlineNow();
  const state = weatherLiveState({ now, receivedAt: DEMO.on ? null : dataAt(), mode, offline: off, busy, demo: DEMO.on,
    pauseUntil: WEATHER_REQUESTS.state().until, lastSuccess: lastOk, lastAttempt: lastTry, interval: AUTO_MS });
  statusText(root.querySelector('#weatherState'), state.label);
  root.querySelector('#weatherBadge').className = 'badge ' + (state.label === 'LIVE' ? 'live' : state.label === 'DÉMO' ? 'demo' : ['CACHE', 'LIMITÉ'].includes(state.label) ? 'cache' : '');
  const received = root.querySelector('#weatherReceived'); statusText(received, '🌦️ ' + state.receipt);
  received.title = 'Réception du modèle principal pour le lieu affiché ; une prévision n’est pas une mesure en direct.';
  statusText(root.querySelector('#weatherFreshness'), state.detail);
  const blocked = busy || state.limited && !off && !DEMO.on;
  document.querySelectorAll('[data-act="refresh"]').forEach(button => { button.disabled = blocked; button.title = busy ? 'Actualisation en cours' : state.limited && !off ? 'Reprise automatique après la pause du fournisseur météo' : ''; });
  root.querySelector('.refresh-icon').classList.toggle('spin', busy && !off);
  updateLiveClock(now);
}
