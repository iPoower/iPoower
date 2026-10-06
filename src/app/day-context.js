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
function appWorkOn(date, days = S.work.days) { return DayContext.workOn(date, appDay(), commuteDays(days)); }
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
  const dep = started ? localTs(TRIPSTART.at) : now, l = { k: 'local', from, to, navTo: to, dep, arr: addMin(dep, +S.work.durMin || 30), min: +S.work.durMin || 30, pts: [] };
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
  const work = appWorkOn(placeToday()), dayButtons = [['work', 'Travail'], ['off', 'Congé / Pas de travail']].map(([v, title]) => `<button data-act="day-type" data-v="${v}" aria-pressed="${work === (v === 'work')}">${title}</button>`).join('');
  const carButtons = S.cars.map(car => `<button class="chip" data-act="day-car" data-id="${esc(car.id)}" aria-pressed="${d.activeCarId === car.id}">${esc(car.short || car.name || car.id)}</button>`).join('');
  const opened = el.querySelector('details.day-editor') && el.querySelector('details.day-editor').open;
  const destinationOpen = el.querySelector('details.day-destination') && el.querySelector('details.day-destination').open;
  const car = appActiveCar();
  el.innerHTML = `<details class="day-editor" ${opened ? 'open' : ''}><summary>Aujourd’hui · ${work ? 'Travail' : 'Congé'} · ${d.dayType ? 'CONFIRMÉ' : 'PRÉVU'}${car ? ' · ' + esc(car.short || car.name) : ''}</summary><div class="seg" role="group" aria-label="Type de journée">${dayButtons}</div><div class="chips" role="group" aria-label="Voiture active">${carButtons}<button class="chip" data-act="day-car" data-id="" aria-pressed="${!d.activeCarId}">Toutes · comparaison</button></div><details class="day-destination" ${destinationOpen ? 'open' : ''}><summary>Destination suivante · ${esc(destination && destination.name || 'Destination à confirmer')} · ${label}</summary><div class="chips">${choices}<button class="chip" data-act="day-destination" data-id="" aria-pressed="${!!n && !n.placeId}">Autre</button></div></details></details>`;
}
