/* Garage Economics : interface locale, protégée par le coffre existant, sans réseau.
 * Tous les montants sont saisis en euros puis conservés en centimes entiers
 * dans la fiche canonique S.cars[i].economics. Les cas inconnus restent inconnus.
 */
const ECON_CATEGORIES = Object.freeze([
  ['fuel','Carburant','fuelCents'],['insurance','Assurance','insuranceCents'],
  ['maintenance','Entretien','maintenanceCents'],['repairs','Réparations','repairsCents'],
  ['tyres','Pneus','tyresCents'],['tolls','Péages','tollsCents'],
  ['lease','Loyer LOA/LLD','leaseCents'],['other','Autres','otherCents']
]);
const ECON_MESSAGES = Object.create(null);
const ECON_MAX_ENTRIES = 360;
const ECON_FUELS = Object.freeze([
  ['unknown','À confirmer'],['diesel','Gazole (B7)'],['diesel-premium','Gazole premium'],
  ['sp98','SP98 E5'],['sp95-e5','SP95 E5'],['sp95-e10','SP95 E10'],
  ['e85','Superéthanol E85'],['other','Autre carburant']
]);
const litreText = ml => Number.isSafeInteger(ml) && ml>0
  ? (ml/1000).toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:3})+' L' : 'volume inconnu';
const perLitreText = val => Number.isFinite(val)
  ? val.toLocaleString('fr-FR',{minimumFractionDigits:3,maximumFractionDigits:3})+' €/L' : '—';
function garageFuelFields() {
  return '<div class="econ-fuel-fields" data-econ-fuel-fields>'+
    '<p class="sub">⛽ Ticket carburant : indique le montant <b>effectivement payé après remise</b>. Les litres et le carburant doivent correspondre au ticket.</p>'+
    '<div class="econ-fields">'+
    economyField('Litres ajoutés · facultatif','litres','','text','inputmode="decimal" placeholder="ex. 26,667"')+
    '<label class="econ-field"><span>Carburant indiqué (ou inconnu)</span><select name="fuelType">'+
      ECON_FUELS.map(([id,label])=>'<option value="'+id+'">'+esc(label)+'</option>').join('')+'</select></label>'+
    '<label class="econ-field econ-tank-full"><input type="checkbox" name="fullTank" value="yes"><span>Plein complet confirmé (réservoir rempli au même niveau)</span></label>'+
    '</div><p class="sub">Consommation réelle entre deux pleins complets avec compteurs, à condition d’enregistrer tous les ravitaillements. La photo du ticket n’est pas conservée.</p></div>';
}

const euro = cents => Number.isSafeInteger(cents)
  ? (cents / 100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'}) : '—';
const moneyInput = cents => Number.isSafeInteger(cents) ? (cents / 100).toFixed(2) : '';
function economyMoney(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim().replace(',', '.');
  if (!s) return null;
  if (!/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?$/.test(s)) throw new Error('Montant invalide (euros, deux décimales maximum).');
  const [whole, fraction = ''] = s.split('.');
  return Number(whole)*100 + Number((fraction+'00').slice(0,2));
}
function economyKm(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return null;
  if (!/^(?:0|[1-9][0-9]{0,7})$/.test(s)) throw new Error('Kilométrage invalide.');
  return Number(s);
}
function economyDate(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value + 'T00:00:00Z')) ||
      new Date(value + 'T00:00:00Z').toISOString().slice(0,10) !== value) throw new Error('Date invalide.');
  return value;
}
function economyLedger(input) {
  const rows = Array.isArray(input) ? input : [];
  const seen = new Set(), valid = [];
  for (const x of rows) {
    if (!x || typeof x.id !== 'string' || !x.id || seen.has(x.id) ||
        !ECON_CATEGORIES.some(c=>c[0]===x.category) ||
        !Number.isSafeInteger(x.amountCents) || x.amountCents<0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(x.date || '')) continue;
    seen.add(x.id); valid.push(x);
  }
  return {rows:valid,invalid:rows.length-valid.length};
}
function economyProjection(car) {
  const econ = car && car.economics || {}, entries = economyLedger(econ.entries);
  const expenses = {};
  const byMonth = Object.create(null);
  ECON_CATEGORIES.forEach(([k,label,key]) => {
    const xs = entries.rows.filter(e=>e.category===k);
    if(xs.length) expenses[key]=xs.reduce((sum,e)=>sum+e.amountCents,0);
  });
  entries.rows.forEach(e => {
    const ym=e.date.slice(0,7);
    byMonth[ym]=(byMonth[ym] || 0)+e.amountCents;
  });
  const last=car && Array.isArray(car.odo) ? car.odo.filter(o=>o && typeof o.km==='number' && /^\d{4}-\d{2}-\d{2}$/.test(o.d||'')).sort((a,b)=>a.d.localeCompare(b.d)).slice(-1)[0] : null;
  const data=GarageEconomics.project({
    purchasePriceCents:econ.purchasePriceCents,
    purchaseDate:econ.purchaseDate,asOfDate:nowIn('Europe/Paris').slice(0,10),
    purchaseOdometerKm:econ.purchaseOdometerKm,currentOdometerKm:last && last.km,
    annualDistanceKm:econ.annualDistanceKm,estimatedResaleCents:econ.estimatedResaleCents,expenses
  });
  return {data,entries,byMonth,expenses};
}
function economyField(label,name,value,type='number',extras='') {
  return '<label class="econ-field"><span>'+esc(label)+'</span><input name="'+name+'" type="'+type+
    '" value="'+esc(value == null ? '' : String(value))+'" '+extras+'></label>';
}
function garageEconomicsHtml(car) {
  if (!car) return '';
  const econ=car.economics || {}, p=economyProjection(car), result=p.data;
  const byMonth=Object.keys(p.byMonth).sort().reverse().slice(0,6);
  const fuel=GarageFuel.summarize(p.entries.rows),real=GarageFuel.fullToFull(p.entries.rows);
  const costs=p.entries.rows.slice().sort((a,b)=>b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0,15);
  const short=costs.map(e=>{
    const category=ECON_CATEGORIES.find(c=>c[0]===e.category);
    return '<li><span><b>'+garageDate(e.date)+'</b> · '+esc(category && category[1] || 'Autre')+
      (e.note ? '<small> · '+esc(e.note)+'</small>' : '')+
      (e.category==='fuel' ? '<small> · '+litreText(e.volumeMl)+
        (GarageFuel.perLiter(e.amountCents,e.volumeMl)!=null ? ' · '+perLitreText(GarageFuel.perLiter(e.amountCents,e.volumeMl)) : '')+
        (e.fuelType ? ' · '+esc((ECON_FUELS.find(f=>f[0]===e.fuelType)||['','Carburant à confirmer'])[1]) : '')+
        (e.fullTank===true ? ' · plein complet déclaré' : '')+'</small>' : '')+'</span><strong>'+euro(e.amountCents)+'</strong>'+
      '<button class="btn sm" type="button" data-act="econ-delete" data-car="'+esc(car.id)+
      '" data-expense-id="'+esc(e.id)+'" aria-label="Supprimer cette dépense">Retirer</button></li>';
  }).join('');
  const summary=result.available ? result.scenarios : [];
  const price3=summary.find(s=>s.months===36),price5=summary.find(s=>s.months===60);
  const cards='<div class="econ-stats">'+
    '<div><span>Achat / 3 ans</span><strong>'+(price3?euro(price3.purchasePerMonthCents)+'/mois':'—')+'</strong></div>'+
    '<div><span>Achat / 5 ans</span><strong>'+(price5?euro(price5.purchasePerMonthCents)+'/mois':'—')+'</strong></div>'+
    '<div><span>Dépenses enregistrées</span><strong>'+(p.entries.rows.length?euro(p.entries.rows.reduce((s,x)=>s+x.amountCents,0)):'À renseigner')+'</strong></div>'+
    '<div><span>Coût déclaré / km</span><strong>'+(result.currentRecordedCostPerKmCents!=null
      ? euro(result.currentRecordedCostPerKmCents)+'/km' : '—')+'</strong></div></div>';
  const fuelSummary='<div class="econ-fuel-summary"><h4>⛽ Carburant · relevés saisis</h4>'+
    '<div class="econ-stats"><div><span>Volume connu</span><strong>'+(fuel.measured?fuel.litres.toLocaleString('fr-FR',{maximumFractionDigits:3})+' L':'—')+'</strong></div>'+
    '<div><span>Prix moyen payé / L</span><strong>'+perLitreText(fuel.weightedPriceEuroPerL)+'</strong></div>'+
    '<div><span>Ravitaillements déclarés</span><strong>'+fuel.count+'</strong></div>'+
    '<div><span>Conso. entre pleins</span><strong>'+(real?real.consumptionL100.toLocaleString('fr-FR',{maximumFractionDigits:2})+' L/100 km':'—')+'</strong></div></div>'+
    (real ? '<p class="sub">Entre '+garageDate(real.startDate)+' et '+garageDate(real.endDate)+' : '+garageKm(real.distanceKm)+
      ' · coût carburant déclaré ≈ '+real.costEuroPer100.toLocaleString('fr-FR',{maximumFractionDigits:2})+' €/100 km. '+esc(real.caveat)+'</p>' :
      '<p class="sub">Consommation réelle non calculable : nécessite deux pleins complets datés et leurs kilométrages, plus tous les apports intermédiaires.</p>')+
    (fuel.missingVolume ? '<p class="econ-warning">'+fuel.missingVolume+' dépense(s) carburant sans volume : prix moyen basé uniquement sur les tickets avec litres.</p>' : '')+
    '</div>';
  const months=byMonth.length ? '<div class="econ-months"><h5>Dépenses mensuelles saisies</h5><ul>'+
    byMonth.map(k=>'<li><span>'+esc(k)+'</span><b>'+euro(p.byMonth[k])+'</b></li>').join('')+'</ul></div>' :
    '<p class="sub">Aucune dépense mensuelle enregistrée.</p>';
  const catOptions=ECON_CATEGORIES.map(([value,label])=>'<option value="'+value+'">'+esc(label)+'</option>').join('');
  const entries=econ.entries && Array.isArray(econ.entries) ? econ.entries : [];
  const comparison=result.available ? 'Amortissement du prix d’achat, sans carburant ni entretien.' :
    'Prix d’achat non renseigné : aucun amortissement calculé.';
  const warning=p.entries.invalid ? '<p class="econ-warning">'+p.entries.invalid+' ligne(s) historiques non valides conservées mais exclues des calculs.</p>' : '';
  const status=ECON_MESSAGES[car.id] || '';
  return '<details class="garage-economics" data-garage-economics="'+esc(car.id)+'"><summary>💶 Coût & rentabilité <small>Budget privé · suivi par véhicule</small></summary>'+
    '<div class="econ-content">'+cards+
    '<p class="sub">'+comparison+' '+(result.shortObservation ? 'Historique encore trop court pour une conclusion fiable.' : '')+
    ' Les coûts ne sont jamais considérés comme exhaustifs.</p>'+
    '<form data-econ-settings-car="'+esc(car.id)+'" class="econ-form">'+
    '<h4>Références du véhicule</h4><div class="econ-fields">'+
    economyField('Prix d’acquisition payé (€)','price',moneyInput(econ.purchasePriceCents),'text','inputmode="decimal" placeholder="ex. 4000"')+
    economyField('Date d’acquisition','date',econ.purchaseDate || '','date')+
    economyField('Compteur à l’achat (km)','odo',econ.purchaseOdometerKm,'number','min="0" step="1"')+
    economyField('Distance prévue par an (km)','annual',econ.annualDistanceKm,'number','min="0" step="1"')+
    economyField('Revente estimée (€) · facultatif','resale',moneyInput(econ.estimatedResaleCents),'text','inputmode="decimal"')+
    '</div><button type="submit" class="btn pri" data-act="econ-settings-save">Enregistrer les références</button></form>'+
    '<form data-econ-expense-car="'+esc(car.id)+'" class="econ-form">'+
    '<h4>Ajouter une dépense</h4><div class="econ-fields">'+
    economyField('Date','date',nowIn('Europe/Paris').slice(0,10),'date','required')+
    '<label class="econ-field"><span>Catégorie</span><select name="category">'+catOptions+'</select></label>'+
    economyField('Montant payé (€)','amount','','text','inputmode="decimal" required placeholder="ex. 60"')+
    economyField('Compteur lors du paiement (km) · facultatif','km','','number','min="0" step="1"')+
    economyField('Libellé facultatif (80 caractères)','note','','text','maxlength="80" autocomplete="off"')+
    '</div><button type="submit" class="btn pri" data-act="econ-expense-save">Ajouter au journal</button></form>'+
    months+warning+
    '<div class="econ-history"><h5>Historique récent ('+entries.length+' ligne(s))</h5>'+
    (costs.length?'<ul>'+short+'</ul>':'<p class="sub">Aucun paiement saisi. Les champs vides ne valent pas zéro.</p>')+
    '</div><p class="sub">Les loyers LOA sont des paiements, pas un prix d’achat. Ne saisis pas deux fois un même coût. '+ 
    'Les données sont enregistrées dans le coffre existant ; vérifier la synchronisation PC ↔ iPhone.</p>'+
    '<p class="econ-status" role="status" aria-live="polite">'+esc(status)+'</p></div></details>';
}
function garageEconomicsCompareHtml(cars) {
  if(!Array.isArray(cars) || !cars.length)return '';
  return '<section class="econ-comparison" aria-label="Comparatif financier des véhicules">'+
    '<h3>💶 Comparatif de possession</h3>'+
    '<p class="sub">Prix d’achat amorti sur 5 ans et dépenses réellement saisies. Comparaison indicative, jamais un classement de rentabilité.</p>'+
    '<div class="econ-compare-grid">'+cars.map(car=>{
      const p=economyProjection(car),r=p.data,scenario=r.available && r.scenarios.find(x=>x.months===60);
      const expenseCents=p.entries.rows.reduce((sum,e)=>sum+e.amountCents,0);
      return '<div class="econ-compare-car"><b>'+esc(car.short||car.name||'Véhicule')+'</b>'+
        '<span>Prix d’achat payé</span><strong>'+euro(r.purchasePriceCents)+'</strong>'+
        '<span>Amorti sur cinq ans</span><strong>'+(scenario?euro(scenario.purchasePerMonthCents)+'/mois':'—')+'</strong>'+
        '<span>Dépenses enregistrées</span><strong>'+(p.entries.rows.length?euro(expenseCents):'À renseigner')+'</strong>'+
        '<button type="button" class="btn sm" data-act="econ-open" data-car="'+esc(car.id)+'">Voir le budget</button></div>';
    }).join('')+'</div><p class="sub">Les dépenses peuvent être incomplètes ; les hypothèses annuelles ne sont pas des paiements.</p></section>';
}
async function economyPersist(car, previous, message) {
  const ix=S.cars.findIndex(c=>c && c.id===car.id);
  if(ix<0 || LOCKED() || DEMO.on || DeviceStorage.isFrozen()) throw new Error('Garage indisponible.');
  markEdit('cars.'+ix+'.economics');
  saveSettings();
  if(lsGet('twrc.settings.v1') !== JSON.stringify(S)) {
    const err=new Error('Écriture non confirmée. Les valeurs restent en mémoire : ne ferme pas la page.');
    err.pending=true; throw err;
  }
  const vs=window.TWRC_VAULT;
  try {
    if(vs) { await vs.flush(); if(vs.error || vs.pendingRecovery) throw new Error('Écriture du coffre en attente'); }
  } catch(cause) {
    const err=new Error('Sauvegarde chiffrée non confirmée. Tes données restent en mémoire : ne ferme pas la page.');
    err.pending=true; throw err;
  }
  ECON_MESSAGES[car.id]=message+' · Enregistré dans le coffre local.';
  renderGarage.last=null; renderGarage();
}
function economyGetCar(id) { return (S.cars || []).find(c=>c && c.id===id); }
document.addEventListener('submit', async event=>{
  const form=event.target;
  if(!form || !form.matches('[data-econ-settings-car],[data-econ-expense-car]')) return;
  event.preventDefault();
  const id=form.dataset.econSettingsCar || form.dataset.econExpenseCar, car=economyGetCar(id);
  if(!car || LOCKED() || DEMO.on) return;
  const econ=car.economics && typeof car.economics==='object' ? car.economics : {},old=JSON.parse(JSON.stringify(car.economics || null));
  const data=new FormData(form);
  try {
    if(form.dataset.econSettingsCar) {
      car.economics={...econ,purchasePriceCents:economyMoney(data.get('price')),purchaseDate:economyDate(data.get('date')),
        purchaseOdometerKm:economyKm(data.get('odo')),annualDistanceKm:economyKm(data.get('annual')),
        estimatedResaleCents:economyMoney(data.get('resale'))};
      await economyPersist(car,old,'Références actualisées');
    } else {
      const amount=economyMoney(data.get('amount')),date=economyDate(data.get('date')),
        category=data.get('category'),km=economyKm(data.get('km')),note=String(data.get('note')||'').trim().slice(0,80);
      if(amount===null || date===null || !ECON_CATEGORIES.some(c=>c[0]===category)) throw new Error('Date, catégorie ou montant manquant.');
      const entries=Array.isArray(econ.entries) ? econ.entries : [];
      if(entries.length>=ECON_MAX_ENTRIES) throw new Error('Journal plein : préserver un export avant de poursuivre.');
      const nonce=new Uint32Array(2);crypto.getRandomValues(nonce);
      car.economics={...econ,entries:entries.concat([{id:Date.now().toString(36)+'-'+Array.from(nonce,n=>n.toString(36)).join(''),
        date,category,amountCents:amount,...(km!==null?{km}:{}),...(note?{note}:{})}])};
      await economyPersist(car,old,'Dépense ajoutée');
    }
  }catch(error){if(!error.pending)car.economics=old;
    ECON_MESSAGES[car.id]=error.message || 'Opération non confirmée';
    const status=form.closest('.garage-economics').querySelector('.econ-status');
    if(status) status.textContent=ECON_MESSAGES[car.id];}
});
document.addEventListener('click', event=>{
  const open=event.target.closest('[data-act="econ-open"]');
  if(!open)return;
  const card=[...document.querySelectorAll('.garage-economics')].find(d=>d.dataset.garageEconomics===open.dataset.car);
  if(card){card.open=true;card.scrollIntoView({behavior:'smooth',block:'center'});card.querySelector('summary').focus({preventScroll:true});}
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-act="econ-delete"]');
  if(!button)return;
  event.preventDefault();
  const car=economyGetCar(button.dataset.car);
  if(!car || LOCKED() || DEMO.on)return;
  const econ=car.economics || {}, old=JSON.parse(JSON.stringify(car.economics || null));
  const entries=Array.isArray(econ.entries)?econ.entries:[],found=entries.find(e=>e.id===button.dataset.expenseId);
  if(!found || !confirm('Retirer cette dépense du suivi ? Cette suppression peut entrer en conflit avec un autre appareil.'))return;
  try {
    car.economics={...econ,entries:entries.filter(e=>e.id!==button.dataset.expenseId)};
    await economyPersist(car,old,'Dépense retirée');
  }catch(error){if(!error.pending)car.economics=old;
    ECON_MESSAGES[car.id]=error.message||'Suppression non confirmée';
    const status=button.closest('.garage-economics').querySelector('.econ-status');
    if(status)status.textContent=ECON_MESSAGES[car.id];}
});
