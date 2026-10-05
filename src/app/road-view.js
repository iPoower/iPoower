// Une carte compacte ; les données privées du trajet restent dans ce contexte mémoire.
const ROAD = { manager: null, alert: null, alertAt: 0, key: null, route: null };
function roadManager() {
  if (!ROAD.manager) {
    let storage = null; try { storage = localStorage; } catch (e) { /* stockage bloqué */ }
    ROAD.manager = new RoadProviders.Manager({ providers: [new RoadProviders.DatexRoadProvider((u, o) => fetch(u, o))], storage, onChange: renderRoad });
  }
  return ROAD.manager;
}
const roadAge = ms => ms == null ? 'âge inconnu' : ms < 60000 ? `${Math.floor(ms / 1000)} s` : `${Math.floor(ms / 60000)} min`;
const roadDistance = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
function roadStatus(p) {
  if (p.active) return 'LIVE';
  if (p.confirmed) return 'Récent';
  return ({ idle: 'En attente', loading: 'Actualisation', cached: 'Cache · non vérifié', offline: 'Hors ligne · cache', stale: 'Périmé', disabled: 'Désactivé', timeout: 'Délai dépassé', unauthorized: 'Accès refusé', limited: 'Quota limité', unavailable: 'Indisponible' })[p.state] || 'Indisponible';
}
function roadSync() {
  try {
    const manager = roadManager(), enabled = S.road.on === 1;
    if (manager.states.get('datex').provider.enabled !== enabled) manager.setEnabled('datex', enabled);
    const allowed = enabled && !LOCKED() && !DEMO.on && LIVE.key && LIVE.phase !== 'idle';
    const route = allowed && LIVE.route && LIVE.route.road && FIX && liveRouteCurrent(LIVE.route, liveOrigin(FIX)) ? LIVE.route.road : null;
    if (ROAD.key !== LIVE.key || ROAD.route !== route) { ROAD.alert = null; ROAD.key = LIVE.key; ROAD.route = route; }
    manager.setContext(route ? { key: LIVE.key, route, fix: FIX, phase: LIVE.phase } : null);
    if (document.hidden || offlineNow()) manager.suspend();
    renderRoad();
    manager.refresh({ online: !offlineNow(), visible: !document.hidden }).catch(() => {});
  } catch (e) { const el = $('#secRoad'); if (el) { el.hidden = true; el.innerHTML = ''; } }
}
function renderRoad() {
  const el = $('#secRoad'); if (!el) return;
  const show = !LOCKED() && !DEMO.on && S.road.on === 1 && LIVE.key && LIVE.phase !== 'idle' && UI.view === 'pneus';
  el.hidden = !show; if (!show) { el.innerHTML = ''; ROAD.alert = null; return; }
  const manager = ROAD.manager; if (!manager) return;
  const v = manager.snapshot({ online: !offlineNow() }), p = v.providers[0], now = Date.now();
  if (ROAD.alert && (now - ROAD.alertAt > 45000 || !v.fresh || !v.events.some(e => e.id === ROAD.alert.id && e.alertEligible))) ROAD.alert = null;
  if (!document.hidden && !ROAD.alert) { const a = manager.nextAlert({ online: !offlineNow() }); if (a) { ROAD.alert = a; ROAD.alertAt = now; } }
  const message = !manager.context ? 'Position précise et trajet OSRM courant requis.' : v.reason === 'gps_uncertain' ? 'Position trop ancienne ou imprécise · signalements masqués.' : v.reason === 'off_route' ? 'Position hors du trajet · recalcul OSRM attendu.' : !v.events.length ? p.confirmed ? 'Aucun événement correspondant dans cette source disponible. Couverture partielle.' : 'Source non vérifiée : aucun état de la circulation ne peut être confirmé.' : '';
  const card = e => `<li><b>${esc(e.title)} · ${esc(e.roadNumber)}</b><span class="road-distance">${roadDistance(e.distanceAhead)} devant${e.etaToEvent == null ? '' : ` · ~${Math.max(1, Math.ceil(e.etaToEvent / 60))} min (OSRM)`}</span>${e.laneInfo ? `<span>${esc(e.laneInfo)}</span>` : ''}${e.delaySeconds == null ? '' : `<span>Délai signalé : ${Math.ceil(e.delaySeconds / 60)} min · source</span>`}<small>${esc(e.producer || e.provider)} · mise à jour ${roadAge(Math.max(0, now - Date.parse(e.updatedAt)))}${!e.providerFresh ? ' · non LIVE' : ''}</small></li>`;
  el.innerHTML = `<div class="road-head"><h2>🚧 Sur le trajet</h2><span class="badge">${esc(roadStatus(p))}</span></div>
    <p class="sub road-source">DATEX · Bison Futé / DIR · ${roadAge(p.ageMs)}<br>National non concédé · couverture partielle</p>
    ${ROAD.alert ? `<div class="road-alert" role="status">⚠️ ${esc(ROAD.alert.title)} · ${roadDistance(ROAD.alert.distanceAhead)} devant</div>` : ''}
    ${message ? `<p class="sub road-message">${message}</p>` : ''}
    ${v.events.length ? `<ul class="road-events">${v.events.slice(0, 3).map(card).join('')}</ul>` : ''}
    ${v.events.length > 3 ? `<details><summary>${v.events.length - 3} autre(s) signalement(s)</summary><ul class="road-events">${v.events.slice(3, 10).map(card).join('')}</ul>${v.events.length > 10 ? '<p class="sub">Les dix signalements les plus proches sont affichés.</p>' : ''}</details>` : ''}
    <p class="sub road-eta">ETA : OSRM · trafic non inclus. ${v.flows.length ? v.flows.slice(0, 2).map(e => `${esc(e.roadNumber)} : ${e.currentSpeed == null ? 'vitesse inconnue' : `${e.currentSpeed} km/h`}${e.freeFlowSpeed == null ? '' : ` (fluide : ${e.freeFlowSpeed} km/h)`} · ${esc(e.provider)}`).join(' · ') : 'Vitesses trafic indisponibles.'}</p>
    <details class="road-details"><summary>Sources et fraîcheur</summary>${v.providers.map(s => `<p class="sub">${esc(s.label)} : ${esc(roadStatus(s))} · ${roadAge(s.ageMs)}<br>${esc(s.coverage || 'Couverture nationale partielle')}<br>Vérification : ${esc(s.checkedAt || 'aucune')}<br>Publication : ${esc(s.publicationTime || 'inconnue')}</p>`).join('')}<p class="sub">Correspondance stricte : axe, sens, géométrie, validité et progression. Les situations ambiguës sont masquées. Les alertes sont visuelles, app ouverte.</p><a href="https://www.bison-fute.gouv.fr/donnees-sur-la-circulation-du.html" target="_blank" rel="noopener noreferrer">Source officielle · Licence Ouverte 2.0</a>${v.events.slice(0, 10).map(e => `<p class="sub">${esc(e.title)} : ${e.provenance.map(s => `${esc(s.producer || s.provider)} · ${esc(s.sourceId)} · ${esc(s.updatedAt)}`).join('<br>')}</p>`).join('')}</details>`;
}
setInterval(() => { if (!document.hidden) roadSync(); }, 30000);
document.addEventListener('visibilitychange', roadSync);
['online', 'offline', 'pageshow'].forEach(event => window.addEventListener(event, roadSync));
