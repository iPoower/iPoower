// Les parcours existants ouvrent désormais Modifier avant une correction de lieu ou un choix météo.
'use strict';
async function revealPlaceControls(p, selector) {
  const target = p.locator(selector).first();
  if (!await target.count() || await target.isVisible()) return;
  if (!await target.evaluate(el => !!el.closest('#placeActions, #locChips'))) return;
  const toggle = p.locator('#placeBar [data-act=place-toggle]');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}
module.exports = { revealPlaceControls };
