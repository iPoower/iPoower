/* Confirmation du montage : les champs restent un brouillon jusqu'au clic final. */
let MOUNT_FORM = null;
const mountIdentity = car => JSON.stringify([tyreStateOf(car).sig, car.plan, car.sets && car.sets.winter]);
function mountOpen(carId) {
  const car = S.cars.find(c => c.id === carId);
  if (DEMO.on || !car || !car.plan.on || car.tire.type === 'winter') return;
  const preview = clone(car); switchTire(preview, 'winter');
  MOUNT_FORM = { carId, date: nowIn('Europe/Paris').slice(0, 10), km: '', msg: '', sig: mountIdentity(car),
    target: [preview.tire.brand, preview.tire.model, preview.tire.size].filter(Boolean).join(' · ') || 'Pneus hiver, modèle non renseigné' };
  renderSeason();
  const form = $('#secSeason .mount-form'); if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function mountDraft(car) {
  if (!MOUNT_FORM || MOUNT_FORM.carId !== car.id) return '';
  return `<div class="mount-form" data-car="${esc(car.id)}" role="group" aria-label="Confirmer le montage hiver">
    <p class="sub">Jeu hiver à activer : <b>${esc(MOUNT_FORM.target)}</b>. Le jeu démonté et ses relevés seront conservés.</p>
    <div class="frow"><div class="fld"><label for="mountDate">Date réelle du montage</label><input id="mountDate" type="date" data-mount-field="date" value="${esc(MOUNT_FORM.date)}" max="${nowIn('Europe/Paris').slice(0, 10)}"></div>
    <div class="fld"><label for="mountKm">Compteur au montage · facultatif</label><input id="mountKm" type="number" min="0" step="1" inputmode="numeric" data-mount-field="km" value="${esc(MOUNT_FORM.km)}" placeholder="ex. 42150"></div></div>
    <p class="sub">Renseigne le compteur relevé le jour du montage. La profondeur et la pression restent à contrôler.</p>
    <p class="sub mount-message" role="status">${esc(MOUNT_FORM.msg)}</p>
    <div class="chips"><button class="btn pri" data-act="mount-save">Confirmer le montage</button><button class="btn" data-act="mount-cancel">Annuler</button></div></div>`;
}
function mountSave() {
  if (!MOUNT_FORM || DEMO.on) return;
  const ci = S.cars.findIndex(c => c.id === MOUNT_FORM.carId), car = S.cars[ci];
  const result = !car || mountIdentity(car) !== MOUNT_FORM.sig ? { error: 'La monte ou le montage prévu a changé. Annule puis rouvre la confirmation.' }
    : LIVE.phase === 'active' ? { error: 'Termine le trajet avant d’enregistrer le montage.' }
    : confirmWinterMount(car, { date: MOUNT_FORM.date, km: MOUNT_FORM.km, today: nowIn('Europe/Paris').slice(0, 10) });
  if (result.error) { MOUNT_FORM.msg = result.error; renderSeason(); return; }
  S.cars[ci] = result.car;
  ['tire', 'sets', 'odo', 'plan.on'].forEach(k => markEdit(`cars.${ci}.${k}`));
  const memory = ttLoad(); delete memory[car.id]; lsSet(TT_KEY, JSON.stringify(memory));
  MOUNT_FORM = null; saveSettings();
  // Le débrief conserve son historique ; le bilan temporaire de l'ancien jeu ne sert plus de point de départ.
  if (TRIPEND && (!TRIPEND.carId || TRIPEND.carId === car.id)) appAction(() => { TRIPEND = null; });
  rebuild(); renderSettings(); renderAll();
}
document.addEventListener('input', e => {
  const t = e.target;
  if (MOUNT_FORM && t.dataset.mountField && ['date', 'km'].includes(t.dataset.mountField)) MOUNT_FORM[t.dataset.mountField] = t.value;
});
