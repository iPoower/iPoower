/* Adaptateur de lecture et rendu : aucune écriture, aucun appel réseau, aucune seconde configuration des véhicules. */
function tyreIntelligenceInput(car, trip = null) {
  const m = CX && CX.m, raw = RAW[UI.loc], today = nowIn(m && m.tz || 'Europe/Paris').slice(0, 10);
  const projected = trip && Array.isArray(trip.points) ? trip.points : null;
  const samples = projected ? projected.filter(p => p.x).map(p => ({ ...p.x, t: p.t }))
    : m && m.nowI >= 0 ? m.hs.slice(m.nowI, m.nowI + 7) : [];
  // Les séries horaires sont partagées par référence avec les modèles déjà chargés : aucune requête ni position copiée.
  const models = projected ? projected.map(p => [ ...Object.values(M), ...Object.values(MIDM), ...Object.values(CALM).map(x => x && x.m), ...Object.values(LEGM).flatMap(x => x && x.models || []) ].find(x => x && x.hs === p.hs)) : [];
  const stamps = models.map(x => x && x.retrievedAt);
  const fetched = projected ? stamps.length && stamps.every(Number.isFinite) ? Math.min(...stamps) : null : raw && Number.isFinite(raw.t) ? raw.t : null;
  return { car, today, weather: { samples, ageMin: DEMO.on ? 0 : Number.isFinite(fetched) ? Reliability.ageMin(fetched) : null,
    source: DEMO.on ? 'Démonstration simulée' : 'Open-Meteo · prévisions déjà chargées',
    fetchedAt: Number.isFinite(fetched) ? new Date(fetched).toISOString() : null, scope: projected ? 'Points du trajet · fraîcheur du point le plus ancien, si connue' : 'Lieu consulté · six prochaines heures',
    offline: offlineNow(), simulation: DEMO.on } };
}
function tyreIntelligenceHtml(car, mode = 'pneus', trip = null) {
  if (!car) return '';
  const r = TyreIntelligence.analyse(tyreIntelligenceInput(car, trip));
  const n = v => v == null ? 'non renseigné' : String(v).replace('.', ','), unknown = 'Données indisponibles';
  const comparison = { exact: 'Dimension et variante identiques', 'same-model': 'Même modèle, dimension différente', indirect: 'Comparabilité partielle', insufficient: 'Données insuffisantes' };
  const ax = { av: 'Avant', ar: 'Arrière', both: 'Deux essieux déclarés', unknown: 'Portée non précisée' };
  const pos = { shoulders: 'épaules', centre: 'centre', inner: 'intérieur', outer: 'extérieur', unknown: 'point non précisé' };
  const wheel = { 'front-left': 'avant gauche', 'front-right': 'avant droit', 'rear-left': 'arrière gauche', 'rear-right': 'arrière droit' };
  const reading = x => `${ax[x.axle] || ax.unknown}${x.wheel ? ' · ' + (wheel[x.wheel] || '') : ''} · ${pos[x.position] || pos.unknown} : Profondeur ${n(x.mm)} mm${x.estimated ? ' (estimation utilisateur)' : ' (mesure saisie)'} · ${x.date || 'date inconnue'}${x.ageDays !== null && x.ageDays !== undefined ? ' · il y a ' + x.ageDays + ' j' : ''}`;
  const link = (src, text) => `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(text || src.organisation + ' · ' + src.year)} ↗</a>`;
  const testHtml = ({ test: t, comparison: c }) => `<details class="ti-test" data-k="ti-${esc(t.id)}"><summary>${esc(t.source.organisation)} · ${t.source.year} · ${esc(t.size)} · ${esc(comparison[c.kind])}</summary>
    <p>${link(t.source)} · publié ${esc(t.source.publishedOn || 'date précise inconnue')} · source vérifiée ${esc(t.source.checkedOn)}</p>
    <p class="sub">Indices ${esc(n(t.loadIndex))}${esc(t.speedIndex || '')} · XL ${t.xl === true ? 'oui' : t.xl === false ? 'non' : 'non documenté'} · variante ${esc(t.variant || 'non documentée')} · véhicule ${esc(t.vehicle || 'non documenté')} · état ${esc(t.tyreState || 'non documenté')} · profondeur publiée ${n(t.treadMm)}${t.treadMm !== null ? ' mm' : ''}.</p>
    <p class="sub">Air ${n(t.airC)}${t.airC !== null ? ' °C' : ''} · chaussée ${n(t.roadC)}${t.roadC !== null ? ' °C' : ''} · ${esc(c.reasons.join(' '))}</p>
    <div class="ti-scroll" role="region" aria-label="Résultats de ${esc(t.source.organisation)} ${t.source.year}" tabindex="0"><table class="ti-table"><thead><tr><th>Discipline</th><th>Valeur publiée</th><th>Protocole et classement</th></tr></thead><tbody>
      ${Object.entries(TyreIntelligence.FACETS).map(([id, [label]]) => { const values = t.metrics.filter(x => x.id === id && x.value !== null);
        return values.length ? values.map(x => `<tr><th>${esc(label)}</th><td>${n(x.value)} ${esc(x.unit)}${x.kind !== 'measured' ? '<br><small>' + esc(x.kind === 'projection' ? 'projection du protocole' : 'appréciation subjective') + '</small>' : ''}</td><td>${esc(x.protocol)}${x.temperatureC ? '<br>' + x.temperatureC.map(n).join('–') + ' °C (' + esc(x.temperatureKind === 'unspecified' ? 'air/chaussée non précisé' : x.temperatureKind) + ')' : ''}<br>${x.rank !== null ? x.rank + ' / ' + x.count + ' dans cet essai' : 'Classement non publié'} · eau ${x.waterMm === null ? 'non renseignée' : n(x.waterMm) + ' mm'}</td></tr>`).join('') : `<tr><th>${esc(label)}</th><td colspan="2" class="muted">${unknown}</td></tr>`;
      }).join('')}</tbody></table></div><ul class="sub">${t.limitations.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
  const rules = r.rules.map(rule => `<details class="ti-rule" data-k="ti-rule-${esc(rule.id)}"><summary><b>${esc(rule.state)}</b> · ${esc(rule.text)}</summary>
    <p class="sub">Règle ${esc(rule.id)} · évaluation ${esc(rule.date || 'date inconnue')}</p><ul class="sub">${rule.sources.map(s => `<li>${esc(s.kind === 'user' ? 'Saisie utilisateur' : s.kind === 'weather' ? s.source || 'Source météo inconnue' : 'Essai publié')} · ${esc(s.date || 'date inconnue')}${s.url ? ' · ' + link({ url: s.url }, 'Source') : ''}</li>`).join('')}${rule.uncertainties.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
    <p class="sub">Déclencheurs : ${esc(JSON.stringify(rule.triggers))}</p></details>`).join('');
  const weather = `<p class="sub">${esc(r.weather.scope || '')} · ${esc(r.weather.source || 'Source météo inconnue')} · ${r.weather.simulation ? 'SIMULÉ' : r.weather.offline ? 'hors ligne' : 'données réseau'} · fraîcheur ${r.weather.ageMin !== null && r.weather.ageMin !== undefined ? Math.round(r.weather.ageMin) + ' min' : 'inconnue'}${r.weather.fetchedAt ? ' · réception ' + esc(r.weather.fetchedAt) : ''}. Température de chaussée estimée, distincte de l’air.</p>`;
  const facts = `<div class="ti-facts"><h4>État renseigné · aucune télémétrie</h4><ul>${r.facts.current.length ? r.facts.current.map(x => `<li>${esc(reading(x))}</li>`).join('') : '<li>Profondeur non renseignée.</li>'}</ul><p class="sub">${esc(r.facts.coverage)}</p>
    ${r.facts.history.length ? `<details data-k="ti-readings"><summary>Relevés individuels · ${r.facts.history.length}</summary><ul>${r.facts.history.map(x => `<li>${esc(reading(x))}</li>`).join('')}</ul></details>` : ''}
    ${r.facts.notes ? `<details data-k="ti-notes"><summary>Notes de mesure conservées</summary><p>${esc(r.facts.notes)}</p></details>` : ''}
    <p class="sub">Pression recommandée : ${esc(r.pressure.target || 'inconnue')} · contrôle ${esc(r.pressure.date || 'non daté')} · mesure AV ${n(r.pressure.av)} / AR ${n(r.pressure.ar)} bar · DOT saisi ${esc(r.dot || 'inconnu')} (portée non établie pour les quatre roues).</p></div>`;
  const shortFacets = r.facets.filter(f => ['dryBraking', 'wetBraking', 'aquaLongitudinal', 'aquaLateral', 'cold'].includes(f.id)).map(f => `<li><b>${esc(f.label)}</b> : ${f.results.length ? f.results.map(x => `${n(x.metric.value)} ${esc(x.metric.unit)} · ${esc(x.test.source.organisation)} ${x.test.source.year} · ${esc(x.test.size)}${x.metric.rank !== null ? ' · ' + x.metric.rank + '/' + x.metric.count + ' dans cet essai' : ''}`).join(' ; ') : unknown}</li>`).join('');
  const planned = r.planned ? `<details class="ti-planned" data-k="ti-plan"><summary>Prévu · ${esc(r.planned.model.brand + ' ' + r.planned.model.model)} · NON MONTÉ</summary><p>${esc(r.planned.size || 'dimension inconnue')} · ce projet ne participe pas aux recommandations de la monte active.</p>${r.planned.tests.map(testHtml).join('')}</details>` : '';
  const full = mode === 'analyse' || mode === 'pneus';
  return `<details class="ti-panel" data-ux="ti-${esc(mode)}-${esc(car.id)}" data-ti-car="${esc(car.id)}" data-ti-mode="${esc(mode)}" aria-label="Intelligence pneumatique"><summary><strong>Intelligence pneumatique</strong> · ${esc(r.title)} · <span class="ti-state">${esc(r.status)}</span></summary><div class="ti-body">
    <p><b>${esc(r.title)}</b> · ${esc(r.size || 'dimension inconnue')} · ${r.active ? 'monte active déclarée' : 'aucune monte active'}</p>
    <p class="sub">Qualité des preuves pour cette monte : <b>${esc(r.quality)}</b>. ${esc(r.qualityReasons.join(' '))}</p>
    ${full ? `<ul class="ti-profile">${shortFacets}</ul>` : ''}${weather}${rules}
    ${full ? facts + (r.tests.length ? `<details data-k="ti-evidence"${mode === 'analyse' ? ' open' : ''}><summary>Essais et protocoles · ${r.tests.length}</summary><p class="sub">Valeurs originales : aucune comparaison directe entre essais, aucune moyenne de classements. Les vitesses d’aquaplaning sont propres à l’essai et ne constituent pas des vitesses sûres de circulation.</p>${r.tests.map(testHtml).join('')}</details>` : '<p>Données d’essais insuffisantes.</p>') + planned : ''}
    <p class="sub ti-foot">Catalogue V${r.schemaVersion} · révision ${r.catalogRevision} · revue ${esc(r.reviewedOn || 'indisponible')}. Essais historiques, mesures saisies et météo actualisée restent distincts. Aucun score ne garantit la sécurité du véhicule.</p></div></details>`;
}
