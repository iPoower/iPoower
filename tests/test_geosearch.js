'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'../src/geosearch.js'),'utf8');
const ctx={console,Number,String,Array,Object,RegExp,encodeURIComponent,setTimeout,Date};vm.createContext(ctx);vm.runInContext(src+';this.G=GeoSearch;',ctx);
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
await check('adresse française sans code postal (rue, accents, apostrophe) : IGN/BAN d’abord ; pays étranger nommé : OpenStreetMap',async()=>{
 for(const q of ["1 Rue de l'Église, Saint-Étienne",'29 Rue Jean Jaurès, Saint-Ouen','12 avenue Foch Amiens','Chemin des Vignes, Montélimar','place du Marché Dieppe'])assert.equal(G.frenchHint(q),true,q);
 for(const q of ['221B Baker Street, London','Rue de la Loi 16, Bruxelles','Avenue de la Gare, Lausanne, Suisse','Amiens','Tour Eiffel'])assert.equal(G.frenchHint(q),false,q);
 const calls=[];const fetch=async u=>{calls.push(u);return {features:[{properties:{label:"1 Rue de l'Église 42000 Saint-Étienne",context:'42, Loire'},geometry:{coordinates:[4.38,45.43]}}]};};
 const r=await G.search("1 Rue de l'Église, Saint-Étienne",fetch);
 assert.equal(calls.length,1);assert.match(calls[0],/data\.geopf\.fr/);assert.equal(r[0].name,"1 Rue de l'Église 42000 Saint-Étienne");
});
await check('parseurs ignorent les coordonnées invalides et limitent à six résultats',async()=>{
 const j={features:Array.from({length:8},(_,i)=>({properties:{label:'L'+i},geometry:{coordinates:[2+i/10,49+i/10]}})).concat([{properties:{label:'bad'},geometry:{coordinates:['x','y']}}])};
 assert.equal(G.ban(j).length,6);
});
await check('audit A05 · département séparé : code et nom, quelle que soit la source ; jamais la région ni le contexte entier',async()=>{
 const b=G.ban({features:[{properties:{label:'1 Place fictive 74000 Annecy',context:'74, Haute-Savoie, Auvergne-Rhône-Alpes',city:'Annecy',citycode:'74010',postcode:'74000',type:'housenumber'},geometry:{coordinates:[6.13,45.9]}}]})[0];
 assert.deepEqual([b.dept,b.deptCode,b.city,b.cityCode,b.postcode],['Haute-Savoie','74','Annecy','74010','74000']);
 const c=G.ban({features:[{properties:{label:'Ajaccio',context:'2A, Corse-du-Sud, Corse'},geometry:{coordinates:[8.7,41.9]}}]})[0];assert.deepEqual([c.dept,c.deptCode],['Corse-du-Sud','2A']);
 const o=G.osm([{lat:'45.9',lon:'6.13',name:'Annecy',display_name:'Annecy, Haute-Savoie, Auvergne-Rhône-Alpes, France',address:{town:'Annecy',county:'Haute-Savoie',state:'Auvergne-Rhône-Alpes','ISO3166-2-lvl6':'FR-74',postcode:'74000',country_code:'fr'}}])[0];
 assert.deepEqual([o.dept,o.deptCode,o.city,o.postcode],['Haute-Savoie','74','Annecy','74000']);
 const region=G.osm([{lat:'45.9',lon:'6.13',name:'Lieu',display_name:'Lieu, Auvergne-Rhône-Alpes, France',address:{state:'Auvergne-Rhône-Alpes',country_code:'fr'}}])[0];assert.equal(region.dept,'');
 const uk=G.osm([{lat:'51.5',lon:'-0.1',name:'X',display_name:'X, London',address:{county:'Greater London',country_code:'gb'}}])[0];assert.deepEqual([uk.dept,uk.deptCode,uk.city],['','','']);
 const m=G.openMeteo({results:[{name:'Annecy',admin2:'Haute-Savoie',country_code:'FR',postcodes:['74000'],latitude:45.9,longitude:6.13}]})[0];assert.deepEqual([m.dept,m.city,m.postcode],['Haute-Savoie','Annecy','74000']);
});
await check('audit A08 · Nominatim : doublons dédupliqués, cache partagé et au moins une seconde entre requêtes',async()=>{
 const calls=[], fake=async url=>{ calls.push({url,at:Date.now()}); return [{lat:'51.5',lon:'-0.1',name:'Adresse test',display_name:'Adresse test, London',address:{country_code:'gb'}}]; };
 const a='1 Fictional Lane, London', b='2 Fictional Lane, London';
 const [first,second]=await Promise.all([G.search(a,fake),G.search(a,fake)]);
 assert.equal(calls.length,1,'la même demande simultanée n’émet qu’un appel');
 assert.deepEqual(first,second); await G.search(a,fake);
 assert.equal(calls.length,1,'un nouveau clic retrouve la réponse en mémoire');
 await G.search(b,fake);
 assert.equal(calls.length,2,'deux adresses distinctes déclenchent deux appels');
 assert(calls[1].at-calls[0].at>=1000,'cadence Nominatim supérieure à 1 requête/seconde');
 assert(calls.every(c=>/nominatim\.openstreetmap\.org/.test(c.url)),'pas de recours supplémentaire non nécessaire');
});
console.log(n+'/'+n+' scénarios OK');
})().catch(e=>{console.error(e);process.exit(1);});
