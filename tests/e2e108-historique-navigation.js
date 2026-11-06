// Lot S · historique de navigation : bouton Retour du navigateur (PC) et geste retour (iPhone, simulé ici par goBack ;
// le geste réel est vérifié par le propriétaire), entre les vues de l'app et le panneau Paramètres. Données fictives.
// Convention : la vue est gardée dans l'état de l'historique (history.state), l'URL n'est JAMAIS modifiée par l'app.
// Attendu : une entrée par changement de vue ou ouverture de panneau ; Retour = vue précédente ou fermeture du panneau ;
// depuis la vue d'arrivée, aucune boucle ; rechargement sur une vue sans erreur ; seul l'identifiant de vue dans l'URL.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
const AT = '2026-11-16T07:00:00+01:00';
let n = 0; const findings = [];
const expect = (label, ok, detail) => { if (ok) { n++; console.log('✅ ' + label); } else { findings.push(label + ' · ' + String(detail || '').slice(0, 400)); console.log('❌ ' + label + ' · ' + String(detail || '').slice(0, 400)); } };
const where = p => p.evaluate(() => ({ view: UI.view, search: location.search, hash: location.hash, len: history.length, settings: !!(document.getElementById('settings') || {}).open, state: history.state }));
const tapView = async (p, v) => { await p.evaluate(() => scrollTo(0, 0)); await p.locator(`#viewSeg [data-act=view][data-v=${v}]`).first().click(); await p.waitForTimeout(300); };
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['pc', 'iphone']) {
      const s = await session(b, { at: AT, dev }), p = s.p; await s.settle(6);
      const w0 = await where(p);
      // Arrivée : l'URL chargée n'est JAMAIS réécrite (un rechargement vise exactement la même adresse) ; seul l'état est posé.
      expect(`${dev} · arrivée : URL inchangée (aucune réécriture au chargement), état d’historique posé`, w0.search === '' && w0.state && w0.state.rc === 1 && w0.state.vue === w0.view, JSON.stringify(w0));
      // Changement de vue AUTOMATIQUE (affectation sans geste, comme au démarrage) : replaceState, aucune entrée, URL inchangée.
      const auto = w0.view === 'meteo' ? 'pneus' : 'meteo';
      await p.evaluate(v => { UI.view = v; renderAll(); }, auto); await s.settle(2); const wa = await where(p);
      expect(`${dev} · changement de vue automatique : aucune entrée d’historique, URL inchangée, état corrigé (replaceState)`, wa.len === w0.len && wa.search === '' && wa.state && wa.state.vue === auto, JSON.stringify(wa));
      // Rechargement après ce changement AUTOMATIQUE : la vue affichée d'office n'est pas restaurée (seul un choix l'est),
      // règle de main : dernière vue CHOISIE de la session (rc.tab), sinon Pneus.
      const mainRule = await p.evaluate(() => { const v = sessionStorage.getItem('rc.tab'); return ['meteo', 'trajet', 'garage', 'analyse'].includes(v) ? v : 'pneus'; });
      await p.reload(); await s.settle(10); const wr = await where(p);
      expect(`${dev} · rechargement après un changement automatique (${auto}) : vue selon la règle de main (${mainRule}), aucun choix inventé`, wr.view === mainRule && wr.search === '' && wr.state && !wr.state.pick && wr.len === w0.len, JSON.stringify(wr));
      await p.evaluate(v => { UI.view = v; renderAll(); }, w0.view); await s.settle(2);
      const home = w0.view, len0 = w0.len;
      const a = home === 'garage' ? 'meteo' : 'garage', c = 'trajet';
      await tapView(p, a); const w1 = await where(p);
      expect(`${dev} · changement de vue → une entrée d’historique (${home} → ${a}), état seul, URL inchangée`, w1.view === a && w1.len === len0 + 1 && w1.search === '' && w1.state && w1.state.vue === a, JSON.stringify(w1));
      await tapView(p, c); const w2 = await where(p);
      expect(`${dev} · second changement de vue → une entrée de plus`, w2.view === c && w2.len === len0 + 2, JSON.stringify(w2));
      await p.locator('#settings > summary').click(); await p.waitForTimeout(300); const w3 = await where(p);
      expect(`${dev} · ouverture du panneau Paramètres → une entrée, URL inchangée (aucune donnée)`, w3.settings && w3.len === len0 + 3 && w3.search === '' && w3.state && w3.state.panel === 'settings', JSON.stringify(w3));
      await p.goBack(); await p.waitForTimeout(300); const b1 = await where(p);
      expect(`${dev} · Retour : ferme le panneau, reste sur la vue`, !b1.settings && b1.view === c, JSON.stringify(b1));
      await p.goBack(); await p.waitForTimeout(300); const b2 = await where(p);
      expect(`${dev} · Retour : vue précédente (${a})`, b2.view === a && b2.search === '' && b2.state && b2.state.vue === a, JSON.stringify(b2));
      await p.goBack(); await p.waitForTimeout(300); const b3 = await where(p);
      expect(`${dev} · Retour : vue d’arrivée (${home}), URL d’arrivée retrouvée`, b3.view === home && b3.search === '', JSON.stringify(b3));
      // Depuis la vue d'arrivée : Retour quitte l'app (page précédente), aucune entrée ajoutée, pas de boucle.
      await p.goBack().catch(() => {}); await p.waitForTimeout(500);
      const left = await p.evaluate(() => location.href);
      expect(`${dev} · depuis la vue d’arrivée : Retour quitte l’app, aucune boucle`, !/race-control/.test(left), left);
      await p.goForward(); await s.settle(8); const f1 = await where(p);
      expect(`${dev} · Suivant : retour dans l’app sur la vue d’arrivée, sans erreur`, f1.view === home, JSON.stringify(f1));
      await p.goForward(); await p.waitForTimeout(300); const f2 = await where(p);
      expect(`${dev} · Suivant encore : vue suivante (${a}) restaurée depuis l’état, URL inchangée`, f2.view === a && f2.search === '' && f2.state && f2.state.vue === a, JSON.stringify(f2));
      // Fermeture manuelle du panneau : l'entrée est consommée (Retour ne « ferme » pas deux fois).
      await tapView(p, a); await p.locator('#settings > summary').click(); await p.waitForTimeout(300);
      await p.evaluate(() => { scrollTo(0, 0); }); await p.locator('#settings > summary').click(); await p.waitForTimeout(500);
      const m1 = await where(p);
      expect(`${dev} · fermeture manuelle du panneau : l’entrée du panneau est consommée`, !m1.settings && m1.view === a && (!m1.state || m1.state.panel === null), JSON.stringify(m1));
      await p.goBack(); await p.waitForTimeout(300); const m2 = await where(p);
      expect(`${dev} · puis Retour : vue précédente directement`, m2.view === home, JSON.stringify(m2));
      // Rechargement sur une vue : même vue, aucune erreur, URL inchangée.
      await tapView(p, 'garage'); const before = errors.length;
      await p.reload(); await s.settle(12); const r1 = await where(p);
      expect(`${dev} · rechargement après un geste vers Garage : vue Garage restaurée (état d’historique), URL inchangée, aucune erreur`, r1.view === 'garage' && r1.search === '' && r1.state && r1.state.vue === 'garage' && errors.length === before, JSON.stringify(r1) + ' · erreurs ' + errors.slice(before).join(' | '));
      // URL : l'app n'y ajoute rien, jamais une donnée (lieu, voiture, coordonnées) ; l'état ne porte que vue et panneau.
      const url = await p.evaluate(() => location.href), stKeys = Object.keys(r1.state || {}).sort().join(',');
      expect(`${dev} · URL : aucun paramètre ajouté par l’app ; état limité à vue, choix et panneau`, new URL(url).search === '' && stKeys === 'panel,pick,rc,vue', url + ' · ' + stKeys);
      // Paramètres étrangers et hash conservés tels quels (contrat de l'import de configuration : ?keep=1, #section=…).
      await p.evaluate(() => history.replaceState(history.state, '', location.pathname + '?keep=1#section=secSeason')); await tapView(p, 'trajet');
      const kept = await p.evaluate(() => ({ search: location.search, hash: location.hash, state: history.state }));
      expect(`${dev} · paramètres étrangers et hash conservés au changement de vue`, kept.search === '?keep=1' && kept.hash === '#section=secSeason' && kept.state && kept.state.vue === 'trajet', JSON.stringify(kept));
      await p.reload(); await s.settle(12); const k2 = await where(p);
      expect(`${dev} · rechargement avec paramètre étranger et fragment : même vue (trajet), adresse intacte`, k2.view === 'trajet' && k2.search === '?keep=1' && k2.hash === '#section=secSeason', JSON.stringify(k2));
      // Lien direct ?vue=garage (nouvelle ouverture, aucun état) : Garage, adresse laissée telle quelle.
      await p.goto(new URL('?vue=garage', await p.evaluate(() => location.href)).href); await s.settle(12); const d1 = await where(p);
      expect(`${dev} · lien direct ?vue=garage : vue Garage, URL non réécrite`, d1.view === 'garage' && d1.search === '?vue=garage' && d1.state && d1.state.vue === 'garage', JSON.stringify(d1));
      await s.c.close();
    }
  } finally { await b.close(); }
  if (errors.length) findings.push('erreurs de page : ' + errors.join(' | ').slice(0, 600));
  console.log(`\n${n} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
  if (findings.length) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('❌ ' + e.message); if (findings.length) console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); });
