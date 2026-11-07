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
// Journal des écritures d'historique (survit aux rechargements) et compteur de navigations INTERNES au document
// (framenavigated sans chargement) : un rechargement donne une navigation ET un « load », une écriture d'historique
// une navigation seule.
const LOGGER = () => { const get = () => JSON.parse(sessionStorage.getItem('__nav') || '[]'), save = L => sessionStorage.setItem('__nav', JSON.stringify(L));
  for (const k of ['pushState', 'replaceState', 'back', 'forward', 'go']) { const f = history[k].bind(history); history[k] = (...a) => { const L = get(); L.push(k); save(L); return f(...a); }; }
  window.__navLog = get; window.__navReset = () => save([]); };
const PW = require('fs').readFileSync('.passphrase', 'utf8').trim();
const tapView = async (p, v) => { await p.evaluate(() => scrollTo(0, 0)); await p.locator(`#viewSeg [data-act=view][data-v=${v}]`).first().click(); await p.waitForTimeout(300); };
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['pc', 'iphone']) {
      const s = await session(b, { at: AT, dev }), p = s.p; await s.settle(6);
      await s.c.addInitScript(LOGGER); await p.evaluate(LOGGER);
      const calls = () => p.evaluate(() => window.__navLog()), reset = () => p.evaluate(() => window.__navReset());
      const nav = { frame: 0, load: 0 }; p.on('framenavigated', f => { if (f === p.mainFrame()) nav.frame++; }); p.on('load', () => { nav.load++; });
      const inDoc = () => nav.frame - nav.load;   // navigations internes au document depuis le début
      const w0 = await where(p);
      // Arrivée : ni l'URL ni l'historique ne sont écrits au chargement (comme main) ; l'entrée sera étiquetée au premier geste.
      expect(`${dev} · arrivée : URL inchangée, aucune écriture d’historique au chargement`, w0.search === '' && w0.state === null, JSON.stringify(w0));
      // Changement de vue AUTOMATIQUE (affectation sans geste, comme au démarrage) : aucune écriture d'historique, URL inchangée.
      const auto = w0.view === 'meteo' ? 'pneus' : 'meteo';
      await reset(); await p.evaluate(v => { UI.view = v; renderAll(); }, auto); await s.settle(2); const wa = await where(p), ca = await calls();
      expect(`${dev} · changement de vue automatique : aucune écriture d’historique (ni entrée, ni état), URL inchangée`, wa.len === w0.len && wa.search === '' && ca.length === 0, JSON.stringify({ wa, ca }));
      // Rechargement après ce changement AUTOMATIQUE : la vue affichée d'office n'est pas restaurée (seul un choix l'est),
      // règle de main : dernière vue CHOISIE de la session (rc.tab), sinon Pneus.
      const mainRule = await p.evaluate(() => { const v = sessionStorage.getItem('rc.tab'); return ['meteo', 'trajet', 'garage', 'analyse'].includes(v) ? v : 'pneus'; });
      await reset(); await p.reload(); await s.settle(10); const wr = await where(p), cr = await calls();
      expect(`${dev} · rechargement après un changement automatique (${auto}) : vue selon la règle de main (${mainRule}), aucun choix inventé, aucune écriture d’historique`, wr.view === mainRule && wr.search === '' && (!wr.state || !wr.state.pick) && wr.len === w0.len && cr.length === 0, JSON.stringify({ wr, cr }));
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
      await reset();
      await p.goto(new URL('?vue=garage', await p.evaluate(() => location.href)).href); await s.settle(12); const d1 = await where(p);
      expect(`${dev} · lien direct ?vue=garage : vue Garage, URL non réécrite, aucune écriture d’historique`, d1.view === 'garage' && d1.search === '?vue=garage' && (await calls()).length === 0, JSON.stringify(d1));
      // RÉGRESSION (PR #310, échec d'e2e64 en CI) : hors geste, l'app n'écrit JAMAIS dans l'historique, comme main ;
      // sinon une attente de navigation se résout sur l'ANCIEN document (page lue avant le vrai rechargement).
      // 1. Panneau ouvert par le code (e2e64 l'ouvre ainsi avant « Verrouiller ») : aucune écriture, aucune entrée.
      await reset(); const lenP = (await where(p)).len;
      await p.evaluate(() => { const d = document.getElementById('settings'); d.open = true; renderSettings(true); }); await s.settle(2);
      const wp = await where(p), cp = await calls();
      expect(`${dev} · panneau ouvert par le code : aucune écriture d’historique, aucune entrée`, wp.settings && wp.len === lenP && cp.length === 0, JSON.stringify({ len: wp.len, lenP, cp }));
      await p.evaluate(() => { document.getElementById('settings').open = false; }); await s.settle(2);
      // 2. Séquence EXACTE d'e2e64 « Verrouiller » (ouverture par le code puis, sans autre commande, attente + clic) :
      //    l'attente se résout sur le NOUVEAU document verrouillé (avant correctif : sur l'ancien, 20 fois sur 20).
      await reset(); const nav0 = inDoc();
      await p.evaluate(() => { window.__ancien = 1; const d = document.getElementById('settings'); d.open = true; renderSettings(true); });
      await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.locator('[data-act=lock]').click()]);
      // Lu IMMÉDIATEMENT après la résolution : le marqueur n'existe que dans l'ancien document.
      const ancienL = await p.evaluate(() => !!window.__ancien); await s.settle(8);
      const lk = { ancien: ancienL, locked: await p.evaluate(() => LOCKED()) };
      expect(`${dev} · Verrouiller (séquence d’e2e64) : l’attente se résout sur le nouveau document verrouillé, jamais sur l’ancien`, !lk.ancien && lk.locked === true, JSON.stringify(lk));
      expect(`${dev} · verrouillage : aucune navigation interne au document, aucune écriture d’historique`, inDoc() === nav0 && (await calls()).length === 0, JSON.stringify({ inDoc: inDoc() - nav0, calls: await calls() }));
      // 3. Séquence EXACTE d'e2e64 « bon code » : nouveau document déverrouillé, données fictives intactes, aucune navigation
      //    interne au document pendant le déverrouillage.
      await reset(); const nav1 = inDoc(); await p.evaluate(() => { window.__ancien = 1; });
      await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]);
      const ancienU = await p.evaluate(() => !!window.__ancien); await s.settle(8);
      const un = { ancien: ancienU, ...(await p.evaluate(() => ({ locked: LOCKED(), names: S.locs.map(l => l.name) }))) };
      expect(`${dev} · bon code (séquence d’e2e64) : nouveau document déverrouillé, lieux fictifs intacts`, !un.ancien && un.locked === false && JSON.stringify(un.names.slice(0, 2)) === JSON.stringify(['Maison test', 'Travail test']), JSON.stringify(un));
      expect(`${dev} · déverrouillage : aucune navigation interne au document, aucune écriture d’historique`, inDoc() === nav1 && (await calls()).length === 0, JSON.stringify({ inDoc: inDoc() - nav1, calls: await calls() }));
      await s.c.close();
      // 4. Mode sans code (appareil sans coffre : l'app reste « verrouillée » mais utilisable avec les réglages de l'utilisateur) :
      //    la navigation fonctionne, par gestes seulement ; aucune écriture d'historique hors geste.
      {
        const z = await session(b, { at: AT, dev, unlock: false }), q = z.p; await z.settle(6);
        await z.c.addInitScript(LOGGER); await q.evaluate(LOGGER);
        const zc = () => q.evaluate(() => window.__navLog()), zr = () => q.evaluate(() => window.__navReset());
        await zr(); const lenL = (await where(q)).len;
        await q.evaluate(() => scrollTo(0, 0)); await q.locator('[data-act=nocode]').first().click(); await z.settle(4);
        const n1 = await where(q), c1 = await zc();
        expect(`${dev} · mode sans code : le bouton ouvre les Paramètres (geste), une seule entrée, URL inchangée`, n1.settings && n1.len === lenL + 1 && n1.state && n1.state.panel === 'settings' && n1.search === '' && c1.filter(k => k === 'pushState').length === 1, JSON.stringify({ n1, c1 }));
        await q.goBack(); await z.settle(2); const n2 = await where(q);
        expect(`${dev} · mode sans code : Retour ferme le panneau`, !n2.settings, JSON.stringify(n2));
        const vB = n2.view === 'garage' ? 'meteo' : 'garage'; await tapView(q, vB); const n3 = await where(q);
        expect(`${dev} · mode sans code : changement de vue par geste = une entrée, URL inchangée`, n3.view === vB && n3.state && n3.state.vue === vB && n3.search === '', JSON.stringify(n3));
        await q.goBack(); await z.settle(2); const n4 = await where(q);
        expect(`${dev} · mode sans code : Retour revient à la vue précédente (${n2.view})`, n4.view === n2.view, JSON.stringify(n4));
        await q.goForward(); await z.settle(2); await zr(); await q.reload(); await z.settle(10); const n5 = await where(q);
        expect(`${dev} · mode sans code : rechargement = vue choisie (${vB}), toujours sans code, aucune écriture d’historique`, n5.view === vB && (await zc()).length === 0 && await q.evaluate(() => localStorage.getItem('twrc.nocode') === '1'), JSON.stringify(n5));
        await z.c.close();
      }
    }
  } finally { await b.close(); }
  if (errors.length) findings.push('erreurs de page : ' + errors.join(' | ').slice(0, 600));
  console.log(`\n${n} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
  if (findings.length) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('❌ ' + e.message); if (findings.length) console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); });
