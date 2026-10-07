/* Extension locale de USER_STORE : lieux configurés par ID, aucun autre store. */
function appDay() {
  USER_STORE.state.dayContext = DayContext.clean(USER_STORE.state.dayContext, Date.now(), placeList(), S.cars);
  return USER_STORE.state.dayContext;
}
function appConfirmedPlace(placeId, at) {
  const d = appDay(); d.lastConfirmedPlace = { placeId, at, source: 'manual' }; d.arrivedAt = at; d.departedAt = null; d.nextDestination = null;
}
function appRealOrigin(date = placeToday()) {
  if (date !== placeToday()) return null;
  const c = placeNow();
  if (c.source === 'gps' || c.source === 'manual' && DayContext.date(c.confirmed.at) === placeToday()) return c.place;
  const confirmed = appDay().lastConfirmedPlace, observation = PLACE.last;
  if (confirmed && observation && observation.source === 'gps' && observation.at > confirmed.at && observation.placeId !== confirmed.placeId) return null;
  return DayContext.morningOrigin(appDay(), Date.now(), placeList());
}
function appCommuteDirection(clock) {
  const now = toMin(clock.slice(11, 16)), dep = toMin(S.work.dep), ret = toMin(S.work.ret);
  const place = placeNow().place, atWork = place && place.id === S.work.to, atHome = place && place.id === S.work.from;
  return appWorkOn(clock) && (atWork || !atHome && now >= dep && now < ret) ? 'ret' : 'go';
}
function appCommuteEndpoints(dir, date, key) {
  // Le lieu réel pilote le prochain commute ; les jambes futures gardent leur origine prévue.
  const real = dir === appCommuteDirection(localTs(Date.now())) ? appRealOrigin(date) : null;
  const n = appDay().nextDestination, start = TRIPSTART && TRIPSTART.key === key && TRIPSTART.trip;
  const from = start && locById(start.fromId) || real || locById(dir === 'go' ? S.work.from : S.work.to);
  const to = n && n.tripKey === key ? locById(n.placeId) : locById(dir === 'go' ? S.work.to : S.work.from);
  return { from, to };
}
function appCommuteLabel(td) {
  const home = S.locs[0].id, from = td.dir === 'go' ? home : S.work.to, to = td.dir === 'go' ? S.work.to : home;
  return td.LA.id === from && td.LB.id === to ? `${td.dir === 'go' ? 'Aller' : 'Retour'} domicile-travail` : `Trajet · ${td.fromName} → ${td.toName}`;
}
function appChooseDestination(placeId, source = 'user') {
  return appAction(() => {
    const places = placeList(); if (placeId != null && !places.some(p => p.id === placeId)) return;
    const at = Date.now(), active = APP_CONTEXT.snapshot && APP_CONTEXT.snapshot.activeTrip;
    const current = placeNow().place || locById(USER_STORE.state.lastDeparture && USER_STORE.state.lastDeparture.placeId);
    const candidate = active || APP_CONTEXT.trips.find(t => t.dep.slice(0, 10) === placeToday() && !liveDoneHas(t, APP_CONTEXT.trips)
      && (!current || (appTripPlace(t, 'from') || {}).id === current.id));
    const prior = TRIPSTART;
    if (LIVE.key) liveReset(); tripPreviewReset(); CANCELROUTEGEN++; CANCELROUTES.clear();
    if (active && prior) TRIPSTART = prior;
    appDay().nextDestination = { placeId: placeId || null, source, confirmedAt: at, expiresAt: DayContext.expiry(at),
      originId: current && current.id || prior && prior.trip && prior.trip.fromId || null,
      tripKey: candidate && candidate.key || 'local|' + at, dep: candidate && (candidate.planDep || candidate.dep) || localTs(at) };
    APP_CONTEXT.weatherPreview = null;
  });
}
function appAgendaDestinationTrips(now = liveNow()) {
  const at = String(now).slice(0, 16), today = placeToday();
  return (APP_CONTEXT.planned || []).filter(t => {
    const l = t && (t.planL || t.l);
    return !!(t && t.src === 'cal' && t.e && l && l.k === 'go' && t.dep && t.dep.slice(0, 10) === today && t.dep >= at && locHasCoords(l.to));
  }).slice(0, 4);
}
function appChooseAgendaDestination(key) {
  const t = (APP_CONTEXT.planned || []).find(x => x && x.key === key && x.src === 'cal');
  const l = t && (t.planL || t.l), p = l && l.to;
  if (!t || !p || !locHasCoords(p)) return false;
  const known = placeList().find(x => x.id !== (PLACE.extra && PLACE.extra.id) && distKm(x, p) <= 1.5);
  if (known) { appChooseDestination(known.id); return true; }
  const current = placeNow().place;
  // PLACE.extra est l'unique lieu dynamique du contexte. Ne jamais l'écraser s'il représente le lieu courant confirmé.
  if (PLACE.extra && current && current.id === PLACE.extra.id && PLACE.conf && PLACE.conf.placeId === PLACE.extra.id) return false;
  const where = t.to || p.city || p.label || 'Rendez-vous';
  const title = t.e && t.e.t && t.e.t !== where ? t.e.t + ' · ' + where : (t.e && t.e.t) || where;
  PLACE.extra = { id: 'agenda-next', name: title, lat: p.lat, lon: p.lon, at: Date.now() };
  appChooseDestination(PLACE.extra.id);
  return true;
}
function appAgendaLeg(e, leg) { return DayContext.returnLeg(leg, calendarTripKey(e, leg), appDay(), Date.now(), placeList()); }
function appWorkOn(date, days = S.work.days) { return DayContext.workOn(date, appDay(), commuteDays(days)); }
function appCalendarCancelState(state = TRIPCANCEL) {
  const day = appDay().dayType;
  // Projection temporaire pour reconstruire un agenda calculé avec le planning
  // habituel. Ne jamais écrire cette projection dans twrc.tripcancel.
  return day && day.value === 'off' ? TripCancel.cancel(state, TripCancel.workId(day.date), TripCancel.workExpiration(day.date), Date.now()) : state;
}
function appCommuteOff(today, time, nowHm, days = S.work.days) {
  for (let off = 0; off <= 8; off++) {
    const date = addMin(today.slice(0, 10) + 'T00:00', off * 1440).slice(0, 10);
    if (appWorkOn(date, days) && (off > 0 || time > nowHm)) return off;
  }
  return null;
}
function appActiveCar() { const id = appDay().activeCarId; return S.cars.find(c => c.id === id) || null; }
function appTripCars() { const car = appActiveCar(); return car ? [car] : TCARS(); }
function appSetDayType(value) {
  if (!['work', 'off'].includes(value)) return;
  appAction(() => {
    appDay().dayType = { date: placeToday(), value };
    // Une journée ne contredit pas un départ réellement confirmé.
    if (LIVE.key && LIVE.phase !== 'active') liveReset();
    tripPreviewReset(); CANCELROUTEGEN++; CANCELROUTES.clear(); UI.dayOff = null;
  });
}
function appSetCar(id) { appAction(() => { appDay().activeCarId = S.cars.some(c => c.id === id) ? id : null; }); }
function appOutfitOccasion(offset = UI.outfitDay) {
  const date = addMin(placeToday() + 'T00:00', offset * 1440).slice(0, 10), n = appDay().nextDestination;
  return DayContext.occasion(date, appDay(), appWorkOn(date), offset === 0 && n && n.placeId, S.work.to);
}
function appLocalTrips(T, now) {
  const n = appDay().nextDestination;
  if (!n || T.some(t => t.key === n.tripKey)) return T;
  const from = locById(n.originId), to = locById(n.placeId), started = TRIPSTART && TRIPSTART.key === n.tripKey;
  const dep = started ? localTs(TRIPSTART.at) : now, l = { k: 'local', from, to, navTo: to, dep, arr: to ? addMin(dep, +S.work.durMin || 30) : null, min: to ? +S.work.durMin || 30 : null, pts: [] };
  const ready = to && from ? tripCancelRouteLeg({ id: n.tripKey, s: n.dep }, { ...l, originPending: true }) : l;
  const r = to && from && !ready.originPending ? legEval(ready) : {};
  T.unshift({ src: 'local', key: n.tripKey, carId: appDay().activeCarId, dep, planDep: n.dep, arr: ready.arr, l: ready,
    from: from && from.name || 'Origine à confirmer', to: to && to.name || 'Destination à confirmer', name: 'Trajet choisi',
    destinationPending: !to, res: r.res || null, sum: r.sum || null, seq: r.seq || [], wait: !r.res, worst: r.worst ?? null });
  return T;
}
function renderDayContext() {
  const el = $('#dayContext'); if (!el) return;
  const d = appDay(), c = APP_CONTEXT.snapshot, n = d.nextDestination;
  const destination = n ? n.placeId ? locById(n.placeId) : null : c.destination;
  const label = n ? n.placeId ? 'CONFIRMÉ' : 'À CONFIRMER' : destination ? 'PRÉVU' : 'À CONFIRMER';
  const choices = placeList().map(p => `<button class="chip" data-act="day-destination" data-id="${esc(p.id)}" aria-pressed="${!!n && n.placeId === p.id}">${esc(p.name)}</button>`).join('');
  const chosen = n && n.placeId ? locById(n.placeId) : null;
  const agendaTrips = appAgendaDestinationTrips(), agendaChoices = agendaTrips.map(t => {
    const l = t.planL || t.l, target = l && l.to, selected = !!(chosen && target && locHasCoords(chosen) && locHasCoords(target) && distKm(chosen, target) <= 1.5);
    const title = t.e && t.e.t || 'Rendez-vous', where = t.to && t.to !== title ? ' · ' + t.to : '';
    return `<button class="chip" data-act="day-destination" data-agenda-key="${esc(t.key)}" aria-pressed="${selected}">📅 ${esc(t.dep.slice(11, 16))} · ${esc(title + where)}</button>`;
  }).join('');
  const work = appWorkOn(placeToday()), dayButtons = [['work', 'Travail'], ['off', 'Congé / Pas de travail']].map(([v, title]) => `<button data-act="day-type" data-v="${v}" aria-pressed="${work === (v === 'work')}">${title}</button>`).join('');
  const carButtons = S.cars.map(car => `<button class="chip" data-act="day-car" data-id="${esc(car.id)}" aria-pressed="${d.activeCarId === car.id}">${esc(car.short || car.name || car.id)}</button>`).join('');
  const opened = el.querySelector('details.day-editor') && el.querySelector('details.day-editor').open;
  const destinationOpen = el.querySelector('details.day-destination') && el.querySelector('details.day-destination').open;
  const car = appActiveCar();
  el.innerHTML = `<details class="day-editor" ${opened ? 'open' : ''}><summary>Aujourd’hui · ${work ? 'Travail' : 'Congé'} · ${d.dayType ? 'CONFIRMÉ' : 'PRÉVU'}${car ? ' · ' + esc(car.short || car.name) : ''}</summary><div class="seg" role="group" aria-label="Type de journée">${dayButtons}</div><div class="chips" role="group" aria-label="Voiture active">${carButtons}<button class="chip" data-act="day-car" data-id="" aria-pressed="${!d.activeCarId}">Toutes · comparaison</button></div><details class="day-destination" ${destinationOpen ? 'open' : ''}><summary>Destination suivante · ${esc(destination && destination.name || 'Destination à confirmer')} · ${label}</summary><div class="chips">${choices}<button class="chip" data-act="day-destination" data-id="" aria-pressed="${!!n && !n.placeId}">Autre</button></div>${agendaChoices ? `<div class="sub">Prochains rendez-vous · départ direct depuis le lieu actuel</div><div class="chips">${agendaChoices}</div>` : ''}</details></details>`;
}
