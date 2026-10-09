/* Modification du départ d'une seule occurrence Agenda.
 * Une intention persistée dans DayContext ; le trajet demeure calculé par effLegs.
 * Aucun GPS passif pour les rendez-vous futurs, aucune nouvelle source météo.
 */
const CAL_ORIGIN = { key: null, mode: '', query: '', hit: null, results: [], generation: 0, busy: false, message: '' };
function calOriginTrip(key) {
  const trip = (APP_CONTEXT.trips || []).find(t => t.key === key && t.src === 'cal' && t.e && t.l && t.l.k === 'go');
  if (!trip || !CAL || !Array.isArray(CAL.events) || !TripCancel.identifiable(CAL.events, trip.e)
    || calendarCancelled(trip.e) || trip.running || TRIPSTART && TRIPSTART.key === key
    || LIVE.key === key && LIVE.phase === 'active' || (USER_STORE.state.done || {})[key]) return null;
  return trip;
}
function calOriginClose() {
  CAL_ORIGIN.key = null; CAL_ORIGIN.generation++; CAL_ORIGIN.results = [];
  CAL_ORIGIN.hit = null; CAL_ORIGIN.busy = false; CAL_ORIGIN.message = '';
}
function calOriginOpen(key) {
  const t = calOriginTrip(key);
  if (!t) return;
  if (CAL_ORIGIN.key === key) { calOriginClose(); renderWx(); const button = document.querySelector('#secWx [data-act="cal-origin-open"]'); if (button) button.focus({ preventScroll: true }); return; }
  const row = (appDay().agendaOrigins || {})[TripCancel.eventId(t.e)];
  const existing = row && row.eventStart === t.e.s ? row : null;
  const from = t.l.from, found = from && placeList().find(p => p.id === from.id || distKm(p, from) < 0.05);
  CAL_ORIGIN.key = key;
  CAL_ORIGIN.mode = existing ? existing.source === 'saved' ? existing.originId : '__manual'
    : found ? found.id : S.locs[0].id;
  CAL_ORIGIN.hit = existing && existing.originPoint ? { ...existing.originPoint } : null;
  CAL_ORIGIN.query = CAL_ORIGIN.hit && (CAL_ORIGIN.hit.address || CAL_ORIGIN.hit.name) || '';
  CAL_ORIGIN.results = []; CAL_ORIGIN.generation++; CAL_ORIGIN.busy = false; CAL_ORIGIN.message = '';
  renderWx();
  const field = document.getElementById('calOriginMode'); if (field) field.focus({ preventScroll: true });
}
function calOriginControls(trip) {
  if (!trip || !trip.id) return '';
  const candidate = calOriginTrip(trip.id);
  if (!candidate) return '';
  const active = CAL_ORIGIN.key === trip.id, e = candidate.e;
  const day = e.s.slice(0, 10), isToday = day === placeToday();
  const gps = isToday && appCurrentGps();
  const entries = placeList().filter(p => p && locHasCoords(p));
  const selected = (appDay().agendaOrigins || {})[TripCancel.eventId(e)];
  const summary = selected && selected.eventStart === e.s ? '<span class="sub">Départ choisi pour ce rendez-vous</span>' : '';
  const opts = entries.map(p => `<option value="${esc(p.id)}" ${CAL_ORIGIN.mode === p.id ? 'selected' : ''}>${p.id === S.locs[0].id ? '🏠 ' : p.id === S.work.to ? '🏢 ' : '📌 '}${esc(p.name)}</option>`).join('');
  const form = !active ? '' : `<div class="trip-field" role="group" aria-label="Départ de ce rendez-vous">
    <label for="calOriginMode">Lieu de départ</label>
    <select id="calOriginMode" data-cal-origin-field="mode">${opts}<option value="__manual" ${CAL_ORIGIN.mode === '__manual' ? 'selected' : ''}>⌨️ Adresse manuelle</option>${gps ? '<option value="__gps" ' + (CAL_ORIGIN.mode === '__gps' ? 'selected' : '') + '>📍 Ma position actuelle</option>' : ''}</select>
    ${CAL_ORIGIN.mode === '__manual' ? `<div class="trip-search">
      <input id="calOriginQuery" type="search" data-cal-origin-field="query" value="${esc(CAL_ORIGIN.query)}" placeholder="Adresse de départ" autocomplete="off">
      <button class="btn sm" data-act="cal-origin-search" ${CAL_ORIGIN.busy ? 'disabled' : ''}>Rechercher</button></div>
      <div class="trip-suggestions">${CAL_ORIGIN.results.map((p,i) => `<button class="trip-suggestion" data-act="cal-origin-pick" data-i="${i}"><b>${esc(p.name)}</b><span>${esc(p.sub || p.address || '')}</span></button>`).join('')}</div>
      ${CAL_ORIGIN.hit ? `<p class="sub">✓ ${esc(CAL_ORIGIN.hit.name || CAL_ORIGIN.hit.address)}</p>` : ''}` : ''}
    ${!isToday ? '<p class="sub">GPS actuel non utilisé automatiquement pour un rendez-vous futur.</p>' : ''}
    ${CAL_ORIGIN.message ? `<p class="sub" role="status">${esc(CAL_ORIGIN.message)}</p>` : ''}
    <div class="chips"><button class="btn sm" data-act="cal-origin-save">Valider le départ</button>
      <button class="btn sm" data-act="cal-origin-close">Annuler</button>
      ${selected ? '<button class="btn sm" data-act="cal-origin-reset">Départ automatique</button>' : ''}</div>
  </div>`;
  return `<div class="wx-trip-origin">${summary}<button class="btn sm" data-act="cal-origin-open" data-key="${esc(trip.id)}" aria-expanded="${active}" aria-controls="wxCalOriginEditor">Modifier le départ</button>
    ${active ? `<div id="wxCalOriginEditor">${form}</div>` : ''}</div>`;
}
function calOriginFieldChanged(input) {
  if (input.dataset.calOriginField === 'mode') {
    CAL_ORIGIN.mode = input.value; CAL_ORIGIN.query = ''; CAL_ORIGIN.hit = null;
    CAL_ORIGIN.results = []; CAL_ORIGIN.generation++; CAL_ORIGIN.message = '';
    renderWx();
  }
  if (input.dataset.calOriginField === 'query') {
    CAL_ORIGIN.query = input.value; CAL_ORIGIN.hit = null; CAL_ORIGIN.results = [];
    CAL_ORIGIN.generation++;
  }
}
async function calOriginAction(action, button) {
  if (action === 'cal-origin-open') { calOriginOpen(button.dataset.key); return; }
  if (action === 'cal-origin-close') { calOriginClose(); renderWx(); return; }
  const t = calOriginTrip(CAL_ORIGIN.key);
  if (!t) { calOriginClose(); renderWx(); return; }
  if (action === 'cal-origin-pick') {
    const pick = CAL_ORIGIN.results[Number(button.dataset.i)];
    if (pick && locHasCoords(pick)) {
      CAL_ORIGIN.hit = DayContext.cleanPoint(pick, 'agenda-origin');
      CAL_ORIGIN.results = []; CAL_ORIGIN.generation++; CAL_ORIGIN.message = '';
      renderWx();
    }
    return;
  }
  if (action === 'cal-origin-search') {
    const q = CAL_ORIGIN.query.trim();
    if (q.length < 2) { CAL_ORIGIN.message = 'Saisis au moins deux caractères.'; renderWx(); return; }
    if (offlineNow()) { CAL_ORIGIN.message = 'Recherche indisponible hors connexion.'; renderWx(); return; }
    if (CAL_ORIGIN.busy) return;
    const gen = ++CAL_ORIGIN.generation, key = CAL_ORIGIN.key;
    CAL_ORIGIN.busy = true; CAL_ORIGIN.message = 'Recherche en cours…'; renderWx();
    try {
      const results = await geocode(q);
      if (CAL_ORIGIN.key !== key || CAL_ORIGIN.generation !== gen) return;
      CAL_ORIGIN.results = results.filter(p => locHasCoords(p)).slice(0, 6);
      CAL_ORIGIN.message = CAL_ORIGIN.results.length ? 'Choisis une adresse dans les résultats.' : 'Aucune adresse trouvée.';
    } catch (e) {
      if (CAL_ORIGIN.key === key && CAL_ORIGIN.generation === gen) CAL_ORIGIN.message = 'Recherche impossible : réessaie.';
    } finally {
      if (CAL_ORIGIN.key === key) {
        CAL_ORIGIN.busy = false; renderWx();
      }
    }
    return;
  }
  if (action !== 'cal-origin-save' && action !== 'cal-origin-reset') return;
  const vault = window.TWRC_VAULT;
  if (!vault || vault.mode !== 'vault' || LOCKED()) {
    CAL_ORIGIN.message = 'Coffre chiffré verrouillé ou indisponible : aucun départ enregistré.';
    renderWx(); return;
  }
  const id = TripCancel.eventId(t.e), now = Date.now();
  let row = null;
  if (action === 'cal-origin-save') {
    const mode = CAL_ORIGIN.mode;
    const gps = mode === '__gps' && t.e.s.slice(0, 10) === placeToday() ? appCurrentGps() : null;
    const origin = mode === '__manual' ? CAL_ORIGIN.hit : mode === '__gps' ? gps : locById(mode);
    if (!origin || !locHasCoords(origin)) {
      CAL_ORIGIN.message = 'Choisis un lieu de départ valide.'; renderWx(); return;
    }
    const source = mode === '__manual' ? 'manual' : mode === '__gps' ? 'gps' : 'saved';
    const expiresAt = Math.max(now + 3600e3, Date.parse(t.e.s + ':00Z') + 48 * 3600e3);
    row = { eventStart: t.e.s, originId: source === 'saved' ? origin.id : null,
      originPoint: source === 'saved' ? null : DayContext.cleanPoint({ ...origin, name: origin.name || 'Ma position' }, 'agenda-origin'),
      source, confirmedAt: now, updatedAt: now, expiresAt };
  }
  // L'intention est publiée en une seule transaction. Une lecture du nouvel itinéraire
  // reste provisoire jusqu'à route ET météo fraîches ; aucun ancien chiffre réutilisé.
  appAction(() => {
    const d = appDay(); d.agendaOrigins = { ...(d.agendaOrigins || {}) };
    if (row) d.agendaOrigins[id] = row; else delete d.agendaOrigins[id];
  });
  const stored = appDay().agendaOrigins[id];
  if (row && !stored || !row && stored) {
    CAL_ORIGIN.message = 'Enregistrement refusé : origine non confirmée.';
    renderWx(); return;
  }
  await vault.flush();
  if (vault.error || USER_STORE.durability().status !== 'durable') {
    CAL_ORIGIN.message = 'Écriture chiffrée non confirmée : données conservées en mémoire, ne ferme pas cet onglet.';
    renderWx(); return;
  }
  CANCELROUTEGEN++; CANCELROUTES.clear();
  APP_CONTEXT.weatherPreview = null;
  calOriginClose(); rebuild(); renderAll();
}
document.addEventListener('change', e => { if (e.target && e.target.dataset && e.target.dataset.calOriginField === 'mode') calOriginFieldChanged(e.target); });
document.addEventListener('input', e => { if (e.target && e.target.dataset && e.target.dataset.calOriginField === 'query') calOriginFieldChanged(e.target); });
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target && e.target.id === 'calOriginQuery') {
    e.preventDefault(); const button = document.querySelector('#secWx [data-act="cal-origin-search"]');
    if (button) button.click();
  }
});
