// Scriptable simulé : moteur embarqué, données fictives, aucun accès réseau réel.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const now = Date.parse('2026-10-10T08:00:00+02:00');
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const demo = { console, Math, Date: Clock, Intl, Map, Set, JSON }; vm.createContext(demo);
vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.mk=makeDemoPayload;', demo);

async function run(code, { failArome = false } = {}) {
  const out = [], requested = []; let widget, completed = false;
  class Color { constructor(h) { this.h = h; } }
  const stack = () => ({ addText(t) { out.push(t); return {}; }, addStack: () => stack(), addSpacer() {}, centerAlignContent() {}, setPadding() {} });
  class ListWidget { constructor() { Object.assign(this, stack()); } async presentMedium() {} }
  class Request {
    constructor(url) { this.url = url; requested.push(url); }
    async loadString() { throw new Error('Code réseau hostile fictif refusé'); }
    async loadJSON() {
      const u = new URL(this.url); assert.equal(u.origin, 'https://api.open-meteo.com');
      const q = u.searchParams;
      if (failArome && q.has('models')) throw new Error('Panne AROME fictive');
      return demo.mk('froid', { lat: +q.get('latitude'), lon: +q.get('longitude') }, 'Europe/Paris', 0);
    }
  }
  const Font = new Proxy({}, { get: () => () => ({}) });
  const ctx = { Math, Date: Clock, Intl, Map, Set, JSON, Color, ListWidget, Request, Font,
    config: { runsInWidget: true }, Script: { setWidget(w) { widget = w; }, complete() { completed = true; } } };
  // L'ancien new Function ne peut pas réussir ici. L'évaluation VM est seulement
  // le harnais d'exécution d'un fichier de confiance, jamais d'une réponse réseau.
  vm.createContext(ctx, { codeGeneration: { strings: false, wasm: false } });
  const cfg = await vm.runInContext('(async()=>{' + code + ';return CFG;})()', ctx, { timeout: 5000 });
  return { out, requested, widget, completed, cfg: JSON.parse(JSON.stringify(cfg)), injected: !!ctx.__widgetInjected };
}
function healthy(result) {
  assert(result.completed && result.widget, 'widget réellement remis à Scriptable');
  assert(result.out.includes('RACE CONTROL')); assert(result.out.some(t => t.startsWith('Test A · été')));
  assert(result.out.some(t => t.startsWith('Départ ') && t.includes('verglas')));
  assert(result.out.some(t => /°C · chaussée/.test(t))); assert(!result.out.includes('Météo indisponible'));
  assert.equal(result.widget.url, 'https://ipoower.github.io/iPoower/race-control/');
  assert.equal(+result.widget.refreshAfterDate, now + 15 * 60 * 1000);
  assert.equal(result.requested.length, 4);
  assert(result.requested.every(u => new URL(u).origin === 'https://api.open-meteo.com'), 'seules les données météo sont demandées');
}
(async () => {
  const code = fs.readFileSync('widget.js', 'utf8'), publicCode = fs.readFileSync('site/widget.js', 'utf8');
  assert(publicCode.includes('const CFG = null;'), 'widget publié sans configuration personnelle');
  assert(!code.includes('new Function') && !code.includes('getText('));
  healthy(await run(code)); console.log('✅ widget iPhone simulé : météo, pneus et rafraîchissement avec moteur embarqué, sans code réseau');
  healthy(await run(code, { failArome: true })); console.log('✅ panne AROME : météo de base et verdict conservés');
  const appSource = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  const helper = appSource.match(/function widgetWithConfig\(script, config\) \{[\s\S]*?\n\}/);
  assert(helper, 'le vrai générateur utilisé par le bouton de copie est testé');
  const configured = vm.runInNewContext(helper[0] + ';widgetWithConfig;', { JSON });
  const base = (await run(code)).cfg;
  for (const label of ["$&", "$'", "$`", '" }; globalThis.__widgetInjected = true; //']) {
    const cfg = JSON.parse(JSON.stringify(base)); cfg.home.name = label; cfg.cars[0].short = label;
    const result = await run(configured(publicCode, cfg));
    assert.deepEqual(result.cfg, cfg); assert(result.out.includes(label + ' · été'));
    assert(result.completed && result.widget); assert.equal(result.injected, false);
  }
  assert.throws(() => configured('modèle sans configuration', base));
  assert.throws(() => configured(publicCode + '\nconst CFG = null;', base));
  const unsafe = vm.runInNewContext(helper[0].replace('() => ', '') + ';widgetWithConfig;', { JSON });
  const hostileLabel = JSON.parse(JSON.stringify(base)); hostileLabel.cars[0].short = "$'";
  // SyntaxError vient du contexte VM : même erreur, prototype distinct du contexte Node.
  await assert.rejects(() => run(unsafe(publicCode, hostileLabel)), error =>
    error.name === 'SyntaxError' && /Invalid or unexpected token/.test(error.message));
  console.log('✅ vraie copie widget : libellés spéciaux conservés, modèles invalides et régression détectés');
  const hostile = code.replace("if (!E) throw new Error", "await new Request(SITE + 'engine.js').loadString(); if (!E) throw new Error");
  assert.notEqual(hostile, code); await assert.rejects(async () => healthy(await run(hostile)));
  console.log('✅ contre-test : réintroduire un téléchargement de code fait échouer la validation');
})().catch(e => { console.error('❌ widget · ' + (e.stack || e)); process.exitCode = 1; });
