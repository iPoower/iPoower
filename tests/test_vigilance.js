// Format réellement observé du relais public : domain_id, color_id, phenomenon,
// échéances J/J1 et dates de validité. Aucune donnée personnelle ni appel réseau.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '../src'), app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const a = app.indexOf('const VIGI_DS ='), b = app.indexOf('// résultats normalisés', a);
assert(a >= 0 && b > a);
let at = Date.parse('2026-10-11T12:00Z');
// Horloge fixée et modifiable : chaque scénario choisit son instant (avant ou après minuit, heure de Paris).
function make(source) {
  const ctx = { URL, URLSearchParams, Date: class extends Date { constructor(...args) { super(...(args.length ? args : [at])); } static now() { return at; } } }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'engine.js'), 'utf8') + `
  const S = { dept: { code: '80', name: 'Somme' } }, DEMO = { on: false }, CX = null;
  let VIGI = {}, response = {}, fetchedUrl = '';
  const fetchJSON = async url => { fetchedUrl = url; return response; };
  const esc = s => String(s), hmLocal = ms => new Date(ms).toISOString().slice(11, 16);
` + source + `
  this.parse = (data, code = '80') => parseVigi(data, code, '', Date.parse('2026-10-11T12:00Z'));
  this.fetch = async data => { response = data; await fetchVigi(); return { url: fetchedUrl, state: VIGI, html: vigiBlock(), top: vigiTop() }; };
  this.render = () => ({ html: vigiBlock(), top: vigiTop() });
`, ctx);
  return ctx;
}
const ctx = make(app.slice(a, b));
const record = fields => ({ fields: { domain_id: '80', color_id: 1, color: 'vert', phenomenon: 'vent', echeance: 'J', product_datetime: '2026-10-11T04:00:00Z', end_time: '2026-10-11T22:00:00Z', ...fields } });
const plain = x => JSON.parse(JSON.stringify(x));
(async () => {
  const rows = { records: [record({}), record({ color_id: 2, color: 'jaune', phenomenon: 'pluie', echeance: 'J1', end_time: '2026-10-12T22:00Z' })] };
  const parsed = plain(ctx.parse(rows)); assert.deepEqual(parsed.items.map(i => i.lvl), [1, 2]); assert.deepEqual(parsed.periods, ['J', 'J1']);
  assert.equal(parsed.issuedAt, Date.parse('2026-10-11T04:00Z'));
  // Aisne 02 : le phénomène 2 d'un autre département ne doit pas être accepté.
  assert.equal(ctx.parse({ records: [record({ domain_id: '80', phenomenon_id: 2 })] }, '02').matched, 0);
  assert.equal(ctx.parse({ records: [record({ end_time: '2026-10-10T22:00Z' })] }).matched, 0);
  const result = plain(await ctx.fetch(rows)), query = new URL(result.url).searchParams;
  assert.equal(query.get('refine.domain_id'), '80'); assert.equal(query.has('q'), false); assert.equal(result.state.state, 'ok');
  // Jaune pour demain seulement : le jaune n'est pas annoncé pour aujourd'hui (le vert d'aujourd'hui n'est pas le niveau affiché).
  assert.match(result.html, /JAUNE<\/span> pluie · demain · bulletin du/); assert.doesNotMatch(result.html, /aujourd’hui/);
  const unread = plain(await ctx.fetch({ records: [record({ color_id: null, color: null })] }));
  assert.equal(unread.state.state, 'unread'); assert.doesNotMatch(unread.html, /VERTE|Aucune vigilance particulière/);
  const empty = plain(await ctx.fetch({ records: [] })); assert.equal(empty.state.state, 'unread'); assert.match(empty.html, /Aucune donnée de vigilance valide/);
  // Bulletin réel de 16 h (heure de Paris), validité de chaque échéance fournie par la source : J jusqu'à minuit, J1 le lendemain.
  const J = { echeance: 'J', product_datetime: '2026-11-09T15:00:00+00:00', begin_time: '2026-11-09T15:00:00+00:00', end_time: '2026-11-09T23:00:00+00:00' };
  const J1 = { echeance: 'J1', product_datetime: '2026-11-09T15:00:00+00:00', begin_time: '2026-11-09T23:00:00+00:00', end_time: '2026-11-10T23:00:00+00:00' };
  const green = { records: [record({ ...J }), record({ ...J, phenomenon: 'pluie' }), record({ ...J1 }), record({ ...J1, phenomenon: 'pluie' })] };
  at = Date.parse('2026-11-09T16:30:00Z');   // 17 h 30 à Paris, le jour du bulletin
  let r = plain(await ctx.fetch(green));
  assert.match(r.html, /VERTE<\/span> aujourd’hui et demain · bulletin du/); assert.doesNotMatch(r.html, /vent|pluie/);   // vert : aucun phénomène nommé
  at = Date.parse('2026-11-10T00:08:00Z');   // 1 h 08 à Paris le lendemain : « J1 » est aujourd'hui, « J » est échu
  r = plain(await ctx.fetch(green));
  assert.match(r.html, /VERTE<\/span> aujourd’hui · bulletin du/); assert.doesNotMatch(r.html, /demain/);
  // Orange annoncé la veille pour le lendemain : après minuit, il concerne aujourd'hui.
  const orange = { records: [record({ ...J }), record({ ...J1, color_id: 3, color: 'orange', phenomenon: 'neige / verglas' })] };
  at = Date.parse('2026-11-09T16:30:00Z'); r = plain(await ctx.fetch(orange));
  assert.match(r.html, /ORANGE<\/span> neige \/ verglas · demain/); assert.equal(r.top.lvl, 3); assert.equal(r.top.text, 'neige / verglas · demain');
  at = Date.parse('2026-11-10T00:08:00Z'); r = plain(await ctx.fetch(orange));
  assert.match(r.html, /ORANGE<\/span> neige \/ verglas · aujourd’hui/); assert.equal(r.top.text, 'neige / verglas · aujourd’hui');
  // Sans nouvel appel réseau : l'état chargé la veille est relu après minuit, le libellé suit l'heure réelle.
  at = Date.parse('2026-11-09T16:30:00Z'); await ctx.fetch(orange); at = Date.parse('2026-11-10T00:08:00Z');
  assert.match(plain(ctx.render()).html, /neige \/ verglas · aujourd’hui/);
  at = Date.parse('2026-11-10T23:30:00Z'); assert.match(plain(ctx.render()).html, /Vigilance non disponible/);   // tout est échu : aucun niveau affiché
  // Même niveau sur les deux jours, phénomènes différents : chacun reste rattaché à son jour.
  at = Date.parse('2026-11-09T16:30:00Z');
  r = plain(await ctx.fetch({ records: [record({ ...J, color_id: 2, color: 'jaune', phenomenon: 'vent' }), record({ ...J1, color_id: 2, color: 'jaune', phenomenon: 'pluie' }), record({ ...J1, phenomenon: 'orages' })] }));
  assert.match(r.html, /JAUNE<\/span> aujourd’hui : vent · demain : pluie · bulletin du/); assert.doesNotMatch(r.html, /orages/);
  // L'alerte de l'onglet Alertes reprend le même texte daté (une seule source).
  assert.match(app, /out\.vigi = \{ id: 'vigi', sev: top\.lvl - 1, title: `Vigilance \$\{\[[^\]]+\]\[top\.lvl\]\} : \$\{top\.text\}`/);
  assert.doesNotMatch(app, /p === 'J' \? 'aujourd’hui' : 'demain'/);
  // Contre-épreuves : l'ancien libellé fondé sur l'échéance seule, puis un élément échu encore affiché, sont détectés.
  const block = app.slice(a, b);
  const byEcheance = block.replace("if (Number.isFinite(i.b)) day = i.b <= now ? today : VIGI_DAY.format(new Date(i.b));\n    else if (", 'if (').replace('const base = VIGI_DAY.format(new Date(VIGI.issuedAt));', 'const base = today;');   // échéance lue par rapport à maintenant, comme avant
  assert.notEqual(byEcheance, block, 'contre-épreuve construite');
  at = Date.parse('2026-11-10T00:08:00Z'); let mutant = make(byEcheance); r = plain(await mutant.fetch(orange));
  assert.match(r.html, /neige \/ verglas · demain/, 'la contre-épreuve reproduit le défaut observé en production');
  const keepExpired = block.replace('.filter(i => !(Number.isFinite(i.e) && i.e <= now))', '');
  assert.notEqual(keepExpired, block, 'contre-épreuve construite');
  at = Date.parse('2026-11-09T16:30:00Z'); mutant = make(keepExpired); await mutant.fetch(orange); at = Date.parse('2026-11-10T23:30:00Z');
  assert.doesNotMatch(plain(mutant.render()).html, /Vigilance non disponible/, 'la contre-épreuve affiche encore un bulletin échu');
  console.log('✅ Code 80 exact · J/J1 · bulletin daté · département distinct du phénomène · absence, illisible et expiré sans faux vert');
  console.log('✅ Jour réel de la vigilance : J1 devient aujourd’hui après minuit · niveau rattaché à son jour · vert sans phénomène · échu masqué · 2 contre-épreuves détectées');
})().catch(e => { console.error(e); process.exitCode = 1; });
