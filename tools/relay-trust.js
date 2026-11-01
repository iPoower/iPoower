#!/usr/bin/env node
// La vérification ne reçoit qu'un token en lecture, jamais les secrets de production.
'use strict';
const fs = require('node:fs');
const SHA = /^[0-9a-f]{40}$/;
const REPO = /^[\w.-]+\/[\w.-]+$/;
const PAGE = 100;
const PENDING = new Set(['queued', 'in_progress', 'requested', 'waiting', 'pending']);
function ciState(runs, sha, repo) {
  if (!SHA.test(sha || '') || !REPO.test(repo || '')) return { state: 'rejected', reason: 'invalid_context' };
  if (!Array.isArray(runs)) return { state: 'unavailable', reason: 'invalid_response' };
  const matching = runs.filter(r => r && r.head_sha === sha && r.head_branch === 'main' && r.event === 'push' &&
    r.path === '.github/workflows/ci.yml' && typeof r.head_repository?.full_name === 'string' && r.head_repository.full_name.toLowerCase() === repo.toLowerCase());
  if (matching.some(r => !Number.isSafeInteger(r.id) || r.id <= 0)) return { state: 'unavailable', reason: 'invalid_response' };
  matching.sort((a, b) => b.id - a.id);
  const latest = matching[0];
  if (!latest) return { state: 'unavailable', reason: 'ci_missing' };
  if (latest.status === 'completed') {
    return latest.conclusion === 'success' ? { state: 'approved', reason: 'ci_success', run: latest } :
      { state: 'rejected', reason: latest.conclusion === 'cancelled' ? 'ci_cancelled' : 'ci_failed', run: latest };
  }
  if (PENDING.has(latest.status) && latest.conclusion == null) return { state: 'pending', reason: 'ci_pending', run: latest };
  return { state: 'unavailable', reason: 'invalid_response' };
}
// Dernier SHA de main (≠ tête) dont la DERNIÈRE CI push est terminée en succès : candidat quand la CI de la tête est
// encore en cours. Le candidat n'est accepté qu'après preuve d'ascendance (compare) : jamais un SHA hors de main.
function previousApproved(runs, sha, repo) {
  if (!SHA.test(sha || '') || !REPO.test(repo || '') || !Array.isArray(runs)) return null;
  const seen = new Set();
  const candidates = runs.filter(r => r && typeof r.head_sha === 'string' && SHA.test(r.head_sha) && r.head_sha !== sha &&
    Number.isSafeInteger(r.id) && r.id > 0).sort((a, b) => b.id - a.id);
  for (const r of candidates) {
    if (seen.has(r.head_sha)) continue;
    seen.add(r.head_sha);
    const result = ciState(runs, r.head_sha, repo);
    if (result.state === 'approved') return result.run;
  }
  return null;
}
function approvedRun(runs, sha, repo) {
  const result = ciState(runs, sha, repo);
  return result.state === 'approved' ? result.run : null;
}
function context(env) {
  const { GITHUB_SHA: sha, GITHUB_REPOSITORY: repo, GITHUB_REF: ref, GH_TOKEN: token } = env;
  return ref === 'refs/heads/main' && SHA.test(sha || '') && REPO.test(repo || '') && token ? { sha, repo, token } : null;
}
async function request(ctx, endpoint, fetchImpl) {
  const response = await fetchImpl(`https://api.github.com/repos/${ctx.repo}/${endpoint}`, {
    headers: { Authorization: `Bearer ${ctx.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('api_unavailable');
  return response.json();
}
async function currentMain(ctx, fetchImpl) {
  const ref = await request(ctx, 'git/ref/heads/main', fetchImpl);
  if (ref?.ref !== 'refs/heads/main' || ref.object?.type !== 'commit' || !SHA.test(ref.object?.sha || '')) throw new Error('invalid_response');
  return ref.object.sha;
}
// base ancêtre strict de head : compare base...head « ahead », rien derrière, base = merge-base.
async function isAncestor(ctx, base, head, fetchImpl) {
  const c = await request(ctx, `compare/${base}...${head}?per_page=1`, fetchImpl);
  return c?.status === 'ahead' && c.behind_by === 0 && Number.isSafeInteger(c.ahead_by) && c.ahead_by > 0 &&
    c.merge_base_commit?.sha === base && c.base_commit?.sha === base;
}
// allowPrevious : seulement si la CI de la tête est en cours (pending). Une tête rouge/annulée reste refusée.
async function check({ env = process.env, fetchImpl = fetch, allowPrevious = false } = {}) {
  const ctx = context(env);
  if (!ctx) return { state: 'rejected', reason: 'invalid_context' };
  try {
    if (await currentMain(ctx, fetchImpl) !== ctx.sha) return { state: 'rejected', reason: 'sha_changed' };
    // Les filtres head_sha/event de l'API renvoient par intermittence 0 run pour des CI existantes (22/10 : relais
    // refusé malgré une CI verte). On lit donc la première page non filtrée, du plus récent au plus ancien, et on
    // filtre ici (ciState : SHA, main, push, ci.yml, dépôt). Tout run de ce SHA plus récent que le dernier de la page
    // y figure forcément ; s'il n'y est pas : ci_missing, jamais approved.
    const data = await request(ctx, `actions/workflows/ci.yml/runs?per_page=${PAGE}`, fetchImpl);
    const list = data?.workflow_runs;
    if (!Number.isSafeInteger(data?.total_count) || data.total_count < 0 || !Array.isArray(list) || list.length > PAGE ||
      list.length > data.total_count || (list.length < PAGE && list.length !== data.total_count) ||
      list.some((r, i) => !Number.isSafeInteger(r?.id) || r.id <= 0 || (i > 0 && r.id >= list[i - 1].id))) {
      return { state: 'unavailable', reason: 'invalid_response' };
    }
    const result = ciState(data.workflow_runs, ctx.sha, ctx.repo);
    if (result.state === 'pending' && allowPrevious) {
      // Protection du 1er novembre 2026 : ne plus bloquer la publication pendant toute la CI d'une fusion.
      // Le code exécuté avec les secrets reste un SHA dont la CI est verte (needs.approved.outputs.sha), jamais la tête.
      const previous = previousApproved(data.workflow_runs, ctx.sha, ctx.repo);
      if (!previous) return result;
      if (!(await isAncestor(ctx, previous.head_sha, ctx.sha, fetchImpl))) return { state: 'rejected', reason: 'previous_not_ancestor' };
      if (await currentMain(ctx, fetchImpl) !== ctx.sha) return { state: 'rejected', reason: 'sha_changed' };
      return { state: 'approved', reason: 'approved_previous', run: previous, sha: previous.head_sha, head: { sha: ctx.sha, run: result.run } };
    }
    if (result.state !== 'approved') return result;
    // Ferme la fenêtre où main avancerait pendant la lecture du succès CI.
    if (await currentMain(ctx, fetchImpl) !== ctx.sha) return { state: 'rejected', reason: 'sha_changed' };
    return { ...result, sha: ctx.sha };
  } catch { return { state: 'unavailable', reason: 'api_unavailable' }; }
}
// Revalidation complète juste avant les secrets : ne remplace JAMAIS le job initial.
// Elle ne produit aucun output d'autorisation. SHA autorisé = tête : pending y reste bloquant. SHA autorisé antérieur
// (approved_previous) : la tête doit être encore en cours, ce SHA toujours le dernier vert et ancêtre de main ; tout
// autre changement (tête devenue verte ou rouge, nouveau vert intermédiaire) refuse cette exécution.
async function recheckApproved({ env = process.env, fetchImpl = fetch } = {}) {
  const ctx = context(env), pinned = env.RELAY_APPROVED_SHA;
  if (!ctx || !SHA.test(pinned || '')) return { ok: false, reason: 'invalid_context' };
  const result = await check({ env, fetchImpl, allowPrevious: pinned !== ctx.sha });
  if (result.state !== 'approved') return { ok: false, reason: result.reason };
  return result.sha === pinned ? { ok: true } : { ok: false, reason: 'approval_changed' };
}
const MESSAGES = {
  invalid_context: 'Contexte de confiance invalide',
  ci_missing: 'CI push attendue absente pour cette révision exacte de main',
  invalid_response: 'Réponse CI non vérifiable (format, statut ou pagination)',
  ci_pending: 'CI exacte encore en cours : relais différé ; reprise par les planifications existantes',
  ci_failed: 'Dernière CI exacte terminée sans succès : relais refusé',
  ci_cancelled: 'Dernière CI exacte annulée : relais refusé',
  sha_changed: 'Main a changé : cette exécution ne peut pas autoriser une autre révision',
  previous_not_ancestor: 'Dernier SHA vert non ancêtre de la tête de main : relais refusé',
  approval_changed: 'Autorisation périmée (CI ou dernier SHA vert changés depuis le contrôle initial) : relais refusé, reprise au prochain déclenchement',
  api_unavailable: 'API GitHub indisponible ou réponse non vérifiable : relais refusé'
};
async function runCli({ argv = process.argv.slice(2), env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  if (argv.length === 1 && argv[0] === '--recheck-approved') {
    const result = await recheckApproved({ env, fetchImpl });
    log(result.ok ? 'Main exact et dernière CI verte revalidés juste avant les secrets ; autorisation préalable obligatoire' : '::error::' + MESSAGES[result.reason]);
    return result.ok ? 0 : 1;
  }
  if (argv.length && (argv.length !== 1 || argv[0] !== '--defer-pending')) {
    log('::error::Options du contrôle de confiance invalides'); return 1;
  }
  const result = await check({ env, fetchImpl, allowPrevious: argv[0] === '--defer-pending' });
  // Seul approved fournit un SHA. Un pending peut réussir le job de lecture, jamais le job privilégié.
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `state=${result.state}\nsha=${result.state === 'approved' ? result.sha : ''}\n`);
  const message = result.reason === 'approved_previous'
    ? `CI de la tête ${result.head.sha} encore en cours (run ${result.head.run.id}) : relais avec le dernier SHA vert ancêtre ${result.sha}, CI ${result.run.id} (approved_previous)`
    : result.state === 'approved' ? `Révision main validée : ${result.sha}, CI ${result.run.id}` : MESSAGES[result.reason];
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `Relais : **${result.state}** — ${message}. Aucun secret applicatif dans ce contrôle.\n`);
  if (result.reason === 'approved_previous') { log('::notice title=Relais sur le dernier SHA vert::' + message); return 0; }
  if (result.state === 'approved') { log(message); return 0; }
  if (result.state === 'pending' && argv[0] === '--defer-pending') { log('::notice title=Relais différé::' + message); return 0; }
  log('::error::' + message + ' ; secrets non utilisés, données conservées');
  return 1;
}
if (require.main === module) runCli().then(code => { process.exitCode = code; }).catch(() => {
  console.error('::error::Contrôle de confiance indisponible ; secrets non utilisés'); process.exitCode = 1;
});
module.exports = { approvedRun, ciState, previousApproved, check, recheckApproved, runCli };
