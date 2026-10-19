/* Garage Life V1 — modèle de laboratoire, 100 % en mémoire.
 * Aucun accès au coffre, à localStorage, IndexedDB, aux fichiers ou au réseau.
 * Ne pas raccorder à la production sans revue séparée du stockage sensible.
 */
'use strict';
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GarageLifeModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : null, function() {
  const VERSION = 1;
  const CATEGORIES = Object.freeze(['vidange','filtres','freinage','distribution','pneus','batterie','controle-technique','reparation','controle','autre']);
  const SOURCE = Object.freeze({ DONE: 'DECLARED_DONE', DEADLINE: 'USER_ENTERED_DEADLINE', MAKER: 'MAKER_SOURCED', UNKNOWN: 'UNKNOWN' });
  const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const str = (x, max) => typeof x === 'string' ? x.trim().slice(0, max) : '';
  const idOk = s => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,60}$/.test(s);
  function dateOk(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y,m,d] = s.split('-').map(Number);
    if (y < 1900 || y > 2100) return false;
    const max = new Date(Date.UTC(y,m,0)).getUTCDate();
    return m >= 1 && m <= 12 && d >= 1 && d <= max;
  }
  const kmOk = n => Number.isSafeInteger(n) && n >= 0 && n <= 50000000;
  const centsOk = n => n === null || (Number.isSafeInteger(n) && n >= 0 && n <= 999999999);
  function parseEuros(value) {
    if (value == null || String(value).trim() === '') return null;
    const t = String(value).trim();
    if (!/^\d{1,7}(?:[,.]\d{1,2})?$/.test(t)) throw new Error('Montant en euros invalide.');
    const [euros, decimals = ''] = t.replace(',', '.').split('.');
    const cents = Number(euros) * 100 + Number(decimals.padEnd(2, '0'));
    if (!centsOk(cents)) throw new Error('Montant hors limite.');
    return cents;
  }
  function validateVehicle(v) {
    if (!isObj(v) || !idOk(v.id) || !str(v.name,120) || !('goalKm' in v) || (v.goalKm !== null && !kmOk(v.goalKm))) throw new Error('Véhicule invalide.');
    return { id:v.id, name:str(v.name,120), goalKm:v.goalKm };
  }
  function validateOperation(o, vehicleIds) {
    if (!isObj(o) || !idOk(o.id) || !vehicleIds.has(o.vehicleId) ||
        !dateOk(o.date) || !CATEGORIES.includes(o.category) ||
        !str(o.description,500) || ![SOURCE.DONE,SOURCE.DEADLINE].includes(o.provenance) ||
        !(o.odometerKm === null || kmOk(o.odometerKm)) ||
        !centsOk(o.amountCents) || !('amountCents' in o) ||
        !(o.provider === null || typeof o.provider === 'string' && o.provider.length <= 160) ||
        o.evidence !== null) throw new Error('Opération invalide.');
    // Le prototype refuse les préconisations constructeur non sourcées.
    if (o.provenance === SOURCE.DEADLINE && o.amountCents !== null) throw new Error('Une échéance ne constitue pas une dépense.');
    return { id:o.id, vehicleId:o.vehicleId, date:o.date, odometerKm:o.odometerKm,
      category:o.category, description:str(o.description,500),
      amountCents:o.amountCents, provider:o.provider === null ? null : str(o.provider,160),
      provenance:o.provenance, evidence:null };
  }
  function fingerprint(o) { return [o.vehicleId,o.date,o.odometerKm,o.category,o.provenance,o.description.toLowerCase()].join('|'); }
  function validateState(input) {
    if (!isObj(input) || input.schemaVersion !== VERSION || !Array.isArray(input.vehicles) ||
        !Array.isArray(input.operations) || input.vehicles.length > 20 || input.operations.length > 20000)
      throw new Error('Version ou structure inconnue : aucune donnée importée.');
    const vehicles=input.vehicles.map(validateVehicle), ids=new Set(vehicles.map(v=>v.id));
    if (ids.size !== vehicles.length) throw new Error('Identifiant véhicule dupliqué.');
    const operations=input.operations.map(o=>validateOperation(o,ids));
    const opIds=new Set(operations.map(o=>o.id)), seen=new Set();
    if (opIds.size !== operations.length) throw new Error('Identifiant opération dupliqué.');
    for (const o of operations) {
      const key=fingerprint(o);
      if (seen.has(key)) throw new Error('Doublon exact : vérification humaine nécessaire.');
      seen.add(key);
    }
    return {schemaVersion:VERSION, vehicles, operations};
  }
  function empty(vehicles) { return validateState({schemaVersion:VERSION,vehicles,operations:[]}); }
  function add(state, entry) {
    const previous=validateState(state);
    const record=validateOperation(entry,new Set(previous.vehicles.map(v=>v.id)));
    return validateState({...previous,operations:[...previous.operations,record]});
  }
  function setGoal(state,vehicleId,goalKm) {
    const previous=validateState(state);
    if (!previous.vehicles.some(v=>v.id===vehicleId) || goalKm !== null && !kmOk(goalKm)) throw new Error('Objectif kilométrique invalide.');
    return validateState({...previous,vehicles:previous.vehicles.map(v=>v.id===vehicleId?{...v,goalKm}:v)});
  }
  function summary(state,vehicleId) {
    const s=validateState(state), v=s.vehicles.find(x=>x.id===vehicleId);
    if (!v) throw new Error('Véhicule inconnu.');
    const items=s.operations.filter(o=>o.vehicleId===vehicleId).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
    const done=items.filter(o=>o.provenance===SOURCE.DONE), deadlines=items.filter(o=>o.provenance===SOURCE.DEADLINE);
    const withKm=done.filter(o=>o.odometerKm!==null);
    const latest=withKm.length?{km:withKm[0].odometerKm,date:withKm[0].date,source:SOURCE.DONE}:null;
    const known=done.filter(o=>o.amountCents!==null), costs=known.reduce((sum,o)=>sum+o.amountCents,0);
    return {vehicle:v,history:items,latest,spentCents:costs,knownCosts:known.length,
      missingCosts:done.length-known.length,deadlines, missing:{
        odometer:latest===null, records:done.length===0, costs:done.some(o=>o.amountCents===null),
        deadlines:deadlines.length===0
      }};
  }
  function roundTripFixture(state) {
    // Simulation de sérialisation, PAS une sauvegarde ni un export chiffré.
    const s=validateState(state), recovered=validateState(JSON.parse(JSON.stringify(s)));
    if (JSON.stringify(recovered)!==JSON.stringify(s)) throw new Error('Aller-retour altéré.');
    return recovered;
  }
  return Object.freeze({VERSION,CATEGORIES,SOURCE,dateOk,kmOk,parseEuros,validateState,empty,add,setGoal,summary,roundTripFixture});
});
