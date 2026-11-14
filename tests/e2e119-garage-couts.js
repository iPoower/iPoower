// Garage · coûts et pleins (reprise de #231), iPhone et PC, moteurs réels, app déverrouillée avec la clé de TEST.
// Saisie réelle dans l'onglet Garage : références, pleins et dépenses, chiffres affichés, refus d'une saisie invalide sans rien modifier,
// conservation après rechargement, données jamais en clair dans le stockage brut, retrait mémorisé, comparatif, aucune page plus large que l'écran.
// Voitures du préréglage fictif (Voiture test A et B) ; montants et dates fictifs.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
let n = 0, stage = '';
const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
const CAR = 'carA';
const panel = p => p.locator(`#secGarage .garage-economics[data-garage-economics="${CAR}"]`);
const status = p => panel(p).locator('.econ-status').innerText();
const text = async p => (await panel(p).innerText()).replace(/\s+/g, ' ');
async function openGarage(s, dev) {
  const tab = s.p.locator('#viewSeg [data-act=view][data-v=garage]');
  if (dev === 'iphone') await tab.tap(); else await tab.click();
  await s.settle(3);
  if (!await panel(s.p).evaluate(d => d.open)) await panel(s.p).locator('summary').click();
  await s.settle(2);
}
async function addExpense(s, { date, category, amount, km = '', litres = '', fuelType = null, full = false, note = '' }) {
  const f = panel(s.p).locator('form[data-econ-add]');
  await f.locator('input[name=date]').fill(date); await f.locator('select[name=category]').selectOption(category);
  await f.locator('input[name=amount]').fill(amount); await f.locator('input[name=km]').fill(km); await f.locator('input[name=note]').fill(note);
  if (category === 'fuel') {
    await f.locator('input[name=litres]').fill(litres);
    if (fuelType) await f.locator('select[name=fuelType]').selectOption(fuelType);
    if (full) await f.locator('input[name=fullTank]').check();
  }
  await f.locator('button[type=submit]').click(); await s.settle(3);
}
const stored = p => p.evaluate(car => { const c = S.cars.find(x => x.id === car); return JSON.parse(JSON.stringify(c.economics || null)); }, CAR);
(async () => {
  const browser = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(browser, { at: '2026-04-01T10:00:00+02:00', dev });
      s.p.on('dialog', d => d.accept());
      await openGarage(s, dev);
      await check(dev + ' · volet « Coût & rentabilité » dans la fiche, vide et honnête (aucun chiffre inventé)', async () => {
        const t = await text(s.p);
        assert.match(t, /Prix d’achat non renseigné : aucun amortissement calculé/); assert.match(t, /Aucune dépense saisie/);
        assert.doesNotMatch(t, /\d+,\d{2}\s?€\/mois/); assert.equal(await stored(s.p), null);
      });
      await check(dev + ' · références enregistrées dans le coffre, amortissement net de la revente', async () => {
        const f = panel(s.p).locator('form[data-econ-ref]');
        await f.locator('input[name=price]').fill('4 000'); await f.locator('input[name=date]').fill('2026-01-10');
        await f.locator('input[name=odo]').fill('100000'); await f.locator('input[name=annual]').fill('12000'); await f.locator('input[name=resale]').fill('2000');
        await f.locator('button[type=submit]').click(); await s.settle(3);
        assert.match(await status(s.p), /Références enregistrées · enregistré dans le coffre/);
        assert.deepEqual((await stored(s.p)).ref, { purchasePriceCents: 400000, purchaseDate: '2026-01-10', purchaseOdometerKm: 100000, annualDistanceKm: 12000, estimatedResaleCents: 200000 });
        assert.match(await text(s.p), /Achat amorti · 5 ans\s?33,33\s?€\/mois/); assert.match(await text(s.p), /revente estimée déduite/);
        assert.equal(await panel(s.p).evaluate(d => d.open), true, 'volet resté ouvert après l’enregistrement');
      });
      await check(dev + ' · trois pleins et une assurance : prix moyen au litre et consommation entre pleins complets', async () => {
        await addExpense(s, { date: '2026-02-01', category: 'fuel', amount: '60', km: '101000', litres: '35,5', fuelType: 'diesel', full: true });
        await addExpense(s, { date: '2026-02-10', category: 'fuel', amount: '30', km: '101400', litres: '17,75' });
        await addExpense(s, { date: '2026-02-20', category: 'fuel', amount: '50', km: '102000', litres: '30', full: true });
        await addExpense(s, { date: '2026-03-01', category: 'insurance', amount: '45', note: 'Assurance fictive' });
        const t = await text(s.p);
        assert.match(await status(s.p), /Dépense ajoutée · enregistré dans le coffre/);
        assert.match(t, /Dépenses saisies\s?185,00\s?€/); assert.match(t, /Prix moyen payé\s?1,682 €\/L/); assert.match(t, /Conso\. entre pleins\s?4,78 L\/100 km/);
        assert.match(t, /Journal · 4 ligne\(s\)/); assert.match(t, /Assurance fictive/); assert.match(t, /1,690 €\/L/, 'prix au litre du premier ticket');
        assert.equal((await stored(s.p)).entries.length, 4);
      });
      await check(dev + ' · saisie invalide : erreur affichée, rien n’est ajouté', async () => {
        await addExpense(s, { date: '2026-03-05', category: 'tolls', amount: 'douze' });
        assert.match(await status(s.p), /Montant invalide/); assert.equal((await stored(s.p)).entries.length, 4);
        await addExpense(s, { date: '2026-03-06', category: 'fuel', amount: '20', full: true });
        assert.match(await status(s.p), /Plein complet : renseigne les litres et le compteur/); assert.equal((await stored(s.p)).entries.length, 4);
      });
      await check(dev + ' · jamais en clair dans le stockage brut (coffre chiffré)', async () => {
        await s.p.evaluate(() => window.TWRC_VAULT.flush());
        const raw = await s.p.evaluate(() => { const st = window.TWRC_RAW_STORAGE, out = []; for (let i = 0; i < st.length; i++) out.push(st.key(i) + '=' + st.getItem(st.key(i))); return out.join('\n'); });
        for (const secret of ['purchasePriceCents', 'Assurance fictive', '400000', 'amountCents']) assert.equal(raw.includes(secret), false, secret + ' trouvé en clair');
      });
      await check(dev + ' · rechargement : références et journal conservés', async () => {
        await s.p.reload(); await s.settle(14); await openGarage(s, dev);
        const e = await stored(s.p), t = await text(s.p);
        assert.equal(e.entries.length, 4); assert.equal(e.ref.purchasePriceCents, 400000); assert.match(t, /Journal · 4 ligne\(s\)/); assert.match(t, /1,682 €\/L/);
      });
      await check(dev + ' · retrait d’une dépense (confirmé) : disparaît, identifiant mémorisé, conservé au rechargement', async () => {
        const id = (await stored(s.p)).entries.find(x => x.category === 'insurance').id;
        await panel(s.p).locator(`button[data-act="econ-delete"][data-entry="${id}"]`).click(); await s.settle(3);
        let e = await stored(s.p);
        assert.match(await status(s.p), /Dépense retirée/); assert.equal(e.entries.length, 3); assert.deepEqual(e.removed, [id]);
        assert.match(await text(s.p), /Dépenses saisies\s?140,00\s?€/);
        await s.p.reload(); await s.settle(14); await openGarage(s, dev);
        e = await stored(s.p); assert.equal(e.entries.length, 3); assert.deepEqual(e.removed, [id]); assert.doesNotMatch(await text(s.p), /Assurance fictive/);
      });
      await check(dev + ' · comparatif des deux voitures affiché, « Voir le budget » ouvre le bon volet', async () => {
        const cmp = s.p.locator('#secGarage .econ-comparison');
        assert.equal(await cmp.count(), 1); const t = (await cmp.innerText()).replace(/\s+/g, ' ');
        assert.match(t, /Test A/); assert.match(t, /Test B/); assert.match(t, /4 000,00\s?€/);
        await panel(s.p).locator('summary').click(); await s.settle(1);
        await cmp.locator(`[data-act="econ-open"][data-car="${CAR}"]`).click(); await s.settle(2);
        assert.equal(await panel(s.p).evaluate(d => d.open), true);
      });
      await check(dev + ' · aucune page plus large que l’écran, champs de saisie à 16 px (pas de zoom sur iPhone)', async () => {
        const r = await s.p.evaluate(() => ({ w: document.scrollingElement.scrollWidth, vw: innerWidth,
          small: [...document.querySelectorAll('#secGarage .econ-field input, #secGarage .econ-field select')].filter(x => parseFloat(getComputedStyle(x).fontSize) < 16).length }));
        assert.ok(r.w <= r.vw, JSON.stringify(r)); assert.equal(r.small, 0, JSON.stringify(r));
      });
      await s.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await browser.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e && e.stack || e)); process.exit(1); });
