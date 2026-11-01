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
//
// Auto-réparation (incident du 7 octobre 2026) : un run du watchdog est resté « waiting » (environnement production) de
// 10:49 à 12:18 UTC. Compté comme « relais en cours », il bloquait la garde ; et comme il tenait la concurrence
// `race-control-relay`, tout nouveau run restait derrière lui : 1 h 36 sans relais. Désormais, quand les données sont
// dues, un run du relais encore actif après STUCK_MIN (le job a un timeout de 8 min) est annulé ; le relais est relancé
// au tick suivant. Rien n'est annulé tant qu'obs.json est frais (aucun appel GitHub dans ce cas).
//
// Horodatages GitHub dans le futur (incident du 1er novembre 2026) : depuis ~08:00 UTC, l'API renvoyait created_at et
// run_started_at décalés de +1 h ; un run « futur » restait « récent » pendant ~1 h et bloquait la garde. Toute heure de
// run au-delà de maintenant + SKEW_TOLERANCE_MS est ramenée à maintenant (runTime) ; un run publié ainsi daté ne retient
// l'horloge que COOLDOWN_MIN après le passage à « dû » (voir guard), jamais ~1 h. Et le refroidissement (attente de
// GitHub Pages) ne compte plus que les runs qui ont réellement publié : un run réussi dont le job privilégié a été sauté
// (relais différé ou refusé par le contrôle de confiance) ou dont l'étape « Publier » n'a pas tourné (données pas encore
// dues) ne retient plus l'horloge. Ce n'est connaissable que par la liste des jobs : au plus MAX_JOB_LOOKUPS appels, et
// seulement quand obs.json est en retard, sans run actif, avec un run réussi dans la fenêtre. Réponse illisible : le run
// compte (comportement antérieur, prudent). Les runs terminés sans succès (échec, annulation) restent comptés : sans
// cela, un relais en échec persistant (CI rouge) serait relancé à chaque minute (tempête et notifications d'échec).
export const REPO = 'iPoower/iPoower';
export const WORKFLOW = 'race-control.yml';
export const RELAY_WORKFLOWS = ['race-control.yml', 'race-control-watchdog.yml'];
export const OBS_URL = 'https://ipoower.github.io/iPoower/race-control/obs.json';
export const DUE_MIN = 8;        // même seuil que l'étape « Vérifier si une vraie synchronisation est due » du workflow
export const COOLDOWN_MIN = 6;   // run récent après le passage à « dû » : on attend sa publication par GitHub Pages
export const STUCK_MIN = 20;     // run du relais toujours actif après 20 min (timeout du job : 8 min) : bloqué
export const SKEW_TOLERANCE_MS = 60e3;   // heure de run plus d'une minute dans le futur : ramenée à maintenant
export const MAX_JOB_LOOKUPS = 3;        // appels « jobs » au plus par tick (seulement si obs.json est en retard)
export const PRIVILEGED_JOBS = ['relay', 'watchdog'];   // job qui publie dans race-control.yml / race-control-watchdog.yml
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

// Heure d'un run selon l'horloge du Worker : illisible = NaN ; plus de SKEW_TOLERANCE_MS dans le futur = maintenant. Pur.
export function runTime(value, now) {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return NaN;
  return t > now + SKEW_TOLERANCE_MS ? now : t;
}
// Début de la fenêtre de refroidissement : après le passage à « dû » et dans les COOLDOWN_MIN dernières minutes. Pur.
export function cooldownSince(now, staleSince) {
  return Math.max(staleSince == null ? -Infinity : staleSince - 60e3, now - COOLDOWN_MIN * 60e3);
}
// Runs bloqués : actifs (en file, en attente, en cours) depuis au moins STUCK_MIN. Pur.
export function stuckRuns(runs, now) {
  return runs.filter(r => ACTIVE.has(r.status) && Number.isFinite(runTime(r.created_at, now)) && now - runTime(r.created_at, now) >= STUCK_MIN * 60e3);
}
// Un run réussi qui aurait publié retiendrait-il l'horloge ? Heure fiable : dans la fenêtre de refroidissement. Heure dans
// le futur (ramenée à maintenant, vraie heure inconnue) : seulement pendant les COOLDOWN_MIN qui suivent le passage à « dû »,
// fenêtre maximale d'un run normal, jamais pendant toute la durée du décalage. Pur.
export function inCooldown(r, now, staleSince) {
  if (Date.parse(r.created_at) > now + SKEW_TOLERANCE_MS) return staleSince != null && now < staleSince + COOLDOWN_MIN * 60e3;
  return runTime(r.created_at, now) >= cooldownSince(now, staleSince);
}
// Runs réussis dont il faut savoir s'ils ont publié : seulement ceux qui retiendraient l'horloge, les plus récents d'abord
// (heure brute), au plus MAX_JOB_LOOKUPS ; les autres restent « inconnus » et comptent. Pur.
export function publicationCandidates(runs, now, staleSince) {
  return runs.filter(r => r.status === 'completed' && r.conclusion === 'success' && r.published == null && Number.isSafeInteger(r.id) &&
    inCooldown(r, now, staleSince)).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, MAX_JOB_LOOKUPS);
}
// Garde pure : runs = [{ status, conclusion, created_at, published }] des workflows du relais. published : true (a publié),
// false (job privilégié sauté ou étape « Publier » non exécutée : n'a rien publié), absent (inconnu : compte, par prudence).
// staleSince inconnu (obs illisible) : tout run récent compte.
export function guard(runs, now, staleSince) {
  if (runs.some(r => ACTIVE.has(r.status))) return { go: false, reason: 'relais déjà en cours' };
  const since = cooldownSince(now, staleSince), recent = runs.filter(r => runTime(r.created_at, now) >= since);
  if (runs.some(r => r.conclusion === 'success' && r.published !== false && inCooldown(r, now, staleSince))) return { go: false, reason: 'cooldown : run récent en publication' };
  if (recent.some(r => r.conclusion !== 'success')) return { go: false, reason: 'espacement : run récent sans succès' };
  return { go: true, reason: recent.length ? 'runs récents sans publication (différés, non dus ou datés du futur) ignorés' : 'aucun run en cours ni récent' };
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
    return (j && Array.isArray(j.workflow_runs) ? j.workflow_runs : []).map(x => ({ id: x.id, status: x.status, conclusion: x.conclusion ?? null,
      created_at: x.created_at, run_started_at: x.run_started_at ?? null }));
  }));
  return lists.flat();
}
// A publié ? true · false (job privilégié sauté, ou étape « Publier » sautée) · null (inconnu : le run comptera). Ne lève jamais.
export async function runPublished(env, fetchImpl, id) {
  try {
    const r = await fetchImpl(`${GH}/runs/${id}/jobs?per_page=10`, { headers: ghHeaders(env), signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const j = await r.json(), jobs = j && Array.isArray(j.jobs) ? j.jobs : [];
    const priv = jobs.filter(x => x && PRIVILEGED_JOBS.includes(x.name));
    if (priv.length !== 1) return null;
    if (priv[0].status === 'completed' && priv[0].conclusion === 'skipped') return false;
    if (priv[0].status !== 'completed' || priv[0].conclusion !== 'success' || !Array.isArray(priv[0].steps)) return null;
    const pub = priv[0].steps.filter(st => st && typeof st.name === 'string' && st.name.startsWith('Publier'));
    if (pub.length !== 1) return null;
    return pub[0].conclusion === 'success' ? true : pub[0].conclusion === 'skipped' ? false : null;
  } catch (e) { return null; }
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
    const runs = await relayRuns(env, fetchImpl), stuck = stuckRuns(runs, now).filter(r => Number.isSafeInteger(r.id)).slice(0, 3);
    if (stuck.length) {   // auto-réparation : annuler, puis relancer au tick suivant (le run annulé libère la concurrence)
      for (const r of stuck) {
        const c = await fetchImpl(`${GH}/runs/${r.id}/cancel`, { method: 'POST', headers: ghHeaders(env), signal: AbortSignal.timeout(15000) });
        out.status = c.status;
        if (c.status < 200 || c.status >= 300) { out.action = 'error'; out.reason = 'annulation du run bloqué refusée'; throw new Error(`Annulation d'un run bloqué refusée par GitHub : HTTP ${c.status}`); }
      }
      const oldest = Math.max(...stuck.map(r => now - Date.parse(r.created_at)));
      out.action = 'cancelled'; out.reason = `${stuck.length} run${stuck.length > 1 ? 's' : ''} bloqué${stuck.length > 1 ? 's' : ''} depuis ${Math.round(oldest / 60e3)} min annulé${stuck.length > 1 ? 's' : ''}`;
      return out;
    }
    if (!runs.some(r => ACTIVE.has(r.status))) {
      for (const r of publicationCandidates(runs, now, d.staleSince)) r.published = await runPublished(env, fetchImpl, r.id);
    }
    const g = guard(runs, now, d.staleSince);
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
