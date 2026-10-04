// Horloge externe du relais Race Control (Cloudflare Workers, Cron Trigger toutes les 5 min).
// Le planificateur `schedule` de GitHub Actions retarde ou abandonne des exécutions aux heures chargées
// (mesuré du 2 au 4 octobre 2026 : écart médian 32 min, maximum 5 h 55, matinée du 2 octobre sans relais).
// Ce Worker ne fait qu'une chose : lire l'âge public de obs.json et, s'il est dû, lancer race-control.yml.
// Il ne lit ni n'envoie aucune donnée personnelle ; le relais, ses secrets et la frontière `main` restent dans GitHub.
//
// Secret Cloudflare : GH_TOKEN = jeton GitHub « fine-grained » limité au dépôt iPoower/iPoower, permission Actions : Read and write
// (aucun accès au contenu du dépôt ni aux secrets).
export const REPO = 'iPoower/iPoower';
export const WORKFLOW = 'race-control.yml';
export const OBS_URL = 'https://ipoower.github.io/iPoower/race-control/obs.json';
export const DUE_MIN = 8;   // même seuil que l'étape « Vérifier si une vraie synchronisation est due » du workflow

// Décision pure : lancer le relais si obs.json est illisible, sans date valide ou âgé d'au moins DUE_MIN minutes.
export function decide(obs, now) {
  const t = obs && Date.parse(obs.updated);
  if (!Number.isFinite(t)) return { dispatch: true, age: null, why: 'obs.json illisible ou sans date' };
  const age = (now - t) / 60000;
  return age >= DUE_MIN ? { dispatch: true, age, why: `relais âgé de ${age.toFixed(1)} min` } : { dispatch: false, age, why: `relais frais (${age.toFixed(1)} min)` };
}

async function readObs(fetchImpl, now) {
  try {   // ?t= contourne le cache CDN de GitHub Pages ; une panne de lecture ne doit jamais empêcher le relais
    const r = await fetchImpl(OBS_URL + '?t=' + now, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(10000) });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

export async function tick(env, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (!env || !env.GH_TOKEN) throw new Error('Secret GH_TOKEN absent : relais non déclenché');
  const d = decide(await readObs(fetchImpl, now), now);
  if (!d.dispatch) return { ...d, status: null };
  const r = await fetchImpl(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { authorization: 'Bearer ' + env.GH_TOKEN, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28',
      'user-agent': 'race-control-relay-clock', 'content-type': 'application/json' },
    // source=horloge : le workflow garde son contrôle de fraîcheur (un lancement manuel, lui, force toujours le relais)
    body: JSON.stringify({ ref: 'main', inputs: { source: 'horloge' } })
  });
  // 204 attendu (2xx accepté). Toute autre réponse fait échouer l'invocation : elle apparaît en erreur dans les journaux Cloudflare.
  if (r.status < 200 || r.status >= 300) throw new Error(`Lancement du relais refusé par GitHub : HTTP ${r.status}`);
  return { ...d, status: r.status };
}

export default {
  async scheduled(event, env, ctx) {
    const res = await tick(env);
    console.log(JSON.stringify({ cron: event.cron, ...res, age: res.age == null ? null : Math.round(res.age * 10) / 10 }));
  },
  // Diagnostic public en lecture seule : âge du relais et décision qui serait prise, sans rien déclencher.
  async fetch() {
    const now = Date.now(), d = decide(await readObs(fetch, now), now);
    return new Response(JSON.stringify({ age_min: d.age == null ? null : Math.round(d.age * 10) / 10, due: d.dispatch, why: d.why }),
      { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
};
