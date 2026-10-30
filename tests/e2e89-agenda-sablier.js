// « ⏳ Lecture de l'agenda… » ne doit jamais rester affiché : chaque incident se termine par un état final en moins de 20 s.
// Constat du 30/10/2026 : sablier infini sur iPhone, état final en ≈ 5 s sur PC. Agenda, clés et lieux 100 % fictifs.
'use strict';
const { BR, session } = require('./lib/context-session');
const AT = '2026-10-30T12:20:00+02:00', HOURGLASS = /Lecture de l.agenda/i;
let fail = 0;
const rows = [];
const brief = p => p.evaluate(() => (document.querySelector('#secBrf') || {}).innerText || '');
// Chaque scénario repart d'une première lecture d'agenda non terminée, comme à l'ouverture de l'app.
async function scenario(browser, name, { prepare = async () => {}, act = s => s.p.evaluate(() => { refreshAll(); }), noCache = false } = {}) {
  const s = await session(browser, { at: AT, dev: 'iphone' });
  try {
    await prepare(s);
    await s.p.evaluate(drop => { if (drop) localStorage.removeItem(CAL_CACHE_KEY); CAL = null; CALDONE = false; busy = false; renderAll(); }, noCache);
    const start = await brief(s.p);
    await act(s);
    await s.settle(40);   // 20 s d'horloge simulée
    const end = await brief(s.p), diag = await s.p.evaluate(() => ({ CALDONE, agenda: !!CAL, busy }));
    const ok = HOURGLASS.test(start) && !HOURGLASS.test(end);
    if (!ok) fail++;
    rows.push((ok ? '✅ ' : '❌ ') + name + (ok ? '' : ' · sablier encore affiché après 20 s · ' + JSON.stringify(diag)));
  } finally { await s.c.close(); }
}
(async () => {
  const b = await BR.launch();
  try {
    await scenario(b, 'agenda reçu : état final');
    await scenario(b, 'agenda sans réponse, sans copie locale', { noCache: true, prepare: s => s.c.route('**/calendar.sealed.json*', () => {}) });
    await scenario(b, 'agenda sans réponse, copie locale conservée', { prepare: s => s.c.route('**/calendar.sealed.json*', () => {}) });
    await scenario(b, 'erreur réseau agenda', { noCache: true, prepare: s => s.c.route('**/calendar.sealed.json*', r => r.abort()) });
    await scenario(b, 'réponse agenda invalide', { noCache: true, prepare: s => s.c.route('**/calendar.sealed.json*', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html>portail</html>' })) });
    await scenario(b, 'observations du relais sans réponse', { prepare: s => s.c.route('**/obs.json*', () => {}) });
    await scenario(b, 'une erreur d’affichage pendant l’actualisation météo', {
      prepare: s => s.p.evaluate(() => {
        const original = renderAll; let thrown = false;
        window.renderAll = function () { original.apply(this, arguments); if (window.__fail && !thrown && /refreshAll/.test(new Error().stack)) { thrown = true; throw new Error('affichage test'); } };
      }),
      act: s => s.p.evaluate(() => { window.__fail = 1; refreshAll().catch(() => {}); }) });
    await scenario(b, 'actualisation météo restée en cours', { act: s => s.p.evaluate(() => { busy = true; refreshAll(); }) });
  } finally { await b.close(); }
  console.log(rows.join('\n'));
  console.log(fail ? fail + ' scénario(s) avec sablier infini [' + BR.NAME + ']' : rows.length + '/' + rows.length + ' scénarios sans sablier infini [' + BR.NAME + ']');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
