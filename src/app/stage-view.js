/* Onglet Pneus · épreuve spéciale (19/11/2026, maquette B « Rallye » validée par le propriétaire).
 * Le trajet en cours, sinon le prochain trajet, présenté comme une spéciale : plaque, niveau du trajet (risque global tripRisk),
 * notes du copilote et ruban de surface (lecture routeTower, mêmes seuils que « État de la route »), choix des pneus de l'épreuve
 * (mêmes évaluations t.res que « Quelle voiture prendre ? » et le risque global), assistance (état pneus existant) et bulletin
 * (gel, alertes). Lecture seule : la seule écriture est le bouton explicite « Prendre … pour mes trajets » (voiture active). */
const STAGE_TYPE = { summer: ['É', 'ÉTÉ'], winter: ['H', 'HIVER'], allseason: ['4S', '4 SAISONS'] };
const STAGE_LV = ['RAS', 'VIGILANCE', 'PRUDENCE', 'DANGER'];
function stageTrip() { const s = APP_CONTEXT.snapshot; return s && (s.activeTrip || s.nextTrip) || null; }
function stageMinutes(t) {
  const a = Date.parse(String(t && t.dep || '').slice(0, 16) + ':00Z'), b = Date.parse(String(t && t.arr || '').slice(0, 16) + ':00Z');
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round((b - a) / 60000) : null;
}
function stagePlateHtml(t) {
  if (!t) return '<div class="rl-plate"><div class="rl-plate-k"><span>PNEUS · ÉPREUVE SPÉCIALE</span><span>—</span></div><div class="rl-plate-b"><b>AUCUNE ÉPREUVE PRÉVUE</b>' +
    '<span>Programme un trajet dans l’onglet Trajet pour lire la route avec tes pneus.</span></div></div>';
  const live = APP_CONTEXT.snapshot && APP_CONTEXT.snapshot.activeTrip === t, min = stageMinutes(t);
  const km = Array.isArray(t.seq) ? t.seq.map(q => q && q.km).filter(Number.isFinite) : [];
  const meta = [tripSpan(t), min != null ? min + ' min' : '', km.length ? f0(Math.max(...km)) + ' km' : ''].filter(Boolean).join(' · ');
  return '<div class="rl-plate"><div class="rl-plate-k"><span>PNEUS · ÉPREUVE SPÉCIALE</span><span>' + (live ? 'EN COURS' : 'PROCHAINE') + '</span></div>' +
    '<div class="rl-plate-b"><b>' + esc((t.from || 'Départ à confirmer') + ' → ' + (t.to || 'Arrivée à confirmer')) + '</b><span>' + esc(meta) + '</span></div></div>';
}
function stageChoiceHtml(t, shown) {
  // Toutes les voitures équipées sur la MÊME série que le trajet (t.res ne garde que la voiture confirmée) : même moteur
  // (windowAssess, mode trajet) que « Quelle voiture prendre ? ».
  const res = t && Array.isArray(t.seq) && t.seq.length ? TCARS().map(c => ({ c, w: windowAssess(c, t.seq, 'trip') }))
    .filter(r => r.w && Number.isFinite(r.w.score) && Number.isInteger(r.w.level)) : [];
  if (!res.length) return '';
  const real = res.filter(r => !carProfile(r.c).generic);
  // Conseillée : un niveau plus bas, ou au moins 5 points d'écart à niveau égal (même lecture que « Quelle voiture prendre ? »).
  const sorted = [...real].sort((a, b) => a.w.level - b.w.level || b.w.score - a.w.score), top = sorted[0], next = sorted[1];
  const best = top && next && (top.w.level < next.w.level || top.w.score - next.w.score >= 5) ? top : null;
  const card = r => {
    const gen = carProfile(r.c).generic, ty = STAGE_TYPE[effType(r.c)] || ['?', 'MONTE À CONFIRMER'], a = treadAxles(r.c.tire);
    const tread = a && (a.av != null || a.ar != null) ? 'AV ' + (a.av == null ? '—' : f1(a.av)) + ' · AR ' + (a.ar == null ? '—' : f1(a.ar)) + ' mm' : 'profondeur à mesurer';
    return '<div class="rl-car' + (best === r ? ' best' : '') + '" data-car="' + esc(r.c.id) + '"><span class="rl-k">' + esc((r.c.short || r.c.name || 'Voiture').toUpperCase() + (best === r ? ' · CONSEILLÉE' : '')) + '</span>' +
      '<b class="rl-type">' + ty[1] + '</b><b class="rl-score" data-lv="' + (gen ? 'x' : r.w.level) + '">' + (gen ? 'aperçu' : r.w.score) + '</b><small>' + esc(tread) + '</small></div>';
  };
  const pick = best && (!shown || shown.id !== best.c.id || !appActiveCar())
    ? '<button type="button" class="rl-btn" data-act="day-car" data-id="' + esc(best.c.id) + '">Prendre ' + esc(best.c.short || best.c.name) + ' pour mes trajets</button>' : '';
  const note = res.length < 2 ? '<p class="sub">Une seule voiture évaluée sur ce trajet : renseigne les pneus de l’autre pour comparer.</p>'
    : !best ? '<p class="sub">Écart faible : les voitures se valent sur cette épreuve.</p>' : '';
  return '<section class="rl-choice" aria-label="Choix des pneus de l’épreuve"><h3 class="rl-h">CHOIX DES PNEUS POUR L’ÉPREUVE</h3><div class="rl-cars">' + res.map(card).join('') + '</div>' + note + pick + '</section>';
}
function stageAssistHtml(car) {
  if (!car) return '<section class="rl-box" aria-label="Assistance"><h3 class="rl-h">ASSISTANCE</h3><p class="sub">Voiture à choisir dans le Garage.</p></section>';
  const st = tyreStateOf(car), maint = st && Array.isArray(st.maint) ? st.maint : [], t = car.tire || {}, a = treadAxles(t), chips = [];
  const has = k => maint.find(m => m.k === k);
  const tr = has('tread'), dot = has('dot');
  chips.push(tr ? [tr.lv >= 3 ? 3 : 1, tr.lv >= 3 ? 'PROFONDEUR SOUS 1,6 MM' : 'PROFONDEUR À SURVEILLER'] : a && a.worst != null ? [0, 'PROFONDEUR OK · ' + f1(a.worst) + ' MM'] : [1, 'PROFONDEUR À MESURER']);
  chips.push(has('pressure') ? [1, 'PRESSION À CONTRÔLER'] : t.pchk && /^\d{4}-\d{2}-\d{2}$/.test(t.pchk.date || '') ? [0, 'PRESSION CONTRÔLÉE LE ' + t.pchk.date.slice(8, 10) + '/' + t.pchk.date.slice(5, 7)] : [1, 'PRESSION CIBLE À RENSEIGNER']);
  chips.push(dot ? [2, 'DOT > 10 ANS'] : /^\d{4}$/.test(String(t.dot || '').trim()) ? [0, 'DOT ' + String(t.dot).trim()] : [1, 'DOT À RENSEIGNER']);
  return '<section class="rl-box" aria-label="Assistance"><div class="rl-row-h"><h3 class="rl-h">ASSISTANCE · ' + esc((car.short || car.name || 'Voiture').toUpperCase()) + '</h3><span class="rl-mono">' + esc(t.size || '') + '</span></div>' +
    '<div class="rl-chips">' + chips.map(([lv, x]) => '<span class="rl-chip" data-lv="' + lv + '">' + esc(x) + '</span>').join('') + '</div>' +
    '<a class="rl-link" href="#secCars">Ouvrir l’assistance (mesures, historique) →</a></section>';
}
function stageBulletinHtml() {
  const fr = CX && CX.sum24 ? frostRisk(CX.sum24) : null, flv = fr && Number.isInteger(fr.level) ? fr.level : null;
  const act = CX && CX.alerts ? ALERT_DEFS.filter(d => S.alerts[d.id] && CX.alerts[d.id]).length : 0;
  const row = (href, label, lv, val) => '<a class="rl-line" href="' + href + '"><span>' + label + '</span><b class="rl-mono" data-lv="' + lv + '">' + esc(val) + '</b></a>';
  return '<section class="rl-bulletin" aria-label="Bulletin de route"><h3 class="rl-h">BULLETIN DE ROUTE</h3>' +
    row('#secIce', 'Gel et verglas · 24 h', flv == null ? 'x' : flv, flv == null ? 'INDÉTERMINÉ' : STAGE_LV[flv]) +
    row('#secAlerts', 'Alertes pneus · 24 h', act ? 2 : 0, act + ' ACTIVE' + (act > 1 ? 'S' : '')) +
    row('#secWeatherLink', 'Météo, agenda, astuces', 'x', '→') + '</section>';
}
function renderStage() {
  const el = $('#secRally'); if (!el) return;
  const show = UI.view === 'pneus' && !LOCKED() && !!CX;
  el.hidden = !show; if (!show) { if (el.innerHTML) el.innerHTML = ''; return; }
  const t = stageTrip(), shown = appDisplayedCar(), risk = t ? tripRisk(t) : null, lv = risk && Number.isInteger(risk.lv) ? risk.lv : null;
  const flag = t && lv != null ? '<div class="rl-flag" role="status" data-lv="' + lv + '"><span class="rl-k">SUR L’ÉPREUVE</span><b>' + STAGE_LV[lv] + '</b><span>' + esc(risk.why || 'aucune cause identifiée sur ce trajet') + '</span></div>' : '';
  let notes = '', ribbon = '';
  if (t) {
    const sources = typeof f1WeatherSources === 'function' ? f1WeatherSources(t.seq) : { known: false, ageMin: null };
    const rows = F1Pure.routeTower(t.seq, { ageMin: sources.known ? sources.ageMin : null }), fz = tripFrost(t);
    const list = F1Pure.copilotNotes(rows, { dep: t.dep, arr: t.arr, frost: fz && Number.isInteger(fz.fr.level) ? fz.fr.level : null, tyre: shown ? effType(shown) : null });
    notes = '<section class="rl-notes" aria-label="Notes du copilote"><h3 class="rl-h">NOTES DU COPILOTE</h3>' + (list.length
      ? '<ol>' + list.map(n => '<li><b class="rl-n" data-lv="' + (n.level == null ? 'x' : n.level) + '">' + String(n.n).padStart(2, '0') + '</b><span>' + esc(n.text) + '</span></li>').join('') + '</ol>'
      : '<p class="sub">Notes en attente : points météo du trajet pas encore reçus ou trop anciens.</p>') +
      '<p class="sub">Tiré des prévisions du modèle, pas une mesure sur la route.</p></section>';
    const seg = F1Pure.stageSurface(rows), kmEnd = rows.length ? rows[rows.length - 1].km : null;
    if (seg.length) ribbon = '<section class="rl-surface" aria-label="Surface de l’épreuve"><div class="rl-row-h"><span class="rl-k">SURFACE DE L’ÉPREUVE</span><span class="rl-mono">' + (Number.isFinite(kmEnd) ? 'km 0 → ' + f0(kmEnd) : rows.length + ' points') + '</span></div>' +
      '<div class="rl-ribbon">' + seg.map(s => '<span data-k="' + (s.kind || 'x') + '" style="flex:' + Math.max(1, s.share) + ' 1 0">' + s.label + '</span>').join('') + '</div></section>';
  }
  const html = '<div class="rl-grid"><div class="rl-a">' + stagePlateHtml(t) + flag + notes + ribbon + '</div><div class="rl-b">' + (t ? stageChoiceHtml(t, shown) : '') + stageAssistHtml(shown) + stageBulletinHtml() +
    '<button type="button" class="rl-go" data-act="view" data-v="trajet">' + (t ? 'PRÉPARER LE DÉPART' : 'PROGRAMMER UN TRAJET') + '</button>' +
    '<p class="sub">Repère informatif, pas une garantie de sécurité.</p></div></div>';
  if (el.innerHTML !== html) el.innerHTML = html;
}
