// Logique du chien de garde (module pur, testé par tests/test_relay_clock.js). Point d'entrée Cloudflare : worker.mjs.
// Horloge externe du relais Race Control (Cloudflare Workers Free, Cron Trigger chaque minute).
// Le planificateur `schedule` de GitHub Actions retarde ou abandonne des exécutions aux heures chargées
// (mesuré du 2 au 4 octobre 2026 : écart médian 39 min, maximum 5 h 55 ; le 4 octobre, aucun relais de 17:33 à 20:23 UTC).
// Ce Worker est seulement un chien de garde : il lit l'âge public de obs.json et, si le relais est en retard, lance
// race-control.yml (workflow_dispatch, source=horloge). GitHub Actions reste le moteur du relais, ses secrets et la frontière `main`.
// Il ne lit, n'envoie ni ne journalise aucune donnée personnelle : seulement l'âge technique d'obs.json et l'état des runs.
//
// Secret Cloudflare (le seul) : GH_TOKEN = jeton GitHub « fine-grained » limité au dépôt iPoower/iPoower,
// permission Actions : Read and write (lister les runs, lancer le workflow). Aucun accès au contenu ni aux secrets.
//
// Anti-tempête, sans stockage : la source de vérité est GitHub. Pas de dispatch si un run du relais (horloge, cron ou
// watchdog GitHub) est en file ou en cours, ni si un run a démarré après que les données sont devenues dues, il y a moins de
// COOLDOWN_MIN (temps de publication de GitHub Pages). Au pire un dispatch par COOLDOWN_MIN tant que le relais reste en panne.
// Seconde protection côté GitHub : concurrency `race-control-relay` et contrôle de fraîcheur du workflow.
export const REPO = 'iPoower/iPoower';
export const WORKFLOW = 'race-control.yml';
export const RELAY_WORKFLOWS = ['race-control.yml', 'race-control-watchdog.yml'];
export const OBS_URL = 'https://ipoower.github.io/iPoower/race-control/obs.json';
export const DUE_MIN = 8;        // même seuil que l'étape « Vérifier si une vraie synchronisation est due » du workflow
export const COOLDOWN_MIN = 6;   // run récent après le passage à « dû » : on attend sa publication par GitHub Pages
const ACTIVE = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);
const GH = 'https://api.github.com/repos/' + REPO + '/actions';

// Décision pure sur obs.json : fresh (< 8 min) · stale (≥ 8 min) · invalid (sans date valide) · unreachable (illisible).
export function decide(obs, now) {
  if (obs === undefined) return { decision: 'unreachable', age: null, staleSince: null };
  const t = obs && Date.parse(obs.updated);
  if (!Number.isFinite(t)) return { decision: 'invalid', age: null, staleSince: null };
  const age = (now - t) / 60000;
  return { decision: age >= DUE_MIN ? 'stale' : 'fresh', age, staleSince: t + DUE_MIN * 60e3 };
}

// Garde pure : runs = [{ status, created_at }] des workflows du relais. staleSince inconnu (obs illisible) : tout run récent compte.
export function guard(runs, now, staleSince) {
  if (runs.some(r => ACTIVE.has(r.status))) return { go: false, reason: 'relais déjà en cours' };
  const since = Math.max(staleSince == null ? -Infinity : staleSince - 60e3, now - COOLDOWN_MIN * 60e3);
  if (runs.some(r => Date.parse(r.created_at) >= since)) return { go: false, reason: 'cooldown : run récent en publication' };
  return { go: true, reason: 'aucun run en cours ni récent' };
}

export async function readObs(fetchImpl, now) {
  try {   // ?t= contourne le cache CDN de GitHub Pages ; aucun jeton n'est envoyé à Pages
    const r = await fetchImpl(OBS_URL + '?t=' + now, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return undefined;                                   // absent ou Pages en erreur : unreachable
    try { return await r.json(); } catch (e) { return null; }      // reçu mais illisible : invalid
  } catch (e) { return undefined; }                                // réseau : unreachable
}
const ghHeaders = env => ({ authorization: 'Bearer ' + env.GH_TOKEN, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'race-control-relay-clock' });

async function relayRuns(env, fetchImpl) {
  const lists = await Promise.all(RELAY_WORKFLOWS.map(async wf => {
    const r = await fetchImpl(`${GH}/workflows/${wf}/runs?per_page=5`, { headers: ghHeaders(env), signal: AbortSignal.timeout(10000) });
    // liste indisponible : erreur, et surtout aucun dispatch à l'aveugle (risque de tempête)
    if (!r.ok) throw new Error(`Liste des runs indisponible : HTTP ${r.status}`);
    const j = await r.json();
    return (j && Array.isArray(j.workflow_runs) ? j.workflow_runs : []).map(x => ({ status: x.status, created_at: x.created_at }));
  }));
  return lists.flat();
}

// Une exécution du chien de garde. Retourne un résumé technique (sans donnée personnelle) et le journalise en une ligne JSON.
export async function tick(env, { fetchImpl = fetch, now = Date.now(), log = console.log } = {}) {
  if (!env || !env.GH_TOKEN) {   // ex. secret placé par erreur dans les variables de build : une ligne lisible, sans aucun appel réseau
    log(JSON.stringify({ t: new Date(now).toISOString(), decision: null, age_min: null, action: 'error', reason: 'GH_TOKEN absent (secret du Worker)', status: null }));
    throw new Error('Secret GH_TOKEN absent : relais non déclenché');
  }
  const d = decide(await readObs(fetchImpl, now), now), out = { decision: d.decision, age: d.age, action: 'none', reason: 'données fraîches', status: null };
  const emit = () => log(JSON.stringify({ t: new Date(now).toISOString(), decision: out.decision, age_min: out.age == null ? null : Math.round(out.age * 10) / 10, action: out.action, reason: out.reason, status: out.status }));
  try {
    if (d.decision === 'fresh') return out;
    const g = guard(await relayRuns(env, fetchImpl), now, d.staleSince);
    if (!g.go) { out.action = 'skipped'; out.reason = g.reason; return out; }
    const r = await fetchImpl(`${GH}/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST', signal: AbortSignal.timeout(15000), headers: { ...ghHeaders(env), 'content-type': 'application/json' },
      // source=horloge : le workflow refait son contrôle de fraîcheur (un lancement manuel, lui, force toujours le relais)
      body: JSON.stringify({ ref: 'main', inputs: { source: 'horloge' } })
    });
    out.status = r.status;
    // 204 attendu (2xx accepté). Sinon l'invocation échoue : visible dans Workers Logs et les événements Cron.
    if (r.status < 200 || r.status >= 300) { out.action = 'error'; out.reason = 'dispatch refusé'; throw new Error(`Lancement du relais refusé par GitHub : HTTP ${r.status}`); }
    out.action = 'dispatched'; out.reason = g.reason; return out;
  } catch (e) {
    if (out.action !== 'error') { out.action = 'error'; out.reason = String(e.message || e).replace(/https?:\S+/g, 'url').slice(0, 80); }
    throw e;
  } finally { emit(); }
}
