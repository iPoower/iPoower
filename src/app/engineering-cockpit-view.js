/* Rendu en lecture seule : le contexte et les véhicules restent ceux de l'app. */
function engineeringCockpitHtml(car, trip = null) {
  if (!car) return '';
  const evidence = TyreIntelligence.analyse(tyreIntelligenceInput(car, trip));
  const r = EngineeringCockpit.build(evidence), types = EngineeringCockpit.TYPES;
  const icons = { acceleration: '↗', braking: '⊣', cornering: '↪', stability: '↔', aquaplaning: '≈', tyres: '◎' };
  return `<section class="ec-panel" aria-label="Engineering Cockpit V1.2" data-ec-car="${esc(car.id)}">
    <header class="ec-head"><div><p class="ec-eyebrow">RACE CONTROL · V${r.version}</p><h2>Engineering Cockpit</h2></div><span class="ec-live">LECTURE DES PREUVES</span></header>
    <p class="ec-mount"><b>${esc(car.short || car.name || 'Véhicule actif')}</b> · ${esc(r.title)} · ${esc(r.size || 'dimension inconnue')}</p>
    <p class="sub">${trip ? 'Trajet prévu : ' + esc(trip.label || 'parcours sélectionné') : 'Lieu consulté : ' + esc(curLoc()?.name || 'lieu inconnu')}. ${r.active ? 'Monte active déclarée.' : 'Aucune monte active confirmée.'}</p>
    <div class="ec-legend" aria-label="Nature des données">${Object.entries(types).map(([k, v]) => `<span class="ec-tag ec-${k}">${v}</span>`).join('')}</div>
    <p class="sub">Les mesures saisies, les estimations, les essais publiés et les inconnues restent distincts. Les essais ne mesurent pas votre véhicule.</p>
    <div class="ec-grid">${r.domains.map(d => `<details class="ec-domain" data-k="ec-${d.id}" data-ec-domain="${d.id}"><summary><span class="ec-icon" aria-hidden="true">${icons[d.id]}</span><span><b>${esc(d.title)}</b><small>${esc(d.note)}</small></span><span class="ec-tag ec-${d.kind}">${types[d.kind]}</span></summary>
      <div class="ec-data">${d.items.map(x => `<div class="ec-datum"><p><span class="ec-tag ec-${x.kind}">${types[x.kind]}</span> <b>${esc(x.label)}</b></p><p class="ec-value">${esc(x.value)}</p><p class="sub">${esc(x.source)} · ${esc(x.date || 'date inconnue')}</p><p class="sub">${esc(x.limit)}</p></div>`).join('')}</div></details>`).join('')}</div>
    <p class="sub ec-foot">Aucune performance instantanée mesurée. Protocoles, sources et limites détaillés dans Intelligence pneumatique.</p>
  </section>`;
}
