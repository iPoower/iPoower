// Historique de navigation (bouton Retour du navigateur sur PC, geste retour sur iPhone) entre les vues de l'app et le
// panneau Paramètres. Chaque changement de vue ou ouverture du panneau crée UNE entrée ; Retour revient à la vue
// précédente ou ferme le panneau ; depuis la vue d'arrivée, Retour quitte l'app (aucune entrée ajoutée : pas de boucle).
// La vue et le panneau sont gardés dans l'ÉTAT de l'historique (history.state), jamais dans l'URL : l'app ne modifie
// l'adresse ni au chargement, ni lors d'un changement de vue, ni lors d'une correction d'état (navSync). Les paramètres et
// le hash présents (paramètres étrangers, #cfg=… de l'import de configuration) restent donc tels quels, et un rechargement
// vise exactement l'adresse chargée. Rechargement : seule la vue CHOISIE par l'utilisateur sur cette entrée (pick, posé par un
// geste, comme rc.tab) est restaurée, jamais une vue affichée automatiquement (même règle que main). Un lien direct
// ?vue=garage reste lu à l'ouverture (voir UI.view dans app.js), sans être réécrit.
const NAV = { ready: false, applying: false };
const NAV_VIEWS = ['pneus', 'meteo', 'trajet', 'garage', 'analyse'];
const navPanelOpen = () => { const s = document.getElementById('settings'); return !!(s && s.open); };
function navInit() {
  if (NAV.ready) return;
  // État seul, URL inchangée (un rechargement vise exactement l'adresse chargée).
  const cur = history.state && history.state.rc === 1 ? history.state : null;   // rechargement : choix de l'entrée conservé
  try { history.replaceState({ rc: 1, vue: UI.view, panel: navPanelOpen() ? 'settings' : null, pick: cur && cur.pick || null }, ''); NAV.ready = true; } catch { /* historique indisponible */ }
}
function navPush(vue, panel) {
  if (!NAV.ready || NAV.applying) return;
  const cur = history.state || {};
  if (cur.rc && cur.vue === vue && (cur.panel || null) === (panel || null)) return;
  // État seul : l'URL n'est jamais modifiée (paramètres étrangers et fragment conservés).
  // pick : vue choisie par un geste (chooseView) ; l'ouverture du panneau garde le choix de l'entrée précédente.
  try { history.pushState({ rc: 1, vue, panel: panel || null, pick: vue !== cur.vue || !cur.rc ? vue : cur.pick || null }, ''); } catch { /* historique indisponible */ }
}
// Vue changée sans chooseView (démarrage, affectation directe) : l'état de l'entrée COURANTE est corrigé, aucune entrée
// ajoutée, URL inchangée.
function navSync() {
  if (!NAV.ready || NAV.applying) return;
  const cur = history.state || {};
  if (cur.rc && cur.vue !== UI.view && NAV_VIEWS.includes(UI.view)) try { history.replaceState({ ...cur, vue: UI.view }, ''); } catch { /* historique indisponible */ }
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
