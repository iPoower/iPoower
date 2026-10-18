/* Fiches constructeur des pneus (onglet Analyse) : uniquement des données publiées, chacune reliée à sa source.
   Règle : aucune donnée fabricant inventée. Un champ absent reste « non disponible ».
   Les pages Michelin n'étaient pas accessibles depuis l'environnement de développement (réseau filtré) : les
   extraits Michelin ci-dessous ont été relevés le 2026-10-05 via les résultats de recherche pointant vers les pages officielles,
   et sont marqués « à confirmer » tant qu'ils n'ont pas été relus directement sur la page.
   Étiquette européenne : elle dépend de la dimension exacte ; elle n'est donc jamais déduite du seul modèle (registre EPREL). */
const TIRE_SPECS = [
  { b: 'Michelin', m: 'Pilot Sport 4S', aka: ['Pilot Sport 4 S'], f: [
    { k: 'Saison', v: 'Été (pneu « max ultra-haute performance »)', src: 'https://www.michelinman.com/auto/tires/michelin-pilot-sport-4-s', kind: 'fabricant', check: 1 },
    { k: 'Usage prévu', v: 'Route et usage circuit occasionnel', src: 'https://www.michelinman.com/auto/tires/michelin-pilot-sport-4-s', kind: 'fabricant', check: 1 },
    { k: 'Gomme', v: 'Bi-Compound : partie extérieure en gomme hybride pour l’adhérence sur sec ; partie intérieure à base de silice et d’élastomères fonctionnels pour une adhérence constante sur mouillé', src: 'https://www.michelin.com.ph/auto/tyres/michelin-pilot-sport-4s', kind: 'fabricant', check: 1 },
    { k: 'Technologie', v: 'Dynamic Response Technology : direction précise et stabilité directionnelle en virage, même à haute vitesse', src: 'https://www.michelin.com.ph/auto/tyres/michelin-pilot-sport-4s', kind: 'fabricant', check: 1 }
  ] },
  { b: 'Michelin', m: 'CrossClimate 2', aka: ['CrossClimate2'], f: [
    { k: 'Saison', v: '4 saisons, marquage 3PMSF (neige sévère)', src: 'https://www.michelinman.com/auto/tires/michelin-crossclimate-2', kind: 'fabricant', check: 1 },
    { k: 'Gomme', v: 'Thermal Adaptive : gomme toutes saisons conçue pour le sec, le mouillé et l’hiver', src: 'https://www.michelinman.com/auto/tires/michelin-crossclimate-2', kind: 'fabricant', check: 1 },
    { k: 'Sculpture', v: 'Sculpture directionnelle en V, orientée vers l’évacuation de l’eau', src: 'https://www.michelinman.com/auto/tires/michelin-crossclimate-2', kind: 'fabricant', check: 1 }
  ] },
  // Catalogue mondial : saison et gamme. Fiche Rovelo : construction commune au modèle.
  // Les dimensions nord-américaines (notamment 94W) ne décrivent pas la variante européenne 94Y XL.
  // Cette dernière est référencée dans EPREL : https://eprel.ec.europa.eu/screen/product/tyres/730150
  { b: 'Rovelo', m: 'RPX-988', aka: ['RPX988', 'RPX 988'], f: [
    { k: 'Saison', v: 'Été', src: 'https://www.rovelotire.com/uploads/20230202/9492180d175686b028059f6ca73f3cca.pdf', kind: 'fabricant' },
    { k: 'Usage prévu', v: 'Ultra-haute performance (UHP)', src: 'https://rovelotireusa.com/wp-content/uploads/2026/04/SAIL-0016_2026-Mar-ProductSheet-CAN-BIL-RPX988_FA.pdf', kind: 'fabricant' },
    { k: 'Sculpture', v: 'Bande de roulement asymétrique et nervure centrale continue', src: 'https://rovelotireusa.com/wp-content/uploads/2026/04/SAIL-0016_2026-Mar-ProductSheet-CAN-BIL-RPX988_FA.pdf', kind: 'fabricant' },
    { k: 'Technologie', v: 'Blocs d’épaulement renforcés avec des lamelles à angle prononcé', src: 'https://rovelotireusa.com/wp-content/uploads/2026/04/SAIL-0016_2026-Mar-ProductSheet-CAN-BIL-RPX988_FA.pdf', kind: 'fabricant' }
  ] }
];
// Rubriques attendues d'une fiche : celles qui manquent sont affichées « non disponible », jamais estimées.
const TIRE_SPEC_KEYS = ['Saison', 'Usage prévu', 'Gomme', 'Technologie', 'Sculpture', 'Étiquette UE', 'Homologation constructeur'];
function tireSpecFor(brand, model) {
  // Une annotation entre parenthèses ne change pas le pneu (« Pilot Sport 4S (AV + AR) ») : ignorée, comme findTire (engine.js).
  // Tout autre texte (« XL », « SUV »…) reste significatif : un autre modèle n'est jamais confondu avec celui-ci.
  const n = s => String(s || '').replace(/\(.*?\)/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const b = n(brand), m = n(model); if (!m) return null;
  return TIRE_SPECS.find(x => (!b || n(x.b) === b) && [x.m, ...(x.aka || [])].some(a => n(a) === m)) || null;
}
