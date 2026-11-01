/* Rendu en lecture seule : le contexte et les véhicules restent ceux de l'app. */
function engineeringCockpitHtml(car, trip = null) {
  if (!car) return '';
  const evidence = TyreIntelligence.analyse(tyreIntelligenceInput(car, trip));
  const r = EngineeringCockpit.build(evidence), types = EngineeringCockpit.TYPES;
  const dg = r.diagnostics, w = dg.weather, noEvidence = tiNoEvidence(evidence);
  // Données à saisir : en tête avec leur bouton (tiTodoHtml) ; manque d'essais : mention unique dans Intelligence pneumatique.
  const entries = dg.entries.filter(x => !TI_TODO_RULES.includes(x.id) && !(noEvidence && TI_EVIDENCE_GAP_RULES.includes(x.id)));
  const source = s => `${esc(s.kind === 'user' ? 'Saisie utilisateur' : s.kind === 'weather' ? s.source || 'Prévision météo' : 'Essai publié')} · ${esc(tiDate(s.date) || 'date inconnue')}`;
  const priorities = `<div class="ec-priorities" role="group" aria-label="Priorités et recommandations"><h3>Priorités du contexte</h3>${evidence.overview && evidence.overview.verdictCap ? `<p class="sub tread-cap"${evidence.overview.verdictCap.level === 3 ? ' role="alert"' : ''}><b>Verdict plafonné par la profondeur :</b> ${esc(evidence.overview.verdictCap.text)}</p>` : ''}${tiTodoHtml(car, evidence)}
    ${entries.length ? entries.map(x => `<div${x.state === 'Risque documenté' ? ' role="alert"' : ''}><details data-k="ec-rule-${esc(x.id)}" data-ec-rule="${esc(x.id)}" class="ec-rule${x.state === 'Risque documenté' ? ' ec-critical' : ''}"${x.state === 'Risque documenté' ? ' open' : ''}><summary><b>${esc(x.state)}</b> · ${esc(x.text)}</summary>
      <p class="sub">Évaluation ${esc(tiDate(x.date) || 'date inconnue')}. ${x.sources.map(source).join(' ; ')}.</p>
      ${x.reference ? `<p class="sub"><span class="ec-tag ec-documented">DOCUMENTÉE</span> <a href="${esc(x.reference.url)}" target="_blank" rel="noopener noreferrer">${esc(x.reference.label)} ↗</a> · référence vérifiée ${esc(tiDate(x.reference.checkedOn))}.</p>` : ''}
      ${x.uncertainties.map(n => `<p class="sub">${esc(n)}</p>`).join('')}</details></div>`).join('') : '<p class="sub">Aucune règle déclenchée avec ces entrées. Cela ne prouve pas que la route ou le véhicule sont sûrs.</p>'}</div>`;
  const weather = `<div class="ec-weather"><p><b>${esc(w.state)}</b>${w.offline ? ' · HORS LIGNE' : ''}</p><p class="sub">${esc(w.scope)} · ${esc(w.source)} · réception ${esc(tiDate(w.fetchedAt) || 'inconnue')} · âge ${w.ageMin === null ? 'inconnu' : w.ageMin + ' min'}.</p>
    ${w.values.map(v => `<p><span class="ec-tag ec-${v.kind}">${types[v.kind]}</span> ${esc(v.label)} : ${esc(v.value)}</p>`).join('')}<p class="sub">Plages des prévisions chargées, arrondies au degré. Ni capteur du véhicule, ni constat de la route. Une donnée ancienne reste historique.</p></div>`;
  const icons = { acceleration: '↗', braking: '⊣', cornering: '↪', stability: '↔', aquaplaning: '≈', tyres: '◎' };
  // Non mesurable sans capteur (accélération, freinage, virage, stabilité, aquaplaning du véhicule) : aucune ligne « INCONNUE » ;
  // seuls les essais documentés restent, et un domaine sans essai n'est pas affiché. La limite est dite une fois (« Sources et limites »).
  const dynamic = ['acceleration', 'braking', 'cornering', 'stability', 'aquaplaning'];
  const measurable = r.domains.map(d => dynamic.includes(d.id) ? { ...d, items: d.items.filter(x => x.kind !== 'unknown') } : d).filter(d => d.items.length);
  return `<section class="ec-panel" aria-label="Engineering Cockpit V1.2" data-ec-car="${esc(car.id)}">
    <header class="ec-head"><div><p class="ec-eyebrow">RACE CONTROL · V${r.version}</p><h2>Engineering Cockpit</h2></div><span class="ec-live">LECTURE DES PREUVES</span></header>
    <p class="ec-mount"><b>${esc(car.short || car.name || 'Véhicule actif')}</b> · ${esc(r.title)} · ${esc(r.size || 'dimension inconnue')}</p>
    <p class="sub">${trip ? 'Trajet prévu : ' + esc(trip.label || 'parcours sélectionné') : 'Lieu consulté : ' + esc(curLoc()?.name || 'lieu inconnu')}. ${r.active ? 'Monte active déclarée.' : 'Aucune monte active confirmée.'}</p>
    ${priorities}${weather}
    <div class="ec-legend" role="group" aria-label="Nature des données">${Object.entries(types).map(([k, v]) => `<span class="ec-tag ec-${k}">${v}</span>`).join('')}</div>
    <p class="sub">Les mesures saisies, les estimations, les essais publiés et les inconnues restent distincts. Les essais ne mesurent pas votre véhicule.</p>
    <div class="ec-grid">${measurable.map(d => `<details class="ec-domain" data-k="ec-${d.id}" data-ec-domain="${d.id}"><summary><span class="ec-icon" aria-hidden="true">${icons[d.id]}</span><span><b>${esc(d.title)}</b><small>${esc(d.note)}</small></span><span class="ec-tag ec-${d.kind}">${types[d.kind]}</span></summary>
      <div class="ec-data">${d.items.map(x => `<div class="ec-datum"><p><span class="ec-tag ec-${x.kind}">${types[x.kind]}</span> <b>${esc(x.label)}</b></p><p class="ec-value">${esc(x.value)}</p><p class="sub">${esc(x.source)} · ${esc(tiDate(x.date) || 'date inconnue')}${x.url ? ` · <a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">protocole ↗</a> · source vérifiée ${esc(tiDate(x.checkedOn))}` : ''}</p><p class="sub">${esc(x.limit)}</p></div>`).join('')}</div></details>`).join('')}</div>
    <p class="sub ec-foot ec-limits"><b>Sources et limites :</b> L’app ne mesure pas l’adhérence : elle l’estime à partir de la météo, de la température et de tes relevés. Protocoles et sources détaillés dans Intelligence pneumatique.</p>
  </section>`;
}
