#!/usr/bin/env node
// La vérification ne reçoit qu'un token en lecture, jamais les secrets de production.
'use strict';
const SHA = /^[0-9a-f]{40}$/;
function approvedRun(runs, sha, repo) {
  if (!SHA.test(sha) || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  const matching = runs.filter(r => r.head_sha === sha && r.head_branch === 'main' && r.event === 'push' &&
    r.path === '.github/workflows/ci.yml' && r.head_repository?.full_name?.toLowerCase() === repo.toLowerCase())
    .sort((a, b) => b.id - a.id);
  const latest = matching[0];
  return latest?.status === 'completed' && latest.conclusion === 'success' ? latest : null;
}
async function check() {
  const { GITHUB_SHA: sha, GITHUB_REPOSITORY: repo, GITHUB_REF: ref, GH_TOKEN: token } = process.env;
  if (ref !== 'refs/heads/main' || !SHA.test(sha || '') || !/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !token) throw new Error('Contexte de confiance invalide');
  const url = `https://api.github.com/repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&event=push&per_page=30`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Validation main indisponible');
  const data = await response.json(), run = approvedRun(data.workflow_runs || [], sha, repo);
  if (!run) throw new Error('Cette révision main ne possède pas encore une CI complète réussie : secrets non utilisés, données conservées');
  console.log(`Révision main validée : ${sha}, CI ${run.id}`);
}
if (require.main === module) check().catch(e => { console.error('::error::' + e.message); process.exitCode = 1; });
module.exports = { approvedRun };
