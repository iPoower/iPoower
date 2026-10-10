/* ---------- diagnostic (observabilité) ---------- */
// FRESH ≤ 15 min (décision possible) · AGING ≤ 60 min (à confirmer) · STALE au-delà · UNAVAILABLE sans donnée
const freshState = ageMin => ageMin == null || !Number.isFinite(ageMin) ? 'UNAVAILABLE' : ageMin <= 15 ? 'FRESH' : ageMin <= 60 ? 'AGING' : 'STALE';
const ageOf = t => { const v = typeof t === 'number' ? t : Date.parse(t || ''); return Number.isFinite(v) ? Math.max(0, (Date.now() - v) / 60000) : null; };
const ageTxt = m => m == null ? '—' : m < 1 ? '< 1 min' : m < 90 ? Math.round(m) + ' min' : (m / 60).toFixed(1).replace('.', ',') + ' h';
const noUrl = t => String(t || '').replace(/https?:\S+/g, 'url').slice(0, 120);
const weatherIncidentText = () => {
  const rows = WEATHER_REQUESTS.incidents(), names = { network: 'panne réseau', timeout: 'délai dépassé', http: 'erreur HTTP',
    'invalid-json': 'JSON illisible', 'invalid-response': 'réponse invalide', 'quota-minute': 'quota par minute', 'quota-hour': 'quota horaire',
    'quota-day': 'quota journalier', 'quota-concurrent': 'trop de requêtes simultanées', 'quota-limited': 'quota fournisseur' };
  return rows.length ? `${rows.length}/20 échecs conservés · ${rows.slice(-5).reverse().map(x =>
    `${new Date(x.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Paris' })} · ${names[x.kind]}${x.status ? ' (HTTP ' + x.status + ')' : ''} · appel ${x.durationMs < 1000 ? x.durationMs + ' ms' : Math.ceil(x.durationMs / 1000) + ' s'}`).join(' ; ')}`
    : 'aucun échec enregistré · historique local des appels, sans URL ni coordonnées';
};
let SWV = null, VER_CHECK_AT = 0, VERSION_COHERENCE = 'unknown';
async function loadSwVersion() {
  try {
    const ctl = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!ctl) { SWV = 'aucun (page non contrôlée)'; return; }
    const ch = new MessageChannel();
    SWV = await new Promise(res => { ch.port1.onmessage = e => res(e.data && e.data.static || 'inconnu'); setTimeout(() => res('sans réponse'), 1500); ctl.postMessage({ type: 'twrc-version' }, [ch.port2]); });
  } catch (e) { SWV = 'indisponible'; }
  renderDiag();
}
function calendarDiagText() {
  if (CAL) return `${freshState(ageOf(CAL.updated))} · relais il y a ${ageTxt(ageOf(CAL.updated))} · ${CAL.events.length} événements${CAL.offline ? ' · copie locale du ' + hmLocal(CAL.cacheAt) : ''}`;
  if (!lsGet('twrc.key')) return 'verrouillé · déverrouille la configuration pour lire l’agenda';
  if (location.protocol !== 'https:' || !crypto.subtle) return 'indisponible · contexte sécurisé nécessaire';
  return CALDONE ? 'indisponible' : 'chargement…';
}
function diagRows(forCopy) {
  const r = RAW[UI.loc], wAge = r ? ageOf(r.t) : null, withData = allLocs().filter(l => RAW[l.id]).length;
  let n = 0, bytes = 0; try { for (let i = 0; i < APP_STORAGE.length; i++) { const k = APP_STORAGE.key(i); if (/^twrc\./.test(k)) { n++; bytes += k.length + (APP_STORAGE.getItem(k) || '').length; } } } catch (e) { /* stockage bloqué */ }
  const relayAge = ageOf(RELAY_AT);
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
    ['Derniers incidents météo', weatherIncidentText()],
    ['Relais (obs.json)', RELAY_AT ? `${freshState(relayAge)} · ${ageTxt(relayAge)}${RELAY_ERR ? ' · erreur relais : ' + noUrl(RELAY_ERR) : ''}` : RELAY_SEEN ? 'UNAVAILABLE · obs.json sans horodatage' : 'non lu'],
    ['Agenda', calendarDiagText()],
    ['Stockage local', (() => { const d = USER_STORE.durability(), valid = d.validatedAt ? ` · validé il y a ${ageTxt(ageOf(d.validatedAt))}` : ' · validation de reprise en attente'; return `${d.status === 'durable' ? 'DURABLE' : 'DEGRADED'}${valid} · ${n} clés · ${Math.round(bytes / 1024)} Ko${d.error ? ' · ' + noUrl(d.error) : ''}`; })()],
    ['Cohérence production', VERSION_COHERENCE === 'current' ? 'À JOUR · build chargé = build publié' : VERSION_COHERENCE === 'offline' ? 'ANCIEN SHELL · mise à jour au retour réseau' : VERSION_COHERENCE === 'deferred' ? 'MISE À JOUR DIFFÉRÉE · trajet en cours' : VERSION_COHERENCE === 'reload' ? 'MISE À JOUR · rechargement demandé' : VERSION_COHERENCE === 'stale' ? 'ANCIEN SHELL · rechargement déjà tenté' : 'inconnue'],
    ['Synthèse Race Control', DECISION_LAST ? `${DECISION_LAST.decision.label} · confiance ${DECISION_LAST.confidence.label} · ${DECISION_LAST.confidence.reason}` : 'indisponible'],
    ['Erreurs runtime', (() => { const c = RUNTIME_RECORDER ? RUNTIME_RECORDER.count() : 0, last = RUNTIME_RECORDER && RUNTIME_RECORDER.last(); return c ? `${c} · dernière : ${ageTxt(ageOf(last.at))} · ${last.kind} · ${noUrl(last.message)}` : '0 depuis le démarrage'; })()],
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
function versionTravelling() { return !!(APP_CONTEXT.snapshot && APP_CONTEXT.snapshot.status === 'travel' || LIVE.phase === 'active'); }
async function enforceVersionCoherence() {
  if (!VER) { VERSION_COHERENCE = 'unknown'; return VERSION_COHERENCE; }
  const target = VER.build || null, marker = target ? 'twrc.reload.' + target : '';
  let attempted = false; try { attempted = !!marker && sessionStorage.getItem(marker) === '1'; } catch (e) { /* sessionStorage optionnel */ }
  VERSION_COHERENCE = Reliability.versionDecision({ loaded: window.TWRC_BUILD, published: target, travelling: versionTravelling(), attempted, online: navigator.onLine !== false });
  if (VERSION_COHERENCE !== 'reload') { renderDiag(); return VERSION_COHERENCE; }
  try { if (marker) sessionStorage.setItem(marker, '1'); } catch (e) { /* anti-boucle best effort */ }
  try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); } catch (e) { if (RUNTIME_RECORDER) RUNTIME_RECORDER.record('service-worker', e); }
  setTimeout(() => location.reload(), 50);
  renderDiag(); return VERSION_COHERENCE;
}
async function loadVersion(force = false) {
  if (!force && VER || loadVersion.busy) return; loadVersion.busy = 1; VER_CHECK_AT = Date.now();
  try {
    const v = await fetchJSON('version.json?t=' + Date.now(), 6000);
    if (v && v.run && v.sha && v.at) { VER = v; const e = $('#verLine'); if (e) e.innerHTML = verLine(); await enforceVersionCoherence(); }
  } catch (e) { /* pas encore publiée / hors ligne */ }
  loadVersion.busy = 0;
}
