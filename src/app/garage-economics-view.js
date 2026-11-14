/* Garage · coûts et pleins (reprise de #231) : volet « 💶 Coût & rentabilité » dans chaque fiche et comparatif des voitures.
 * Données : S.cars[i].economics, dans les réglages déjà chiffrés par le coffre de session (aucune nouvelle clé, aucun réseau).
 * Chaque enregistrement est marqué (markEdit), écrit, relu, puis le coffre est vidé sur disque ; un échec est dit, jamais masqué. */
const ECON_STATUS = Object.create(null);   // message du dernier enregistrement, par voiture (mémoire de la page seulement)
const econEuro = c => Number.isSafeInteger(c) ? (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—';
const econInputEuro = c => Number.isSafeInteger(c) ? (c / 100).toFixed(2).replace('.', ',') : '';
const econLitres = v => Number.isFinite(v) ? v.toLocaleString('fr-FR', { maximumFractionDigits: 3 }) + ' L' : '—';
const econLabel = (list, id) => (list.find(x => x[0] === id) || [id, id])[1];
function econField(label, name, value, type = 'text', extra = '') {
  return '<label class="econ-field"><span>' + esc(label) + '</span><input name="' + name + '" type="' + type + '" value="' + esc(value == null ? '' : String(value)) + '" ' + extra + '></label>';
}
function econCurrentKm(car) {
  const last = (Array.isArray(car && car.odo) ? car.odo : []).filter(o => o && Number.isFinite(o.km) && /^\d{4}-\d{2}-\d{2}$/.test(o.d || '')).sort((a, b) => a.d.localeCompare(b.d)).pop();
  return last ? Math.round(last.km) : null;
}
function econProject(car) { return GarageEconomics.project(car && car.economics, { today: nowIn('Europe/Paris').slice(0, 10), currentKm: econCurrentKm(car) }); }
function garageEconomicsHtml(car) {
  if (!car || !car.id) return '';
  const econ = car.economics || {}, ref = econ.ref || {}, p = econProject(car), rows = GarageEconomics.ledger(econ).rows;
  const id = esc(car.id), today = nowIn('Europe/Paris').slice(0, 10), f = p.fuel, c = p.consumption;
  const stats = '<div class="econ-stats">' +
    '<div><span>Achat amorti · 3 ans</span><strong>' + (p.amortized36 != null ? econEuro(p.amortized36) + '/mois' : '—') + '</strong></div>' +
    '<div><span>Achat amorti · 5 ans</span><strong>' + (p.amortized60 != null ? econEuro(p.amortized60) + '/mois' : '—') + '</strong></div>' +
    '<div><span>Dépenses saisies</span><strong>' + (p.entries ? econEuro(p.spentCents) : 'À renseigner') + '</strong></div>' +
    '<div><span>Coût déclaré / km</span><strong>' + (p.costPerKmCents != null ? econEuro(p.costPerKmCents) + '/km' : '—') + '</strong></div></div>' +
    '<p class="sub">' + (p.price == null ? 'Prix d’achat non renseigné : aucun amortissement calculé.' : 'Amortissement du prix payé' + (p.resaleUsed ? ', revente estimée déduite' : '') + ', sans carburant ni entretien.') +
    (p.costPerKmCents != null ? ' Coût au km : prix payé + dépenses saisies, divisés par les km parcourus depuis l’achat.' : ' Coût au km : prix, compteur d’achat et 1 000 km parcourus nécessaires.') +
    (p.shortHistory ? ' Historique encore trop court pour conclure.' : '') + ' Les dépenses saisies ne sont jamais présumées complètes.</p>';
  const fuel = '<div class="econ-fuel-summary"><h4>⛽ Carburant · tickets saisis</h4><div class="econ-stats">' +
    '<div><span>Volume connu</span><strong>' + (f.measured ? econLitres(f.litres) : '—') + '</strong></div>' +
    '<div><span>Prix moyen payé</span><strong>' + (f.euroPerLitre != null ? f.euroPerLitre.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' €/L' : '—') + '</strong></div>' +
    '<div><span>Ravitaillements</span><strong>' + f.count + '</strong></div>' +
    '<div><span>Conso. entre pleins</span><strong>' + (c ? c.litresPer100.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' L/100 km' : '—') + '</strong></div></div>' +
    (c ? '<p class="sub">Du ' + garageDate(c.startDate) + ' au ' + garageDate(c.endDate) + ' : ' + garageKm(c.distanceKm) + ', ' + econLitres(c.litres) + ' · ≈ ' +
      c.eurosPer100.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' € de carburant aux 100 km. Valable seulement si tous les ravitaillements sont saisis.</p>'
      : '<p class="sub">Consommation réelle : deux pleins complets datés avec leurs compteurs, et le volume de tous les ravitaillements entre eux.</p>') +
    (f.missingVolume ? '<p class="econ-warning">' + f.missingVolume + ' ravitaillement(s) sans volume : le prix moyen ne compte que les tickets avec litres.</p>' : '') + '</div>';
  const months = Object.keys(p.byMonth).sort().reverse().slice(0, 6);
  const monthly = months.length ? '<div class="econ-months"><h5>Dépenses par mois</h5><ul>' + months.map(m => '<li><span>' + esc(m.slice(5, 7) + '/' + m.slice(0, 4)) + '</span><b>' + econEuro(p.byMonth[m]) + '</b></li>').join('') + '</ul></div>' : '';
  const history = rows.slice().reverse().slice(0, 15).map(e => '<li><span><b>' + garageDate(e.date) + '</b> · ' + esc(econLabel(GarageEconomics.CATEGORIES, e.category)) +
      (e.category === 'fuel' ? '<small> · ' + (e.volumeMl ? econLitres(e.volumeMl / 1000) + ' · ' + (e.amountCents * 10 / e.volumeMl).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' €/L' : 'volume inconnu') +
        ' · ' + esc(econLabel(GarageEconomics.FUELS, e.fuelType || 'unknown')) + (e.fullTank ? ' · plein complet' : '') + '</small>' : '') +
      (e.km != null ? '<small> · ' + garageKm(e.km) + '</small>' : '') + (e.note ? '<small> · ' + esc(e.note) + '</small>' : '') + '</span><strong>' + econEuro(e.amountCents) + '</strong>' +
      '<button type="button" class="btn sm" data-act="econ-delete" data-car="' + id + '" data-entry="' + esc(e.id) + '" aria-label="Retirer la dépense du ' + garageDate(e.date) + '">Retirer</button></li>').join('');
  const cats = GarageEconomics.CATEGORIES.map(([v, l]) => '<option value="' + v + '">' + esc(l) + '</option>').join('');
  const fuels = GarageEconomics.FUELS.map(([v, l]) => '<option value="' + v + '">' + esc(l) + '</option>').join('');
  return '<details class="garage-economics" data-garage-economics="' + id + '"><summary>💶 Coût & rentabilité <small>Budget privé de cette voiture · chiffré dans le coffre</small></summary><div class="econ-content">' +
    stats +
    '<form class="econ-form" data-econ-ref="' + id + '"><h4>Références de la voiture</h4><div class="econ-fields">' +
      econField('Prix d’achat payé (€)', 'price', econInputEuro(ref.purchasePriceCents), 'text', 'inputmode="decimal" autocomplete="off"') +
      econField('Date d’achat', 'date', ref.purchaseDate || '', 'date') +
      econField('Compteur à l’achat (km)', 'odo', ref.purchaseOdometerKm, 'text', 'inputmode="numeric" autocomplete="off"') +
      econField('Distance prévue par an (km)', 'annual', ref.annualDistanceKm, 'text', 'inputmode="numeric" autocomplete="off"') +
      econField('Revente estimée (€) · facultatif', 'resale', econInputEuro(ref.estimatedResaleCents), 'text', 'inputmode="decimal" autocomplete="off"') +
    '</div><button type="submit" class="btn pri">Enregistrer les références</button></form>' +
    '<form class="econ-form" data-econ-add="' + id + '"><h4>Ajouter une dépense</h4><div class="econ-fields">' +
      econField('Date', 'date', today, 'date', 'required') +
      '<label class="econ-field"><span>Catégorie</span><select name="category" data-econ-category>' + cats + '</select></label>' +
      econField('Montant payé (€)', 'amount', '', 'text', 'inputmode="decimal" required autocomplete="off"') +
      econField('Compteur (km) · facultatif', 'km', '', 'text', 'inputmode="numeric" autocomplete="off"') +
      econField('Libellé · facultatif', 'note', '', 'text', 'maxlength="80" autocomplete="off"') +
    '</div><div class="econ-fuel-fields" data-econ-fuel><p class="sub">⛽ Montant <b>réellement payé, après remise</b> ; litres et carburant tels qu’écrits sur le ticket.</p><div class="econ-fields">' +
      econField('Litres · facultatif', 'litres', '', 'text', 'inputmode="decimal" autocomplete="off"') +
      '<label class="econ-field"><span>Carburant</span><select name="fuelType">' + fuels + '</select></label>' +
      '<label class="econ-tank-full"><input type="checkbox" name="fullTank" value="yes"><span>Plein complet (réservoir rempli au même niveau)</span></label>' +
    '</div></div><button type="submit" class="btn pri">Ajouter au journal</button></form>' +
    fuel + monthly + (p.invalid ? '<p class="econ-warning">' + p.invalid + ' ligne(s) illisible(s) conservée(s), exclue(s) des calculs.</p>' : '') +
    '<div class="econ-history"><h5>Journal · ' + p.entries + ' ligne(s)' + (p.entries > 15 ? ', les 15 dernières' : '') + '</h5>' + (history ? '<ul>' + history + '</ul>' : '<p class="sub">Aucune dépense saisie. Un champ vide ne vaut pas zéro.</p>') + '</div>' +
    '<p class="sub">Un loyer LOA/LLD est un paiement, pas un prix d’achat : ne le compte pas deux fois.</p>' +
    '<p class="econ-status" role="status" aria-live="polite">' + esc(ECON_STATUS[car.id] || '') + '</p></div></details>';
}
function garageEconomicsCompareHtml(cars) {
  const list = (Array.isArray(cars) ? cars : []).filter(c => c && c.id);
  if (list.length < 2 || !list.some(c => c.economics)) return '';
  return '<section class="econ-comparison" aria-label="Comparatif des coûts des voitures"><h3>💶 Comparatif des coûts</h3>' +
    '<p class="sub">Prix payé amorti sur 5 ans et dépenses réellement saisies : une comparaison indicative, jamais un classement de rentabilité.</p><div class="econ-compare-grid">' +
    list.map(car => { const p = econProject(car); return '<div class="econ-compare-car" data-econ-compare="' + esc(car.id) + '"><b>' + esc(car.short || car.name || 'Voiture') + '</b>' +
      '<span>Prix payé</span><strong>' + econEuro(p.price) + '</strong><span>Amorti sur 5 ans</span><strong>' + (p.amortized60 != null ? econEuro(p.amortized60) + '/mois' : '—') + '</strong>' +
      '<span>Dépenses saisies</span><strong>' + (p.entries ? econEuro(p.spentCents) : 'À renseigner') + '</strong>' +
      '<span>Coût déclaré / km</span><strong>' + (p.costPerKmCents != null ? econEuro(p.costPerKmCents) + '/km' : '—') + '</strong>' +
      '<button type="button" class="btn sm" data-act="econ-open" data-car="' + esc(car.id) + '">Voir le budget</button></div>'; }).join('') + '</div></section>';
}
// Écrit, relit et vide le coffre ; sinon l'ancienne fiche est remise et l'échec est dit (jamais « enregistré » sans preuve).
async function econPersist(car, next, paths, message) {
  const ix = S.cars.indexOf(car);
  if (ix < 0 || LOCKED() || DEMO.on || DeviceStorage.isFrozen()) throw new Error('Garage indisponible : déverrouille Race Control.');
  const before = car.economics;
  car.economics = next; paths.forEach(k => markEdit('cars.' + ix + '.economics.' + k));
  try {
    saveSettings();
    const saved = JSON.parse(lsGet('twrc.settings.v1') || 'null');
    if (!saved || !saved.cars || JSON.stringify(saved.cars[ix] && saved.cars[ix].economics) !== JSON.stringify(next)) throw new Error('relecture');
    const vs = window.TWRC_VAULT;
    if (vs && vs.mode === 'vault') { await vs.flush(); if (vs.error || vs.pendingRecovery) throw new Error('coffre'); }
  } catch (e) {
    car.economics = before; try { saveSettings(); } catch (x) { /* l'ancienne valeur reste en mémoire */ }
    throw new Error('Enregistrement non confirmé : rien n’a été modifié. Réessaie.');
  }
  ECON_STATUS[car.id] = message + ' · enregistré dans le coffre.';
  renderGarage.last = null; renderGarage();
}
function econStatus(node, car, text) { ECON_STATUS[car.id] = text; const s = node && node.closest('.garage-economics'); const el = s && s.querySelector('.econ-status'); if (el) el.textContent = text; }
function econNewId() { const n = new Uint32Array(2); crypto.getRandomValues(n); return (Date.now().toString(36) + '-' + n[0].toString(36) + n[1].toString(36)).slice(0, 40); }
document.addEventListener('submit', async event => {
  const form = event.target, carId = form && (form.dataset.econRef || form.dataset.econAdd);
  if (!carId) return;
  event.preventDefault();
  const car = (S.cars || []).find(c => c && c.id === carId); if (!car) return;
  const data = new FormData(form), econ = car.economics || {};
  try {
    if (form.dataset.econRef) {
      const ref = { purchasePriceCents: GarageEconomics.parseMoney(data.get('price')), purchaseDate: GarageEconomics.parseDay(data.get('date')),
        purchaseOdometerKm: GarageEconomics.parseKm(data.get('odo')), annualDistanceKm: GarageEconomics.parseKm(data.get('annual')),
        estimatedResaleCents: GarageEconomics.parseMoney(data.get('resale')) };
      await econPersist(car, { ...econ, ref }, ['ref'], 'Références enregistrées');
    } else {
      const category = String(data.get('category') || ''), fuel = category === 'fuel';
      const next = GarageEconomics.addEntry(econ, { date: GarageEconomics.parseDay(data.get('date')), category, amountCents: GarageEconomics.parseMoney(data.get('amount')),
        km: GarageEconomics.parseKm(data.get('km')), note: String(data.get('note') || ''),
        volumeMl: fuel ? GarageEconomics.parseLitres(data.get('litres')) : null, fuelType: fuel ? String(data.get('fuelType') || 'unknown') : null,
        fullTank: fuel && data.get('fullTank') === 'yes' }, econNewId());
      await econPersist(car, next, ['entries'], 'Dépense ajoutée');
    }
  } catch (e) { econStatus(form, car, e.message || 'Enregistrement non confirmé.'); }
});
document.addEventListener('change', event => {
  const sel = event.target && event.target.closest && event.target.closest('select[data-econ-category]');
  const box = sel && sel.closest('form').querySelector('[data-econ-fuel]');
  if (box) box.hidden = sel.value !== 'fuel';
});
document.addEventListener('click', async event => {
  const btn = event.target.closest && event.target.closest('[data-act]'), a = btn && btn.dataset.act;
  if (a === 'econ-open') {
    const open = btn;
    const d = [...document.querySelectorAll('.garage-economics')].find(x => x.dataset.garageEconomics === open.dataset.car);
    if (d) { d.open = true; d.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }); d.querySelector('summary').focus({ preventScroll: true }); }
    return;
  }
  if (!(a === 'econ-delete')) return;
  const del = btn;
  event.preventDefault();
  const car = (S.cars || []).find(c => c && c.id === del.dataset.car); if (!car) return;
  if (!confirm('Retirer cette dépense du journal ?')) return;
  try { await econPersist(car, GarageEconomics.removeEntry(car.economics, del.dataset.entry), ['entries', 'removed'], 'Dépense retirée'); }
  catch (e) { econStatus(del, car, e.message || 'Retrait non confirmé.'); }
});
const ECON_STYLE = `<style>
#secGarage .garage-economics{margin-top:10px;border:1px solid var(--line2);border-radius:6px;background:var(--panel);min-width:0}
#secGarage .garage-economics>summary{cursor:pointer;min-height:44px;padding:12px;font:700 17px var(--f-disp);letter-spacing:.02em}
#secGarage .garage-economics>summary small{display:block;margin-top:3px;color:var(--fg2);font:11px var(--f-mono)}
#secGarage .garage-economics>summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#secGarage .econ-content{display:flex;flex-direction:column;gap:12px;padding:0 11px 13px;min-width:0}
#secGarage .econ-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
#secGarage .econ-stats>div{display:flex;flex-direction:column;min-width:0;gap:5px;padding:10px;border:1px solid var(--line);border-radius:4px;background:var(--panel2)}
#secGarage .econ-stats span{font:11px var(--f-mono);color:var(--fg2);overflow-wrap:anywhere}
#secGarage .econ-stats strong{font:700 clamp(16px,4vw,22px) var(--f-disp);overflow-wrap:anywhere}
#secGarage .econ-form{padding:11px 0;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:10px}
#secGarage .econ-form h4,#secGarage .econ-months h5,#secGarage .econ-history h5,#secGarage .econ-fuel-summary h4{font:650 16px var(--f-disp);margin:0}
#secGarage .econ-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:9px}
#secGarage .econ-field{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--fg2);min-width:0}
#secGarage .econ-field input,#secGarage .econ-field select{width:100%;max-width:100%;min-height:44px;box-sizing:border-box;font-size:16px;color:var(--fg);background:var(--panel2);border:1px solid var(--line2);border-radius:4px;padding:0 10px}
#secGarage .econ-form button[type=submit]{min-height:44px;align-self:flex-start}
#secGarage .econ-fuel-fields{display:flex;flex-direction:column;gap:9px;padding:12px;border:1px dashed var(--line2);background:var(--panel2);border-radius:5px}
#secGarage .econ-fuel-fields[hidden]{display:none!important}
#secGarage .econ-tank-full{display:flex;align-items:center;gap:10px;grid-column:1/-1;min-height:44px;font-size:13px;color:var(--fg)}
#secGarage .econ-tank-full input{width:22px;height:22px;flex:none;accent-color:var(--accent)}
#secGarage .econ-fuel-summary{display:flex;flex-direction:column;gap:8px;border:1px solid var(--line2);padding:10px;border-radius:5px}
#secGarage .econ-history ul,#secGarage .econ-months ul{list-style:none;margin:7px 0 0;padding:0}
#secGarage .econ-history li,#secGarage .econ-months li{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-bottom:1px solid var(--line);padding:9px 0;font-size:13px}
#secGarage .econ-history li>span{min-width:110px;flex:1;overflow-wrap:anywhere}
#secGarage .econ-history li strong,#secGarage .econ-months li b{font:600 13px var(--f-mono)}
#secGarage .econ-history li button{min-height:44px;min-width:44px}
#secGarage .econ-warning{padding:8px;border:1px solid var(--warn);color:var(--fg);border-radius:4px;font-size:12px}
#secGarage .econ-status{font-size:13px;font-weight:600;color:var(--accent);min-height:16px;margin:0}
#secGarage .econ-comparison{padding:12px;border:1px solid var(--line2);border-radius:6px;background:var(--panel2);margin-top:12px}
#secGarage .econ-comparison h3{font:700 20px var(--f-disp);margin:0 0 8px}
#secGarage .econ-compare-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:8px}
#secGarage .econ-compare-car{display:grid;grid-template-columns:1fr auto;gap:7px;align-items:center;padding:10px;border:1px solid var(--line2);border-radius:4px;background:var(--panel)}
#secGarage .econ-compare-car>b{grid-column:1/-1;font:700 17px var(--f-disp)}
#secGarage .econ-compare-car span{color:var(--fg2);font-size:12px}
#secGarage .econ-compare-car strong{font:600 13px var(--f-mono)}
#secGarage .econ-compare-car button{grid-column:1/-1;min-height:44px}
@media(max-width:359px){#secGarage .econ-stats{grid-template-columns:minmax(0,1fr)}}
</style>`;
