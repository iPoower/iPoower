let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (CX) drawChart(); }, 150); });
let gpsResumeAt = -Infinity;
function resumeGps() {
  if (document.hidden || !S.gpsAuto || location.protocol !== 'https:' || Date.now() - gpsResumeAt < 750) return;
  gpsResumeAt = Date.now(); stopGps(); startWatch(LIVE.phase === 'active', true); locate(false, true);
}
// iOS peut abandonner le watch et une demande ponctuelle pendant la veille : recréer les deux à la reprise.
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopGps(); gpsResumeAt = -Infinity; } else { tripCancelSchedulePurge(); resumeGps(); } });
['pageshow', 'focus'].forEach(ev => window.addEventListener(ev, () => { tripCancelSchedulePurge(); resumeGps(); }));
// actualisation automatique : toutes les 5 min tant que l'app est à l'écran, et dès le retour dans l'app
// (vérification toutes les 30 s : résiste à la mise en veille des minuteurs par iOS)
const AUTO_MS = 5 * 60e3;
function autoTick() {
  if (document.hidden) return;
  if (!DEMO.on && expireLive()) { rebuild(); renderAll(); }   // reprise : la donnée vieillie est requalifiée avant toute requête
  if (DEMO.on || busy || (navigator.onLine === false)) return;
  const ref = Math.max(lastOk || 0, lastTry || 0);
  if (Date.now() - ref >= AUTO_MS) refreshAll();
}
setInterval(autoTick, 30e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(autoTick, 300); });
function networkChanged() {
  if (offlineNow()) { markOfflineCache(); rebuild(); renderAll(); loadCalendar(); }
  else { renderStatus(); refreshAll(); }
}
window.addEventListener('offline', networkChanged);
window.addEventListener('online', networkChanged);
['pageshow', 'focus'].forEach(ev => window.addEventListener(ev, () => setTimeout(autoTick, 300)));

/* ---------- démarrage ---------- */
function registerSW() {
  try { if ('serviceWorker' in navigator && location.protocol === 'https:' && /github\.io$/.test(location.hostname)) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {}); } catch (e) { /* non disponible */ }
}
document.addEventListener('toggle', e => { if (e.target && e.target.id === 'settings' && e.target.open) renderSettings(true); }, true);
(function init() {
  if (LOCKED() && lsGet('twrc.key')) unseal(lsGet('twrc.key')).then(ok => { if (ok) location.reload(); });
  registerSW(); refreshTireDB(); tripCancelSchedulePurge();
  if (GPS && !(Number.isFinite(GPS.acc) && GPS.acc <= PLACE_ACC_APPROX)) { GPS = null; try { localStorage.removeItem('twrc.gps'); } catch (e) { /* stockage */ } }   // ancienne position réseau : jamais une position
  if (S.gpsAuto && GPS) UI.loc = 'gps';
  { const c = placeNow(); if (c.source === 'manual') UI.loc = c.place.id; }   // lieu confirmé : contexte de tous les modules (origine verrouillée)
  if (S.gpsAuto && location.protocol === 'https:') setTimeout(() => locate(false), 400);
  loadCache(); if (offlineNow()) markOfflineCache(); rebuild(); renderSettings(); renderAll();
  if (offlineNow()) loadCalendar(); else refreshAll();
})();
