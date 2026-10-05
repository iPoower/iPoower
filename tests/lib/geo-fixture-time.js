'use strict';
// Les anciens parcours réseau téléportaient parfois la voiture de plusieurs kilomètres en 1 s.
// Faire avancer l'horloge Date sans exécuter les minuteurs conserve le test des réponses concurrentes,
// mais donne aux déplacements volontaires une durée routière cohérente (35 m/s, environ 126 km/h).
// Les cas explicitement périmés, les sauts aberrants et le drift utilisent toujours leurs propres timestamps.
exports.coherentTime = async (page, target, options = {}) => {
  if (options.age) return;
  const advance = await page.evaluate(p => {
    const f = FIX; if (!f) return 0;
    const R = Math.PI / 180, h = Math.sin((p.lat - f.lat) * R / 2) ** 2 + Math.cos(f.lat * R) * Math.cos(p.lat * R) * Math.sin((p.lon - f.lon) * R / 2) ** 2;
    const distance = 12742000 * Math.asin(Math.sqrt(Math.min(1, h))), needed = distance > 150 ? Math.ceil(distance / 35) * 1000 : 0;
    return Math.max(0, needed - (Date.now() - f.ts));
  }, target);
  if (advance > 0) await page.clock.setSystemTime(new Date(await page.evaluate(() => Date.now()) + advance));
};
