'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'../src/geosearch.js'),'utf8');
const ctx={console,Number,String,Array,Object,RegExp,encodeURIComponent};vm.createContext(ctx);vm.runInContext(src+';this.G=GeoSearch;',ctx);
const G=ctx.G;let n=0;const check=async(label,fn)=>{await fn();n++;console.log('✅ '+label);};
(async()=>{
await check('adresse française : IGN/BAN prioritaire et aucun second fournisseur si succès',async()=>{
 const calls=[];const fetch=async u=>{calls.push(u);return {features:[{properties:{label:'29 Rue Jean Jaurès 80610 Saint-Ouen',context:'80, Somme, Hauts-de-France'},geometry:{coordinates:[2.11,50.04]}}]};};
 const r=await G.search('29 Rue Jean Jaurès, 80610 Saint-Ouen',fetch);
 assert.equal(calls.length,1);assert.match(calls[0],/data\.geopf\.fr\/geocodage\/search/);assert.equal(r[0].provider,'IGN/BAN');assert.equal(r[0].name,'29 Rue Jean Jaurès 80610 Saint-Ouen');
});
await check('adresse mondiale : OpenStreetMap prioritaire',async()=>{
 const calls=[];const fetch=async u=>{calls.push(u);return [{lat:'51.5237',lon:'-0.1585',name:'221B Baker Street',display_name:'221B Baker Street, London, England, United Kingdom',address:{state:'England'}}];};
 const r=await G.search('221B Baker Street, London',fetch);
 assert.equal(calls.length,1);assert.match(calls[0],/nominatim\.openstreetmap\.org\/search/);assert.equal(r[0].provider,'OpenStreetMap');
});
await check('panne BAN : bascule vers OpenStreetMap',async()=>{
 const calls=[];const fetch=async u=>{calls.push(u);if(/data\.geopf/.test(u))throw new Error('down');return [{lat:'50.04',lon:'2.11',name:'Rue Jean Jaurès',display_name:'29, Rue Jean Jaurès, Saint-Ouen, France',address:{county:'Somme'}}];};
 const r=await G.search('29 Rue Jean Jaurès, 80610 Saint-Ouen',fetch);
 assert.equal(calls.length,2);assert.equal(r[0].provider,'OpenStreetMap');assert.equal(r[0].dept,'Somme');
});
await check('aucun résultat adresse : Open-Meteo reste repli ville',async()=>{
 const calls=[];const fetch=async u=>{calls.push(u);if(/open-meteo/.test(u))return {results:[{name:'Amiens',admin2:'Somme',admin1:'Hauts-de-France',country:'France',country_code:'FR',latitude:49.89,longitude:2.30}]};return /nominatim/.test(u)?[]:{features:[]};};
 const r=await G.search('Amiens centre improbable',fetch);
 assert(calls.length>=2);assert.equal(r[0].provider,'Open-Meteo');
});
await check('parseurs ignorent les coordonnées invalides et limitent à six résultats',async()=>{
 const j={features:Array.from({length:8},(_,i)=>({properties:{label:'L'+i},geometry:{coordinates:[2+i/10,49+i/10]}})).concat([{properties:{label:'bad'},geometry:{coordinates:['x','y']}}])};
 assert.equal(G.ban(j).length,6);
});
console.log(n+'/'+n+' scénarios OK');
})().catch(e=>{console.error(e);process.exit(1);});
