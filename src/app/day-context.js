/* Extension locale de USER_STORE : lieux configurés par ID, aucun autre store. */
function appDay() {
  USER_STORE.state.dayContext = DayContext.clean(USER_STORE.state.dayContext, Date.now(), placeList());
  return USER_STORE.state.dayContext;
}
function appConfirmedPlace(placeId, at) {
  const d = appDay(); d.lastConfirmedPlace = { placeId, at, source: 'manual' }; d.arrivedAt = at; d.nextDestination = null;
}
function appRealOrigin(date = placeToday()) {
  if (date !== placeToday()) return null;
  const c = placeNow();
  if (c.source === 'gps' || c.source === 'manual' && DayContext.date(c.confirmed.at) === placeToday()) return c.place;
  return DayContext.morningOrigin(appDay(), Date.now(), placeList());
}
function appCommuteEndpoints(dir, date, key) {
  const real = appRealOrigin(date), n = appDay().nextDestination, start = TRIPSTART && TRIPSTART.key === key && TRIPSTART.trip;
  const from = start && locById(start.fromId) || real || locById(dir === 'go' ? S.work.from : S.work.to);
  const to = n && n.tripKey === key ? locById(n.placeId) : locById(dir === 'go' ? S.work.to : S.work.from);
  return { from, to };
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
function appAgendaLeg(e, leg) { return DayContext.returnLeg(leg, calendarTripKey(e, leg), appDay(), Date.now(), placeList()); }
function appLocalTrips(T, now) {
  const n = appDay().nextDestination;
  if (!n || T.some(t => t.key === n.tripKey)) return T;
  const from = locById(n.originId), to = locById(n.placeId), started = TRIPSTART && TRIPSTART.key === n.tripKey;
  const dep = started ? localTs(TRIPSTART.at) : now, l = { k: 'local', from, to, navTo: to, dep, arr: addMin(dep, +S.work.durMin || 30), min: +S.work.durMin || 30, pts: [] };
  const ready = to && from ? tripCancelRouteLeg({ id: n.tripKey, s: n.dep }, { ...l, originPending: true }) : l;
  const r = to && from && !ready.originPending ? legEval(ready) : {};
  T.unshift({ src: 'local', key: n.tripKey, carId: null, dep, planDep: n.dep, arr: ready.arr, l: ready,
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
  el.innerHTML = `<div class="sub">AUJOURD’HUI</div><details><summary>Destination suivante · ${esc(destination && destination.name || 'Destination à confirmer')} · ${label}</summary><div class="chips">${choices}<button class="chip" data-act="day-destination" data-id="" aria-pressed="${!!n && !n.placeId}">Autre</button></div></details>`;
}
