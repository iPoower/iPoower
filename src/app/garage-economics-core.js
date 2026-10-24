/* Garage Economics : calcul pur, sans persistance ni effet de bord.
 * Les montants sont en centimes entiers. Inconnu n'est jamais assimilé à zéro.
 * Amortissement du prix d'achat ≠ rentabilité économique.
 */
'use strict';
const GarageEconomics = (() => {
  const HORIZONS = Object.freeze([12,24,36,60,84]);
  const COST_KEYS = Object.freeze(['fuelCents','insuranceCents','maintenanceCents','repairsCents','tyresCents','tollsCents','leaseCents','otherCents']);
  const validMoney = n => Number.isSafeInteger(n) && n >= 0 ? n : null;
  const validKm = n => Number.isSafeInteger(n) && n >= 0 ? n : null;
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const ms = Date.parse(value+'T00:00:00.000Z');
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0,10) === value ? value : null;
  }
  const round = n => Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER ? Math.round(n) : null;
  function project(input={}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Fiche invalide');
    const purchasePriceCents = validMoney(input.purchasePriceCents);
    if (purchasePriceCents === null) return {available:false,reason:'PURCHASE_PRICE_MISSING',scenarios:[]};
    const purchaseDate=validDate(input.purchaseDate), asOfDate=validDate(input.asOfDate);
    const elapsedDays=purchaseDate && asOfDate && asOfDate>=purchaseDate
      ? (Date.parse(asOfDate+'T00:00:00.000Z')-Date.parse(purchaseDate+'T00:00:00.000Z'))/86400000 : null;
    const purchaseOdometerKm=validKm(input.purchaseOdometerKm), currentOdometerKm=validKm(input.currentOdometerKm);
    const distanceSincePurchaseKm=purchaseOdometerKm!==null && currentOdometerKm!==null && currentOdometerKm>=purchaseOdometerKm
      ? currentOdometerKm-purchaseOdometerKm : null;
    const annualDistanceKm=validKm(input.annualDistanceKm);
    const estimatedResaleCents=validMoney(input.estimatedResaleCents);
    const entries=input.expenses && typeof input.expenses==='object' && !Array.isArray(input.expenses) ? input.expenses : {};
    const recordedExpenses={}, missingExpenses=[];
    let recordedExpensesCents=0;
    for(const key of COST_KEYS) {
      const x=validMoney(entries[key]);
      if(x===null) missingExpenses.push(key);
      else {recordedExpenses[key]=x;recordedExpensesCents+=x;}
    }
    if(!Number.isSafeInteger(recordedExpensesCents) || !Number.isSafeInteger(recordedExpensesCents+purchasePriceCents)) {
      return {available:false,reason:'AMOUNT_OVERFLOW',scenarios:[]};
    }
    const scenarios=HORIZONS.map(months=>{
      const distanceKm=annualDistanceKm!==null && annualDistanceKm>0 ? annualDistanceKm*months/12 : null;
      return {
        months,
        purchasePerMonthCents:round(purchasePriceCents/months),
        purchasePerKmCents:distanceKm ? round(purchasePriceCents/distanceKm) : null,
        estimatedResalePerMonthCents:estimatedResaleCents===null ? null : round((purchasePriceCents-estimatedResaleCents)/months),
        basis:'PURCHASE_ONLY_EXCLUDING_OPERATING_COSTS'
      };
    });
    return {
      available:true,purchasePriceCents,purchaseDate,asOfDate,elapsedDays,
      purchaseOdometerKm,currentOdometerKm,distanceSincePurchaseKm,annualDistanceKm,estimatedResaleCents,
      recordedExpensesCents,recordedExpenses,missingExpenses,
      recordedCashOutlayCents:purchasePriceCents+recordedExpensesCents,
      operatingCostCoverage:missingExpenses.length?'PARTIAL':'DECLARED_CATEGORIES_COMPLETE',
      currentRecordedCostPerKmCents:distanceSincePurchaseKm>0
        ? round((purchasePriceCents+recordedExpensesCents)/distanceSincePurchaseKm) : null,
      shortObservation:elapsedDays===null || elapsedDays<30 || distanceSincePurchaseKm===null || distanceSincePurchaseKm<1000,
      scenarios
    };
  }
  function compare(cars,byId) {
    if(!Array.isArray(cars)) return [];
    const supplied=byId && typeof byId==='object' ? byId : {};
    const used=new Set();
    return cars.filter(car=>car && typeof car==='object').map((car,index)=>{
      const id=typeof car.id==='string' && car.id.trim() ? car.id : 'car-'+index;
      if(used.has(id)) return null;
      used.add(id);
      return {id,name:typeof car.name==='string'?car.name:'Véhicule '+(index+1),
        result:project(Object.prototype.hasOwnProperty.call(supplied,id)?supplied[id]:{})};
    }).filter(Boolean);
  }
  return Object.freeze({project,compare,HORIZONS});
})();
if(typeof module!=='undefined' && module.exports) module.exports=GarageEconomics;
