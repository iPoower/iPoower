#!/usr/bin/env bash
# Protection des branches (sécurité V1) — À EXÉCUTER PAR LE PROPRIÉTAIRE APRÈS REVUE, jamais automatiquement par la CI.
# main : PR obligatoire, contrôles CI requis et à jour, aucun force-push ni suppression, règles appliquées aussi à l'admin.
# gh-pages : écrite par les publications automatisées (déploiement, relais, DATEX) → seuls le force-push et la
# suppression sont interdits ; les écritures en avance rapide restent possibles pour ne rien interrompre.
set -euo pipefail
REPO="${1:-iPoower/iPoower}"
gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["unit", "validation", "scan"] },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true
}
JSON
gh api -X POST "repos/$REPO/rulesets" --input - <<'JSON'
{
  "name": "gh-pages : ni réécriture ni suppression",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/gh-pages"], "exclude": [] } },
  "rules": [ { "type": "non_fast_forward" }, { "type": "deletion" } ]
}
JSON
echo "Protections appliquées. Vérification :"; gh api "repos/$REPO/branches/main/protection" --jq '{strict: .required_status_checks.strict, checks: .required_status_checks.contexts, admins: .enforce_admins.enabled, force: .allow_force_pushes.enabled, delete: .allow_deletions.enabled}'
