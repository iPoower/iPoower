// « Je pars de chez moi » puis rester (ou revenir) à la maison, données fictives, iPhone puis PC :
// le bandeau n'affirme jamais « Trajet en cours · GPS · Fiable » pour un simple départ annoncé ; deux relevés GPS précis
// au lieu quitté, 15 min après l'annonce, terminent le départ ; avant 15 min, l'annonce est respectée.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
const { revealPlaceControls } = require('./lib/place-controls');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + d)); if (!ok) fail++; };
const bar = p => p.evaluate(() => document.querySelector('#placeBar').innerText.replace(/\s+/g, ' '));
const state = p => p.evaluate(() => ({ status: APP_CONTEXT.snapshot.status, lastDeparture: USER_STORE.state.lastDeparture, conf: PLACE.conf && PLACE.conf.placeId,
  stored: JSON.parse(localStorage.getItem(USER_STORE.key) || 'null') }));
async function click(p, sel) { await revealPlaceControls(p, sel); await p.locator(sel).first().click(); }
async function run(b, dev) {
  const { p, c, settle } = await session(b, { at: '2026-11-12T19:00:00+01:00', dev, geo: { lat: 48.8502, lon: 2.3501, acc: 15 } });
  const fixes = async (n, gap) => { for (let i = 0; i < n; i++) { await p.clock.runFor(gap); await p.evaluate(() => window.__geoPush()); await settle(3); } };
  await p.evaluate(() => { S.work.days = []; saveSettings(); rebuild(); renderAll(); }); await settle(4);   // jour de congé : aucun trajet prévu
  await p.locator('[data-act=locate]').first().click(); await settle(6);
  check(`${dev} · GPS précis à la maison`, /Maison test · Fiable · GPS navigateur/.test(await bar(p)), await bar(p));
  await click(p, '#placeBar [data-act=place-confirm][data-place=home]'); await settle(4);
  await click(p, '#placeBar [data-act=place-leave]'); await settle(4);
  let t = await bar(p), s = await state(p);
  check(`${dev} · « Je pars » : en route annoncé, sans fausse preuve GPS`, /EN ROUTE · Estimée · Départ annoncé à 19:00 · trajet non suivi/.test(t) && !/Trajet en cours · GPS/.test(t) && s.status === 'travel', t);
  await fixes(6, 60e3);
  t = await bar(p); s = await state(p);
  check(`${dev} · 6 min après, GPS à la maison : l'annonce est respectée`, /Départ annoncé/.test(t) && s.lastDeparture && s.lastDeparture.placeId === 'home', t);
  await fixes(1, 30 * 60e3); await fixes(1, 30e3);
  t = await bar(p); s = await state(p);
  check(`${dev} · 36 min après, deux relevés précis à la maison : départ terminé, « Maison test » GPS`, /Maison test · Fiable · GPS navigateur/.test(t) && !/EN ROUTE/.test(t) && s.lastDeparture === null && s.status === 'home', t + ' · ' + JSON.stringify(s.lastDeparture));
  check(`${dev} · fin du départ enregistrée`, s.stored && s.stored.lastDeparture == null, JSON.stringify(s.stored && s.stored.lastDeparture));
  await p.reload(); await settle(10);
  t = await bar(p);
  check(`${dev} · rechargement : pas de retour à « EN ROUTE »`, !/EN ROUTE/.test(t), t);
  await click(p, '#placeBar [data-act=place-confirm][data-place=home]'); await settle(4);
  check(`${dev} · « Je suis déjà chez moi » toujours disponible`, /À LA MAISON · Maison test/.test(await bar(p)), await bar(p));
  await c.close();
}
(async () => {
  const b = await BR.launch();
  try { await run(b, 'iphone'); await run(b, 'pc'); } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
  console.log(rows.join('\n') + '\n\n' + (rows.length - fail) + '/' + rows.length + ' contrôles « départ annoncé, resté à la maison »');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
