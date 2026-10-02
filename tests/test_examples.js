const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');
const ctx={console,Math,Date,Intl,Map,Set};vm.createContext(ctx);
vm.runInContext(src+`
DEMO_SCN.ex1={name:'ex',fn:c=>({T: c.rel<=0?8: Math.max(4, 8-(c.rel*0.45)), RH:92,P:(c.rel>=0&&c.rel<10)?0.3:0,snow:0,code:(c.rel>=0&&c.rel<10)?61:3,vis:12000,wind:12,gust:25,cloud:90})};
DEMO_SCN.ex2={name:'ex2',fn:c=>({T: 8+5*Math.sin(Math.PI*c.rel/12) ,RH:90,P:0.4,snow:0,code:61,vis:15000,wind:10,gust:22,cloud:90})};
const cars=[{id:'i20',short:'i20 N',sporty:1,tire:{type:'summer',size:'215/40 R18 89Y XL',tread:null}},{id:'308',short:'308',sporty:0,tire:{type:'allseason',size:'225/45 R17 94W',tread:null}}];
['ex1','ex2'].forEach(k=>{const loc={lat:49.8,lon:2.7};const m=makeModel(makeDemoPayload(k,loc),'demo',loc);const seq=seqOf(m,m.nowI,12);const sm=summarize(seq);
 cars.forEach(c=>{const w=windowAssess(c,seq,'card');const n=narrate(c,w,sm,'actuellement');console.log(k,c.short,w.score,LV[w.level].name,'|',n.head,n.body);});});
`,ctx);
