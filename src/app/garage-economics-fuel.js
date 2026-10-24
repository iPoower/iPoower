/* Garage Fuel — calculs purs, relevés explicitement saisis.
 * Aucun accès réseau, aucune photo ou donnée privée dans le code public.
 * Le carburant est en millilitres (entiers) ; les sommes en centimes.
 */
'use strict';
const GarageFuel = (() => {
  const MAX_ML = 200000;
  function parseLitres(value) {
    if(typeof value !== 'string') return null;
    const raw=value.trim().replace(',','.');
    if(!raw) return null;
    if(!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,3})?$/.test(raw)) throw new Error('Volume invalide : litres, trois décimales maximum.');
    const [litres,decimals='']=raw.split('.');
    const ml=Number(litres)*1000+Number((decimals+'000').slice(0,3));
    if(!Number.isSafeInteger(ml)||ml<=0||ml>MAX_ML)throw new Error('Volume de carburant hors limites (0–200 L).');
    return ml;
  }
  const validRow = x => x && x.category==='fuel' && Number.isSafeInteger(x.amountCents) && x.amountCents>=0;
  const validVolume = x => Number.isSafeInteger(x.volumeMl) && x.volumeMl>0 && x.volumeMl<=MAX_ML;
  const validKm = n => Number.isSafeInteger(n) && n>=0;
  const validDate = d => typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d+'T00:00:00Z')) && new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
  function summarize(input) {
    const fuel=(Array.isArray(input)?input:[]).filter(validRow);
    const quantified=fuel.filter(validVolume);
    const totalMl=quantified.reduce((a,x)=>a+x.volumeMl,0);
    const totalCents=fuel.reduce((a,x)=>a+x.amountCents,0);
    const matchedCents=quantified.reduce((a,x)=>a+x.amountCents,0);
    // Le prix au litre se fonde uniquement sur des paiements dont le volume est connu.
    return {count:fuel.length,measured:quantified.length,missingVolume:fuel.length-quantified.length,
      litres:totalMl/1000,costCents:totalCents,weightedPriceEuroPerL:totalMl?matchedCents*10/totalMl:null};
  }
  function fullToFull(input) {
    const fuel=(Array.isArray(input)?input:[]).filter(validRow);
    if(fuel.length<2) return null;
    // Deux pompes le même jour ne sont pas ordonnables avec fiabilité sans horodatage.
    if(fuel.some(e=>!validDate(e.date))) return null;
    const dates=new Set(),ordered=fuel.slice().sort((a,b)=>a.date.localeCompare(b.date));
    if(ordered.some(e=>{const duplicate=dates.has(e.date);dates.add(e.date);return duplicate;})) return null;
    const fullIndices=ordered.flatMap((e,i)=>e.fullTank===true&&validKm(e.km)&&validVolume(e)?[i]:[]);
    if(fullIndices.length<2) return null;
    const last=fullIndices[fullIndices.length-1],first=fullIndices[fullIndices.length-2];
    const start=ordered[first],finish=ordered[last],distanceKm=finish.km-start.km;
    if(distanceKm<=0 || distanceKm>50000) return null;
    const between=ordered.slice(first+1,last+1);
    if(between.some(e=>!validVolume(e)))return null;
    // Vérifie que tous les compteurs disponibles sur l'intervalle sont cohérents.
    let priorKm=start.km;
    for(const e of between) {
      if(validKm(e.km)) {if(e.km<priorKm || e.km>finish.km) return null;priorKm=e.km;}
      else if(e.km!=null) return null;
    }
    const fuelMl=between.reduce((n,e)=>n+e.volumeMl,0);
    const amountCents=between.reduce((n,e)=>n+e.amountCents,0);
    return {startDate:start.date,endDate:finish.date,startKm:start.km,endKm:finish.km,
      distanceKm,litres:fuelMl/1000,consumptionL100:fuelMl/10/distanceKm,
      costEuroPer100:amountCents/distanceKm,fullRefuels:2,otherRefuels:between.length-1,
      caveat:'Estimation conditionnelle : tous les ravitaillements intermédiaires doivent être enregistrés.'};
  }
  function perLiter(amountCents,volumeMl) {
    return Number.isSafeInteger(amountCents)&&amountCents>=0&&Number.isSafeInteger(volumeMl)&&volumeMl>0&&volumeMl<=MAX_ML
      ? amountCents*10/volumeMl : null;
  }
  return Object.freeze({parseLitres,summarize,fullToFull,perLiter});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GarageFuel;
