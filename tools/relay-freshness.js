#!/usr/bin/env node
// Mesure de la fraîcheur réelle du relais, à partir des commits du relais sur gh-pages (aucun secret, aucune donnée personnelle).
// Objectif : obs.json âgé de moins de 15 min pendant les matinées de semaine (05:00–09:30, heure de Paris).
// Usage : git fetch origin gh-pages && node tools/relay-freshness.js [jours=7]
'use strict';
const SLO_MIN = 15, WIN = [5 * 60, 9 * 60 + 30];
const PARIS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
function parisMinute(ms) {
  const p = Object.fromEntries(PARIS.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { weekday: !['Sat', 'Sun'].includes(p.weekday), min: (+p.hour % 24) * 60 + +p.minute };
}
const pct = (a, q) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * q))] : null;
// times : instants (ms) des relais réussis ; renvoie les écarts entre relais et la part des minutes de matinée sous l'objectif.
function freshness(times, from, to) {
  const t = [...times].filter(Number.isFinite).sort((a, b) => a - b);
  const gaps = t.slice(1).map((x, i) => (x - t[i]) / 60000).sort((a, b) => a - b);
  let total = 0, ok = 0, j = -1;
  for (let m = Math.ceil(from / 60000) * 60000; m < to; m += 60000) {
    const p = parisMinute(m); if (!p.weekday || p.min < WIN[0] || p.min >= WIN[1]) continue;
    while (j + 1 < t.length && t[j + 1] <= m) j++;
    total++; if (j >= 0 && (m - t[j]) / 60000 < SLO_MIN) ok++;
  }
  return { runs: t.length, p50: pct(gaps, 0.5), p90: pct(gaps, 0.9), max: gaps.length ? gaps[gaps.length - 1] : null,
    morningMinutes: total, morningFresh: total ? ok / total : null };
}
module.exports = { freshness, parisMinute, SLO_MIN };
if (require.main === module) {
  const days = +(process.argv[2] || 7), to = Date.now(), from = to - days * 86400e3;
  const log = require('child_process').execSync(`git log origin/gh-pages --since=${Math.floor(from / 1000)} --format=%ct%x09%s`, { encoding: 'utf8' });
  const times = log.split('\n').filter(l => /\t(Observations|Relais watchdog)/.test(l)).map(l => +l.split('\t')[0] * 1000);
  const r = freshness(times, from, to), f = x => x == null ? '—' : x.toFixed(0) + ' min';
  console.log(`Relais sur ${days} j : ${r.runs} synchronisations · écart médian ${f(r.p50)} · p90 ${f(r.p90)} · max ${f(r.max)}`);
  console.log(r.morningMinutes ? `Matinées de semaine (05:00–09:30) : ${(100 * r.morningFresh).toFixed(1)} % du temps avec obs.json < ${SLO_MIN} min`
    : 'Aucune matinée de semaine dans la période');
}
