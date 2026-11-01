// Agenda : une réservation non confirmée « [À réserver] » n'est pas un trajet par défaut (iPhone et PC, moteurs réels).
// Agenda fictif du harnais, re-chiffré avec la clé de test : seul le titre d'un rendez-vous est marqué. #trajet le rétablit.
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { seal, tryUnseal } = require('../tools/keys.js');
const PW = fs.readFileSync('.passphrase', 'utf8').trim();
// Copie des fixtures du run : l'agenda modifié ne touche jamais celui des autres suites.
const SRC = process.env.SP, SP = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e93-'));
fs.cpSync(SRC, SP, { recursive: true });
const base = tryUnseal(JSON.parse(fs.readFileSync(path.join(SRC, 'cal.fake.json'), 'utf8')), PW.toLowerCase());
assert(base && Array.isArray(base.events), 'agenda fictif lisible avec la clé de test');
const target = base.events.find(e => e.lat != null && (e.legs || []).length && e.mode !== 'pasdetrajet' && e.s >= '2026-10-03');
assert(target, 'un rendez-vous fictif localisé avec trajet existe');
const write = title => fs.writeFileSync(path.join(SP, 'cal.fake.json'), JSON.stringify(seal({ ...base,
  events: base.events.map(e => e.id === target.id ? { ...e, t: title, mode: /#trajet/.test(title) ? 'trajet' : e.mode } : e) }, PW.toLowerCase())));
process.env.SP = SP;
const { BR, session, errors } = require('./lib/context-session');
let n = 0, stage = '';
const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
const state = p => p.evaluate(id => {
  const e = (CAL && CAL.events || []).find(x => x.id === id), sec = document.getElementById('secCal');
  return { mode: e && e.mode, unconfirmed: !!(e && e.unconfirmed), listed: !!(sec && sec.querySelector(`.cal-e[data-event-id="${id}"]`)),
    note: sec ? sec.textContent : '', trips: (APP_CONTEXT.trips || []).filter(t => String(t.key || '').includes(id)).length };
}, target.id);
(async () => {
  const browser = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      write('[À réserver] Rendez-vous fictif');
      let s = await session(browser, { at: '2026-10-02T18:00:00+02:00', dev });
      await check(dev + ' · « [À réserver] » : pas un trajet, compté et expliqué', async () => {
        await s.p.evaluate(() => { UI.view = 'pneus'; renderAll(); }); await s.settle(4);
        const r = await state(s.p);
        assert.equal(r.mode, 'pasdetrajet'); assert.equal(r.unconfirmed, true);
        assert.equal(r.listed, false, 'aucune carte trajet pour la réservation non confirmée');
        assert.equal(r.trips, 0, 'aucun trajet construit pour la réservation non confirmée');
        assert.match(r.note, /1 réservation non confirmée \(\[À réserver\]\) : pas un trajet\. Ajoute #trajet au titre/);
      });
      await s.c.close();
      write('[À réserver] Rendez-vous fictif #trajet');
      s = await session(browser, { at: '2026-10-02T18:00:00+02:00', dev });
      await check(dev + ' · « [À réserver] » + #trajet : redevient un trajet', async () => {
        await s.p.evaluate(() => { UI.view = 'pneus'; renderAll(); }); await s.settle(4);
        const r = await state(s.p);
        assert.equal(r.mode, 'trajet'); assert.equal(r.unconfirmed, false);
        assert.equal(r.listed, true, 'carte trajet présente');
        assert.doesNotMatch(r.note, /réservation non confirmée/);
      });
      await s.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await browser.close(); fs.rmSync(SP, { recursive: true, force: true }); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e && e.stack || e)); process.exit(1); });
