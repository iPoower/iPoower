// Lot 1 : oracle de contrat UNIQUEMENT dans les tests ; aucun import de production.
// Octets synthétiques : aucune donnée personnelle, aucune clé, aucun chiffrement réel.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createHash } = require('node:crypto'), vm = require('node:vm');
const doc = fs.readFileSync(path.join(__dirname, '../docs/INTEGRATION.md'), 'utf8');
function section(name) {
  const start = '<!-- integration-' + name + ':start -->', end = '<!-- integration-' + name + ':end -->';
  const part = doc.split(start)[1]?.split(end)[0];
  assert(part, 'section normative absente : ' + name);
  return JSON.parse(part.match(/~~~json\s*([\s\S]*?)\s*~~~/)[1]);
}
const schema = section('schema'), limits = section('limits');
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const digest = v => createHash('sha256').update(v).digest('hex');
const clone = v => JSON.parse(JSON.stringify(v));
const fail = code => { throw new Error(code); };
const fitsFile = n => Number.isSafeInteger(n) && n >= 0 && n <= limits.maxFileBytes;
const fitsCipher = n => Number.isSafeInteger(n) && n >= limits.tagBytes && n <= limits.maxCipherBytes;
const producer = v => typeof v === 'string' && v.trim() === v && /^prod-[1-9][0-9]{0,8}$/.test(v) ? Number(v.slice(5)) : null;

// Sous-ensemble du schéma normatif, sans nouvelle dépendance et sans code livré au navigateur.
function shape(rule, value) {
  if (own(rule, 'const') && value !== rule.const) return false;
  if (rule.type === 'object') {
    if (!object(value) || !rule.required.every(k => own(value, k))) return false;
    if (rule.additionalProperties === false && Object.keys(value).some(k => !own(rule.properties, k))) return false;
    return Object.keys(value).every(k => !own(rule.properties, k) || shape(rule.properties[k], value[k]));
  }
  if (rule.type === 'string') return typeof value === 'string' &&
    (rule.minLength == null || value.length >= rule.minLength) &&
    (rule.maxLength == null || value.length <= rule.maxLength) &&
    (!rule.pattern || new RegExp(rule.pattern).test(value));
  return true;
}
function decoded(value, min, max) {
  if (typeof value !== 'string' || !value.length || value.length % 4 ||
    value.length > Math.ceil(max / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail('INVALID_ENCODING');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length < min || bytes.length > max || bytes.toString('base64') !== value) fail('INVALID_ENCODING');
  return bytes;
}
function parseFile(input) {
  const bytes = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  if (!fitsFile(bytes.length)) fail('FILE_TOO_LARGE');
  if (bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]))) fail('MALFORMED_FILE');
  let text, value;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); value = JSON.parse(text); }
  catch { fail('MALFORMED_FILE'); }
  const tokens = text.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g) || [];
  const stack = [];
  for (let j = 0; j < tokens.length; j++) {
    const token = tokens[j];
    if (token === '{' || token === '[') {
      stack.push(token === '{' ? new Set() : null);
      if (stack.length > limits.maxJsonDepth) fail('MALFORMED_FILE');
    } else if (token === '}' || token === ']') stack.pop();
    else if (token.startsWith('"') && tokens[j + 1] === ':') {
      const keys = stack[stack.length - 1], key = JSON.parse(token);
      if (!keys || keys.has(key)) fail('MALFORMED_FILE');
      keys.add(key);
    }
  }
  return value;
}
const storageSource = fs.readFileSync(path.join(__dirname, '../src/device-storage.js'), 'utf8');
const historical = vm.runInNewContext(storageSource + ';DeviceStorage;', { atob, btoa, Uint8Array });
function inspect(input, reader = 'prod-124', role = 'race') {
  const packet = parseFile(input);
  if (!object(packet)) fail('UNSUPPORTED_FORMAT');
  if (!own(packet, 'format') && packet.app === 'twrc-backup') {
    if (!historical.validEnvelope(packet, true)) fail('INVALID_ENVELOPE');
    if (role !== 'race') fail('LEGACY_REEXPORT_REQUIRED');
    return 'legacy-candidate';
  }
  if (packet.format !== 'race-control-backup') fail('UNSUPPORTED_FORMAT');
  if (packet.schemaVersion !== 1) fail('UNSUPPORTED_SCHEMA');
  if (!shape(schema, packet)) fail('INVALID_ENVELOPE');
  const time = Date.parse(packet.createdAt);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== packet.createdAt) fail('INVALID_ENVELOPE');
  decoded(packet.payload.s, limits.saltBytes, limits.saltBytes);
  decoded(packet.payload.i, limits.ivBytes, limits.ivBytes);
  const cipher = decoded(packet.payload.c, limits.tagBytes, limits.maxCipherBytes);
  if (digest(cipher) !== packet.sha256) fail('INTEGRITY_MISMATCH');
  if (role === 'race') {
    const loaded = producer(reader);
    if (loaded === null) fail('UNKNOWN_READER_VERSION');
    if (producer(packet.appVersion) > loaded) fail('PRODUCER_TOO_NEW');
  }
  return 'schema-ok'; // GCM et conservation ne sont PAS exécutés ici.
}
const cipher = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const example = {
  format: 'race-control-backup', schemaVersion: 1, createdAt: '2026-01-01T00:00:00.000Z',
  appVersion: 'prod-124', sha256: '630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd',
  payload: { alg: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', it: 600000,
    s: Buffer.alloc(16).toString('base64'), i: Buffer.alloc(12).toString('base64'), c: cipher.toString('base64') }
};
const encoded = value => JSON.stringify(value);
const altered = fn => { const v = clone(example); fn(v); return encoded(v); };
let count = 0;
function check(name, fn) { fn(); count++; console.log('✅ contrat : ' + name); }
function rejects(input, code, reader, role) { assert.throws(() => inspect(input, reader, role), code ? { message: code } : undefined); }

check('schéma et limites normatifs explicites', () => {
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.deepEqual(schema.required, ['format', 'schemaVersion', 'createdAt', 'appVersion', 'sha256', 'payload']);
  assert.deepEqual(schema.properties.payload.required, ['alg', 'kdf', 'it', 's', 'i', 'c']);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.payload.additionalProperties, false);
  assert.deepEqual(limits, { maxFileBytes: 68 * 1024 ** 2, maxCipherBytes: 48 * 1024 ** 2,
    maxJsonDepth: 4, saltBytes: 16, ivBytes: 12, tagBytes: 16 });
});
check('vecteur SHA-256 des octets 0 à 31', () => { assert.equal(digest(cipher), example.sha256); assert.equal(inspect(encoded(example)), 'schema-ok'); });
check('ordre des propriétés et indentation sans effet sur le hash de C', () => {
  const reordered = Object.fromEntries(Object.entries(example).reverse());
  assert.equal(inspect(JSON.stringify(reordered, null, 2)), 'schema-ok');
});
check('hash du Base64 ou du JSON refusé', () => {
  for (const h of [digest(example.payload.c), digest(encoded(example.payload))]) rejects(altered(v => { v.sha256 = h; }), 'INTEGRITY_MISMATCH');
});
for (const key of schema.required) check('champ obligatoire ' + key, () => rejects(altered(v => { delete v[key]; })));
for (const key of schema.properties.payload.required) check('paramètre obligatoire payload.' + key, () => rejects(altered(v => { delete v.payload[key]; })));
for (const value of [0, 2, 999, '1', null]) check('version de schéma inconnue ' + String(value), () => rejects(altered(v => { v.schemaVersion = value; }), 'UNSUPPORTED_SCHEMA'));
check('format inconnu sans repli historique', () => rejects(altered(v => { v.format = 'other'; v.app = 'twrc-backup'; }), 'UNSUPPORTED_FORMAT'));
for (const value of ['prod-0', 'prod-01', 'prod-1.0', 'prod-1000000000', 'dev', '', 124, null, 'prod-124\n', 'prod-124\r\n', 'prod-124\u2028']) {
  check('version productrice non canonique ' + String(value), () => rejects(altered(v => { v.appVersion = value; }), 'INVALID_ENVELOPE'));
}
check('comparaison numérique prod-10 après prod-9', () => {
  const v = altered(v => { v.appVersion = 'prod-10'; });
  rejects(v, 'PRODUCER_TOO_NEW', 'prod-9');
  assert.equal(inspect(altered(v => { v.appVersion = 'prod-9'; }), 'prod-10'), 'schema-ok');
  assert.equal(inspect(v, 'prod-10'), 'schema-ok');
});
check('producteur futur refusé seulement par le lecteur Race Control', () => {
  const v = altered(v => { v.appVersion = 'prod-125'; });
  rejects(v, 'PRODUCER_TOO_NEW', 'prod-124');
  assert.equal(inspect(v, undefined, 'vault'), 'schema-ok');
});
for (const reader of ['', 'local', 'prod-01', null, 'prod-124\n']) check('lecteur chargé inconnu ' + JSON.stringify(reader), () => rejects(encoded(example), 'UNKNOWN_READER_VERSION', reader));
for (const value of ['0'.repeat(64), 'A'.repeat(64), 'ab', null, 1, example.sha256 + '\n']) check('empreinte invalide ' + String(value).slice(0, 8), () => rejects(altered(v => { v.sha256 = value; })));
check('un octet de C altéré est refusé', () => rejects(altered(v => { const c = Buffer.from(v.payload.c, 'base64'); c[0] ^= 1; v.payload.c = c.toString('base64'); }), 'INTEGRITY_MISMATCH'));
check('hash recalculé et métadonnée changée ne prouvent pas GCM', () => {
  const v = clone(example); const c = Buffer.from(v.payload.c, 'base64'); c[0] ^= 1;
  v.payload.c = c.toString('base64'); v.sha256 = digest(c); v.createdAt = '2026-01-02T00:00:00.000Z';
  assert.equal(inspect(encoded(v)), 'schema-ok');
  assert(doc.includes('PAS une preuve d’authenticité')); assert(doc.includes('additionalData (AAD)'));
});
for (const key of ['locations', 'vehicles', 'trips', 'address', 'driveFolderId', 'password', 'key', 'accessToken', '__proto__', 'constructor']) {
  check('métadonnée interdite ' + key + ' à chaque niveau', () => {
    rejects(altered(v => { Object.defineProperty(v, key, { enumerable: true, value: 'synthetic' }); }));
    rejects(altered(v => { Object.defineProperty(v.payload, key, { enumerable: true, value: 'synthetic' }); }));
  });
}
for (const text of ['{', '{"format":', 'null', '[]', '42', '"text"', encoded(example) + ' trailing']) {
  check('fichier incomplet ou non objet ' + text.slice(0, 12), () => rejects(text));
}
check('UTF-8 invalide et BOM refusés', () => { rejects(Buffer.from([195, 40]), 'MALFORMED_FILE'); rejects(Buffer.concat([Buffer.from([239, 187, 191]), Buffer.from(encoded(example))]), 'MALFORMED_FILE'); });
check('clés dupliquées directes, échappées et dans payload refusées', () => {
  const raw = encoded(example);
  rejects(raw.replace('{"format":', '{"format":"ignored","format":'), 'MALFORMED_FILE');
  rejects(raw.replace('{"format":', '{"\\u0066ormat":"ignored","format":'), 'MALFORMED_FILE');
  rejects(raw.replace('"payload":{', '"payload":{"alg":"ignored",'), 'MALFORMED_FILE');
});
check('profondeur bornée avant traitement métier', () => rejects('{"a":[[[[0]]]]}', 'MALFORMED_FILE'));
for (const date of ['2026-02-30T00:00:00.000Z', '2026-13-01T00:00:00.000Z', '2026-01-01T00:00:00Z', '2026-01-01T01:00:00.000+01:00']) {
  check('date non canonique ' + date, () => rejects(altered(v => { v.createdAt = date; }), 'INVALID_ENVELOPE'));
}
for (const value of [0, 1, 599999, 600001, 1e12, '600000']) check('coût KDF arbitraire refusé ' + value, () => rejects(altered(v => { v.payload.it = value; }), 'INVALID_ENVELOPE'));
check('suite cryptographique inconnue refusée', () => {
  rejects(altered(v => { v.payload.alg = 'AES-CBC'; }), 'INVALID_ENVELOPE');
  rejects(altered(v => { v.payload.kdf = 'other'; }), 'INVALID_ENVELOPE');
});
for (const value of ['_'.repeat(24), example.payload.c.slice(0, -1), example.payload.c + '\n', 'A'.repeat(22) + 'B=']) {
  check('Base64 non canonique refusé', () => rejects(altered(v => { v.payload.c = value; })));
}
check('tailles sel, IV et tag exactes', () => {
  for (const [field, size] of [['s', 15], ['s', 17], ['i', 11], ['i', 13], ['c', 15]]) {
    rejects(altered(v => { v.payload[field] = Buffer.alloc(size).toString('base64'); }));
  }
});
check('bornes numériques inclusives sans allocation massive', () => {
  assert(fitsFile(limits.maxFileBytes)); assert(!fitsFile(limits.maxFileBytes + 1)); assert(!fitsFile(-1));
  assert(fitsCipher(16)); assert(fitsCipher(limits.maxCipherBytes)); assert(!fitsCipher(15)); assert(!fitsCipher(limits.maxCipherBytes + 1));
});
for (const version of [1, 2, undefined]) check('historique V' + (version || 'sans-version') + ' validé par le code existant', () => {
  const old = { app: 'twrc-backup', s: example.payload.s, i: example.payload.i, c: example.payload.c };
  if (version !== undefined) Object.assign(old, { v: version, kdf: 'PBKDF2-SHA256', it: 600000 });
  assert.equal(historical.validEnvelope(old, true), true);
  assert.equal(inspect(encoded(old)), 'legacy-candidate');
  rejects(encoded(old), 'LEGACY_REEXPORT_REQUIRED', undefined, 'vault');
});
check('Base64 historique non canonique encore reconnu par le validateur existant', () => {
  const old = { app: 'twrc-backup', v: 2, s: 'A'.repeat(21) + 'B==', i: example.payload.i, c: example.payload.c };
  assert.equal(historical.validEnvelope(old, true), true);
  assert.equal(inspect(encoded(old)), 'legacy-candidate');
  rejects(encoded(old), 'LEGACY_REEXPORT_REQUIRED', undefined, 'vault');
});
check('historique futur ou KDF arbitraire toujours refusé', () => {
  const old = { app: 'twrc-backup', v: 3, s: example.payload.s, i: example.payload.i, c: example.payload.c };
  assert.equal(historical.validEnvelope(old, true), false);
  rejects(encoded(old), 'INVALID_ENVELOPE');
  old.v = 2; old.it = 1e12; rejects(encoded(old), 'INVALID_ENVELOPE');
});
check('blocages futurs documentés, sans prétendre les corriger', () => {
  for (const id of ['B01', 'B02', 'B03', 'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09']) assert(doc.includes(id));
  assert(doc.includes('NON RÉSOLUS par le lot 1')); assert(doc.includes('Arrêt après leur création'));
});
console.log(count + '/' + count + ' scénarios de contrat OK (aucune restauration exécutée)');
