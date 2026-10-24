'use strict';
// Vrais coffres, clés IDB, file IDB et transport HTTP ; Google est intégralement
// simulé. Chromium/WebKit ne valent pas une recette Safari sur iPhone physique.
const path = require('node:path');
const fs = require('node:fs'), assert = require('node:assert/strict'), BR = require('./lib/browser');
const { load, business, code } = require('./lib/control-vault-owner');
const U = 'https://race.example.com/';
const source = ['journal-archive', 'debrief', 'device-storage', 'remember-device', 'session-vault', 'sync-merge', 'sync-revisions', 'sync-outbox', 'sync-key', 'control-vault-packet', 'drive-store', 'drive-transport', 'drive-sync']
  .map(n => fs.readFileSync(path.resolve(__dirname, '../src/' + n + '.js'), 'utf8')).join('\n') + `
window.fixture = { async boot(initial) {
  window.vault = SessionVault.create({raw:localStorage,session:sessionStorage,crypto,target:window,remembered:RememberDevice});
  await vault.boot(); if(initial) await vault.unlock(initial.code, initial.values, true);
  window.provider=new DriveTransport.OpaqueDrive([location.origin]); provider.connect('fixture-token',3600,['https://www.googleapis.com/auth/drive.file']);
  window.db=DriveStore.create('twrc.drive.sync.v1');
  window.sync=DriveSync.create({vault,provider,version:()=> 'prod-999'});
  sync.select({folder:'fixture-folder',binding:'a'.repeat(64)});
}, count: async()=>JournalArchive.capture((await vault.syncSnapshot()).values).records.length,
recovery: async()=> {const b=await db.latestRecovery();return b&&SessionVault.readRecovery(new TextDecoder().decode(b),'${code}',crypto);}};`;
function values(count, label) {
  const owner = load(), b = business(owner, count), v = b.values;
  const archive = owner.J.capture(v); archive.records = archive.records.map(r => owner.J.encode({ ...JSON.parse(r), key: label + '-' + JSON.parse(r).key }));
  const ctx = JSON.parse(v[owner.J.CONTEXT]); ctx.debrief.entries = ctx.debrief.entries.map(e => ({ ...e, key: label + '-' + e.key })); ctx.debrief.archive = archive;
  return { 'twrc.settings.v1': JSON.stringify({ ...b.data.settings, edits: {}, calib: [], journal: {} }), [owner.J.KEY]: JSON.stringify(archive), [owner.J.CONTEXT]: JSON.stringify(ctx) };
}
function remote() {
  const files = new Map(), pending = new Map(); let seq = 0, drop = false, hold = null;
  async function routes(context) {
    await context.route(U + '**', r => r.fulfill({contentType:r.request().url().endsWith('owner.js')?'text/javascript':'text/html',
      body:r.request().url().endsWith('owner.js')?source:'<!doctype html><html lang="fr"><meta charset="utf-8"><title>RC fictif</title><script src="/owner.js"></script><body>Fiction</body></html>'}));
    await context.route('https://www.googleapis.com/**', async r => {
      const req=r.request(), u=new URL(req.url()), key=u.pathname.split('/').pop();
      const headers={'Access-Control-Allow-Origin':new URL(U).origin,'Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Access-Control-Allow-Headers':'authorization,content-type,content-range,x-upload-content-type,x-upload-content-length','Access-Control-Expose-Headers':'Location,Range,Content-Length'};
      const json=(v,status=200)=>r.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(v)});
      if(req.method()==='OPTIONS') return r.fulfill({status:204,headers});
      assert.equal(req.headers().authorization,'Bearer fixture-token'); assert(!u.searchParams.has('access_token'));
      if(key==='generateIds') return json({ids:['file-'+ ++seq]});
      if(req.method()==='POST') {
        if(u.searchParams.get('uploadType')==='multipart') {
          const chunks=req.postData().split('\r\n\r\n'), meta=JSON.parse(chunks[1].split('\r\n--')[0]), bytes=Buffer.from(chunks[2].split('\r\n--')[0]);
          if(files.has(meta.id)) return json({},409); files.set(meta.id,{meta:{...meta,size:String(bytes.length)},bytes}); return json({id:meta.id});
        }
        const meta=req.postDataJSON(); pending.set(meta.id,meta);
        return r.fulfill({status:200,headers:{...headers,Location:'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id='+meta.id}});
      }
      if(req.method()==='PUT') {
        if(hold){const gate=hold;hold=null;gate.started();await gate.promise;}
        const id=u.searchParams.get('upload_id'), meta=pending.get(id), bytes=req.postDataBuffer();
        // Les fixtures restent sous 1 MiB ; les gros morceaux sont couverts par B2.
        assert.equal(req.headers()['content-range'],`bytes 0-${bytes.length-1}/${bytes.length}`);
        files.set(id,{meta:{...meta,size:String(bytes.length)},bytes}); pending.delete(id);
        if(drop) {drop=false;return r.abort('failed');} return json({id});
      }
      if(key==='fixture-folder') return json({id:key,mimeType:'application/vnd.google-apps.folder',trashed:false,ownedByMe:true,appProperties:{cv_contract:'rc-folder-v1'},capabilities:{canAddChildren:true}});
      if(u.pathname==='/drive/v3/files') {
        const contract=(u.searchParams.get('q')||'').includes("value='rc-key-a1'")?'rc-key-a1':'rc-v1';
        return json({incompleteSearch:false,files:[...files.values()].map(f=>f.meta).filter(m=>m.appProperties.cv_contract===contract)});
      }
      const f=files.get(key); if(!f) return json({},404);
      return u.searchParams.get('alt')==='media'?r.fulfill({headers,contentType:'application/json',body:f.bytes}):json(f.meta);
    });
  }
  return {routes,files,loseReply:()=>{drop=true;},holdUpload:()=>{let started,release;const reached=new Promise(r=>{started=r;});const promise=new Promise(r=>{release=r;});hold={started,promise};return {reached,release};}};
}
(async()=>{
  const browser=await BR.launch(), drive=remote();
  try {
    const pc=await browser.newContext(), phone=await browser.newContext({viewport:{width:414,height:896},isMobile:true,hasTouch:true});
    await drive.routes(pc);await drive.routes(phone);
    const open=async(context,initial)=>{const p=await context.newPage();await p.goto(U);await p.evaluate(initial=>fixture.boot(initial),initial);return p;};
    let p=await open(pc,{code,values:values(120,'pc')}), q=await open(phone,{code,values:values(61,'phone')});
    const originalPhone = await q.evaluate(async()=>(await vault.syncSnapshot()).values);
    await p.evaluate(()=>sync.run(true)); assert.equal(await p.evaluate(()=>sync.status.message),'synchronisé');
    await q.evaluate(()=>sync.run(true)); assert.equal(await q.evaluate(()=>sync.status.message),'synchronisé');
    for(let i=0;i<3;i++){await p.evaluate(()=>sync.run(true));await q.evaluate(()=>sync.run(true));}
    assert.equal(await p.evaluate(()=>fixture.count()),185);assert.equal(await q.evaluate(()=>fixture.count()),185);
    const size=drive.files.size;await p.evaluate(()=>sync.run(true));await q.evaluate(()=>sync.run(true));assert.equal(drive.files.size,size);
    const proof=await q.evaluate(async()=>({ recovered:JournalArchive.capture(await fixture.recovery()).records.length, current:await fixture.count(), raw:localStorage.getItem(SessionVault.VAULT).includes('synthetic') }));
    assert.equal(proof.recovered,63);assert.equal(proof.current,185);assert.equal(proof.raw,false);
    assert.deepEqual(await q.evaluate(()=>fixture.recovery()),originalPhone,'complete authenticated pre-merge recovery equals the original local snapshot');
    const independentCopy = await q.evaluate(async()=>Array.from(await db.latestRecovery()));
    console.log('✅ coffres réels + transport + IDB : 120/61 trajets, 91/365 jours, historique brut et double réponse conservés ; copie avant fusion déchiffrée');
    drive.loseReply();
    await p.evaluate(async()=>{const s=JSON.parse(vault.store.getItem('twrc.settings.v1'));s.cars[0].photo='synthetic-photo';vault.store.setItem('twrc.settings.v1',JSON.stringify(s));vault.store.setItem('twrc.editstamps.v1',JSON.stringify({'cars.0.photo':Date.now()}));await vault.flush();await sync.run(true);});
    const job=await p.evaluate(async()=>(await db.read()).outbox.job);assert(job && drive.files.has(job.fileId));
    await p.close();p=await open(pc);await p.evaluate(()=>sync.run(true));
    const receipt=await p.evaluate(async()=>(await db.read()).outbox.verified);assert.equal(receipt.fileId,job.fileId);
    assert.equal([...drive.files.values()].filter(f=>f.meta.appProperties.rcr===job.rev.id).length,1);
    console.log('✅ fermeture après réponse perdue : reprise du coffre mémorisé et de la file IDB, même identifiant, un seul fichier');
    await p.evaluate(()=>vault.lock());assert.equal(await p.evaluate(()=>vault.mode),'locked');
    await p.evaluate(()=>sync.run(true));assert.equal(await p.evaluate(()=>sync.status.message),'code requis');
    console.log('✅ verrouillage : clé révoquée, aucun envoi ni reprise automatique du coffre verrouillé');
    await pc.close();await phone.close();
    // Les seuls octets de récupération survivent hors des deux installations.
    const recoveryContext=await browser.newContext();await drive.routes(recoveryContext);
    const restoredPage=await open(recoveryContext);
    const restored=await restoredPage.evaluate(async ({bytes,code})=>{
      if(localStorage.getItem(SessionVault.VAULT))throw Error('installation must be empty');
      const values=await SessionVault.readRecovery(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes)),code,crypto);
      await vault.unlock(code,values,true);return (await vault.syncSnapshot()).values;
    },{bytes:independentCopy,code});
    assert.deepEqual(restored,originalPhone,'full values restored in an independent empty installation, no count-only comparison');
    await recoveryContext.close();console.log('✅ copie indépendante après fermeture : authentification RC, restauration dans un coffre neuf et comparaison structurelle exhaustive');
    for(const kind of ['first','automatic']) {
      const context=await browser.newContext(), isolated=remote();await isolated.routes(context);
      const page=await open(context,{code,values:values(120,'pending-'+kind)});
      try {
        if(kind==='automatic')await page.evaluate(()=>sync.run(true));
        await page.evaluate(async()=>{const s=JSON.parse(vault.store.getItem('twrc.settings.v1'));s.cars[0].photo='fixture-A';vault.store.setItem('twrc.settings.v1',JSON.stringify(s));await vault.flush();});
        const gate=isolated.holdUpload(), sending=page.evaluate(()=>sync.run(true));
        let deadline;try{await Promise.race([gate.reached,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('Mock upload not reached')),15000);})]);}finally{clearTimeout(deadline);}
        await page.evaluate(async()=>{const s=JSON.parse(vault.store.getItem('twrc.settings.v1'));s.cars[0].photo='fixture-B';vault.store.setItem('twrc.settings.v1',JSON.stringify(s));await vault.flush();});
        gate.release();await sending;
        const pending=await page.evaluate(async()=>({state:(await db.read()).outbox,local:JSON.parse(vault.store.getItem('twrc.settings.v1')).cars[0].photo,status:sync.status.message}));
        assert.equal(pending.local,'fixture-B');assert.notEqual(pending.state.dirtySince,null);assert.notEqual(pending.status,'synchronisé');
        await page.evaluate(()=>sync.run(true));
        const latest=[...isolated.files.values()].filter(f=>f.meta.appProperties.cv_contract==='rc-v1').at(-1);
        const check=await page.evaluate(async({bytes,code})=>{const codec=ControlVaultPacket.create({validateBusiness:DriveSync.validateBusiness});const data=await codec.open(new Uint8Array(bytes),code,'prod-999');return {saved:data.values,expected:DriveSync.projection((await vault.syncSnapshot()).values),status:sync.status.message};},{bytes:[...latest.bytes],code});
        assert.deepEqual(check.saved,check.expected);assert.equal(check.status,'synchronisé');
        const invalidated=await page.evaluate(()=>{const s=JSON.parse(vault.store.getItem('twrc.settings.v1'));s.cars[0].photo='fixture-C';vault.store.setItem('twrc.settings.v1',JSON.stringify(s));return sync.status;});
        assert.equal(invalidated.message,'en attente','a foreground edit invalidates the previous success immediately, before the timer');
        assert.notEqual(invalidated.state,'SYNCED');
        await page.evaluate(async()=>{await vault.flush();await sync.run(true);});
        assert.equal(await page.evaluate(()=>sync.status.message),'synchronisé');
        console.log('✅ '+kind+': real vault/IDB/AES-GCM, edit during upload durably pending, full remote payload verified after its own transmission');
      }finally{await context.close();}
    }

    const idbContext=await browser.newContext();await drive.routes(idbContext);
    try {
      const page=await idbContext.newPage();await page.goto(U);
      const result=await page.evaluate(fs.readFileSync(path.resolve(__dirname,'fixtures/native-drive-store.js'),'utf8'));
      assert.equal(result.aborted,true);assert.equal(result.closedRejected,true);
      for(const key of ['afterAbort','afterReopen','afterVersionChange'])assert.deepEqual(result[key],result.expected,key);
      assert.match(result.recoveryHash,/^[0-9a-f]{64}$/);assert.deepEqual(result.recovery,[9,8,7,0,255]);
      console.log('✅ IndexedDB natif : transaction réellement annulée, connexion close réouverte, événement versionchange, octets et récupération WebCrypto intacts');
    } finally {await idbContext.close();}

  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
