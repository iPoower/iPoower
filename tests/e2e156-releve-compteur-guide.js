// Relevé guidé du compteur (27/11/2026, choix du propriétaire), données FICTIVES, iPhone puis PC. Aller fictif 06:30 → 07:10,
// il est 08:10. Après « Confirmer mon arrivée », Départ et la feuille de route invitent à relever le compteur de la voiture
// du trajet ; rien n'est écrit d'office ; « Relever le compteur » ouvre le champ existant du Garage ; le vrai relevé saisi
// fait disparaître l'invitation, aussi après rechargement. Aucune invitation avant l'arrivée confirmée.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 700))); if (!ok) fail++; };
const hints = p => p.evaluate(() => ({ dep: [...document.querySelectorAll('#secGps [data-trip-odo]')].map(e => e.innerText), road: [...document.querySelectorAll('#secTripSummary [data-trip-odo]')].map(e => e.innerText) }));
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T08:10:00+01:00', dev }), p = s.p; await s.settle(4);
  const ini = await p.evaluate(() => {
    S.cars.forEach((c, i) => Object.assign(c.tire, { type: i ? 'winter' : 'summer', size: '205/55 R16 91V', tread: 6 }));
    const car = S.cars[0]; car.odo = Garage.odoReplace(car.odo || [], '2026-11-10', 42000);
    S.work.dep = '06:30'; S.work.durMin = 40; saveSettings(); appSetCar(car.id); rebuild(); UI.view = 'gps'; renderAll();
    return { id: car.id, name: car.short || car.name, odo: JSON.stringify(car.odo) };
  }); await s.settle(6);
  const before = await hints(p);
  check(`${dev} · avant l’arrivée confirmée : aucune invitation à relever le compteur`, !before.dep.length && !before.road.length, JSON.stringify(before));
  const key = await p.evaluate(() => { const b = document.querySelector('#secGps [data-act=fr-arrived]'); return b && b.dataset.key; });
  if (!key) { check(`${dev} · « Confirmer mon arrivée » présent dans Départ`, false, 'absent'); await s.c.close(); return; }
  await p.locator('#secGps [data-act=fr-arrived]').click(); await s.settle(3);
  const after = await hints(p), odo1 = await p.evaluate(id => JSON.stringify(S.cars.find(c => c.id === id).odo), ini.id);
  check(`${dev} · après confirmation : Départ invite à relever le compteur de ${ini.name}, dernier relevé (42 000 km) et km du trajet affichés`,
    after.dep.length === 1 && after.dep[0].includes(ini.name) && /42\s?000 km/.test(after.dep[0]) && /trajet [~≈]/.test(after.dep[0]), JSON.stringify(after));
  check(`${dev} · rien n’est écrit d’office : compteur inchangé`, odo1 === ini.odo, odo1);
  await p.evaluate(() => { UI.view = 'trajet'; renderAll(); }); await s.settle(2);
  const road = await hints(p);
  check(`${dev} · feuille de route : même invitation sur la spéciale arrivée`, road.road.length === 1 && road.road[0].includes(ini.name), JSON.stringify(road));
  await p.evaluate(() => { UI.view = 'gps'; renderAll(); }); await s.settle(2);
  await p.locator('#secGps [data-trip-odo] [data-act=garage-quick]').click({ timeout: 3000 }).catch(() => {}); await s.settle(2);
  const f = await p.evaluate(id => { const i = S.cars.findIndex(c => c.id === id), a = document.activeElement;
    return { i, open: !!(document.getElementById('settings') || {}).open, focus: a && a.id, ph: a && a.getAttribute('placeholder'), odo: JSON.stringify(S.cars[i].odo) }; }, ini.id);
  check(`${dev} · « Relever le compteur » ouvre le champ existant du Garage (compteur actuel, dernier relevé en indication), rien d’écrit`,
    f.open && f.focus === 'odo-' + f.i && f.ph === '42000' && f.odo === ini.odo, JSON.stringify(f));
  await p.evaluate(() => { const d = document.getElementById('settings'); if (d) d.open = true; renderSettings(true); }); await s.settle(1);
  await p.locator('#odo-' + f.i).fill('42031'); await p.locator('[data-act=odo][data-i="' + f.i + '"]').click(); await s.settle(3);
  await p.evaluate(() => { UI.view = 'gps'; renderAll(); }); await s.settle(2);
  const saved = await p.evaluate(id => ({ last: lastOdo(S.cars.find(c => c.id === id)), today: liveNow().slice(0, 10) }), ini.id), gone = await hints(p);
  check(`${dev} · relevé saisi (42 031 km, daté d’aujourd’hui) : l’invitation disparaît de Départ et de la feuille`,
    saved.last && saved.last.km === 42031 && saved.last.d === saved.today && !gone.dep.length && !gone.road.length, JSON.stringify({ saved, gone }));
  await p.evaluate(async () => { await window.TWRC_VAULT.flush(); }); await p.reload(); await s.settle(8);
  await p.evaluate(() => { UI.view = 'gps'; renderAll(); }); await s.settle(2);
  const re = await hints(p), last = await p.evaluate(id => lastOdo(S.cars.find(c => c.id === id)), ini.id);
  check(`${dev} · rechargement : relevé conservé, aucune invitation`, last && last.km === 42031 && !re.dep.length, JSON.stringify({ re, last }));
  await s.c.close();
}
(async () => {
  const b = await BR.launch();
  try { await run(b, 'iphone'); await run(b, 'pc'); } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
