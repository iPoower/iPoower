const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');
const ctx={console,Math,Date,Intl,Map,Set};vm.createContext(ctx);vm.runInContext(src+`
this.api={makeDemoPayload,makeModel,windowAssess,summarize,seqOf,narrate,seasonAnalysis,computeAlerts,LV,ICE_LV,hourVerdict,estRoad,iceRisk};`,ctx);
const A=ctx.api;
const cars=[
 {id:'i20',short:'i20 N',sporty:true,tire:{type:'summer',size:'215/40 R18 89Y XL',tread:null},plan:{on:true,date:''}},
 {id:'308',short:'308',sporty:false,tire:{type:'allseason',size:'225/45 R17 94W',tread:null},plan:{on:false}}];
const loc={id:'ros',lat:49.8167,lon:2.7};
for(const k of ['froid','pluie','neige','doux']){
  const p=A.makeDemoPayload(k,loc); const m=A.makeModel(p,'demo',loc);
  console.log('\n=== '+k+' nowI',m.nowI,m.nowStr,'hours',m.hs.length,'days',m.days.length);
  const seq=A.seqOf(m,m.nowI,12); const sm=A.summarize(seq);
  console.log(' Tmin',sm.Tmin,'TrMin',sm.TrMin,'iceMax',sm.iceMax,A.ICE_LV[sm.iceLevel],'visMin',sm.visMin,'snow',sm.snowSum,'Pmax',sm.Pmax);
  for(const c of cars){ const w=A.windowAssess(c,seq,'card'); const n=A.narrate(c,w,sm,'actuellement');
    console.log(' ',c.short,c.tire.type,'score',w.score,A.LV[w.level].name,'(score lvl',w.scoreLevel,'flag',w.flagLevel,')');
    console.log('   ',n.head,n.body);
    if(k==='froid') console.log('   top parts',JSON.stringify(w.worst.parts.slice(0,5))); }
  const m0=m.hs[m.nowI]; console.log(' now T',m0.T,'Tr',m0.Tr);
  if(k==='froid'){ const i=m.hs.findIndex(x=>x.t.slice(11,16)==='06:00'&&x.t>m.nowStr); const x=m.hs[i]; console.log(' 06:00 T',x.T,'Tr',x.Tr,'ice',JSON.stringify(x.ice));
   const mid=m.hs.findIndex(x=>x.t.slice(11,16)==='15:00'&&x.t>m.nowStr); console.log(' 15:00 T',m.hs[mid].T,'Tr',m.hs[mid].Tr);}
  const s1=A.seasonAnalysis(m,cars[0]); console.log(' season i20:',s1.level,s1.title,'|',s1.text, 'days',s1.days.length);
  const s2=A.seasonAnalysis(m,cars[1]); console.log(' season 308:',s2.level,s2.title);
  const al=A.computeAlerts(m,cars,{rainThr:5},{i20:s1,'308':s2}); console.log(' alerts',Object.values(al).map(a=>a.id+':'+a.sev).join(' '));
}
