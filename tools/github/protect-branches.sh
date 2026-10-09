#!/usr/bin/env bash
# Protection des branches (sécurité V1) — À EXÉCUTER PAR LE PROPRIÉTAIRE APRÈS REVUE, jamais automatiquement par la CI.
# main : PR obligatoire, contrôles CI requis et à jour, aucun force-push ni suppression, règles appliquées aussi à l'admin.
# gh-pages : écrite par les publications automatisées (déploiement, relais, DATEX) → seuls le force-push et la
# suppression sont interdits ; les écritures en avance rapide restent possibles pour ne rien interrompre.
set -euo pipefail
REPO="${1:-iPoower/iPoower}"
[[ "$(gh api "repos/$REPO" --jq '.permissions.admin // false')" == true ]] || {
  echo "ERREUR : un accès administrateur est requis ; aucune protection n’a été modifiée" >&2; exit 1;
}
gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["unit", "validation", "scan"] },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true
}
JSON
# Relancer le script ne doit pas créer plusieurs rulesets concurrents.
EXISTING_RULESET_ID="$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name == "gh-pages : ni réécriture ni suppression") | .id' | head -n 1)"
if [[ -n "$EXISTING_RULESET_ID" ]]; then
  RULESET_METHOD=PUT
  RULESET_ENDPOINT="repos/$REPO/rulesets/$EXISTING_RULESET_ID"
else
  RULESET_METHOD=POST
  RULESET_ENDPOINT="repos/$REPO/rulesets"
fi
gh api -X "$RULESET_METHOD" "$RULESET_ENDPOINT" --input - <<'JSON'
{
  "name": "gh-pages : ni réécriture ni suppression",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["refs/heads/gh-pages"], "exclude": [] } },
  "rules": [ { "type": "non_fast_forward" }, { "type": "deletion" } ]
}
JSON
echo "Protections demandées : contrôle de la configuration réellement active."
gh api "repos/$REPO/branches/main/protection" --jq '{pr_obligatoire: (.required_pull_request_reviews != null), approbations: .required_pull_request_reviews.required_approving_review_count, strict: .required_status_checks.strict, checks: .required_status_checks.contexts, admins: .enforce_admins.enabled, force: .allow_force_pushes.enabled, delete: .allow_deletions.enabled, historique_lineaire: .required_linear_history.enabled, conversations_resolues: .required_conversation_resolution.enabled}'
MAIN_OK="$(gh api "repos/$REPO/branches/main/protection" --jq '(.required_pull_request_reviews != null) and (.required_pull_request_reviews.required_approving_review_count == 0) and (.required_status_checks.strict == true) and ((.required_status_checks.contexts | sort) == ["scan", "unit", "validation"]) and (.enforce_admins.enabled == true) and (.allow_force_pushes.enabled == false) and (.allow_deletions.enabled == false) and (.required_linear_history.enabled == true) and (.required_conversation_resolution.enabled == true)')"
[[ "$MAIN_OK" == true ]] || { echo "ERREUR : main insuffisamment protégée" >&2; exit 1; }
RULESET_ID="$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name == "gh-pages : ni réécriture ni suppression") | .id' | head -n 1)"
[[ -n "$RULESET_ID" ]] || { echo "ERREUR : ruleset gh-pages introuvable" >&2; exit 1; }
PAGES_OK="$(gh api "repos/$REPO/rulesets/$RULESET_ID" --jq '(.target == "branch") and (.enforcement == "active") and (.conditions.ref_name.include == ["refs/heads/gh-pages"]) and (.conditions.ref_name.exclude == []) and (((.bypass_actors // []) | length) == 0) and (([.rules[].type] | sort) == ["deletion", "non_fast_forward"])')"
[[ "$PAGES_OK" == true ]] || { echo "ERREUR : gh-pages insuffisamment protégée" >&2; exit 1; }
echo "OK : main (PR sans approbation, CI, pas de force-push/suppression) + gh-pages (écritures normales permises)."
