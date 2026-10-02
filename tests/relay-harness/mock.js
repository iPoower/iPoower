const fs=require('fs'),vm=require('vm'),path=require('path');
const T0=new Date(process.env.FAKE).getTime(), RD=Date;
global.Date=class extends RD{constructor(...a){super(...(a.length?a:[T0]))} static now(){return T0}};
const ctx={Math,Date:global.Date,Intl,Map,Set,JSON,console};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname+'/engine.js','utf8')+fs.readFileSync(__dirname+'/demo.js','utf8')+';DEMO_SCN.fog={fn:c=>{const v=DEMO_SCN.pluie.fn(c);if(c.d===0&&c.hh>=5&&c.hh<=8){v.vis=200;v.code=45;v.P=0;v.T=-1.5;v.RH=99;v.cloud=5;}return v;}};this.D={makeDemoPayload};',ctx);
global.SENT=[];
const ICS=['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:a1','DTSTART;TZID=Europe/Paris:20261003T083000','DTEND;TZID=Europe/Paris:20261003T100000','SUMMARY:Réunion fournisseur','LOCATION:12 Rue Nationale\\, 59000 Lille','END:VEVENT',
'BEGIN:VEVENT','UID:a2','DTSTART:20260915T130000Z','DTEND:20260915T150000Z','RRULE:FREQ=WEEKLY;BYDAY=TU','SUMMARY:Sport','LOCATION:Paris','END:VEVENT',
'BEGIN:VEVENT','UID:a3','DTSTART;VALUE=DATE:20261005','SUMMARY:Journée Lille','LOCATION:Lille','END:VEVENT',
'BEGIN:VEVENT','UID:a4','DTSTART;TZID=Europe/Paris:20261004T100000','SUMMARY:Annulé','LOCATION:Rouen','STATUS:CANCELLED','END:VEVENT',
'BEGIN:VEVENT','UID:b1','DTSTART;TZID=Europe/Paris:20261003T170000','DTEND;TZID=Europe/Paris:20261003T180000','SUMMARY:Assurance','DESCRIPTION:Prendre les papiers. #direct',"LOCATION:10 rue des Lilas\\, 80000 Amiens",'END:VEVENT',
'BEGIN:VEVENT','UID:b2','DTSTART;TZID=Europe/Paris:20261003T200000','DTEND;TZID=Europe/Paris:20261003T231500','SUMMARY:Concert','LOCATION:Centre-ville\\, 80000 Amiens','END:VEVENT',
'BEGIN:VEVENT','UID:tv','DTSTART;TZID=Europe/Paris:20261003T204500','SUMMARY:📺 France – Italie','LOCATION:Paris','END:VEVENT',
'BEGIN:VEVENT','UID:a5','DTSTART;TZID=Europe/Paris:20261004T110000','SUMMARY:Appel sans lieu','END:VEVENT','END:VCALENDAR'].join('\r\n');
global.fetch=async(u,o)=>{u=String(u);
 if(u.includes('project-osrm')){const m=/driving\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/.exec(u);const a=[+m[1],+m[2]],b=[+m[3],+m[4]];const co=[...Array(11)].map((_,k)=>[a[0]+(b[0]-a[0])*k/10,a[1]+(b[1]-a[1])*k/10]);const R=x=>x*Math.PI/180,d=6371*2*Math.asin(Math.sqrt(Math.sin(R(b[1]-a[1])/2)**2+Math.cos(R(a[1]))*Math.cos(R(b[1]))*Math.sin(R(b[0]-a[0])/2)**2))*1.25;const du=co.slice(1).map((_,k)=>k<3?d/30*3600/10:d/110*3600/10);return{ok:true,status:200,json:async()=>({routes:[{distance:d*1000,duration:du.reduce((a,b)=>a+b,0),geometry:{coordinates:co},legs:[{annotation:{duration:du}}]}]})};}
 if(u.includes('geocodage/reverse')){const q=new URL(u).searchParams;return{ok:true,status:200,json:async()=>({features:[{properties:{city:'Ville'+(+q.get('lat')).toFixed(1)}}]})};}
 if(u.includes('calendar.google'))return{ok:true,status:200,text:async()=>ICS};
 if(u.includes('geopf.fr')){const q=decodeURIComponent(u.split('q=')[1]);return{ok:true,status:200,json:async()=>({features:/Nationale/.test(q)?[{geometry:{coordinates:[3.0573,50.6365]},properties:{score:0.92,label:'12 Rue Nationale 59000 Lille'}}]:[{geometry:{coordinates:[2.35,48.85]},properties:{score:0.3,label:'x'}}]})};}
 if(u.includes('geocoding-api')){const n=decodeURIComponent(u.split('name=')[1]);const C={Paris:[48.8534,2.3488],Lille:[50.633,3.0586],Amiens:[49.8941,2.2958]};const c=C[n];return{ok:true,status:200,json:async()=>({results:c?[{latitude:c[0],longitude:c[1],name:n,admin1:n==='Paris'?'Île-de-France':'Hauts-de-France',country_code:'FR'}]:[]})};}
 if(u.includes('aviationweather'))return{ok:true,status:200,json:async()=>[]};
 if(u.includes('ntfy')){const b=JSON.parse(o.body);console.log('>>> PUSH',b.title,'|',b.message.replace(/\n/g,' / '));return{ok:true,status:200}}
 const q=new URL(u).searchParams,la=q.get('latitude').split(','),lo=q.get('longitude').split(',');const P=la.map((x,k)=>ctx.D.makeDemoPayload(process.env.SCN,{lat:+x,lon:+lo[k]},'Europe/Paris'));return{ok:true,status:200,json:async()=>P.length>1?P:P[0]}};
