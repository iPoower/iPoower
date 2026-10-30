// « ⏳ Lecture de l'agenda… » ne doit jamais rester affiché : chaque incident se termine par un état final en moins de 20 s.
// Constat du 30/10/2026 : sablier infini sur iPhone (requête météo bloquée 4 min, agenda lu seulement après elle), état final
// en ≈ 5 s sur PC. Agenda, clés et lieux 100 % fictifs.
'use strict';
const fs = require('node:fs');
const { BR, session } = require('./lib/context-session');
const AT = '2026-10-30T12:20:00+02:00', HOURGLASS = /Lecture de l.agenda/i;
let fail = 0;
const rows = [];
const text = (p, sel) => p.evaluate(s => (document.querySelector(s) || {}).innerText || '', sel);
const journal = p => p.evaluate(() => JSON.stringify({ debrief: USER_STORE.state.debrief, archive: lsGet(JournalArchive.KEY) }));
const hold = () => {};   // réponse qui n'arrive jamais
// Chaque scénario repart d'une première lecture d'agenda non terminée, comme à l'ouverture de l'app.
async function scenario(browser, name, { prepare = async () => {}, act = s => s.p.evaluate(() => { refreshAll(); }), noCache = false, expect = () => null, seconds = 20 } = {}) {
  const s = await session(browser, { at: AT, dev: 'iphone' });
  try {
    await prepare(s);
    await s.p.evaluate(drop => { if (drop) localStorage.removeItem(CAL_CACHE_KEY); CAL = null; CALDONE = false; CALFAIL = null; CALREAD = null; busy = false; renderAll(); }, noCache);
    const start = await text(s.p, '#secBrf'), before = await journal(s.p);
    await act(s);
    await s.settle(seconds * 2);
    const brief = await text(s.p, '#secBrf'), agenda = await text(s.p, '#secCal');
    const why = !HOURGLASS.test(start) ? 'sablier absent au départ' : HOURGLASS.test(brief) ? 'sablier encore affiché après ' + seconds + ' s'
      : await journal(s.p) !== before ? 'journal des trajets modifié' : await expect(s, brief, agenda);
    if (why) fail++;
    rows.push((why ? '❌ ' : '✅ ') + name + (why ? ' · ' + why + ' · ' + JSON.stringify(await s.p.evaluate(() => ({ CALDONE, agenda: !!CAL, busy, CALFAIL })))
      + ' · ' + brief.split('\n')[0].slice(0, 90) : ''));
  } finally { await s.c.close(); }
}
const message = re => (s, brief, agenda) => re.test(brief + '\n' + agenda) ? null : 'message attendu absent : ' + re;
const retryButton = async s => await s.p.locator('[data-act=cal-retry]').count() ? null : 'bouton Réessayer absent';
const both = (...checks) => async (...a) => { for (const c of checks) { const r = await c(...a); if (r) return r; } return null; };
(async () => {
  const b = await BR.launch();
  try {
    await scenario(b, 'succès : agenda reçu, aucun message d’échec', {
      expect: async s => await s.p.evaluate(() => !!CAL && !CAL.offline && !CALFAIL) ? null : 'agenda non chargé' });
    await scenario(b, 'délai dépassé sans copie locale : « Agenda indisponible pour l’instant » + Réessayer', { noCache: true,
      prepare: s => s.c.route('**/calendar.sealed.json*', hold),
      expect: both(message(/Agenda indisponible pour l.instant · aucune donnée enregistrée/i), retryButton) });
    await scenario(b, 'délai dépassé avec copie locale : dernières données conservées et datées', {
      prepare: s => s.c.route('**/calendar.sealed.json*', hold),
      expect: both(message(/Agenda indisponible pour l.instant · dernières données du \d\d\/\d\d/i), retryButton,
        async s => await s.p.evaluate(() => !!CAL && CAL.events.length > 0) ? null : 'copie locale non affichée') });
    await scenario(b, 'erreur réseau : message court', { noCache: true,
      prepare: s => s.c.route('**/calendar.sealed.json*', r => r.abort()),
      expect: both(message(/Agenda injoignable pour l.instant/i), retryButton) });
    await scenario(b, 'réponse invalide : message court', { noCache: true,
      prepare: s => s.c.route('**/calendar.sealed.json*', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html>portail</html>' })),
      expect: both(message(/Agenda illisible pour l.instant/i), retryButton) });
    await scenario(b, 'déchiffrement sans réponse : délai maximal de 15 s', { noCache: true,
      prepare: s => s.p.evaluate(() => { crypto.subtle.deriveKey = () => new Promise(() => {}); }),
      expect: message(/Agenda indisponible pour l.instant/i) });
    await scenario(b, 'observations du relais sans réponse : agenda lu quand même', {
      prepare: s => s.c.route('**/obs.json*', hold), seconds: 5,
      expect: async s => await s.p.evaluate(() => !!CAL && !CALFAIL) ? null : 'agenda non chargé pendant l’attente du relais' });
    await scenario(b, 'météo bloquée (cas iPhone du 30/10) : agenda lu sans attendre la météo', {
      prepare: s => s.c.route(/open-meteo\.com/, hold), seconds: 5,
      expect: async s => await s.p.evaluate(() => !!CAL && !CALFAIL && busy) ? null : 'agenda non chargé pendant que la météo attend' });
    await scenario(b, 'erreur d’affichage pendant l’actualisation météo', {
      prepare: s => s.p.evaluate(() => {
        const original = renderAll; let thrown = false;
        window.renderAll = function () { original.apply(this, arguments); if (window.__fail && !thrown && /refreshAll/.test(new Error().stack)) { thrown = true; throw new Error('affichage test'); } };
      }),
      act: s => s.p.evaluate(() => { window.__fail = 1; refreshAll().catch(() => {}); }),
      expect: async s => await s.p.evaluate(() => !!CAL && !busy) ? null : 'agenda non lu ou actualisation restée en cours' });
    await scenario(b, 'actualisation météo déjà en cours : l’agenda ne l’attend pas', {
      act: s => s.p.evaluate(() => { busy = true; refreshAll(); }),
      expect: async s => await s.p.evaluate(() => !!CAL) ? null : 'agenda non lu' });
    await scenario(b, 'retour au premier plan : lecture gelée par la veille relancée sans attendre un minuteur', {
      prepare: async s => {
        s.calls = 0; const body = fs.readFileSync(process.env.SP + '/cal.fake.json', 'utf8');
        await s.c.route(/open-meteo\.com/, hold);   // comme sur l'iPhone le 30/10 : météo bloquée
        await s.c.route('**/calendar.sealed.json*', r => { if (s.calls++) r.fulfill({ status: 200, contentType: 'application/json', body }); });
      },
      act: async s => {
        await s.p.evaluate(() => { refreshAll(); });
        await s.p.clock.runFor(500);
        // Veille iOS : 4 min passent à l'horloge murale, aucun minuteur ne sonne.
        const now = await s.p.evaluate(() => Date.now());
        await s.p.clock.pauseAt(now + 10); await s.p.clock.setSystemTime(now + 4 * 60e3);
        const before = s.calls;
        await s.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await s.p.waitForTimeout(500);
        s.relaunched = s.calls > before;
        await s.p.clock.resume();
      },
      seconds: 2,
      expect: async s => !s.relaunched ? 'aucune nouvelle lecture au retour au premier plan' : await s.p.evaluate(() => !!CAL && !CAL.offline && !CALFAIL) ? null : 'agenda non chargé après la relance' });
    await scenario(b, 'Réessayer après une erreur : agenda chargé, message retiré', { noCache: true,
      prepare: s => s.c.route('**/calendar.sealed.json*', r => r.abort()),
      act: async s => {
        await s.p.evaluate(() => { refreshAll(); }); await s.settle(20);
        await s.c.unroute('**/calendar.sealed.json*');
        const retry = s.p.locator('#secBrf [data-act=cal-retry]'); s.clicked = await retry.count() > 0; if (s.clicked) await retry.click();
      },
      expect: async s => !s.clicked ? 'bouton Réessayer absent' : await s.p.evaluate(() => !!CAL && !CALFAIL) && !await s.p.locator('[data-act=cal-retry]').count() ? null : 'Réessayer sans effet' });
  } finally { await b.close(); }
  console.log(rows.join('\n'));
  console.log(fail ? fail + ' scénario(s) en échec [' + BR.NAME + ']' : rows.length + '/' + rows.length + ' scénarios agenda sans sablier infini [' + BR.NAME + ']');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
