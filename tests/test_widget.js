// simulation de Scriptable pour tester le widget
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');const c0={console,Math,Date,Intl,Map,Set,JSON};vm.createContext(c0);vm.runInContext(src+';this.mk=makeDemoPayload;',c0);
const out=[];class Color{constructor(h){this.h=h}}
const mkStack=()=>({addText(t){out.push(t);return{}},addStack(){return mkStack()},addSpacer(){},centerAlignContent(){},setPadding(){}});
class ListWidget{constructor(){Object.assign(this,mkStack())}presentMedium(){}}
class Request{constructor(u){this.u=u}async loadString(){return fs.readFileSync('site/engine.js','utf8')}async loadJSON(){const q=new URL(this.u).searchParams;return c0.mk('froid',{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0)}}
const Font=new Proxy({},{get:()=>()=>({})});
const ctx={console,Math,Date,Intl,Map,Set,JSON,Color,ListWidget,Request,Font,config:{runsInWidget:true},Script:{setWidget(){out.push('[setWidget]')},complete(){}}};vm.createContext(ctx);
vm.runInContext('(async()=>{'+fs.readFileSync('widget.js','utf8')+'})().then(()=>console.log(out.join(" | "))).catch(e=>console.log("ERR",e))',Object.assign(ctx,{out}));
