// Recherche d'adresse explicite : France via IGN/BAN, monde via OpenStreetMap, ville via Open-Meteo en dernier recours.
'use strict';
const GeoSearch = (() => {
  const finite = Number.isFinite;
  const clean = (v, n = 220) => typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '';
  // Adresse française : code postal, « France », ou voie à la française (rue, avenue, chemin…) sans pays étranger nommé.
  // Une adresse sans code postal (« 1 Rue de l'Église, Saint-Étienne ») part ainsi d'abord vers la BAN, la référence
  // officielle ; si la BAN ne trouve rien, OpenStreetMap prend le relais comme avant.
  const FR_STREET = /(?:^|[\s,'’-])(?:rue|avenue|av\.|boulevard|bd|chemin|allée|allee|impasse|place|quai|cours|route|faubourg|lieu-dit|hameau|résidence|residence|square|sentier|voie|ruelle|passage|esplanade)(?=[\s,'’-]|$)/i;
  const FOREIGN = /\b(?:belgique|belgium|bruxelles|brussels|suisse|switzerland|schweiz|genève|geneve|lausanne|luxembourg|monaco|canada|québec|quebec|montréal|montreal|maroc|morocco|tunisie|algérie|algerie|sénégal|senegal|uk|england|london|usa|deutschland|germany|españa|spain|italia|italy)\b/i;
  const frenchHint = q => /\b(?:0[1-9]|[1-8]\d|9[0-5]|97[1-6])\d{3}\b/.test(q) || /\bfrance\b/i.test(q) || (FR_STREET.test(q) && !FOREIGN.test(q));

  function ban(json) {
    return (json && Array.isArray(json.features) ? json.features : []).map(f => {
      const p = f && f.properties || {}, c = f && f.geometry && f.geometry.coordinates || [];
      const lon = +c[0], lat = +c[1]; if (!finite(lat) || !finite(lon)) return null;
      const label = clean(p.label || [p.housenumber, p.street || p.name, p.postcode, p.city].filter(Boolean).join(' '));
      // contexte BAN « 74, Haute-Savoie, Auvergne-Rhône-Alpes » : code et nom du département séparés, jamais la chaîne entière
      const ctx = clean(p.context || '', 160).split(',').map(x => x.trim()), deptCode = /^(\d{2}|2[AB]|97\d)$/i.test(ctx[0] || '') ? ctx[0].toUpperCase() : '';
      return label ? { name: label, address: label, sub: clean(p.context || [p.postcode, p.city].filter(Boolean).join(' · ')), dept: deptCode ? clean(ctx[1] || '', 100) : '', deptCode,
        city: clean(p.city || '', 120), cityCode: clean(String(p.citycode || ''), 5), postcode: clean(String(p.postcode || ''), 5), lat, lon, provider: 'IGN/BAN', precision: clean(p.type || '', 80) } : null;
    }).filter(Boolean).slice(0, 6);
  }
  function osm(json) {
    return (Array.isArray(json) ? json : []).map(r => {
      const lat = +r.lat, lon = +r.lon; if (!finite(lat) || !finite(lon)) return null;
      const parts = clean(r.display_name, 500).split(',').map(x => x.trim()).filter(Boolean);
      const name = clean(r.name || parts.slice(0, Math.min(2, parts.length)).join(', '));
      // département : comté OSM ou code ISO « FR-74 » ; jamais la région (state), qui ferait échouer l'alerte montagne
      const a = r.address || {}, fr = !a.country_code || String(a.country_code).toLowerCase() === 'fr', iso = clean(a['ISO3166-2-lvl6'] || '', 12);
      const dept = fr ? clean(a.county || a.state_district || '', 100) : '', deptCode = fr && /^FR-(\d{2}|2[AB]|97\d)/i.test(iso) ? iso.slice(3, iso.startsWith('FR-97') ? 6 : 5).toUpperCase() : '';
      const sub = clean(parts.filter(x => !name.includes(x)).slice(0, 4).join(', '));
      return name ? { name, address: clean(r.display_name, 320), sub, dept, deptCode, city: fr ? clean(a.city || a.town || a.village || a.municipality || '', 120) : '', cityCode: '',
        postcode: fr ? clean(String(a.postcode || ''), 5) : '', lat, lon, provider: 'OpenStreetMap', precision: clean(r.addresstype || r.type || '', 80) } : null;
    }).filter(Boolean).slice(0, 6);
  }
  function openMeteo(json) {
    return (json && Array.isArray(json.results) ? json.results : []).map(r => {
      const lat = +r.latitude, lon = +r.longitude; if (!finite(lat) || !finite(lon)) return null;
      return { name: clean(r.name), address: clean([r.name, r.admin2, r.admin1, r.country].filter(Boolean).join(', '), 320), sub: clean([r.admin2, r.admin1, r.country].filter(Boolean).join(', ')), dept: r.country_code === 'FR' ? clean(r.admin2 || '', 100) : '', deptCode: '',
        city: r.country_code === 'FR' ? clean(r.name) : '', cityCode: '', postcode: r.country_code === 'FR' && Array.isArray(r.postcodes) ? clean(String(r.postcodes[0] || ''), 5) : '', lat, lon, provider: 'Open-Meteo', precision: 'locality' };
    }).filter(x => x && x.name).slice(0, 6);
  }
  async function call(fetchJson, url) { try { return await fetchJson(url, 8000); } catch (e) { return null; } }
  async function search(q, fetchJson) {
    q = clean(q, 260); if (q.length < 2) return [];
    const enc = encodeURIComponent(q);
    const banUrl = 'https://data.geopf.fr/geocodage/search?q=' + enc + '&limit=6&autocomplete=0';
    const osmUrl = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&accept-language=fr&q=' + enc;
    const omUrl = 'https://geocoding-api.open-meteo.com/v1/search?name=' + enc + '&count=6&language=fr&format=json';
    const order = frenchHint(q) ? [['ban', banUrl], ['osm', osmUrl], ['om', omUrl]] : [['osm', osmUrl], ['ban', banUrl], ['om', omUrl]];
    for (const [kind, url] of order) {
      const raw = await call(fetchJson, url);
      const out = kind === 'ban' ? ban(raw) : kind === 'osm' ? osm(raw) : openMeteo(raw);
      if (out.length) return out;
    }
    return [];
  }
  return { search, ban, osm, openMeteo, frenchHint };
})();
