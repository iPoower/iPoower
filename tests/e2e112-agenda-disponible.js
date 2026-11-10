// Lot 2 (passe Clara R2) · Agenda (iPhone et PC, moteurs réels) :
//  R2-03 : un rendez-vous « Disponible » (free: true, publié par le relais depuis TRANSP:TRANSPARENT) n'a aucun trajet,
//          sauf #trajet ; il est compté dans le pied de l'agenda ; « Occupé » (sans champ) garde son trajet.
//  R2-04 : le message #direct cite le même point de départ que la ligne « ALLER », y compris après un départ choisi dans l'app.
// Agenda fictif du harnais, re-chiffré avec la clé de test : seuls le statut et le mode de deux rendez-vous changent.
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { seal, tryUnseal } = require('../tools/keys.js');
const PW = fs.readFileSync('.passphrase', 'utf8').trim();
const SRC = process.env.SP, SP = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e112-'));
fs.cpSync(SRC, SP, { recursive: true });
const base = tryUnseal(JSON.parse(fs.readFileSync(path.join(SRC, 'cal.fake.json'), 'utf8')), PW.toLowerCase());
assert(base && Array.isArray(base.events), 'agenda fictif lisible avec la clé de test');
const routable = base.events.filter(e => e.lat != null && (e.legs || []).some(l => l.k === 'go') && e.mode !== 'pasdetrajet' && e.s >= '2026-10-03');
const allDay = base.events.find(e => e.allDay && e.lat != null && (e.legs || []).length && e.mode !== 'pasdetrajet');
const target = routable.filter(e => !e.allDay)[0], direct = routable.find(e => e !== target && e.s.slice(0, 10) !== target.s.slice(0, 10) && e.legs.find(l => l.k === 'go').fromKind === 'home');
assert(target && direct && allDay, 'rendez-vous fictifs localisés avec trajet (horaires et toute la journée) existent');
const write = (patch, patchDirect = {}) => fs.writeFileSync(path.join(SP, 'cal.fake.json'), JSON.stringify(seal({ ...base,
  events: base.events.map(e => e.id === target.id ? { ...e, ...patch } : e.id === direct.id ? { ...e, ...patchDirect } : e.id === allDay.id ? { ...e, free: true } : e) }, PW.toLowerCase())));
process.env.SP = SP;
const { BR, session, errors } = require('./lib/context-session');
let n = 0, stage = '';
const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
const state = (p, id) => p.evaluate(id => {
  const e = (CAL && CAL.events || []).find(x => x.id === id), sec = document.getElementById('secCal');
  return { mode: e && e.mode, available: !!(e && e.available), listed: !!(sec && sec.querySelector(`.cal-e[data-event-id="${id}"]`)),
    legs: e ? effLegs(e).length : null, note: sec ? sec.textContent : '', trips: (APP_CONTEXT.trips || []).filter(t => String(t.key || '').includes(id)).length };
}, id);
// Message #direct et ligne « ALLER » du même rendez-vous, tels qu'affichés.
const directText = (p, id) => p.evaluate(id => {
  const e = CAL.events.find(x => x.id === id), go = effLegs(e).find(l => l.k === 'go'), alt = altHtml(e).replace(/<[^>]+>/g, ''), leg = go ? legHtml(go, e).replace(/<[^>]+>/g, ' ') : '';
  const aller = (/(?:🏠|📍) (depuis [^\n]+?)\s{2,}/.exec(leg + '  ') || [])[1] || null, msg = (/aller calculé (depuis [^.]+)\./.exec(alt) || [])[1] || null;
  return { alt, aller, msg, pending: !!(go && go.originPending), from: go && go.fromKind };
}, id);
(async () => {
  const browser = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      write({ free: true }, { mode: 'direct' });
      let s = await session(browser, { at: '2026-10-02T18:00:00+02:00', dev });
      await check(dev + ' · R2-03 · « Disponible » : aucun trajet, compté dans le pied de l’agenda', async () => {
        await s.p.evaluate(() => { UI.view = 'pneus'; renderAll(); }); await s.settle(4);
        const r = await state(s.p, target.id);
        assert.equal(r.mode, 'pasdetrajet'); assert.equal(r.available, true);
        assert.equal(r.listed, false, 'aucune carte trajet'); assert.equal(r.legs, 0, 'ni aller ni retour'); assert.equal(r.trips, 0, 'aucun trajet construit');
        assert.match(r.note, /1 rendez-vous « Disponible » : pas un trajet\. Ajoute #trajet au titre pour en faire un\./);
        assert.doesNotMatch(r.note, /rendez-vous ignorés \(#pasdetrajet/, 'compté sous son propre motif');
      });
      await check(dev + ' · R2-03 · « toute la journée » marqué Disponible : trajet conservé, non compté', async () => {
        const r = await state(s.p, allDay.id);
        assert.notEqual(r.mode, 'pasdetrajet'); assert.equal(r.available, false); assert.ok(r.legs > 0, 'aller/retour conservés');
      });
      await check(dev + ' · R2-04 · #direct sans rendez-vous précédent : même départ que la ligne « ALLER »', async () => {
        const d = await directText(s.p, direct.id);
        assert.equal(d.from, 'home'); assert.ok(d.msg && d.aller, JSON.stringify(d)); assert.equal(d.msg, d.aller);
      });
      await check(dev + ' · R2-04 · départ choisi dans l’app (travail) : le message ne cite plus le domicile', async () => {
        await s.p.evaluate(id => { const e = CAL.events.find(x => x.id === id);
          S.calOrigins = CalendarOrigin.update(S.calOrigins, TripCancel.eventId(e), 'go', { kind: 'saved', placeId: 'work' }, TripCancel.eventExpiration(e, Date.now())); renderAll(); }, direct.id);
        await s.settle(6);
        const d = await directText(s.p, direct.id);
        assert.notEqual(d.from, 'home', JSON.stringify(d));
        assert.doesNotMatch(d.alt, /depuis le domicile/, 'le plan du relais (domicile) n’est plus cité');
        if (d.msg || d.aller) assert.equal(d.msg, d.aller, JSON.stringify(d)); else assert.match(d.alt, /en cours de confirmation/);
      });
      await s.c.close();
      write({ free: true, mode: 'trajet' });
      s = await session(browser, { at: '2026-10-02T18:00:00+02:00', dev });
      await check(dev + ' · R2-03 · « Disponible » + #trajet : redevient un trajet', async () => {
        await s.p.evaluate(() => { UI.view = 'pneus'; renderAll(); }); await s.settle(4);
        const r = await state(s.p, target.id);
        assert.equal(r.mode, 'trajet'); assert.equal(r.available, false); assert.equal(r.listed, true); assert.ok(r.legs > 0);
        assert.doesNotMatch(r.note, /« Disponible »/);
      });
      await s.c.close();
      write({});
      s = await session(browser, { at: '2026-10-02T18:00:00+02:00', dev });
      await check(dev + ' · R2-03 · « Occupé » (aucun champ free) : comportement inchangé', async () => {
        await s.p.evaluate(() => { UI.view = 'pneus'; renderAll(); }); await s.settle(4);
        const r = await state(s.p, target.id);
        assert.equal(r.mode, target.mode); assert.equal(r.available, false); assert.equal(r.listed, true); assert.ok(r.legs > 0);
      });
      await s.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await browser.close(); fs.rmSync(SP, { recursive: true, force: true }); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e && e.stack || e)); process.exit(1); });
