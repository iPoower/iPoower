// Point d'entrée Cloudflare Workers : uniquement l'export par défaut. workerd traite chaque export nommé du module
// principal comme un point d'entrée, et refuse les constantes ; toute la logique vit donc dans clock.mjs.
import { tick, decide, readObs, DUE_MIN, COOLDOWN_MIN } from './clock.mjs';

export default {
  async scheduled(event, env, ctx) { await tick(env); },
  // Diagnostic public en lecture seule (aucun appel à GitHub, aucun jeton) : âge observé d'obs.json et décision.
  async fetch(request) {
    if (new URL(request.url).pathname !== '/status') return new Response('Not found', { status: 404 });
    const now = Date.now(), d = decide(await readObs(fetch, now), now);
    return new Response(JSON.stringify({ service: 'race-control-relay-clock', cron: 'chaque minute', now: new Date(now).toISOString(),
      age_min: d.age == null ? null : Math.round(d.age * 10) / 10, decision: d.decision, due_after_min: DUE_MIN, cooldown_min: COOLDOWN_MIN }),
      { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
};
