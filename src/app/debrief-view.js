/* ---------- débrief d'arrivée : clôture unique, carte Pneus, Journal ----------
 * Le module pur est src/debrief.js (Debrief). Ici : la clôture des trajets et le rendu.
 * closeTrip() est le SEUL écrivain de done[key] pour une arrivée (invariant I1, docs/debrief.md).
 */
let DEBRIEF = Debrief.load(lsGet(Debrief.KEY), Date.now());
const DBF_UI = { open: null, hide: {}, worse: false, causes: [], saved: null };
const DBF_CAUSES = { fog: 'Brouillard / brume', rain: 'Pluie', wet: 'Route mouillée', slippery: 'Glissant / gel', wind: 'Vent', traffic: 'Trafic', temperature: 'Température', other: 'Autre' };
const DBF_LEVEL = { observation: 'observation', motif: 'motif possible', signal: 'signal', suggestion: 'suggestion de calibrage' };
function debriefStore(next) { DEBRIEF = next; lsSet(Debrief.KEY, Debrief.serialize(DEBRIEF)); }
// Mesures du trajet vivant, lues sans effet de bord (aucune écriture de la mémoire thermique).
function liveTripEvidence(key) {
  if (DEMO.on || !CX || !key || LIVE.key !== key) return null;
  const car = labCar(); if (!car || !hasTires(car)) return null;
  try { const inp = labInput(car), r = tyreLab(inp); return r && r.thermal && inp.drive ? { r, inp } : null; } catch (e) { return null; }
}
// Instantané : uniquement ce qui a été mesuré ou planifié ; le reste reste null (I4). Aucun titre ni coordonnée (I5).
function debriefSnapshot(t, how, fin, now) {
  const span = (a, b) => { const x = Date.parse(a), y = Date.parse(b); return Number.isFinite(x) && Number.isFinite(y) && y > x ? Math.round((y - x) / 60e3) : null; };
  const leg = t.l || null, td = t.td || null, d = fin && fin.inp && fin.inp.drive, r = fin && fin.r;
  const place = end => { try { const p = appTripPlace(t, end); return p && p.id || null; } catch (e) { return null; } };
  const km = v => Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
  return { tripKey: t.key, src: t.src, leg: (td && td.dir) || (leg && leg.k) || null, origin: place('from'), destination: place('to'),
    how: how === 'auto' ? 'auto' : 'confirmé', startedAt: d && Number.isFinite(d.startTs) ? d.startTs : null, endedAt: now,
    planned: { min: span(t.dep, t.arr), km: km(leg && leg.km) },
    observed: d ? { min: Number.isFinite(d.startTs) ? Math.round((now - d.startTs) / 60e3) : null, km: km(d.km), kmSrc: d.kmSrc } : null,
    thermal: r && r.thermal ? { range: r.thermal.range, s: r.thermal.s, confidence: r.confidence && r.confidence.level } : null,
    evidence: null };
}
// Point de clôture unique et idempotent : un trajet = une clôture = un débrief (I1, I2).
// Renvoie true seulement pour la première clôture du trajet.
function closeTrip(t, how, fin) {
  if (!t || !t.key) return false;
  const now = Date.now(), cur = USER_STORE.state.done[t.key], first = !(cur && cur.exp > now);
  if (first) liveDonePersist(t.key, how);
  if (!DEMO.on) {
    const res = Debrief.create(DEBRIEF, debriefSnapshot(t, how, fin || liveTripEvidence(t.key), now), now);
    if (res.created) debriefStore(res.state);
  }
  return first;
}
// « Annuler l'arrivée » : le débrief disparaît avec la clôture (I3). Sans effet s'il n'existe plus.
function debriefRevoke(key) { const r = Debrief.revoke(DEBRIEF, key, Date.now()); if (r.revoked) debriefStore(r.state); }

function debriefCurrent(now) {
  if (DBF_UI.saved && DEBRIEF.items[DBF_UI.saved]) return DEBRIEF.items[DBF_UI.saved];
  if (DBF_UI.open && DEBRIEF.items[DBF_UI.open] && !DEBRIEF.items[DBF_UI.open].feedback) return DEBRIEF.items[DBF_UI.open];
  const c = Debrief.card(DEBRIEF, now); return c && !DBF_UI.hide[c.tripKey] ? c : null;
}
const dbfName = r => r.src === 'work' ? (r.leg === 'ret' ? 'Retour domicile-travail' : 'Aller domicile-travail') : r.leg === 'ret' ? 'Retour de rendez-vous' : 'Rendez-vous agenda';
function renderDebrief() {
  const el = $('#secDbf'); if (!el) return;
  const now = Date.now(), r = UI.view === 'pneus' && LIVE.phase !== 'active' ? debriefCurrent(now) : null;
  if (!r) { if (!el.hidden) { el.hidden = true; el.innerHTML = ''; } return; }
  el.hidden = false;
  const tile = (k, v, n) => `<div class="mt"><span class="k">${k}</span><span class="v">${v}</span>${n ? `<span class="n">${n}</span>` : ''}</div>`;
  const p = r.planned || {}, o = r.observed || {}, th = r.thermal, dash = '—';
  const dmin = o.min != null && p.min != null ? o.min - p.min : null;
  const tiles = tile('Durée', o.min != null ? o.min + ' min' : dash, p.min != null ? 'prévu ' + p.min + ' min' + (dmin ? ` (${dmin > 0 ? '+' : '−'}${Math.abs(dmin)})` : '') : '')
    + tile('Distance', o.km != null ? String(o.km).replace('.', ',') + ' km' : dash, o.km != null ? (o.kmSrc === 'route' ? 'sur l’itinéraire' : 'estimée') : 'non mesurée')
    + (th ? tile('Pneus à l’arrivée', th.range ? `${th.range[0]} à ${th.range[1]} °C` : dash, ['Pneu froid', 'Sous la plage favorable', 'Fenêtre favorable', 'Chaud', 'Très chaud'][th.s] || '') : '');
  const head = `<div class="mod-h"><h2>🏁 Débrief · ${esc(dbfName(r))}</h2><span class="src">arrivée ${hmLocal(r.endedAt)}</span></div>`;
  const measured = r.observed || r.thermal ? `<div class="metrics">${tiles}</div>` : '<p class="sub">Arrivée confirmée a posteriori : aucune mesure du trajet (rien n’est estimé à sa place).</p>';
  let body;
  if (DBF_UI.saved === r.tripKey && r.feedback) {
    const f = r.feedback, msg = f.verdict === 'expected' ? 'Conforme au verdict.' : f.verdict === 'better' ? 'Plus clément que prévu : noté.'
      : 'Noté : ' + f.causes.map(c => DBF_CAUSES[c]).join(', ') + '. Une observation seule ne change aucun seuil.';
    body = `<div class="dbf-ok" role="status"><b>Débrief enregistré</b><span>${esc(msg)}</span><span class="sub">Stocké sur ce téléphone, sans aucune position.</span></div>
      <div class="dbf-row"><button class="btn sm" data-act="dbf-close">Fermer</button></div>`;
  } else {
    const v = k => `<button class="btn${DBF_UI.worse && k === 'worse' ? ' pri' : ''}" data-act="dbf-verdict" data-v="${k}">${{ better: 'Mieux', expected: 'Comme prévu', worse: 'Pire' }[k]}</button>`;
    const causes = DBF_UI.worse ? `<p class="sub">Qu’est-ce qui était pire ?</p><div class="chips dbf-causes">${Debrief.CAUSES.map(c => `<button class="chip" data-act="dbf-cause" data-c="${c}" aria-pressed="${DBF_UI.causes.includes(c)}">${DBF_CAUSES[c]}</button>`).join('')}</div>
      <div class="dbf-row"><button class="btn pri" data-act="dbf-save"${DBF_UI.causes.length ? '' : ' disabled'}>Enregistrer</button></div>` : '';
    body = `<h3 class="dbf-q">Et sur la route, c’était…</h3><div class="dbf-v">${v('better')}${v('expected')}${v('worse')}</div>${causes}
      <div class="dbf-row"><button class="btn sm" data-act="dbf-later">Plus tard</button></div>`;
  }
  el.innerHTML = head + measured + body;
}
function debriefRerender() { renderDebrief(); renderJournal(); }
function debriefAnswer(verdict, causes) {
  const key = (debriefCurrent(Date.now()) || {}).tripKey; if (!key) return;
  const r = Debrief.answer(DEBRIEF, key, verdict, causes, Date.now()); if (!r.ok) return;
  debriefStore(r.state); Object.assign(DBF_UI, { saved: key, open: null, worse: false, causes: [] }); debriefRerender();
}
function debriefAction(a, t) {
  if (a === 'dbf-verdict') { if (t.dataset.v === 'worse') { DBF_UI.worse = true; debriefRerender(); } else debriefAnswer(t.dataset.v, []); }
  else if (a === 'dbf-cause') { const c = t.dataset.c, i = DBF_UI.causes.indexOf(c); if (i >= 0) DBF_UI.causes.splice(i, 1); else if (Debrief.CAUSES.includes(c)) DBF_UI.causes.push(c); debriefRerender(); }
  else if (a === 'dbf-save') debriefAnswer('worse', DBF_UI.causes);
  else if (a === 'dbf-later') { const c = debriefCurrent(Date.now()); if (c) DBF_UI.hide[c.tripKey] = 1; Object.assign(DBF_UI, { open: null, worse: false, causes: [] }); debriefRerender(); }
  else if (a === 'dbf-close') { DBF_UI.saved = null; debriefRerender(); }
  else if (a === 'dbf-open') { const k = t.dataset.key; if (DEBRIEF.items[k]) { Object.assign(DBF_UI, { open: k, saved: null, worse: false, causes: [] }); delete DBF_UI.hide[k];
    if (UI.view !== 'pneus') { UI.view = 'pneus'; lsSet('twrc.view', UI.view); renderAll(); } else debriefRerender();
    const el = $('#secDbf'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); } }
}
// Bloc du Journal de saison : historique, conformité et motifs (un rapport, jamais une règle : I7).
function debriefJournalHtml() {
  const now = Date.now(), list = Debrief.journal(DEBRIEF, now); if (!list.length) return '';
  const s = Debrief.summary(DEBRIEF), pats = Debrief.patterns(DEBRIEF);
  const st = { answered: '', pending: 'à répondre', toComplete: 'à compléter' };
  const verdict = r => r.feedback ? { better: 'Mieux', expected: 'Comme prévu', worse: 'Pire · ' + r.feedback.causes.map(c => DBF_CAUSES[c]).join(', ') }[r.feedback.verdict] : st[r.status];
  const rows = list.slice(0, 10).map(r => `<li class="dbf-li ${r.feedback ? 'v-' + r.feedback.verdict : 'v-none'}"><span>${esc(dbfName(r))}</span><span class="sub">${esc(verdict(r))}</span>
    <span class="sub">${fmtDay(localTs(r.endedAt).slice(0, 10))} ${hmLocal(r.endedAt)}</span>${r.feedback ? '' : `<button class="btn sm" data-act="dbf-open" data-key="${esc(r.tripKey)}">Compléter</button>`}</li>`).join('');
  const pat = pats.length ? `<ul class="dbf-pats">${pats.map(p => `<li><b>${esc(DBF_CAUSES[p.cause])}</b> · ${p.n} cas · ${DBF_LEVEL[p.level]}</li>`).join('')}</ul>` : '';
  return `<div class="dbf-j"><h3>Débriefs des trajets</h3>
    <p class="sub">${s.expected} comme prévu · ${s.worse} pire · ${s.better} mieux${s.unanswered ? ' · ' + s.unanswered + ' sans réponse' : ''}${s.conformity != null ? ' · verdict conforme ' + s.conformity + ' %' : ''}</p>
    ${pat}<ul class="dbf-list">${rows}</ul>
    <p class="disc">1 cas = observation, 2 = motif possible, 3 à 4 = signal, 5 et plus = suggestion de calibrage. Aucun seuil ne change automatiquement. Stocké sur ce téléphone uniquement, sans position.</p></div>`;
}
