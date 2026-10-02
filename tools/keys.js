// Outils de chiffrement partagés par build.js, check-secrets.js et check-keys.js (jamais publiés sur le site).
// Même format que l'app (WebCrypto) et le relais : PBKDF2-SHA256 + AES-256-GCM, étiquette en fin de texte chiffré.
'use strict';
const crypto = require('crypto');
// normalisation identique au relais et à l'app : espaces, guillemets et casse ignorés
const norm = s => String(s || '').trim().replace(/^["'«\s]+|["'»\s]+$/g, '').toLowerCase();
function unseal(S, pass) {
  const key = crypto.pbkdf2Sync(pass, Buffer.from(S.s, 'base64'), S.it, 32, 'sha256'), b = Buffer.from(S.c, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(S.i, 'base64')); d.setAuthTag(b.subarray(b.length - 16));
  return JSON.parse(Buffer.concat([d.update(b.subarray(0, b.length - 16)), d.final()]).toString('utf8'));
}
function seal(obj, pass) {
  if (!pass) throw new Error('seal : clé absente');
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.pbkdf2Sync(pass, salt, 600000, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv); const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final(), c.getAuthTag()]);
  return { v: 1, kdf: 'PBKDF2-SHA256', it: 600000, s: salt.toString('base64'), i: iv.toString('base64'), c: ct.toString('base64') };
}
// null si la clé ne convient pas (l'erreur n'est jamais affichée : elle ne contient rien d'utile)
const tryUnseal = (S, pass) => { if (!S || !pass) return null; try { return unseal(S, pass); } catch (e) { return null; } };
module.exports = { norm, seal, unseal, tryUnseal };
