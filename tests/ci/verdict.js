// Même verdict que le runner historique : les erreurs, scénarios incomplets et erreurs JS restent bloquants.
'use strict';
function verdict(code, out) {
  const js = out.match(/erreurs JS : (?!aucune)([^\n]{0,300})/), ex = out.match(/^(?:\w*Error|(?:page|locator|browserContext)\.\w+):[^\n]{0,240}/m);
  if (code !== 0) return 'code de sortie ' + code + (js ? ' · erreurs JS : ' + js[1] : ex ? ' · ' + ex[0] : '');
  if (/❌|ERR |Error:|TimeoutError/.test(out)) return 'échec signalé dans la sortie';
  const sc = [...out.matchAll(/(\d+)\/(\d+) scénarios OK/g)]; if (sc.some(m => m[1] !== m[2])) return 'scénarios incomplets';
  const er = out.match(/errors (\[.*\])/); if (er && er[1] !== '[]') return 'erreurs JavaScript : ' + er[1].slice(0, 200);
  if (/erreurs JS : (?!aucune)/.test(out)) return 'erreurs JavaScript';
  if (/perdus [1-9]/.test(out)) return 'réglages perdus';
  return null;
}
module.exports = { verdict };
