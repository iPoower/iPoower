// Point d'entrée Cloudflare Workers : uniquement l'export par défaut. workerd traite chaque export nommé du module
// principal comme un point d'entrée, et refuse les constantes ; toute la logique vit donc dans clock.mjs et outage-alert.mjs.
import { tick, decide, readObs, DUE_MIN, COOLDOWN_MIN } from './clock.mjs';
import { outageAlert } from './outage-alert.mjs';

export default {
  // Chaque minute : une seule lecture d'obs.json, partagée entre le chien de garde (relance du relais via GitHub) et
  // l'alerte de secours (ntfy, indépendante de GitHub Actions). L'un n'empêche jamais l'autre : une panne de l'API GitHub
  // fait échouer le chien de garde, pas l'alerte ; l'invocation reste en échec (visible) si l'un des deux échoue.
  async scheduled(event, env, ctx) {
    const now = Date.now(), obs = await readObs(fetch, now);
    const minute = Number.isFinite(event && event.scheduledTime) ? event.scheduledTime : now - now % 60e3;
    const [watch, alert] = await Promise.allSettled([
      tick(env, { now, preloaded: true, obs }),
      outageAlert(env, { obs, now: minute, reread: () => readObs(fetch, Date.now()) })
    ]);
    if (watch.status === 'rejected') throw watch.reason;
    if (alert.status === 'rejected') throw alert.reason;
  },
  // Diagnostic public en lecture seule (aucun appel à GitHub, aucun jeton) : âge observé d'obs.json et décision.
  async fetch(request) {
    if (new URL(request.url).pathname !== '/status') return new Response('Not found', { status: 404 });
    const now = Date.now(), d = decide(await readObs(fetch, now), now);
    return new Response(JSON.stringify({ service: 'race-control-relay-clock', cron: 'chaque minute', now: new Date(now).toISOString(),
      age_min: d.age == null ? null : Math.round(d.age * 10) / 10, decision: d.decision, due_after_min: DUE_MIN, cooldown_min: COOLDOWN_MIN }),
      { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
};
