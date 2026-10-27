'use strict';
// Read-only published TEST origins, disposable browser contexts, no OAuth or user data.
const { chromium, webkit } = require('playwright');
const crypto = require('node:crypto');
const fs = require('node:fs');
const APPS = [
  {name:'RC',origin:'https://rc-drive-test-ipoower.pages.dev',source:'4353cd218cf036edc2d3b8c44806f85d08358e8c',anchor:'79e05ad61b40826f4837606fff6ffff17282a89b3a0e7f26f62fc9ba888c3ef6',cache:'twrc-static-v12'},
  {name:'CV',origin:'https://cv-drive-test-ipoower.pages.dev',source:'f0b93ab1588f322b1ccb6a7ad074ad1c755cb73c',anchor:'2d0fe9ec3d096f5b37deb8ae9713127bb5c211e3cc4875c21676fb3fb9b04716',cache:'cv-shell-v4'}
];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function verifyOrigin(app) {
  const r=await fetch(app.origin+'/fixture-manifest.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new Error('manifest HTTP '+r.status);
  const bytes=Buffer.from(await r.arrayBuffer()); const manifest=JSON.parse(bytes);
  if(sha(bytes)!==app.anchor||manifest.sourceSha!==app.source) throw new Error('candidate provenance mismatch');
  const index=await fetch(app.origin+'/index.html',{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});
  return {status:index.status,location:index.headers.get('location'),manifestSha256:sha(bytes),sourceSha:manifest.sourceSha};
}
async function cacheSnapshot(page,cacheName) {
  return page.evaluate(async name=>{
    const c=await caches.open(name);
    const out={};
    for(const p of ['/','/index.html']) {
      const r=await c.match(new URL(p,location.origin).href);
      out[p]=r?{url:r.url,redirected:r.redirected,status:r.status,type:r.type,contentType:r.headers.get('content-type')}:null;
    }
    return {controller:navigator.serviceWorker.controller?.scriptURL||null,entries:out};
  },cacheName);
}
async function oneCase(browser,app,engine,warm) {
  const result={app:app.name,engine,mode:warm?'online-reload-then-offline':'first-start-then-offline',networkMode:'playwright-context-setOffline (simulated)',online:false,offline:false};
  const context=await browser.newContext({viewport:{width:414,height:896},hasTouch:true,serviceWorkers:'allow'});
  try {
    const page=await context.newPage();
    const response=await page.goto(app.origin+'/',{waitUntil:'domcontentloaded',timeout:30000});
    if(!response||response.status()!==200) throw new Error('initial navigation HTTP '+response?.status());
    await page.locator('#drive-test-notice').waitFor({state:'visible',timeout:15000});
    if(app.name==='CV') await page.locator('#hero-title').waitFor({state:'visible',timeout:15000});
    await page.evaluate(async()=>{
      await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('SW ready timeout')),20000))]);
      if(!navigator.serviceWorker.controller) await Promise.race([new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true})),new Promise((_,reject)=>setTimeout(()=>reject(new Error('SW control timeout')),12000))]);
      localStorage.setItem('fortress.synthetic.offline','fixture-only');
    });
    result.firstCache=await cacheSnapshot(page,app.cache);
    if(warm) {
      await page.reload({waitUntil:'domcontentloaded',timeout:30000});
      await page.locator('#drive-test-notice').waitFor({state:'visible',timeout:15000});
      result.afterOnlineReloadCache=await cacheSnapshot(page,app.cache);
    }
    result.online=true;
    await context.setOffline(true);
    result.networkProbe=await page.evaluate(()=>fetch('/fixture-manifest.json?offline-probe',{cache:'no-store'}).then(r=>'http-'+r.status).catch(()=>'failed'));
    if(result.networkProbe!=='failed') throw new Error('network probe unexpectedly reachable: '+result.networkProbe);
    try {
      const off=await page.reload({waitUntil:'domcontentloaded',timeout:15000});
      result.offlineStatus=off?.status()||null;
      result.noticeVisible=await page.locator('#drive-test-notice').isVisible();
      result.heroVisible=app.name==='CV'?await page.locator('#hero-title').isVisible():null;
      result.sentinel=await page.evaluate(()=>localStorage.getItem('fortress.synthetic.offline')).catch(()=>null);
      result.offline=result.noticeVisible && (app.name!=='CV'||result.heroVisible) && result.sentinel==='fixture-only';
      if(!result.offline) result.error='offline document or synthetic storage invariant missing';
    } catch(e) { result.error=String(e.message).slice(0,1500); }
  } catch(e) { result.error=String(e.message).slice(0,1500); }
  finally { await context.close(); }
  return result;
}
async function main() {
  const report={createdAt:new Date().toISOString(),playwright:require('playwright/package.json').version,scope:'published TEST; fresh disposable browser contexts; emulated offline; no physical iPhone or Google Drive',origins:[],cases:[],errors:[]};
  for(const app of APPS) try { report.origins.push({app:app.name,...await verifyOrigin(app)}); } catch(e) { report.errors.push({app:app.name,reason:e.message}); }
  if(!report.errors.length) for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]]) {
    let browser;
    try {
      browser=await launcher.launch({headless:true});
      for(const app of APPS) for(const warm of [false,true]) report.cases.push(await oneCase(browser,app,engine,warm));
    } catch(e) { report.errors.push({engine,reason:e.message}); }
    finally { if(browser) await browser.close(); }
  }
  report.allOfflinePassed=!report.errors.length&&report.cases.length===8&&report.cases.every(c=>c.online&&c.offline);
  fs.writeFileSync('fortress-cloudflare-offline-diagnostic.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(!report.allOfflinePassed) process.exitCode=1;
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
