/* Présentation seulement : les déploiements restent en mémoire, sans clé de
 * stockage ni copie des données métier. Les commandes historiques restent dans
 * leurs sections et les avertissements principaux restent toujours visibles. */
const UX_OPEN = new Set();
function uxFold(key, title, body, note = '') {
  return '<details class="ux-fold" data-ux="' + esc(key) + '"' + (UX_OPEN.has(key) ? ' open' : '') +
    '><summary><span><b>' + esc(title) + '</b>' + (note ? '<small>' + esc(note) + '</small>' : '') +
    '</span></summary><div class="ux-fold-body">' + body + '</div></details>';
}
document.addEventListener('toggle', e => {
  const node = e.target;
  if (!node || !node.isConnected || !node.matches('details[data-ux]')) return;
  if (node.open) UX_OPEN.add(node.dataset.ux); else UX_OPEN.delete(node.dataset.ux);
}, true);
function uxFocusKey(root) {
  const active = document.activeElement;
  return active && active.tagName === 'SUMMARY' && root.contains(active) &&
    active.parentElement.dataset.ux || null;
}
function uxRestoreFocus(root, key) {
  if (!key) return;
  const fold = [...root.querySelectorAll('details[data-ux]')].find(x => x.dataset.ux === key);
  if (fold) fold.querySelector(':scope > summary').focus({ preventScroll: true });
}
