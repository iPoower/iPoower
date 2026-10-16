'use strict';
// Contrôle des vrais gestionnaires UI, sans écrire un profil ni une clé réelle.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const T = Date.parse('2026-10-16T12:00:00Z');
function fixture(mode = 'vault', recovery = false, failure = null) {
  const alerts = [], c = { Uint8Array, crypto: require('node:crypto').webcrypto, Date: class extends Date { static now() { return T; } },
    window: { alert: message => alerts.push(message) }, DayContext: { endOfDay: () => T + 86400000 } };
  vm.createContext(c);
  vm.runInContext(['journal-archive', 'debrief', 'app/debrief-view'].map(f => fs.readFileSync(path.join(__dirname, '../src/' + f + '.js'), 'utf8')).join('\n') + `
    USER_STORE = { state: { debrief: Debrief.close(null, { key: 'trajet-fictif', how: 'confirmé' }, ${T}) }, durability: () => ({ status: 'durable' }) };
    appAction = fn => fn(); renderDebrief = () => {};
    DEBRIEF_FORM = { key: 'trajet-fictif', conditions: ['wet'], grip: 'normal' };
    this.inspect = () => ({ journal: JSON.stringify(USER_STORE.state.debrief), form: DEBRIEF_FORM });
    this.actions = [debriefSave, debriefLater, debriefSnooze];
  `, c);
  c.window.TWRC_VAULT = { mode, journalNeedsRecovery: recovery, error: null, pendingWrites: false,
    async flush() { if (failure === 'throw') throw new Error('Stockage fictif refusé'); if (failure) this.error = 'Quota fictif'; } };
  return { c, alerts };
}
module.exports = (async () => {
  for (const [mode, recovery] of [['plain', false], ['vault', true]]) for (let i = 0; i < 3; i++) {
    const { c, alerts } = fixture(mode, recovery), before = c.inspect();
    await c.actions[i]();
    assert.equal(c.inspect().journal, before.journal, 'lecture seule : aucune mutation même en mémoire');
    assert.equal(c.inspect().form, before.form, 'lecture seule : formulaire conservé');
    assert.equal(alerts.length, 1, 'le refus doit être explicite pour chaque action');
    assert.match(alerts[0], /copie de récupération/);
  }
  console.log('✅ actions journal : Enregistrer / Plus tard / silence quotidien refusés sur les deux profils en lecture seule');
  for (const failure of ['quota', 'throw']) for (let i = 0; i < 3; i++) {
    const { c, alerts } = fixture('vault', false, failure), before = c.inspect();
    await c.actions[i]();
    assert.equal(c.inspect().form, before.form, 'échec durable : aucune fermeture de confirmation');
    assert.match(alerts[0], /non enregistrée durablement/);
  }
  console.log('✅ actions journal : quota et exception de stockage gardent le formulaire et signalent l’échec');
  for (let i = 0; i < 3; i++) {
    const { c, alerts } = fixture(); let release;
    c.window.TWRC_VAULT.flush = () => new Promise(resolve => { release = resolve; });
    const before = c.inspect(), pending = c.actions[i]();
    assert.equal(c.inspect().form, before.form, 'aucun succès avant la fin de la vérification');
    await c.actions[i](); // Un second clic ne lance pas une autre transaction.
    release(); await pending;
    assert.equal(c.inspect().form, null); assert.equal(alerts.length, 0);
    const journal = JSON.parse(c.inspect().journal);
    assert(i === 0 ? journal.entries[0].feedback : i === 1 ? journal.entries[0].deferred : journal.quietUntil > T);
  }
  console.log('✅ actions journal : confirmation uniquement après flush ; doubles clics ignorés pendant la vérification');
})().catch(e => { console.error('❌ actions journal : ' + e.stack); process.exitCode = 1; });
