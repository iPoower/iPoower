/* Laboratoire Garage Life : navigateur sans profil, sans réseau externe et sans donnée réelle.
 * Exécution volontaire manuelle jusqu'au raccord coordonné à la matrice CI.
 */
'use strict';
const {chromium,webkit}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../garage-life-preview');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const allowed=new Set(['index.html','style.css','model.js','app.js']);
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=pathname==='/'?'index.html':pathname.slice(1);
  if(!allowed.has(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)],'cache-control':'no-store'});
  res.end(fs.readFileSync(path.join(root,file)));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 let checks=0;
 try{
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.BROWSER || process.env.BROWSER===name)){
   const browser=await engine.launch({headless:true});
   try{
    for(const width of [320,375,414,1440]){
     const ctx=await browser.newContext({viewport:{width,height:860},serviceWorkers:'block'});
     const page=await ctx.newPage();
     const external=[];
     page.on('request',request=>{if(!request.url().startsWith(origin))external.push(request.url());});
     await page.goto(origin+'/');
     await page.getByRole('heading',{name:/TWIN GARAGE LIVE/}).waitFor();
     assert.match(await page.locator('#car-info').innerText(),/Véhicule A/);
     assert.match(await page.locator('#history').innerText(),/Vidange/);
     await page.locator('#choose-b').click();
     assert.match(await page.locator('#car-info').innerText(),/Véhicule B/);
     assert.match(await page.locator('#deadlines').innerText(),/2027/);
     const form=page.locator('#operation-form');
     await form.locator('[name=date]').fill('2026-10-18');
     await form.locator('[name=km]').fill('108600');
     await form.locator('[name=category]').selectOption('batterie');
     await form.locator('[name=description]').fill('Batterie fictive renouvelée');
     await form.locator('[name=amount]').fill('84,90');
     await form.locator('button[type=submit]').click();
     assert.match(await page.locator('#history').innerText(),/84,90/);
     await page.locator('#goal').fill('500000');
     await page.getByRole('button',{name:'Définir l’objectif'}).click();
     assert.match(await page.locator('#car-info').innerText(),/500.000|500 000|500 000/);
     const widths=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
     assert.ok(widths.scroll<=widths.client+2,name+' '+width+' px : débordement');
     const stores=await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}));
     assert.deepEqual(stores,{local:0,session:0});
     assert.deepEqual(external,[]);
     await page.reload();
     assert.doesNotMatch(await page.locator('#history').innerText(),/Batterie fictive renouvelée/);
     await ctx.close();checks++;
    }
   }finally{await browser.close();}
  }
  console.log('GARAGE LIFE navigateur : '+checks+' scénarios navigateur ciblés (320/375/414/1440).');
 }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
