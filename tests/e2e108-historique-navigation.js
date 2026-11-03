// Lot S · historique de navigation : bouton Retour du navigateur (PC) et geste retour (iPhone, simulé ici par goBack ;
// le geste réel est vérifié par le propriétaire), entre les vues de l'app et le panneau Paramètres. Données fictives.
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
      expect(`${dev} · arrivée : URL = identifiant de vue seul (${w0.search})`, /^\?vue=(pneus|meteo|trajet|garage|analyse)$/.test(w0.search) && w0.search === '?vue=' + w0.view, JSON.stringify(w0));
      const home = w0.view, len0 = w0.len;
      const a = home === 'garage' ? 'meteo' : 'garage', c = 'trajet';
      await tapView(p, a); const w1 = await where(p);
      expect(`${dev} · changement de vue → une entrée d’historique (${home} → ${a})`, w1.view === a && w1.len === len0 + 1 && w1.search === '?vue=' + a, JSON.stringify(w1));
      await tapView(p, c); const w2 = await where(p);
      expect(`${dev} · second changement de vue → une entrée de plus`, w2.view === c && w2.len === len0 + 2, JSON.stringify(w2));
      await p.locator('#settings > summary').click(); await p.waitForTimeout(300); const w3 = await where(p);
      expect(`${dev} · ouverture du panneau Paramètres → une entrée, URL inchangée (aucune donnée)`, w3.settings && w3.len === len0 + 3 && w3.search === '?vue=' + c && w3.state && w3.state.panel === 'settings', JSON.stringify(w3));
      await p.goBack(); await p.waitForTimeout(300); const b1 = await where(p);
      expect(`${dev} · Retour : ferme le panneau, reste sur la vue`, !b1.settings && b1.view === c, JSON.stringify(b1));
      await p.goBack(); await p.waitForTimeout(300); const b2 = await where(p);
      expect(`${dev} · Retour : vue précédente (${a})`, b2.view === a && b2.search === '?vue=' + a, JSON.stringify(b2));
      await p.goBack(); await p.waitForTimeout(300); const b3 = await where(p);
      expect(`${dev} · Retour : vue d’arrivée (${home})`, b3.view === home && b3.search === '?vue=' + home, JSON.stringify(b3));
      // Depuis la vue d'arrivée : Retour quitte l'app (page précédente), aucune entrée ajoutée, pas de boucle.
      await p.goBack().catch(() => {}); await p.waitForTimeout(500);
      const left = await p.evaluate(() => location.href);
      expect(`${dev} · depuis la vue d’arrivée : Retour quitte l’app, aucune boucle`, !/race-control/.test(left), left);
      await p.goForward(); await s.settle(8); const f1 = await where(p);
      expect(`${dev} · Suivant : retour dans l’app sur la vue d’arrivée, sans erreur`, f1.view === home, JSON.stringify(f1));
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
      expect(`${dev} · rechargement sur ?vue=garage : vue Garage, aucune erreur`, r1.view === 'garage' && r1.search === '?vue=garage' && errors.length === before, JSON.stringify(r1) + ' · erreurs ' + errors.slice(before).join(' | '));
      // URL : jamais d'autre paramètre, jamais de donnée (lieu, voiture, coordonnées).
      const url = await p.evaluate(() => location.href);
      expect(`${dev} · URL : seul le paramètre vue`, [...new URL(url).searchParams.keys()].join(',') === 'vue' && !/lat|lon|car|lieu|\d{2}\.\d{3}/.test(new URL(url).search), url);
      await s.c.close();
    }
  } finally { await b.close(); }
  if (errors.length) findings.push('erreurs de page : ' + errors.join(' | ').slice(0, 600));
  console.log(`\n${n} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
  if (findings.length) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('❌ ' + e.message); if (findings.length) console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); });
