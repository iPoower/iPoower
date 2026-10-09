/* Brouillon UI seulement. La préférence validée vit dans S.calOrigins ; les
 * jambes restent la projection de TripCancel.rebuild/effLegs/APP_CONTEXT. */
let CAL_ORIGIN_FORM = null, CAL_ORIGIN_NOTICE = null;
function calendarOriginEvent(form) {
  const events = CAL && CAL.events || [], e = events.find(e => TripCancel.eventId(e) === form.id);
  return e && TripCancel.identifiable(events, e) && calendarSpatial(e) && !calendarCancelled(e) ? e : null;
}
function calendarOriginEditable(t) {
  const leg = t && (t.planL || t.l);
  return !!(t && t.src === 'cal' && t.e && leg && ['go', 'ret'].includes(leg.k) && !t.running
    && !(TRIPSTART && TRIPSTART.key === t.key) && !(LIVE.key === t.key && LIVE.phase === 'active')
    && TripCancel.identifiable(CAL && CAL.events || [], t.e));
}
function calendarOriginOpen(key) {
  const t = APP_CONTEXT.snapshot.trips.find(t => t.key === key);
  if (!calendarOriginEditable(t)) return;
  const k = (t.planL || t.l).k, id = TripCancel.eventId(t.e), c = CalendarOrigin.get(S.calOrigins, id, k);
  CAL_ORIGIN_NOTICE = null;
  CAL_ORIGIN_FORM = { id, k, key, title: t.e.t || 'Rendez-vous', mode: c ? c.kind === 'saved' ? 'saved:' + c.placeId : c.kind : 'auto',
    query: c && c.kind === 'address' ? c.point.address || c.point.name : '', hit: c && c.point || null, results: [], gen: 0, saving: false, busy: false, message: '' };
  renderAll(); $('#wxOriginMode')?.focus();
}
function calendarOriginClose() {
  if (!CAL_ORIGIN_FORM || CAL_ORIGIN_FORM.saving) return;
  CAL_ORIGIN_FORM.gen++; CAL_ORIGIN_FORM = null; renderAll();
  $('#secWx [data-act="cal-origin-open"]')?.focus();
}
function calendarOriginControls(t) {
  if (!calendarOriginEditable(t)) return '';
  const id = TripCancel.eventId(t.e), k = (t.planL || t.l).k, c = CalendarOrigin.get(S.calOrigins, id, k);
  const notice = CAL_ORIGIN_NOTICE && CAL_ORIGIN_NOTICE.id === id && CAL_ORIGIN_NOTICE.k === k ? CAL_ORIGIN_NOTICE.message : '';
  const rule = c && ['direct', 'maison'].includes(t.e.mode) ? ` · remplace ici l’origine de #${t.e.mode}` : '';
  return `<div class="wx-origin-command"><button class="btn sm" data-act="cal-origin-open" data-key="${esc(t.key)}">Modifier le départ</button>${c ? `<span class="sub">Départ choisi pour ce rendez-vous${esc(rule)}</span>` : ''}</div>${notice ? `<p class="sub" role="status">${esc(notice)}</p>` : ''}`;
}
function calendarOriginEditorHtml() {
  const f = CAL_ORIGIN_FORM; if (!f) return '';
  const disabled = f.saving ? ' disabled' : '', options = [['auto', 'Départ automatique'], ['home', 'Domicile'],
    ...[...(S.locs || []).slice(1), ...(S.customs || [])].filter(locHasCoords).map(p => ['saved:' + p.id, p.name]), ['address', 'Adresse manuelle'],
    ...(navigator.geolocation && window.isSecureContext ? [['gps', 'GPS · ma position']] : [])];
  const e = calendarOriginEvent(f), tag = e && ['direct', 'maison'].includes(e.mode) ? ` Le choix remplace l’origine de #${e.mode} pour ce trajet ; « Départ automatique » rétablit cette règle.` : '';
  return `<div id="wxOriginEditor" class="wx-origin-editor" data-binding="${esc(f.id + '|' + f.k)}">
    <p class="sub">${esc(f.title)} · ${f.k === 'ret' ? 'retour' : 'aller'} uniquement.${esc(tag)}</p>
    <label for="wxOriginMode">Départ</label><select id="wxOriginMode"${disabled}>${options.map(([v, label]) => `<option value="${esc(v)}"${f.mode === v ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>
    ${f.mode === 'address' ? `<div class="trip-search"><input type="search" id="wxOriginQ" value="${esc(f.query)}" placeholder="Adresse de départ" autocomplete="street-address" aria-label="Adresse de départ"${disabled}><button class="btn" data-act="cal-origin-search"${disabled}>Rechercher</button></div><div class="trip-suggestions">${f.results.map((p, i) => `<button class="trip-suggestion" data-act="cal-origin-pick" data-i="${i}"${disabled}><b>${esc(p.name)}</b><span>${esc(p.sub || p.address || '')}</span></button>`).join('')}</div>` : ''}
    ${f.mode === 'gps' ? `<button class="btn" data-act="cal-origin-gps"${disabled}${f.busy ? ' disabled' : ''}>${f.busy ? 'Localisation…' : 'Utiliser ma position'}</button>` : ''}
    ${f.hit && ['address', 'gps'].includes(f.mode) ? `<p class="sub">Départ retenu : ${esc(f.hit.address || f.hit.name)}</p>` : ''}
    <p class="sub" role="status">${esc(f.message)}</p><div class="chips"><button class="btn" data-act="cal-origin-apply"${disabled}${f.busy ? ' disabled' : ''}>${f.saving ? 'Enregistrement…' : 'Appliquer'}</button><button class="btn" data-act="cal-origin-close"${disabled}>Retour</button></div>
  </div>`;
}
function calendarOriginRenderEditor() {
  const el = $('#wxOriginEditor'); if (!el || !CAL_ORIGIN_FORM) return;
  // Seules les actions du brouillon changent ses contrôles. Les actualisations
  // météo réutilisent ce nœud, sans perdre clavier, sélection ou focus.
  const active = document.activeElement, id = el.contains(active) && active.id, start = id && active.selectionStart, end = id && active.selectionEnd;
  el.outerHTML = calendarOriginEditorHtml();
  const input = id && document.getElementById(id); if (input) { input.focus(); if (typeof start === 'number') try { input.setSelectionRange(start, end); } catch (e) { /* select */ } }
}
async function calendarOriginSearch() {
  const f = CAL_ORIGIN_FORM; if (!f || f.saving || f.mode !== 'address') return;
  const q = f.query.trim(), gen = ++f.gen; f.hit = null; f.results = [];
  if (q.length < 3 || offlineNow()) { f.message = offlineNow() ? 'Recherche d’adresse disponible au retour du réseau. Domicile et lieux enregistrés restent disponibles.' : 'Saisis au moins trois caractères.'; calendarOriginRenderEditor(); return; }
  f.message = 'Recherche…'; calendarOriginRenderEditor();
  try {
    const hits = await geocode(q);
    if (CAL_ORIGIN_FORM !== f || gen !== f.gen || f.mode !== 'address') return;
    f.results = hits.filter(locHasCoords).slice(0, 6); f.message = f.results.length ? 'Choisis une adresse.' : 'Aucune adresse trouvée.';
  } catch (e) { if (CAL_ORIGIN_FORM !== f || gen !== f.gen) return; f.message = 'Recherche indisponible. Réessaie.'; }
  calendarOriginRenderEditor();
}
function calendarOriginGps() {
  const f = CAL_ORIGIN_FORM; if (!f || f.saving || f.mode !== 'gps' || !navigator.geolocation) return;
  const gen = ++f.gen; f.hit = null; f.busy = true; f.message = 'Position ponctuelle demandée…'; calendarOriginRenderEditor();
  const current = () => CAL_ORIGIN_FORM === f && gen === f.gen && f.mode === 'gps';
  const fail = message => { if (!current()) return; f.busy = false; f.message = message; calendarOriginRenderEditor(); };
  try {
    // Ne passe jamais par locate/receivePosition : aucun watch, lieu courant
    // ou modèle météo sélectionné n'est changé par ce relevé.
    navigator.geolocation.getCurrentPosition(pos => {
      if (!current()) return;
      const p = pos.coords, now = Date.now();
      if (!p || !locHasCoords({ lat: p.latitude, lon: p.longitude }) || !Number.isFinite(p.accuracy) || p.accuracy > PLACE_ACC_GPS
        || !Number.isFinite(pos.timestamp) || pos.timestamp > now + 60e3 || now - pos.timestamp > 2 * 60e3) { fail('Position trop ancienne ou imprécise. Choisis un lieu ou réessaie.'); return; }
      f.hit = { lat: p.latitude, lon: p.longitude, name: 'Ma position choisie', provider: 'gps', precision: 'gps' }; f.busy = false; f.message = 'Position prête pour ce trajet.'; calendarOriginRenderEditor();
    }, err => fail(err && err.code === 1 ? 'GPS refusé. Choisis un lieu ou une adresse.' : 'GPS indisponible. Choisis un lieu ou réessaie.'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  } catch (e) { fail('GPS indisponible. Choisis un lieu ou une adresse.'); }
}
function calendarOriginInvalidate(id, k) {
  for (const key of CANCELROUTES.keys()) { const parts = JSON.parse(key); if (parts[0] === id && parts[1] === k) CANCELROUTES.delete(key); }
  const target = t => t && t.e && TripCancel.eventId(t.e) === id && (t.planL || t.l || {}).k === k;
  if (LIVE.phase !== 'active' && target(LIVE.base)) liveReset();
  if (target(TRIPPREVIEW.base)) tripPreviewReset();
}
function calendarOriginRetryRoutes() {
  // Les caches météo négatifs de l'agenda sont partagés par l'origine choisie
  // et le trajet automatique. Au retour du réseau, leur délai d'échec ne
  // doit pas bloquer un changement d'origine ou « Départ automatique ».
  // Garder les modèles valides : aucune météo ni route recalculée en double.
  for (const key of Object.keys(LEGM)) if (LEGM[key] && !LEGM[key].models) delete LEGM[key];
  for (const key of Object.keys(CALM)) if (CALM[key] && !CALM[key].m) delete CALM[key];
  for (const [key, entry] of CANCELROUTES) {
    if (!entry.originExplicit) continue;
    if (entry.phase === 'error') CANCELROUTES.delete(key);
    if (entry.leg) { const k = legKey(entry.leg); if (LEGM[k] && !LEGM[k].models) delete LEGM[k]; }
  }
}
function calendarOriginPurge() {
  const next = CalendarOrigin.clean(S.calOrigins);
  let stored = null; try { stored = JSON.parse(lsGet('twrc.settings.v1') || 'null'); } catch (e) { /* coffre */ }
  if (JSON.stringify(next) !== JSON.stringify(S.calOrigins || {}) || stored && stored.calOrigins && JSON.stringify(next) !== JSON.stringify(stored.calOrigins)) { S.calOrigins = next; saveSettings(); }
}
async function calendarOriginApply() {
  const f = CAL_ORIGIN_FORM; if (!f || f.saving || f.busy) return;
  const e = calendarOriginEvent(f), t = APP_CONTEXT.planned.find(t => t.e && TripCancel.eventId(t.e) === f.id && (t.planL || t.l || {}).k === f.k);
  if (!e || !calendarOriginEditable(t)) { f.message = 'Ce trajet n’est plus modifiable. Reviens au prochain trajet.'; calendarOriginRenderEditor(); return; }
  const c = f.mode === 'auto' ? null : f.mode === 'home' ? { kind: 'home' } : f.mode.startsWith('saved:') ? { kind: 'saved', placeId: f.mode.slice(6) }
    : f.hit && { kind: f.mode, point: f.hit };
  if (c === false || c === undefined || !['auto', 'home'].includes(f.mode) && !CalendarOrigin.resolve(c, S)) { f.message = 'Choisis un départ valide avant d’appliquer.'; calendarOriginRenderEditor(); return; }
  const VS = window.TWRC_VAULT;
  if (!VS || VS.mode !== 'vault') { f.message = 'Déverrouille Race Control pour conserver ce départ dans le stockage chiffré.'; calendarOriginRenderEditor(); return; }
  f.saving = true; f.message = ''; calendarOriginRenderEditor();
  try {
    S.calOrigins = CalendarOrigin.update(S.calOrigins, f.id, f.k, c, TripCancel.eventExpiration(e, Date.now())); markEdit('calOrigins'); saveSettings();
    const expected = JSON.stringify(S.calOrigins), saved = JSON.parse(lsGet('twrc.settings.v1') || 'null');
    if (!saved || JSON.stringify(saved.calOrigins) !== expected) throw new Error('stockage');
    calendarOriginInvalidate(f.id, f.k); renderAll();
    await VS.flush();
    if (VS.mode !== 'vault' || VS.error) throw new Error('coffre');
    CAL_ORIGIN_NOTICE = { id: f.id, k: f.k, message: c ? 'Départ enregistré pour ce rendez-vous.' : 'Départ automatique rétabli pour ce rendez-vous.' };
    if (CAL_ORIGIN_FORM === f) CAL_ORIGIN_FORM = null;
    renderAll(); $('#secWx [data-act="cal-origin-open"]')?.focus();
  } catch (e) {
    if (CAL_ORIGIN_FORM !== f) return;
    f.saving = false; f.message = 'Enregistrement chiffré non confirmé. Le choix reste en mémoire ; réessaie avant de recharger.'; calendarOriginRenderEditor();
  }
}
document.addEventListener('change', e => {
  const f = CAL_ORIGIN_FORM; if (!f || f.saving || e.target.id !== 'wxOriginMode') return;
  f.mode = e.target.value; f.gen++; f.busy = false; f.hit = null; f.results = []; f.message = ''; calendarOriginRenderEditor();
});
document.addEventListener('input', e => {
  const f = CAL_ORIGIN_FORM; if (!f || f.saving || e.target.id !== 'wxOriginQ') return;
  f.query = e.target.value; f.gen++; f.hit = null; f.results = []; f.message = ''; calendarOriginRenderEditor();
});
document.addEventListener('keydown', e => {
  if (!CAL_ORIGIN_FORM || !e.target.closest('#wxOriginEditor')) return;
  if (e.key === 'Escape') { e.preventDefault(); calendarOriginClose(); }
  else if (e.key === 'Enter' && e.target.id === 'wxOriginQ') { e.preventDefault(); calendarOriginSearch(); }
});
window.addEventListener('storage', e => {
  if (LOCKED() || e.key !== 'twrc.settings.v1' || !e.newValue) return;
  try {
    const incoming = JSON.parse(e.newValue), next = CalendarOrigin.merge(S.calOrigins, incoming.calOrigins);
    if (JSON.stringify(next) === JSON.stringify(CalendarOrigin.clean(S.calOrigins))) return;
    const old = S.calOrigins; S.calOrigins = next;
    new Set([...Object.keys(old || {}), ...Object.keys(next)]).forEach(id => ['go', 'ret'].forEach(k => {
      if (JSON.stringify(old && old[id] && old[id][k]) !== JSON.stringify(next[id] && next[id][k])) calendarOriginInvalidate(id, k);
    }));
    if (APP_CONTEXT.ready) renderAll();
  } catch (err) { /* coffre invalide : aucune préférence importée */ }
});
