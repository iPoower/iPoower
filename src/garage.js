/* Garage : projection PURE des voitures déjà enregistrées.
 * Une source de vérité : S.cars + tyreState() ; aucune donnée mécanique inventée,
 * ni nouveau stockage, ni diagnostic OBD. Les dates sont celles déclarées.
 */
'use strict';
const Garage = (() => {
  const str = x => typeof x === 'string' ? x.trim() : '';
  const val = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null;
  const validDate = x => /^\d{4}-\d{2}-\d{2}$/.test(str(x));
  function overview(cars, activeId, stateFor) {
    if (!Array.isArray(cars)) return [];
    const used = new Set();
    return cars.filter(car => car && typeof car === 'object').map((car, index) => {
      const key = str(car.id) || 'car-' + index;
      if (used.has(key)) return null;
      used.add(key);
      const t = car.tire || {}, p = car.plan || {};
      const state = typeof stateFor === 'function' ? stateFor(car) : null;
      const readings = (Array.isArray(car.odo) ? car.odo : [])
        .filter(x => x && val(x.km) != null && validDate(x.d))
        .slice().sort((a, b) => String(a.d).localeCompare(String(b.d)));
      const last = readings.length ? readings[readings.length - 1] : null;
      const mounted = state && state.active;
      const lastPressure = state && state.pressure && state.pressure.check;
      const plan = !!p.on && t.type !== 'winter' ? {
        model: [str(p.brand), str(p.model)].filter(Boolean).join(' ') || null,
        size: str(p.size) || null,
        eta: validDate(p.etaFrom) ? p.etaFrom : null,
        etaTo: validDate(p.etaTo) ? p.etaTo : null,
        appointment: validDate(p.appointmentDate) ? p.appointmentDate : null,
        confirmed: !!p.appointmentConfirmed
      } : null;
      return {
        id: key, name: str(car.name) || str(car.short) || 'Voiture ' + (index + 1),
        short: str(car.short) || str(car.name) || 'Voiture ' + (index + 1),
        spec: str(car.spec), active: key === activeId,
        odo: last ? { km: last.km, date: last.d, source: 'USER_ENTERED' } : null,
        tyre: mounted ? {
          type: mounted.label,
          model: state.model && [str(state.model.brand), str(state.model.model)].filter(Boolean).join(' ') || null,
          size: str(t.size) || null,
          tread: state.tread && val(state.tread.mm) != null ? { mm: state.tread.mm, estimated: !!state.tread.est, date: state.tread.date || null } : null,
          pressure: state.pressure && val(state.pressure.target) != null ? { bar: state.pressure.target, checked: lastPressure && lastPressure.date || null } : null,
          dot: state.dot && state.dot.txt || null,
          mount: state.mount && state.mount.date || null,
          kmSinceMount: state.mount && val(state.mount.kmSince) != null ? state.mount.kmSince : null,
          stored: state.stored || []
        } : null,
        notices: state && Array.isArray(state.maint) ? state.maint.map(m => ({ level: m.lv, text: str(m.text) })).filter(m => m.text) : [],
        winterPlan: plan
      };
    }).filter(Boolean);
  }
  return { overview };
})();
