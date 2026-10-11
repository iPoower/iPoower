// Format réellement observé du relais public : domain_id, color_id, phenomenon,
// échéances J/J1 et dates de validité. Aucune donnée personnelle ni appel réseau.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '../src'), app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const a = app.indexOf('const VIGI_DS ='), b = app.indexOf('// résultats normalisés', a);
assert(a >= 0 && b > a);
const at = Date.parse('2026-10-11T12:00Z');
const ctx = { URL, URLSearchParams, Date: class extends Date { constructor(...args) { super(...(args.length ? args : [at])); } static now() { return at; } } }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'engine.js'), 'utf8') + `
  const S = { dept: { code: '80', name: 'Somme' } }, DEMO = { on: false }, CX = null;
  let VIGI = {}, response = {}, fetchedUrl = '';
  const fetchJSON = async url => { fetchedUrl = url; return response; };
  const esc = s => String(s), hmLocal = ms => new Date(ms).toISOString().slice(11, 16);
` + app.slice(a, b) + `
  this.parse = (data, code = '80') => parseVigi(data, code, '', Date.parse('2026-10-11T12:00Z'));
  this.fetch = async data => { response = data; await fetchVigi(); return { url: fetchedUrl, state: VIGI, html: vigiBlock() }; };
`, ctx);
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
  assert.match(result.html, /JAUNE/); assert.match(result.html, /aujourd’hui et demain/); assert.match(result.html, /bulletin du/);
  const unread = plain(await ctx.fetch({ records: [record({ color_id: null, color: null })] }));
  assert.equal(unread.state.state, 'unread'); assert.doesNotMatch(unread.html, /VERTE|Aucune vigilance particulière/);
  const empty = plain(await ctx.fetch({ records: [] })); assert.equal(empty.state.state, 'unread'); assert.match(empty.html, /Aucune donnée de vigilance valide/);
  console.log('✅ Code 80 exact · J/J1 · bulletin daté · département distinct du phénomène · absence, illisible et expiré sans faux vert');
})().catch(e => { console.error(e); process.exitCode = 1; });
