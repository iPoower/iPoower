// Historique de navigation (bouton Retour du navigateur sur PC, geste retour sur iPhone) entre les vues de l'app et le
// panneau Paramètres. Chaque changement de vue ou ouverture du panneau PAR L'UTILISATEUR crée UNE entrée ; Retour revient à
// la vue précédente ou ferme le panneau ; depuis la vue d'arrivée, Retour quitte l'app (aucune entrée ajoutée : pas de boucle).
// La vue et le panneau sont gardés dans l'ÉTAT de l'historique (history.state), jamais dans l'URL : l'app ne modifie jamais
// l'adresse (paramètres étrangers et fragment #cfg=… conservés, un rechargement vise exactement l'adresse chargée).
// INVARIANT : l'historique n'est touché que PENDANT un geste de l'utilisateur (clic, touche, appui sur un onglet de vue ou
// sur le panneau). Jamais au chargement, au rechargement, au verrouillage ou au déverrouillage, lors d'un changement de vue
// automatique, ni quand le code ouvre le panneau de lui-même : hors geste, l'app se comporte comme main (aucune navigation
// interne au document, qui serait vue par le navigateur et les outils de test comme une navigation).
// L'entrée courante n'est étiquetée (vue affichée) qu'au moment du geste suivant, juste avant la nouvelle entrée.
// Rechargement : seule la vue CHOISIE par l'utilisateur sur cette entrée (pick, posé par un geste, comme rc.tab) est
// restaurée, jamais une vue affichée automatiquement (même règle que main). Un lien direct ?vue=garage reste lu à
// l'ouverture (voir UI.view dans app.js), sans être réécrit. Mode sans code : même comportement (aucune condition de verrou).
const NAV = { ready: false, applying: false, shown: null, panelBefore: false };
const NAV_VIEWS = ['pneus', 'meteo', 'trajet', 'garage', 'analyse'];
const navPanelOpen = () => { const s = document.getElementById('settings'); return !!(s && s.open); };
function navInit() {
  if (NAV.ready) return;
  NAV.ready = true; NAV.shown = UI.view;   // aucune écriture d'historique au chargement
}
// Appelée seulement pendant un geste (chooseView, panneau) : étiquette l'entrée courante avec la vue AFFICHÉE avant le
// geste, puis ajoute l'entrée du geste. État seul : l'URL n'est jamais modifiée.
function navPush(vue, panel) {
  if (!NAV.ready || NAV.applying) return;
  const raw = history.state, shown = NAV_VIEWS.includes(NAV.shown) ? NAV.shown : vue;
  let cur = raw && raw.rc === 1 ? raw : null;
  try {
    if (!cur || cur.vue !== shown) { cur = { rc: 1, vue: shown, panel: cur ? cur.panel || null : null, pick: cur && cur.pick || null }; history.replaceState(cur, ''); }
    if (cur.vue === vue && (cur.panel || null) === (panel || null)) return;
    // pick : vue choisie par un geste (chooseView) ; l'ouverture du panneau garde le choix de l'entrée précédente.
    history.pushState({ rc: 1, vue, panel: panel || null, pick: vue !== cur.vue ? vue : cur.pick || null }, '');
  } catch { /* historique indisponible */ }
}
// Vue changée (geste, démarrage, affectation directe) : seule la mémoire de la vue affichée est mise à jour, aucune
// écriture d'historique (l'entrée courante sera étiquetée au prochain geste).
function navSync() { if (NAV.ready) NAV.shown = UI.view; }
// Panneau Paramètres : seule une ouverture ou fermeture produite par un VRAI geste (clic ou touche de l'utilisateur, sur
// le résumé du panneau, un bouton « Réglages » ou un lien) touche l'historique ; ouverture = une entrée ; fermeture = cette
// entrée consommée (Retour ne « ferme » pas deux fois). Le code qui ouvre le panneau de lui-même n'ajoute rien.
document.addEventListener('click', e => { NAV.panelBefore = navPanelOpen(); }, true);
window.addEventListener('click', e => {
  if (!e.isTrusted || !NAV.ready || NAV.applying) return;
  const sum = e.target && e.target.closest ? e.target.closest('#settings > summary') : null;
  const before = NAV.panelBefore, after = sum && !e.defaultPrevented ? !before : navPanelOpen();   // le résumé bascule après le clic
  const cur = history.state || {};
  if (!before && after) navPush(UI.view, 'settings');
  else if (before && !after && cur.rc && cur.panel === 'settings') { NAV.applying = true; try { history.back(); } finally { setTimeout(() => { NAV.applying = false; }, 0); } }
});
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
