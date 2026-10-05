/* ---------- diagnostic (observabilité) ---------- */
// FRESH ≤ 15 min (décision possible) · AGING ≤ 60 min (à confirmer) · STALE au-delà · UNAVAILABLE sans donnée
const freshState = ageMin => ageMin == null || !Number.isFinite(ageMin) ? 'UNAVAILABLE' : ageMin <= 15 ? 'FRESH' : ageMin <= 60 ? 'AGING' : 'STALE';
const ageOf = t => { const v = typeof t === 'number' ? t : Date.parse(t || ''); return Number.isFinite(v) ? Math.max(0, (Date.now() - v) / 60000) : null; };
const ageTxt = m => m == null ? '—' : m < 1 ? '< 1 min' : m < 90 ? Math.round(m) + ' min' : (m / 60).toFixed(1).replace('.', ',') + ' h';
const noUrl = t => String(t || '').replace(/https?:\S+/g, 'url').slice(0, 120);
let SWV = null;
async function loadSwVersion() {
  try {
    const ctl = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!ctl) { SWV = 'aucun (page non contrôlée)'; return; }
    const ch = new MessageChannel();
    SWV = await new Promise(res => { ch.port1.onmessage = e => res(e.data && e.data.static || 'inconnu'); setTimeout(() => res('sans réponse'), 1500); ctl.postMessage({ type: 'twrc-version' }, [ch.port2]); });
  } catch (e) { SWV = 'indisponible'; }
  renderDiag();
}
function diagRows(forCopy) {
  const r = RAW[UI.loc], wAge = r ? ageOf(r.t) : null, withData = allLocs().filter(l => RAW[l.id]).length;
  let n = 0, bytes = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^twrc\./.test(k)) { n++; bytes += k.length + (localStorage.getItem(k) || '').length; } } } catch (e) { /* stockage bloqué */ }
  const calAge = CAL ? ageOf(CAL.updated) : null, relayAge = ageOf(RELAY_AT);
  return [
    ['Application chargée', window.TWRC_BUILD ? `build ${window.TWRC_BUILD} · shell HTML/JS/CSS autonome` : 'version locale'],
    ['Version publiée', VER ? `prod-${VER.run} · ${String(VER.sha).slice(0, 7)} · métadonnées du serveur` : 'indisponible'],
    ['Service Worker', SWV || '…'],
    ['Contexte navigateur', `${window.isSecureContext ? 'sécurisé' : 'non sécurisé'} · ${(window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone ? 'PWA installée' : 'onglet navigateur'}`],
    ['Réseau', DEMO.on ? 'démo (aucune donnée réelle)' : offlineNow() ? 'hors ligne' : busy ? 'en ligne · actualisation en cours' : 'en ligne'],
    ['Dernière actualisation', lastOk ? `${hmLocal(lastOk)} (il y a ${ageTxt(ageOf(lastOk))})` : 'aucune réussie' + (lastTry ? ` · tentative ${hmLocal(lastTry)}` : '')],
    ['Météo du lieu affiché', r ? `${freshState(wAge)} · ${r.mode === 'live' ? 'LIVE' : r.mode === 'cache' ? 'cache' : r.mode} · ${ageTxt(wAge)}${ERR[UI.loc] ? ' · erreur : ' + noUrl(ERR[UI.loc]) : ''}` : 'UNAVAILABLE' + (ERR[UI.loc] ? ' · ' + noUrl(ERR[UI.loc]) : '')],
    ['Lieux avec météo', `${withData}/${allLocs().length}`],
    ['API météo', (() => { const p = WEATHER_REQUESTS.state(); return p.until > Date.now() ? `HTTP 429 · pause jusqu’à ${hmLocal(p.until)} · ${p.kind}` : `disponible · ${p.active}/2 requêtes actives · ${p.queued} en attente`; })()],
    ['Relais (obs.json)', RELAY_AT ? `${freshState(relayAge)} · ${ageTxt(relayAge)}${RELAY_ERR ? ' · erreur relais : ' + noUrl(RELAY_ERR) : ''}` : RELAY_SEEN ? 'UNAVAILABLE · obs.json sans horodatage' : 'non lu'],
    ['Agenda', CAL ? `${freshState(calAge)} · relais il y a ${ageTxt(calAge)} · ${CAL.events.length} événements${CAL.offline ? ' · copie locale du ' + hmLocal(CAL.cacheAt) : ''}` : CALDONE ? 'indisponible' : 'chargement…'],
    ['Stockage local', `${n} clés · ${Math.round(bytes / 1024)} Ko`],
    ...placeDiagRows(forCopy),
    ...(() => { const car = labCar(), st = car ? tyreStateOf(car) : null; if (!st) return [['Pneus (Analyse)', 'aucun véhicule']];
      const ax = a => `${a.model || 'modèle ?'} · ${a.size || 'dimension ?'} · DOT ${a.dot || '?'} · ${a.tread != null ? a.tread + ' mm' : 'profondeur ?'} · ${a.press != null ? a.press + ' bar' : 'pression ?'}`;
      return [['Véhicule (Analyse)', st.vehicle.name], ['Monte active', st.active ? st.active.label : 'inconnue'], ['Avant', ax(st.axles.front)], ['Arrière', ax(st.axles.rear)],
        ['Profil pneu', `${st.profile.kind} · ${st.profile.label}`], ['Données pneu', st.quality.map(q => q.st + ' ' + q.k).join(' · ')], ['Mémoire thermique', (() => { const h = ttLoad()[car.id]; return !h ? 'aucune' : tyreMemoryValid(h, st) ? `valide · ${h.at}` : 'ignorée (autre monte ou ancienne version)'; })()]]; })(),
    ['Moteur v2 (preuves)', (() => { const L = shadowLoad(), s2 = evidenceScore(L.map(e => ({ pred: e.v2, obs: e.obs }))), s1 = evidenceScore(L.map(e => ({ pred: e.v1, obs: e.obs })));
      return `mode ${EV_FLAG()} · ${L.length} entrées · vérités terrain ${s2.n} · faux négatifs v1 ${s1.fn} / v2 ${s2.fn} · faux positifs v1 ${s1.fp} / v2 ${s2.fp}`; })()],
    ['Trajet vivant', `${LIVE.phase}${FIX ? ` · dernier relevé GPS il y a ${ageTxt(ageOf(FIX.ts))} (${Number.isFinite(FIX.acc) ? '±' + Math.round(FIX.acc) + ' m' : 'précision inconnue'})` : ' · aucun relevé GPS'}`]
  ];
}
const diagHtml = () => diagRows().map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
const diagText = () => `Race Control · diagnostic du ${new Date().toISOString()}\n` + diagRows(true).map(([k, v]) => `${k} : ${v}`).join('\n');
function renderDiag() { const el = $('#diagBox'); if (el && $('#settings') && $('#settings').open) el.innerHTML = diagHtml(); }
// version en production (version.json écrit par le déploiement automatique : n° de mise en production, date, commit)
let VER = null;
const verLine = () => VER ? `En ligne : <b>prod-${esc(String(VER.run))}</b> du ${new Date(VER.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })} · commit <span class="mono">${esc(String(VER.sha).slice(0, 7))}</span> · ${VER.rollback ? '<b>retour arrière</b> après tests verts' : 'déployée après tests verts'}.` : 'Version de production : information indisponible.';
async function loadVersion() {
  if (VER || loadVersion.busy) return; loadVersion.busy = 1;
  try { const v = await fetchJSON('version.json?t=' + Date.now(), 6000); if (v && v.run && v.sha && v.at) { VER = v; const e = $('#verLine'); if (e) e.innerHTML = verLine(); } } catch (e) { /* pas encore publiée */ }
  loadVersion.busy = 0;
}
