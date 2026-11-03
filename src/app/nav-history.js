// Historique de navigation (bouton Retour du navigateur sur PC, geste retour sur iPhone) entre les vues de l'app et le
// panneau Paramètres. Chaque changement de vue ou ouverture du panneau crée UNE entrée ; Retour revient à la vue
// précédente ou ferme le panneau ; depuis la vue d'arrivée, Retour quitte l'app (aucune entrée ajoutée : pas de boucle).
// L'URL ne porte que l'identifiant de la vue (?vue=garage), jamais une donnée ; le panneau ouvert reste dans l'état de
// l'historique. Le hash reste réservé à l'import de configuration (#cfg=…). Rechargement sur une vue : même vue.
const NAV = { ready: false, applying: false };
const NAV_VIEWS = ['pneus', 'meteo', 'trajet', 'garage', 'analyse'];
function navViewFromUrl() {
  try { const v = new URLSearchParams(location.search).get('vue'); return NAV_VIEWS.includes(v) ? v : null; } catch { return null; }
}
function navUrl(view) {
  const u = new URL(location.href);
  for (const k of [...u.searchParams.keys()]) if (k !== 'vue') u.searchParams.delete(k);   // aucune autre donnée dans l'URL
  u.searchParams.set('vue', view);
  return u.pathname + u.search + u.hash;
}
const navPanelOpen = () => { const s = document.getElementById('settings'); return !!(s && s.open); };
function navInit() {
  if (NAV.ready) return;
  try { history.replaceState({ rc: 1, vue: UI.view, panel: navPanelOpen() ? 'settings' : null }, '', navUrl(UI.view)); NAV.ready = true; } catch { /* historique indisponible */ }
}
function navPush(vue, panel) {
  if (!NAV.ready || NAV.applying) return;
  const cur = history.state || {};
  if (cur.rc && cur.vue === vue && (cur.panel || null) === (panel || null)) return;
  try { history.pushState({ rc: 1, vue, panel: panel || null }, '', navUrl(vue)); } catch { /* historique indisponible */ }
}
// Vue changée sans chooseView (démarrage, affectation directe) : l'entrée COURANTE est corrigée, aucune entrée ajoutée.
function navSync() {
  if (!NAV.ready || NAV.applying) return;
  const cur = history.state || {};
  if (cur.rc && cur.vue !== UI.view && NAV_VIEWS.includes(UI.view)) try { history.replaceState({ ...cur, vue: UI.view }, '', navUrl(UI.view)); } catch { /* historique indisponible */ }
}
// Panneau Paramètres : ouverture = une entrée ; fermeture à la main = cette entrée consommée (Retour ne « ferme » pas deux fois).
document.addEventListener('toggle', e => {
  if (!NAV.ready || NAV.applying || !e.target || e.target.id !== 'settings') return;
  const cur = history.state || {};
  if (e.target.open) navPush(UI.view, 'settings');
  else if (cur.rc && cur.panel === 'settings') { NAV.applying = true; try { history.back(); } finally { setTimeout(() => { NAV.applying = false; }, 0); } }
}, true);
window.addEventListener('popstate', e => {
  const st = e.state;
  if (!st || !st.rc) return;
  NAV.applying = true;
  try {
    const set = document.getElementById('settings');
    if (set && set.open !== (st.panel === 'settings')) set.open = st.panel === 'settings';
    if (NAV_VIEWS.includes(st.vue) && st.vue !== UI.view) chooseView(st.vue);
  } finally { setTimeout(() => { NAV.applying = false; }, 0); }
});
navInit();
