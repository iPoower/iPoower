/* Présence sur ordinateur (16/11/2026) : Race Control lisible quand l'onglet reste ouvert en arrière-plan.
 * 1. Titre d'onglet et icône (pastille de couleur) = le verdict « Ici, maintenant » déjà calculé, sans nouveau calcul.
 * 2. Pastille sur l'icône de l'app installée (Badging API : Chrome, Edge, Brave sur ordinateur) dès VIGILANCE.
 * 3. Raccourcis clavier : 1 à 5 pour les onglets (ordre affiché), R pour actualiser ; jamais pendant une saisie,
 *    ni avec Ctrl, Alt ou Cmd (les raccourcis du navigateur restent intacts).
 * Confidentialité : le titre est visible dans la barre des tâches et les partages d'écran ; il ne contient jamais de lieu,
 * seulement le niveau et l'heure de départ. Icône en SVG (data:) : aucune lecture de canvas (protégée par Brave). */
const DESK_TITLE = 'TYRE WEATHER RACE CONTROL';
const DESK_TONE = { 0: ['🟢', '#2ecc71'], 1: ['🟡', '#f1c40f'], 2: ['🟠', '#f39c12'], 3: ['🔴', '#e74c3c'], x: ['⚪', '#8a96a3'] };
const DESK_VIEWS = ['meteo', 'pneus', 'trajet', 'garage', 'analyse'];   // ordre des onglets affichés : 1 Météo … 5 Analyse
let DESK_PRESENCE = '';
// state : null (verrouillé, démo, données absentes) ou { level 0-3, limited, label, dep: 'HH:MM' | 'lun. 16/11 06:30' | null }
function deskPresence(state) {
  const tone = state ? DESK_TONE[state.limited ? 'x' : state.level] || DESK_TONE.x : null;
  const title = state ? tone[0] + ' ' + state.label + (state.dep ? ' · départ ' + state.dep : '') + ' · Race Control' : DESK_TITLE;
  const alert = !!(state && !state.limited && state.level >= 1);
  const key = title + '|' + (tone ? tone[1] : '') + '|' + alert;
  if (key === DESK_PRESENCE) return;
  DESK_PRESENCE = key;
  document.title = title;
  const link = document.querySelector('link[rel="icon"]');
  if (link) {
    if (!link.dataset.deskHref) { link.dataset.deskHref = link.getAttribute('href') || ''; link.dataset.deskType = link.getAttribute('type') || ''; }
    if (tone) {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="31" fill="#0f151c"/>' +
        '<circle cx="32" cy="32" r="21" fill="' + tone[1] + '"/></svg>';
      link.setAttribute('type', 'image/svg+xml'); link.setAttribute('href', 'data:image/svg+xml,' + encodeURIComponent(svg));
    } else { link.setAttribute('type', link.dataset.deskType); link.setAttribute('href', link.dataset.deskHref); }
  }
  try {
    if (alert && navigator.setAppBadge) navigator.setAppBadge().catch(() => {});
    else if (!alert && navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
  } catch (e) { /* Badging API absente : rien à afficher */ }
}
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  const t = e.target;
  if (t && (t.isContentEditable || (t.closest && t.closest('input, textarea, select, [contenteditable], dialog[open]')))) return;
  if (LOCKED()) return;
  const n = /^[1-5]$/.test(e.key) ? +e.key : 0;
  if (n) { e.preventDefault(); chooseView(DESK_VIEWS[n - 1]); return; }
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); refreshAll(); }
});
