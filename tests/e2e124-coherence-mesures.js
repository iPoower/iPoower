// Cohérence des mesures (audit du 15/11/2026), données fictives, app déverrouillée avec la clé de TEST.
// Boîte de dépôt : pneus remplacés (mesures antérieures détachées, historique conservé), montage plus ancien refusé,
// pression jamais redatée, voiture sans pneus, une seule chronologie des kilométrages (plein, compteur, budget, Paramètres),
// bloc entouré de phrases. Trajet : échec du calcul d'itinéraire visible (jamais « calcul en cours » sans fin, aucune durée d'emprunt).
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 500))); if (!ok) fail++; };
const e = (id, date, car, type, values, extra = {}) => ({ id, date, car, type, status: 'measured', values, ...extra });
const block = entries => JSON.stringify({ format: 'rc-depot-v1', source: 'claude', entries });
const flat = async l => (await l.innerText()).replace(/\s+/g, ' ');
async function depot(b, dev) {
  const s = await session(b, { at: '2026-11-15T17:30:00+01:00', dev }), p = s.p, dialogs = [];
  p.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
  const box = p.locator('#secGarage #rcInbox');
  const garage = async () => { await p.locator('#viewSeg [data-act=view][data-v=garage]').click(); await s.settle(3); if (!await box.evaluate(d => d.open)) await box.locator('summary').click(); await s.settle(1); };
  const car = id => p.evaluate(id => JSON.parse(JSON.stringify(S.cars.find(c => c.id === id))), id);
  // Colle un bloc, rend le texte de chaque saisie, valide tout ce qui peut l'être, puis vide la liste.
  async function paste(raw) {
    await garage();
    await box.locator('#rcInboxText').fill(typeof raw === 'string' ? raw : block(raw)); await box.locator('[data-act=inbox-read]').click(); await s.settle(2);
    const items = []; for (const it of await box.locator('.inbox-item').all()) items.push(await flat(it));
    for (let guard = 0; guard < 20 && await box.locator('[data-act=inbox-accept]:not([disabled])').count(); guard++) { await box.locator('[data-act=inbox-accept]:not([disabled])').first().click(); await s.settle(3); }
    for (let guard = 0; guard < 20 && await box.locator('[data-act=inbox-reject]').count(); guard++) { await box.locator('[data-act=inbox-reject]').first().click(); await s.settle(1); }
    return { items, status: (await box.locator('.inbox-status').innerText()).trim() };
  }
  let r = await paste([e('dep-base-odo1', '2026-11-01', 'Test A', 'odometer', { km: 15000 }), e('dep-base-tread1', '2026-11-01', 'Test A', 'tread', { mm: 1.8, ax: 'both' }), e('dep-base-press1', '2026-11-01', 'Test A', 'pressure', { av: 2.4, ar: 2.2, T: 8 })]);
  let a = await car('carA');
  check(`${dev} · base : compteur, profondeur usée et pressions enregistrés`, a.tire.treadAv === 1.8 && a.tire.pchk.ar === 2.2 && a.odo.length === 1, JSON.stringify(a.tire));
  check(`${dev} · Garage : pneus usés signalés`, /1,8 mm/.test(await flat(p.locator('#secGarage'))));

  r = await paste('Voici le bloc préparé :\n```json\n' + block([e('dep-mount-new1', '2026-11-10', 'Test A', 'tireMount', { type: 'summer', brand: 'Marque Neuve', dot: '4026', km: 15300 })]) + '\n```\nBonne route !');
  a = await car('carA');
  check(`${dev} · bloc entouré de phrases : lu`, r.items.length === 1 && /Pneus montés : été → été · Marque Neuve/.test(r.items[0]), r.status + ' ' + r.items.join(' | '));
  check(`${dev} · pneus remplacés : l’aperçu annonce les mesures détachées`, /Profondeur 1,8 mm : mesurée avant ce montage/.test(r.items[0]) && /Pressions mesurées le 01\/11\/2026 : antérieures/.test(r.items[0]), r.items[0]);
  check(`${dev} · pneus remplacés : profondeur et pression actuelles à mesurer, historique conservé`, a.tire.treadAv == null && a.tire.treadAr == null && a.tire.tread == null && !a.tire.pchk.date && a.tire.treads.length === 1 && a.tire.brand === 'Marque Neuve' && a.tire.mounted === '2026-11-10' && a.tire.mountKm === 15300, JSON.stringify(a.tire));
  const g = await flat(p.locator('#secGarage'));
  check(`${dev} · Garage : plus de « 1,8 mm » ni de remplacement à prévoir pour des pneus neufs`, !/1,8 mm/.test(g) && /Marque Neuve/.test(g), g.slice(0, 900));

  r = await paste([e('dep-mount-old1', '2026-05-01', 'Test A', 'tireMount', { type: 'summer', brand: 'Marque Ancienne', dot: '0125' }), e('dep-mount-old2', '2026-05-01', 'Test A', 'tireMount', { type: 'winter' })]);
  a = await car('carA');
  check(`${dev} · montage plus ancien : refusé, rien de modifié`, r.items.every(x => /montage plus récent est déjà enregistré \(10\/11\/2026\)/.test(x)) && a.tire.brand === 'Marque Neuve' && a.tire.type === 'summer' && a.tire.mounted === '2026-11-10', r.items.join(' | '));

  await paste([e('dep-press-full', '2026-11-11', 'Test A', 'pressure', { av: 2.4, ar: 2.3 })]);
  r = await paste([e('dep-press-av', '2026-11-12', 'Test A', 'pressure', { av: 2.6 })]);
  a = await car('carA');
  check(`${dev} · pression avant seule : l’arrière de la veille n’est pas redaté`, a.tire.pchk.date === '2026-11-12' && a.tire.pchk.av === 2.6 && a.tire.pchk.ar === null && /arrière non mesurée ce jour-là : l’ancienne valeur \(2,30 bar du 11\/11\/2026\) n’est pas reconduite/.test(r.items[0]), JSON.stringify(a.tire.pchk) + ' ' + r.items[0]);

  r = await paste([e('dep-none-tread', '2026-11-12', 'Test B', 'tread', { mm: 6, ax: 'both' }), e('dep-none-press', '2026-11-12', 'Test B', 'pressure', { av: 2.3, ar: 2.3 })]);
  const bcar = await car('carB');
  check(`${dev} · voiture sans pneus : mesures refusées, fiche intacte`, r.items.every(x => /Aucun pneu monté sur cette voiture/.test(x)) && bcar.tire.tread == null && !(bcar.tire.treads || []).length, r.items.join(' | '));

  r = await paste([e('dep-fuel-good', '2026-11-13', 'Test A', 'fuel', { amountCents: 7000, litres: 40, km: 15600, fullTank: true, fuelType: 'sp98' })]);
  a = await car('carA');
  check(`${dev} · plein cohérent : budget et compteur de la voiture à jour`, a.economics.entries.length === 1 && a.odo.some(o => o.d === '2026-11-13' && o.km === 15600) && /Compteur : .*→ 15.600 km/.test(r.items[0]), JSON.stringify(a.odo) + ' ' + r.items[0]);
  r = await paste([e('dep-fuel-back', '2026-11-14', 'Test A', 'fuel', { amountCents: 5000, litres: 30, km: 15500, fullTank: true }), e('dep-odo-back', '2026-11-14', 'Test A', 'odometer', { km: 15400 }),
    e('dep-odo-old', '2026-10-01', 'Test A', 'odometer', { km: 14000 })]);
  a = await car('carA');
  check(`${dev} · plein et compteur qui reculent : refusés, avec le relevé contredit`, /contredit le plein du 13\/11\/2026 \(15.600 km\)/.test(r.items[0]) && /contredit le plein du 13\/11\/2026/.test(r.items[1]) && !a.odo.some(o => o.d === '2026-11-14') && a.economics.entries.length === 1, r.items.slice(0, 2).join(' | '));
  check(`${dev} · compteur ancien : ajouté à l’historique, aperçu sans compteur qui recule`, /Compteur au 01\/10\/2026 : 14.000 km · relevé ancien ajouté à l’historique, dernier relevé inchangé/.test(r.items[2]) && a.odo[0].d === '2026-10-01', r.items[2]);
  check(`${dev} · Garage : compteur affiché = dernier relevé connu (15 600 km)`, /COMPTEUR ENREGISTRÉ 15.600 km/.test(await flat(p.locator('#secGarage'))));

  // Budget saisi à la main : même chronologie, même report du compteur.
  await garage();
  const eco = p.locator('#secGarage .garage-economics').first(); if (!await eco.evaluate(d => d.open)) await eco.locator('summary').click(); await s.settle(1);
  const form = eco.locator('form[data-econ-add]'), add = async (date, amount, km) => { await form.locator('[name=date]').fill(date); await form.locator('[name=category]').selectOption('tolls'); await form.locator('[name=amount]').fill(amount); await form.locator('[name=km]').fill(km); await form.locator('button[type=submit], [type=submit]').first().click(); await s.settle(3); };
  await add('2026-11-14', '12,50', '15000');
  a = await car('carA');
  check(`${dev} · dépense à la main, compteur qui recule : refusée avec le relevé contredit`, a.economics.entries.length === 1 && /contredit le plein du 13\/11\/2026/.test(await flat(eco)), (await flat(eco)).slice(-400));
  await add('2026-11-14', '12,50', '15700');
  a = await car('carA');
  check(`${dev} · dépense à la main cohérente : enregistrée, compteur reporté dans les relevés`, a.economics.entries.length === 2 && a.odo.some(o => o.d === '2026-11-14' && o.km === 15700), JSON.stringify(a.odo));

  // Compteur saisi dans Paramètres : une contradiction demande confirmation (ici refusée) et ne s'enregistre pas en silence.
  await p.evaluate(() => { const d = document.querySelector('#settings'); d.open = true; renderSettings(true); }); await s.settle(2);
  const odo = p.locator('#odo-0'); await odo.evaluate(el => { for (let x = el; x; x = x.parentElement) if (x.tagName === 'DETAILS') x.open = true; el.scrollIntoView(); });
  await odo.fill('15100'); await p.locator('[data-act=odo][data-i="0"]').click(); await s.settle(3);
  a = await car('carA');
  check(`${dev} · Paramètres, compteur qui recule : confirmation demandée, rien d’enregistré sans elle`, dialogs.some(d => /contredit .* du 14\/11\/2026/.test(d)) && !a.odo.some(o => o.km === 15100), JSON.stringify(dialogs) + JSON.stringify(a.odo));

  await p.reload(); await s.settle(8);
  a = await car('carA');
  check(`${dev} · rechargement : fiche cohérente conservée dans le coffre`, a.tire.brand === 'Marque Neuve' && a.tire.treadAv == null && a.odo.length === 5 && a.economics.entries.length === 2, JSON.stringify({ odo: a.odo, n: a.economics.entries.length }));
  await p.locator('#viewSeg [data-act=view][data-v=pneus]').click(); await s.settle(4);
  const link = await flat(p.locator('#secWeatherLink'));
  check(`${dev} · Pneus : la pluie est nommée (« pluie : … »), aucun mot orphelin`, /· pluie : (aucune|faible|modérée|forte) ·/.test(link), link);
  check(`${dev} · aucune page plus large que l’écran`, await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await s.c.close();
}
// Le harnais coupe le service d'itinéraire : le trajet manuel doit le dire, proposer un nouvel essai et ne pas emprunter la durée domicile-travail.
async function route(b, dev) {
  const s = await session(b, { at: '2026-11-15T17:30:00+01:00', dev }), p = s.p;
  await p.locator('#viewSeg [data-act=view][data-v=trajet]').click(); await s.settle(3);
  const sec = p.locator('#secTrip');
  await sec.locator('[data-act=trip-dest-known]').first().click(); await s.settle(2);
  await sec.locator('#tripCar').selectOption({ index: 1 }); await s.settle(2);
  await sec.locator('[data-act=trip-plan]').first().click(); await s.settle(8);
  const t = await flat(sec);
  check(`${dev} · Trajet : échec d’itinéraire annoncé, plus de « Calcul en cours » sans fin`, /Itinéraire indisponible/.test(t) && !/Calcul en cours/.test(t), t.slice(0, 700));
  check(`${dev} · Trajet : bouton « Réessayer maintenant »`, await sec.locator('[data-act=trip-route-retry]').count() === 1);
  await sec.locator('[data-act=trip-route-retry]').click(); await s.settle(6);
  check(`${dev} · Trajet : après un nouvel essai en échec, l’état reste explicite`, /Itinéraire indisponible/.test(await flat(sec)));
  await p.locator('#viewSeg [data-act=view][data-v=meteo]').click(); await s.settle(4);
  const m = ((await flat(p.locator('body'))).match(/🧭 PROCHAIN TRAJET.{0,330}/) || [''])[0];
  check(`${dev} · Météo : aucune durée empruntée au trajet domicile-travail, itinéraire indisponible annoncé`, /Itinéraire indisponible pour le moment/.test(m) && !/→ \d\d:\d\d · \d+ min/.test(m.split('Ensuite')[0]), m);
  await p.locator('#viewSeg [data-act=view][data-v=pneus]').click(); await s.settle(4);
  const brf = await flat(p.locator('#secBrf'));
  check(`${dev} · Pneus : le briefing ne parle plus d’une annulation qui n’a pas eu lieu`, /Itinéraire indisponible pour le moment/.test(brf) && !/Origine à confirmer après annulation/.test(brf), brf.slice(0, 500));
  await s.c.close();
}
(async () => {
  const b = await BR.launch();
  try { await depot(b, 'iphone'); await route(b, 'iphone'); await route(b, 'pc'); } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
  console.log(rows.join('\n') + '\n\n' + (rows.length - fail) + '/' + rows.length + ' contrôles « cohérence des mesures »');
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
