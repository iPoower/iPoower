/* « Guider avec… » (21/11/2026) : liens OFFICIELS vers Waze, Apple Plans et Google Maps, construits sur l'appareil.
 * Module PUR : aucune requête, aucun stockage. Le lien n'est suivi qu'à l'appui ; rien n'est envoyé avant.
 * Confidentialité : une destination qui est (ou jouxte, ≤ 1,5 km) un lieu enregistré n'est JAMAIS écrite dans un lien
 * (ni adresse, ni coordonnées). Domicile ou travail : favori Waze « home » / « work » ; Plans et Google Maps n'ont pas
 * d'équivalent par lien, ils sont alors indisponibles (« choisis-le dans l'app »).
 * dest = { address, lat, lon, privacy: null | 'home' | 'work' | 'private' }. Résultat par app : { url } ou { url: null, why }. */
const GuideLinks = (() => {
  // Encodage strict (RFC 3986) : ' ( ) ! * aussi, pour que l'URL affichée soit exactement celle qui part.
  const finite = Number.isFinite, enc = v => encodeURIComponent(v).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const coords = d => d && finite(d.lat) && finite(d.lon) ? (+d.lat).toFixed(5) + ',' + (+d.lon).toFixed(5) : null;
  const addr = d => d && typeof d.address === 'string' && d.address.trim() ? d.address.trim().replace(/\s+/g, ' ') : null;
  // Waze : https://waze.com/ul?q=<adresse>&ll=<lat>,<lon>&navigate=yes ; favoris : https://waze.com/ul?favorite=home|work&navigate=yes
  function waze(d) {
    if (!d) return { url: null, why: 'destination inconnue' };
    if (d.privacy === 'home' || d.privacy === 'work') return { url: 'https://waze.com/ul?favorite=' + d.privacy + '&navigate=yes', fav: d.privacy };
    if (d.privacy) return { url: null, why: 'lieu enregistré : choisis-le dans Waze' };
    const a = addr(d), c = coords(d);
    if (!a && !c) return { url: null, why: 'destination sans adresse ni position' };
    return { url: 'https://waze.com/ul?' + [a ? 'q=' + enc(a) : null, c ? 'll=' + c : null, 'navigate=yes'].filter(Boolean).join('&') };
  }
  // Apple Plans : https://maps.apple.com/?daddr=<adresse encodée>&dirflg=d (adresse obligatoire : daddr en coordonnées seules
  // est signalé défaillant).
  function plans(d) {
    if (!d) return { url: null, why: 'destination inconnue' };
    if (d.privacy) return { url: null, why: 'lieu enregistré : choisis-le dans Plans' };
    const a = addr(d);
    if (!a) return { url: null, why: 'adresse inconnue (Plans exige une adresse)' };
    return { url: 'https://maps.apple.com/?daddr=' + enc(a) + '&dirflg=d' };
  }
  // Google Maps : https://www.google.com/maps/dir/?api=1&destination=<adresse ou lat,lon>&travelmode=driving
  function google(d) {
    if (!d) return { url: null, why: 'destination inconnue' };
    if (d.privacy) return { url: null, why: 'lieu enregistré : choisis-le dans Google Maps' };
    const v = addr(d) || coords(d);
    if (!v) return { url: null, why: 'destination sans adresse ni position' };
    return { url: 'https://www.google.com/maps/dir/?api=1&destination=' + enc(v) + '&travelmode=driving' };
  }
  const APPS = Object.freeze([{ id: 'waze', label: 'Waze', build: waze }, { id: 'plans', label: 'Plans', build: plans }, { id: 'google', label: 'Google Maps', build: google }]);
  const all = d => APPS.map(a => ({ id: a.id, label: a.label, ...a.build(d) }));
  return Object.freeze({ waze, plans, google, all, APPS });
})();
if (typeof module !== 'undefined') module.exports = GuideLinks;
