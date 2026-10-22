#!/usr/bin/env bash
# Installation bornée et relancée du navigateur Playwright pour la CI, la QA et le profilage.
# `timeout` tue `npx playwright` mais pas l'apt-get lancé en root par --with-deps : il continue de
# télécharger et garde le verrou dpkg, si bien qu'un nouvel essai immédiat échouait en quelques
# secondes (« Could not get lock /var/lib/dpkg/lock-frontend », 22/10 : cinq jobs perdus sans un test).
# Avant chaque nouvel essai, on attend donc, de façon bornée, la fin de cet apt-get : il a souvent
# terminé les téléchargements entre-temps et l'essai suivant est alors rapide.
# Usage : tools/ci-browser-install.sh chromium|webkit
set -u
browser="${1:-}"
case "$browser" in chromium|webkit) ;; *) echo "::error::navigateur inconnu : '$browser'"; exit 2 ;; esac
attempt_s="${CI_INSTALL_ATTEMPT_S:-360}" wait_s="${CI_INSTALL_LOCK_WAIT_S:-120}"
poll_s="${CI_INSTALL_POLL_S:-5}" pause_s="${CI_INSTALL_PAUSE_S:-10}"
# Processus vivants seulement : un apt-get zombie (non récolté) ne tient plus le verrou.
busy() { local p; for p in apt-get apt dpkg; do pgrep -x -r R,S,D,T "$p" >/dev/null && return 0; done; return 1; }
for i in 1 2 3; do
  timeout "$attempt_s" npx playwright install --with-deps "$browser" && exit 0
  echo "::warning title=Navigateur $browser::installation bloquée ou en échec (essai $i/3), nouvelle tentative"
  [ "$i" = 3 ] && break
  waited=0
  while busy && [ "$waited" -lt "$wait_s" ]; do sleep "$poll_s"; waited=$((waited + poll_s)); done
  busy && echo "::warning title=Navigateur $browser::apt toujours actif après ${wait_s} s"
  sleep $((i * pause_s))
done
echo "::error title=Navigateur $browser::installation impossible après 3 essais"; exit 1
