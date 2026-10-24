// Préparation uniquement : URLs et en-têtes fictifs, vrai code SW dans une VM,
// vrai build de CI sans données personnelles. Aucun réseau ni hébergement.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function origin(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('origin_shape');
  return u;
}
function architecture(personal, guest, legacy) {
  try {
    const p = origin(personal), g = origin(guest), l = new URL(legacy);
    const separate = p.origin !== g.origin && p.origin !== l.origin && g.origin !== l.origin && p.hostname !== g.hostname;
    return { designReady: separate, productionIsolated: false, migration: 'NO_GO' };
  } catch (e) { return { designReady: false, productionIsolated: false, migration: 'NO_GO' }; }
}
function headerTemplate(text) {
  const lines = text.split(/\r?\n/);
  const csp = lines.find(l => /^\s+Content-Security-Policy:/i.test(l)) || '';
  return {
    sizeValid: lines.every(l => Buffer.byteLength(l, 'utf8') <= 2000),
    csp: !!csp && /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'none'/.test(csp) &&
      !/unsafe-eval|script-src[^;]*unsafe-inline/.test(csp),
    referrer: /Referrer-Policy:\s*no-referrer/.test(text),
    permissions: /Permissions-Policy:/.test(text),
    // Un fichier _headers ne démontre jamais son application par un serveur.
    httpVerified: false
  };
}
const lifecycle = fs.readFileSync(path.join(root, 'src/app/lifecycle.js'), 'utf8');
const register = lifecycle.match(/function registerSW\(\) \{[\s\S]*?\n\}/)[0];
function registration(host) {
  let calls = 0;
  const ctx = { location: { protocol: 'https:', hostname: host }, RUNTIME_RECORDER: null,
    navigator: { serviceWorker: { register: () => { calls++; return Promise.resolve({ update() {} }); } } } };
  vm.createContext(ctx); vm.runInContext(register + ';registerSW();', ctx); return calls;
}
const fixture = { personal: 'https://race-prive.example.invalid/', guest: 'https://weather-public.example.invalid/', legacy: 'https://ancien.example.invalid/app/' };
let n = 0; const check = (label, fn) => { fn(); n++; console.log('✅ ' + label); };
async function main() {
  check('deux origines dédiées fictives : architecture recevable, jamais une preuve de migration', () => {
    assert.deepEqual(architecture(fixture.personal, fixture.guest, fixture.legacy), { designReady: true, productionIsolated: false, migration: 'NO_GO' });
  });
  check('deux chemins d’un même hôte : isolation refusée', () => assert.equal(architecture('https://partage.example.invalid/private/', 'https://partage.example.invalid/guest/', fixture.legacy).designReady, false));
  check('hôte de production réutilisé pour le personnel ou l’invité : refus', () => {
    assert.equal(architecture('https://ancien.example.invalid/', fixture.guest, fixture.legacy).designReady, false);
    assert.equal(architecture(fixture.personal, 'https://ancien.example.invalid/', fixture.legacy).designReady, false);
  });
  check('HTTPS normalisé : casse et port implicite ne créent pas deux origines', () => assert.equal(architecture('https://Meme.example.invalid/', 'https://meme.example.invalid:443/', fixture.legacy).designReady, false));
  check('HTTP, identifiants, query et fragment ne sont jamais une origine cible', () => {
    for (const p of ['http://race.example.invalid/', 'https://user:code-fictif@race.example.invalid/', 'https://race.example.invalid/?cfg=fictif', 'https://race.example.invalid/#cfg-fictif'])
      assert.equal(architecture(p, fixture.guest, fixture.legacy).designReady, false);
  });
  check('même hôte sur deux ports : cookies non isolés, préparation refusée', () => assert.equal(architecture('https://partage.example.invalid:443/', 'https://partage.example.invalid:8443/', fixture.legacy).designReady, false));
  check('en-tête trop long : rejet sans troncature', () => assert.equal(headerTemplate('/*\n  Content-Security-Policy: ' + 'x'.repeat(2001)).sizeValid, false));
  check('CSP inline/eval ou absence de frame-ancestors : refus du modèle', () => {
    assert.equal(headerTemplate("/*\n  Content-Security-Policy: script-src 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'").csp, false);
    assert.equal(headerTemplate("/*\n  Content-Security-Policy: default-src 'self'").csp, false);
  });
  check('limite PWA confirmée par le code réel : GitHub accepté, pages.dev et domaine dédié non enregistrés', () => {
    assert.equal(registration('fixture.github.io'), 1); assert.equal(registration('fixture.pages.dev'), 0); assert.equal(registration('race-prive.example.invalid'), 0);
  });
  const { prepare } = require('./ci/workspace'); prepare();
  const headers = fs.readFileSync(path.join(root, '.ci/dist/_headers'), 'utf8'), report = headerTemplate(headers);
  check('vrai build fictif : CSP script par empreintes, frame-ancestors et taille compatibles', () => { assert.equal(report.sizeValid, true); assert.equal(report.csp, true); assert(/script-src[^;]*sha256-/.test(headers)); });
  check('vrai modèle Referrer/Permissions/SW no-cache : présent, HTTP pas encore prouvé', () => {
    assert.equal(report.referrer, true); assert.equal(report.permissions, true); assert(/\/sw\.js\s*\n\s*Cache-Control:\s*no-cache/.test(headers)); assert.equal(report.httpVerified, false);
  });
  check('Backup V2 réel : absence des observations humaines explicitement détectée, pas de faux GO exhaustif', () => {
    const ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(root, 'src/calendar-origin.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/backup.js'), 'utf8') + ';this.backup=Backup;', ctx);
    const source = { reports: [{ kind: 'wet', at: 1 }], shadow: [{ observed: 'dry', at: 2 }] };
    const b = ctx.backup.make({ settings: JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/preset.fake.json'), 'utf8')), context: source, at: '2026-10-13T06:00:00Z' });
    assert(!JSON.stringify(b).includes('reports')); assert(!JSON.stringify(b).includes('shadow')); assert.equal(architecture(fixture.personal, fixture.guest, fixture.legacy).migration, 'NO_GO');
  });
  check('le laboratoire et sa CI sont sans secret, déploiement, domain/DNS ou accès utilisateur', () => {
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/fortress-ii-consolidated.yml'), 'utf8');
    assert(/permissions:\s*\n\s*contents: read/.test(workflow)); assert(!/secrets\.|environment:|workflow_dispatch:|contents: write|pages: write|id-token: write/.test(workflow));
  });
  console.log(n + '/' + n + ' scénarios OK — NO GO migration réelle');
}
if (require.main === module) main().catch(() => { console.error('❌ Préflight d’origine : échec sur fixture, aucun état réel modifié'); process.exitCode = 1; });
module.exports = { architecture, headerTemplate, registration };
