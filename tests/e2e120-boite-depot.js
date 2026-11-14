// Boîte de dépôt (saisies préparées par Claude), iPhone et PC, moteurs réels, app déverrouillée avec la clé de TEST.
// Bloc collé dans le Garage, lu strictement, relu saisie par saisie (avant → après), validé ou rejeté au clic seulement.
// Vérifie : rien d'appliqué sans clic, aucun HTML interprété, voiture inconnue choisie à la main, coffre chiffré, marques de synchronisation,
// journal des trajets intact, doublons ignorés au second collage, rechargement, aucune page plus large que l'écran. Données fictives.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
let n = 0, stage = '';
const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
const box = p => p.locator('#secGarage #rcInbox');
const status = async p => (await box(p).locator('.inbox-status').innerText()).trim();
const text = async p => (await box(p).innerText()).replace(/\s+/g, ' ');
const e = (id, date, car, type, values, extra = {}) => ({ id, date, car, type, status: 'measured', values, ...extra });
const ENTRIES = [
  e('dep-fuel-0001', '2026-03-28', 'Test A', 'fuel', { amountCents: 6050, litres: 35.5, km: 12000, fullTank: true, fuelType: 'diesel' }, { note: 'Station fictive' }),
  e('dep-odo-0001', '2026-03-29', 'test a', 'odometer', { km: 12100 }),
  e('dep-press-0001', '2026-03-30', 'Voiture test A', 'pressure', { av: 2.4, ar: 2.3, T: 9.5 }),
  e('dep-tread-0001', '2026-03-30', 'Test A', 'tread', { mm: 6.2, ax: 'av' }),
  e('dep-mount-0001', '2026-03-31', 'Test A', 'tireMount', { type: 'winter', brand: 'Marque B', dot: '3825', km: 12150 }),
  e('dep-maint-0001', '2026-03-31', 'Test A', 'maintenance', { kind: 'revision', km: 12150, amountCents: 18900 }),
  e('dep-odo-0002', '2026-03-31', 'Voiture inconnue', 'odometer', { km: 5000 }),
  e('dep-fuel-0002', '2026-03-31', 'Test A', 'fuel', { amountCents: 999 }, { note: 'À rejeter' }),
  { ...e('dep-bad-0001', '2026-03-31', 'Test A', 'odometer', { km: 1 }), '<img src=x onerror=window.__pwn=1>': 1 }
];
const BLOCK = '```json\n' + JSON.stringify({ format: 'rc-depot-v1', source: 'claude', createdAt: '2026-04-01T07:00:00Z', entries: ENTRIES }) + '\n```';
async function openGarage(s, dev) {
  const tab = s.p.locator('#viewSeg [data-act=view][data-v=garage]');
  if (dev === 'iphone') await tab.tap(); else await tab.click();
  await s.settle(3);
  if (!await box(s.p).evaluate(d => d.open)) await box(s.p).locator('summary').click();
  await s.settle(1);
}
async function paste(s, value) { await box(s.p).locator('#rcInboxText').fill(value); await box(s.p).locator('[data-act="inbox-read"]').click(); await s.settle(2); }
const item = (p, id) => box(p).locator('.inbox-item').filter({ has: p.locator(`[data-entry^="${id}#"]`) });
async function act(s, id, what) { await box(s.p).locator(`[data-act="inbox-${what}"][data-entry^="${id}#"]`).click(); await s.settle(3); }
const cars = p => p.evaluate(() => JSON.parse(JSON.stringify(S.cars.map(c => ({ id: c.id, odo: c.odo || [], tire: c.tire, maint: c.maint, economics: c.economics || null })))));
const untouched = p => p.evaluate(() => ({ context: lsGet('twrc.context.v1'), archive: typeof JournalArchive !== 'undefined' ? lsGet(JournalArchive.KEY) : null, journal: JSON.stringify(S.journal || null) }));
(async () => {
  const browser = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(browser, { at: '2026-04-01T10:00:00+02:00', dev });
      await openGarage(s, dev);
      const before = await cars(s.p), journal = await untouched(s.p);
      await check(dev + ' · volet « Saisies préparées par Claude » au Garage, vide : rien n’est enregistré sans clic', async () => {
        assert.match(await text(s.p), /Saisies préparées par Claude/); assert.match(await text(s.p), /rien n’est enregistré sans ton clic/);
        assert.equal(await box(s.p).locator('#rcInboxText').count(), 1);
      });
      await check(dev + ' · bloc illisible ou d’un autre format : refusé, rien n’est lu ni modifié', async () => {
        await paste(s, '{"format":"rc-depot-v1","source":"claude","entries":[');
        assert.match(await status(s.p), /JSON strict attendu · rien n’a été lu/);
        await paste(s, JSON.stringify({ format: 'autre', source: 'claude', entries: [ENTRIES[1]] }));
        assert.match(await status(s.p), /Format inconnu/); assert.deepEqual(await cars(s.p), before);
      });
      await check(dev + ' · bloc valide : 9 saisies listées (1 refusée), avant → après affiché, aucune appliquée par la lecture', async () => {
        await paste(s, BLOCK);
        assert.match(await status(s.p), /9 saisie\(s\) à relire/); assert.equal(await box(s.p).locator('.inbox-item').count(), 9);
        const t = await text(s.p);
        assert.match(t, /Plein · 28\/03\/2026 · Test A · mesuré/i); assert.match(t, /Budget : \+ 60,50\s€ \(carburant\)/); assert.match(t, /Volume : 35,50 L · plein complet/);
        assert.match(t, /Pressions mesurées : aucune valeur → AV 2,40 \/ AR 2,30 bar/); assert.match(t, /Pneus montés : été → hiver · Marque B · le 31\/03\/2026/); assert.match(t, /Dernière révision : non renseignée → 31\/03\/2026 à 12\s150 km/);
        assert.match(t, /« Voiture inconnue » introuvable/); assert.match(t, /Saisie n° 9 refusée · Saisie : champ inconnu/);
        assert.deepEqual(await cars(s.p), before, 'lecture seule');
      });
      await check(dev + ' · texte du bloc jamais interprété comme du HTML (clé piégée affichée en texte)', async () => {
        const r = await s.p.evaluate(() => ({ img: document.querySelectorAll('#rcInbox img').length, pwn: window.__pwn === 1, txt: document.querySelector('#rcInbox .inbox-bad').textContent }));
        assert.equal(r.img, 0); assert.equal(r.pwn, false); assert.match(r.txt, /« <img src=x onerror=windo »/);
      });
      await check(dev + ' · rejeter : saisie retirée de la liste, fiche inchangée ; voiture inconnue : Valider bloqué tant qu’elle n’est pas choisie', async () => {
        await act(s, 'dep-fuel-0002', 'reject'); await act(s, 'dep-bad-0001', 'reject');
        assert.match(await status(s.p), /Saisie rejetée : rien n’a été modifié/); assert.equal(await box(s.p).locator('.inbox-item').count(), 7); assert.deepEqual(await cars(s.p), before);
        assert.equal(await box(s.p).locator('[data-act="inbox-accept"][data-entry^="dep-odo-0002#"]').isDisabled(), true);
      });
      await check(dev + ' · valider le plein : ligne du budget avec l’identifiant de la saisie, marque de synchronisation, coffre à jour', async () => {
        await act(s, 'dep-fuel-0001', 'accept');
        assert.match(await status(s.p), /Plein enregistré pour Test A · coffre à jour/);
        const r = await s.p.evaluate(() => ({ row: S.cars[0].economics.entries.find(x => x.id === 'dep-fuel-0001'), mark: S.edits['cars.0.economics.entries'] }));
        assert.deepEqual(r.row, { id: 'dep-fuel-0001', date: '2026-03-28', category: 'fuel', amountCents: 6050, km: 12000, note: 'Station fictive', volumeMl: 35500, fuelType: 'diesel', fullTank: true });
        assert.equal(r.mark, 1); assert.equal(await item(s.p, 'dep-fuel-0001').count(), 0);
      });
      await check(dev + ' · valider compteur, pressions, profondeur, montage hiver et révision : chaque fiche reçoit exactement la saisie', async () => {
        for (const id of ['dep-odo-0001', 'dep-press-0001', 'dep-tread-0001', 'dep-mount-0001', 'dep-maint-0001']) await act(s, id, 'accept');
        const c = (await cars(s.p))[0];
        assert.deepEqual(c.odo, [{ d: '2026-03-29', km: 12100 }, { d: '2026-03-31', km: 12150 }]);
        assert.equal(c.tire.type, 'winter'); assert.equal(c.tire.brand, 'Marque B'); assert.equal(c.tire.dot, '3825'); assert.equal(c.tire.mounted, '2026-03-31'); assert.equal(c.tire.mountKm, 12150);
        const summer = await s.p.evaluate(() => S.cars[0].sets.summer);
        assert.deepEqual({ ...summer.pchk }, { date: '2026-03-30', T: 9.5, av: 2.4, ar: 2.3 }, 'pressions mesurées rangées avec le jeu été'); assert.equal(summer.treadAv, 6.2);
        assert.deepEqual({ d: c.maint.rev.d, km: c.maint.rev.km }, { d: '2026-03-31', km: 12150 });
        assert.deepEqual(c.economics.entries.map(x => x.id).sort(), ['dep-fuel-0001', 'dep-maint-0001']);
        const marks = await s.p.evaluate(() => Object.keys(S.edits).filter(k => /^cars\.0\.(tire|sets|maint|odo)/.test(k)));
        for (const k of ['cars.0.tire', 'cars.0.sets', 'cars.0.maint.rev.d', 'cars.0.tire.pchk.av']) assert.ok(marks.includes(k), k);
      });
      await check(dev + ' · voiture choisie à la main (Test B) puis validée ; liste vidée avec le bilan', async () => {
        await box(s.p).locator('select[data-inbox-car^="dep-odo-0002#"]').selectOption('carB'); await s.settle(2);
        await act(s, 'dep-odo-0002', 'accept');
        assert.deepEqual((await cars(s.p))[1].odo, [{ d: '2026-03-31', km: 5000 }]);
        assert.equal(await box(s.p).locator('.inbox-item').count(), 0); assert.match(await status(s.p), /Boîte vidée · 7 validée\(s\), 2 rejetée\(s\)/);
      });
      await check(dev + ' · journal des trajets et contexte jamais modifiés ; rien en clair dans le stockage brut', async () => {
        assert.deepEqual(await untouched(s.p), journal);
        await s.p.evaluate(() => window.TWRC_VAULT.flush());
        const raw = await s.p.evaluate(() => { const st = window.TWRC_RAW_STORAGE, out = []; for (let i = 0; i < st.length; i++) out.push(st.key(i) + '=' + st.getItem(st.key(i))); return out.join('\n'); });
        for (const secret of ['dep-fuel-0001', 'Station fictive', 'Marque B', 'amountCents']) assert.equal(raw.includes(secret), false, secret + ' trouvé en clair');
      });
      await check(dev + ' · rechargement : tout est conservé ; même bloc recollé → saisies déjà enregistrées ignorées, rien de réappliqué', async () => {
        await s.p.reload(); await s.settle(14); await openGarage(s, dev);
        const kept = await cars(s.p);
        assert.equal(kept[0].tire.type, 'winter'); assert.equal(kept[0].economics.entries.length, 2); assert.deepEqual(kept[1].odo, [{ d: '2026-03-31', km: 5000 }]);
        await paste(s, BLOCK);
        assert.match(await status(s.p), /6 déjà enregistrée\(s\), ignorée\(s\)/); assert.equal(await box(s.p).locator('.inbox-item').count(), 3, 'restent la voiture inconnue, la saisie rejetée et la saisie illisible');
        assert.match(await item(s.p, 'dep-odo-0002').innerText(), /introuvable/);
        assert.deepEqual(await cars(s.p), kept);
        for (const id of ['dep-odo-0002', 'dep-fuel-0002', 'dep-bad-0001']) await act(s, id, 'reject');
      });
      await check(dev + ' · aucune page plus large que l’écran, zone de collage à 16 px, boutons de 44 px', async () => {
        await paste(s, BLOCK); // trois saisies relistées : mesure avec une liste affichée
        const r = await s.p.evaluate(() => ({ w: document.scrollingElement.scrollWidth, vw: innerWidth,
          small: [...document.querySelectorAll('#rcInbox .inbox-actions .btn')].filter(b => b.getBoundingClientRect().height < 44).length }));
        assert.ok(r.w <= r.vw, JSON.stringify(r)); assert.equal(r.small, 0, JSON.stringify(r));
        for (const id of ['dep-odo-0002', 'dep-fuel-0002', 'dep-bad-0001']) await act(s, id, 'reject');
        assert.equal(await box(s.p).locator('#rcInboxText').evaluate(x => parseFloat(getComputedStyle(x).fontSize)), 16);
      });
      await s.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await browser.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e && e.stack || e)); process.exit(1); });
