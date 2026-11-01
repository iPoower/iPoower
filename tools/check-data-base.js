'use strict';
// Contrôle de déploiement de l'origine dédiée (lot 2) : l'app servie annonce une TWRC_DATA_BASE non vide (gh-pages),
// le flux routier y est atteignable et en JSON valide (jamais la page HTML de repli), et son âge est contrôlé.
// Bloquant : base absente ou non HTTPS, flux absent ou non JSON. Avertissement : flux plus ancien que STALE_MIN.
const STALE_MIN = 30;
function verify({ html, roadStatus, roadType, roadText, now = Date.now() }) {
  const errors = [], warnings = [];
  const m = /window\.TWRC_DATA_BASE=("(?:[^"\\]|\\.)*")/.exec(String(html || ''));
  let base = null; try { base = m ? JSON.parse(m[1]) : null; } catch (e) { base = null; }
  if (!base) errors.push('TWRC_DATA_BASE absente ou vide : l’app lirait ses données sur sa propre origine (page HTML de repli).');
  else if (!/^https:\/\/[^/]+\/.*\/$/.test(base)) errors.push('TWRC_DATA_BASE invalide (HTTPS et « / » final attendus) : ' + base);
  let feed = null;
  if (roadStatus !== 200) errors.push('road-datex.json non atteignable (HTTP ' + roadStatus + ').');
  else if (!/json/i.test(String(roadType || ''))) errors.push('road-datex.json servi en ' + (roadType || 'type inconnu') + ' au lieu de JSON.');
  else { try { feed = JSON.parse(roadText); } catch (e) { errors.push('road-datex.json illisible (JSON invalide).'); } }
  let ageMin = null;
  if (feed) {
    const at = Date.parse(feed.checkedAt);
    if (!Number.isFinite(at)) errors.push('road-datex.json sans date de vérification (checkedAt).');
    else { ageMin = Math.max(0, Math.round((now - at) / 60000)); if (ageMin > STALE_MIN) warnings.push(`Flux routier vérifié il y a ${ageMin} min (seuil ${STALE_MIN} min) : cron ou relais à surveiller.`); }
  }
  return { ok: !errors.length, errors, warnings, base, ageMin };
}
async function main(url) {
  const html = await (await fetch(url.replace(/\/?$/, '/'), { cache: 'no-store' })).text();
  const pre = verify({ html, roadStatus: 200, roadType: 'json', roadText: '{"checkedAt":"' + new Date().toISOString() + '"}' });
  let r = pre;
  if (pre.base) {
    const res = await fetch(pre.base + 'road-datex.json', { cache: 'no-store', headers: { Origin: url } });
    r = verify({ html, roadStatus: res.status, roadType: res.headers.get('content-type'), roadText: await res.text() });
  }
  r.warnings.forEach(w => console.log('::warning::' + w));
  r.errors.forEach(e => console.log('::error::' + e));
  if (r.ok) console.log(`✅ Données de l'origine dédiée : ${r.base} · road-datex.json en JSON, vérifié il y a ${r.ageMin} min`);
  process.exit(r.ok ? 0 : 1);
}
if (require.main === module) main(process.argv[2]).catch(e => { console.log('::error::' + e.message); process.exit(1); });
module.exports = { verify, STALE_MIN };
